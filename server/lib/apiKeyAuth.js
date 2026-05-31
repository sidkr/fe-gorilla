/**
 * API-key auth (R2).
 *
 * API keys authenticate external systems hitting the inbound events API.
 * Format of a raw key:  gk_live_<32 url-safe random bytes>
 *
 * We NEVER store the raw key. We store:
 *   - keyPrefix: the first chunk (incl. "gk_live_" + a few chars), shown in UI
 *   - keyHash:   HMAC-SHA256(rawKey, server pepper) — looked up + compared
 *                in constant time on every request.
 *
 * Exposed helpers:
 *   generateKey()        → { raw, keyPrefix, keyHash }
 *   hashKey(raw)         → keyHash (for verification)
 *   parsePrefix(raw)     → keyPrefix
 *   authenticate(header) → { org, apiKey } | throws Error with .status
 */

const crypto = require("crypto");
const { Parse } = require("./parseClient");

const KEY_ENV_PREFIX = "gk_live_";
// keyPrefix shown in the UI: brand prefix + first 8 chars of the random part.
const PREFIX_RANDOM_CHARS = 8;

function getPepper() {
  return (
    process.env.API_KEY_PEPPER ||
    process.env.TRACKING_SECRET ||
    process.env.PARSE_MASTER_KEY ||
    "dev-api-key-pepper-change-me"
  );
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compute the stored hash for a raw key (HMAC-SHA256 with the server pepper). */
function hashKey(raw) {
  return crypto.createHmac("sha256", getPepper()).update(String(raw)).digest("hex");
}

/** The shown prefix: "gk_live_" + first N chars of the random portion. */
function parsePrefix(raw) {
  const s = String(raw);
  const rest = s.startsWith(KEY_ENV_PREFIX) ? s.slice(KEY_ENV_PREFIX.length) : s;
  return KEY_ENV_PREFIX + rest.slice(0, PREFIX_RANDOM_CHARS);
}

/** Mint a fresh key. The raw value is returned ONCE and never persisted. */
function generateKey() {
  const raw = KEY_ENV_PREFIX + b64url(crypto.randomBytes(32));
  return { raw, keyPrefix: parsePrefix(raw), keyHash: hashKey(raw) };
}

/** Constant-time string compare (hex strings). */
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function extractBearer(header) {
  if (!header || typeof header !== "string") return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Authenticate an Authorization header against the ApiKey class.
 *
 * Returns { org, apiKey } on success. On failure throws an Error with a
 * `.status` property (401) so the route can respond cleanly.
 *
 * Side effect: best-effort update of lastUsedAt (does not block on failure).
 */
async function authenticate(authHeader) {
  const raw = extractBearer(authHeader);
  if (!raw) {
    const e = new Error("Missing or malformed Authorization header");
    e.status = 401;
    throw e;
  }

  const ApiKey = Parse.Object.extend("ApiKey");
  const q = new Parse.Query(ApiKey);
  q.equalTo("keyPrefix", parsePrefix(raw));
  const candidate = await q.first({ useMasterKey: true });

  const expectedHash = candidate ? candidate.get("keyHash") : null;
  const providedHash = hashKey(raw);

  // Always run the compare to keep timing uniform; against a dummy when no row.
  const dummy = "0".repeat(providedHash.length);
  const matches = safeEqual(providedHash, expectedHash || dummy);

  if (!candidate || !matches) {
    const e = new Error("Invalid API key");
    e.status = 401;
    throw e;
  }

  if (candidate.get("revokedAt")) {
    const e = new Error("API key has been revoked");
    e.status = 401;
    throw e;
  }

  // The org pointer/object — passed straight to the ingest job, which accepts a
  // Parse pointer (it does q.equalTo("organization", org) + ptrId(org).id).
  const org = candidate.get("organization");
  if (!org) {
    const e = new Error("API key is not bound to an organization");
    e.status = 401;
    throw e;
  }

  // Best-effort lastUsedAt update; never block/throw the request on this.
  candidate.set("lastUsedAt", new Date());
  candidate
    .save(null, { useMasterKey: true })
    .catch((err) => console.error("[apiKeyAuth] lastUsedAt update failed:", err));

  return { org, apiKey: candidate };
}

module.exports = {
  generateKey,
  hashKey,
  parsePrefix,
  safeEqual,
  extractBearer,
  authenticate,
  KEY_PREFIX: KEY_ENV_PREFIX,
};
