// ─────────────────────────────────────────────────────────────────────────────
// Tracking tokens. CommonJS. Sending.md §10 (open/click) + §11 (unsubscribe).
//
// HMAC-signed, URL-safe, self-contained tokens. A token carries its own payload
// (no DB lookup to validate) and a truncated HMAC tag that proves we minted it.
// Tokens NEVER expire — a tracked link in an email is valid forever.
//
//   token  = base64url(JSON.stringify(payload)) + "." + sig
//   sig    = first 22 chars of base64url(HMAC_SHA256(secret, body))
//
// The payload is NOT a secret (it leaks a sendId, which is fine — see
// routes/tracking.js). The HMAC only prevents forgery/tampering.
//
// Secret: env TRACKING_SECRET (falls back to legacy TRACKING_TOKEN_SECRET, then
// a loud dev default). Rotating the secret invalidates every outstanding link.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require("crypto");
const { optional } = require("./env");

const DEV_DEFAULT_SECRET = "gorilla-dev-tracking-secret-do-not-use-in-prod";

let warned = false;
function getSecret() {
  const v =
    optional("TRACKING_SECRET", undefined) ||
    optional("TRACKING_TOKEN_SECRET", undefined);
  if (v) return v;
  if (!warned) {
    console.warn(
      "[trackingTokens] TRACKING_SECRET not set — using an insecure dev default. " +
        "Set TRACKING_SECRET before sending real email.",
    );
    warned = true;
  }
  return DEV_DEFAULT_SECRET;
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlToBuffer(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  const normalized = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(normalized, "base64");
}

function sign(body) {
  const mac = crypto.createHmac("sha256", getSecret()).update(body).digest();
  return b64url(mac).slice(0, 22);
}

// Sign an arbitrary JSON-serializable payload into a URL-safe token.
function signToken(payload) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// Verify + decode a token. Returns the payload object on success, or null on any
// tamper / malformed / garbage input. Constant-time tag comparison.
function verifyToken(token) {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const tag = token.slice(dot + 1);

  const expected = sign(body);
  // Compare as fixed-length buffers; bail before timingSafeEqual if lengths
  // differ (timingSafeEqual throws on length mismatch).
  const tagBuf = Buffer.from(tag);
  const expBuf = Buffer.from(expected);
  if (tagBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(tagBuf, expBuf)) return null;

  try {
    return JSON.parse(b64urlToBuffer(body).toString("utf8"));
  } catch (_) {
    return null;
  }
}

// ── Convenience builders (payload shapes are the contract for routes/*) ──────
// `t` is the event-type discriminator the tracking routes switch on.

// Open pixel token: GET /t/o/:token
function openToken(sendId) {
  return signToken({ t: "o", sendId });
}

// Click redirect token: GET /t/c/:token. Carries the destination so the
// endpoint can 302 without a DB lookup; linkId disambiguates duplicate URLs.
function clickToken(sendId, url, linkId) {
  const payload = { t: "c", sendId, url };
  if (linkId != null) payload.linkId = linkId;
  return signToken(payload);
}

// Unsubscribe token: GET/POST /u/:token
function unsubToken(sendId) {
  return signToken({ t: "u", sendId });
}

module.exports = {
  signToken,
  verifyToken,
  openToken,
  clickToken,
  unsubToken,
};
