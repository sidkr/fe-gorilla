// Inbound webhook endpoints. Sending.md §6/§7.
//
// POST /api/webhooks/ses → SNS message ingest. Two paths:
//   1. SubscriptionConfirmation: GET the SubscribeURL to confirm the topic
//      subscription (one-time per topic; best-effort).
//   2. Notification: verify the SNS message is authentic, then enqueue a
//      webhook-ingest Agenda job. We DON'T process inline — the webhook reply
//      must be fast so SNS doesn't retry/back-off the endpoint.
//
// CRITICAL: this route is mounted BEFORE Parse's /api handler, so it needs its
// own JSON body parser (`express.json`). SNS posts with Content-Type
// `text/plain`, so we parse `type: '*/*'`.
const express = require("express");
const https = require("https");
const crypto = require("crypto");
const { WEBHOOK_INGEST } = require("../lib/jobNames");
const { getAgenda } = require("../lib/agendaInstance");
const { optional } = require("../lib/env");

// Best-effort GET of the SNS SubscribeURL to confirm a topic subscription.
function confirmSubscription(url) {
  return new Promise((resolve) => {
    try {
      https
        .get(url, (res) => {
          res.resume(); // drain
          res.on("end", resolve);
        })
        .on("error", () => resolve()); // best-effort: never throw
    } catch {
      resolve();
    }
  });
}

// ---------------------------------------------------------------------------
// SNS signature verification (Sending.md §3/§6).
//
// AWS SNS signs every message with an RSA private key; we verify against the
// public cert advertised at `SigningCertURL`. SignatureVersion "1" = RSA-SHA1,
// "2" = RSA-SHA256. The string-to-sign is built from a fixed set of keys, in a
// fixed order, each emitted as `key + "\n" + value + "\n"`. The key set differs
// by message Type (Notification vs SubscriptionConfirmation/UnsubscribeConfirmation).
// ---------------------------------------------------------------------------

// Keys (in order) that participate in the string-to-sign, per SNS message Type.
// `Subject` is included for Notifications ONLY when present in the message.
const SIGNED_KEYS = {
  Notification: ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
  SubscriptionConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
  UnsubscribeConfirmation: ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
};

// Build the canonical string-to-sign. Each present key contributes
// `key\nvalue\n`. `Subject` (Notification only) is skipped when absent.
function buildCanonicalString(message) {
  const keys = SIGNED_KEYS[message.Type];
  if (!keys) return null;
  let canonical = "";
  for (const key of keys) {
    if (key === "Subject" && message.Subject === undefined) continue;
    if (message[key] === undefined) continue;
    canonical += key + "\n" + message[key] + "\n";
  }
  return canonical;
}

// Only genuine AWS SNS signing hosts. Must be https and match the regional
// SNS cert host exactly (e.g. sns.us-east-1.amazonaws.com) — NOT any
// *.amazonaws.com host (S3, etc., which an attacker could host a cert on).
const SNS_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

// Default cert fetcher: HTTPS GET the PEM. Tests inject a stub instead.
function defaultFetchCert(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`cert fetch HTTP ${res.statusCode}`));
        }
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// Module-level cert fetch hook — overridable in tests via setCertFetcher().
let certFetcher = defaultFetchCert;
function setCertFetcher(fn) {
  certFetcher = typeof fn === "function" ? fn : defaultFetchCert;
}

// Cache fetched certs by URL (the cert at a given URL is immutable).
const certCache = new Map();
async function getCert(url) {
  if (certCache.has(url)) return certCache.get(url);
  const pem = await certFetcher(url);
  certCache.set(url, pem);
  return pem;
}

// Cryptographically verify an SNS message. Async. Returns false on ANY failure
// (bad host, fetch error, unknown SignatureVersion, bad/tampered signature).
// `fetchCert` may be passed explicitly to override the module hook (tests).
async function verifySnsSignature(message, fetchCert) {
  try {
    if (!message || !message.Signature || !message.SigningCertURL) return false;

    // SignatureVersion → digest algorithm.
    const alg =
      message.SignatureVersion === "1"
        ? "RSA-SHA1"
        : message.SignatureVersion === "2"
          ? "RSA-SHA256"
          : null;
    if (!alg) return false; // unknown SignatureVersion

    // SigningCertURL must be https on a genuine SNS host.
    let url;
    try {
      url = new URL(message.SigningCertURL);
    } catch {
      return false;
    }
    if (url.protocol !== "https:" || !SNS_HOST_RE.test(url.host)) return false;

    const canonical = buildCanonicalString(message);
    if (canonical == null) return false;

    const fetcher = typeof fetchCert === "function" ? fetchCert : null;
    const certPem = fetcher ? await fetcher(message.SigningCertURL) : await getCert(message.SigningCertURL);
    if (!certPem) return false;

    const verifier = crypto.createVerify(alg);
    verifier.update(canonical, "utf8");
    return verifier.verify(certPem, message.Signature, "base64");
  } catch {
    return false;
  }
}

// Authenticity gate. In real mode we MUST cryptographically verify the SNS
// signature against AWS's signing cert before trusting the body — anyone can
// POST to a public endpoint. In mock/dev (AWS_SES_MODE !== "real") our pipeline
// is hermetic and emits UNSIGNED events, so we skip the crypto check but STILL
// apply the basic structural checks (so even mock callers must look like SNS).
//
// async: real-mode verification fetches the signing cert.
async function isAuthentic(body) {
  const mode = (optional("AWS_SES_MODE", "mock") || "mock").toLowerCase();

  // Basic structural checks — applied in BOTH modes. A genuine SNS message
  // always carries these fields + a recognized Type.
  if (!body || !body.MessageId || !body.Type) return false;
  if (!SIGNED_KEYS[body.Type]) return false; // unknown/unsupported Type

  // Dev/mock: structural checks only; SNS doesn't sign our mock events.
  if (mode !== "real") return true;

  // Real mode: full cryptographic verification.
  return verifySnsSignature(body);
}

function mount(app) {
  app.post("/api/webhooks/ses", express.json({ type: "*/*" }), async (req, res) => {
    const body = req.body || {};

    // 1. Subscription confirmation handshake. Verify before we GET the
    //    SubscribeURL — an attacker could otherwise trick us into confirming a
    //    subscription to a topic they control.
    if (body.Type === "SubscriptionConfirmation") {
      if (!(await isAuthentic(body))) return res.status(403).end();
      if (body.SubscribeURL) await confirmSubscription(body.SubscribeURL);
      return res.status(200).end();
    }

    // 2. Notification → verify, then enqueue. Always fast-ack 200.
    if (body.Type === "Notification") {
      if (!(await isAuthentic(body))) return res.status(403).end();

      let event;
      try {
        event = JSON.parse(body.Message);
      } catch {
        // Malformed payload — ack so SNS stops retrying; nothing to enqueue.
        return res.status(200).end();
      }

      // Enqueue resiliently: never let a queue hiccup turn into a 5xx (which
      // triggers SNS retries). Reply 200 regardless.
      try {
        const agenda = await getAgenda();
        await agenda.now(WEBHOOK_INGEST, { event });
      } catch (err) {
        console.error("[webhooks/ses] enqueue failed:", err && err.message);
      }
      return res.status(200).end();
    }

    // Unknown SNS message type — ack so SNS doesn't hammer us.
    return res.status(200).end();
  });
}

module.exports = {
  mount,
  // Exported for unit tests (and to allow cert-fetcher injection):
  verifySnsSignature,
  buildCanonicalString,
  isAuthentic,
  setCertFetcher,
};
