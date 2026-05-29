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

// Authenticity gate. In real mode we MUST verify the SNS signature against
// AWS's signing cert before trusting the body — anyone can POST to a public
// endpoint. In mock/dev we accept (the pipeline is hermetic; no public AWS).
//
// TODO(real): full SNS signature verification — fetch SigningCertURL (must be an
// amazonaws.com host over https), build the canonical string-to-sign per the SNS
// spec, and RSA-SHA1/SHA256 verify `Signature`. For now we reject obviously-bad
// payloads (missing the fields a genuine SNS notification always carries).
function isAuthentic(body) {
  const mode = (optional("AWS_SES_MODE", "mock") || "mock").toLowerCase();
  if (mode !== "real") return true; // dev/mock: trust
  if (!body || !body.Signature || !body.SigningCertURL || !body.MessageId) return false;
  try {
    const host = new URL(body.SigningCertURL).host;
    if (!/(^|\.)amazonaws\.com$/.test(host)) return false;
  } catch {
    return false;
  }
  // TODO(real): cryptographic signature check against the fetched cert.
  return true;
}

function mount(app) {
  app.post("/api/webhooks/ses", express.json({ type: "*/*" }), async (req, res) => {
    const body = req.body || {};

    // 1. Subscription confirmation handshake.
    if (body.Type === "SubscriptionConfirmation") {
      if (body.SubscribeURL) await confirmSubscription(body.SubscribeURL);
      return res.status(200).end();
    }

    // 2. Notification → verify, then enqueue. Always fast-ack 200.
    if (body.Type === "Notification") {
      if (!isAuthentic(body)) return res.status(403).end();

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

module.exports = { mount };
