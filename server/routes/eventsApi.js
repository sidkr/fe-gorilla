/**
 * Inbound events API (R2) — intake path B.
 *
 * Mounted under /api/v1/events. API-key authed (Authorization: Bearer <key>).
 * External stores/checkouts POST orders here; we resolve the org from the key
 * and enqueue the shared ingest-conversion job (sourceType "api"). The ingest
 * job dedupes on (org, orderId, sourceType), so retries are idempotent.
 *
 * Responds 202 (accepted) without blocking on attribution — the worker does
 * the heavy lifting.
 *
 * Money is integer minor units (cents). We validate it's a non-negative
 * integer and never coerce floats.
 */

const express = require("express");
const { authenticate } = require("../lib/apiKeyAuth");
const { getAgenda } = require("../lib/agendaInstance");

// --- Per-key in-memory rate limiter (basic; resets each window) -------------
const RATE_LIMIT = Number(process.env.EVENTS_API_RATE_LIMIT || 120); // req/window
const RATE_WINDOW_MS = Number(process.env.EVENTS_API_RATE_WINDOW_MS || 60000);
const buckets = new Map(); // keyId -> { count, resetAt }

function rateLimit(keyId) {
  const now = Date.now();
  let b = buckets.get(keyId);
  if (!b || now >= b.resetAt) {
    b = { count: 0, resetAt: now + RATE_WINDOW_MS };
    buckets.set(keyId, b);
  }
  b.count += 1;
  return {
    ok: b.count <= RATE_LIMIT,
    remaining: Math.max(0, RATE_LIMIT - b.count),
    resetAt: b.resetAt,
  };
}

const ISO_CURRENCY = /^[A-Z]{3}$/;

function validatePurchase(body) {
  const errors = [];
  const { email, orderId, value, currency, occurredAt, itemCount } = body || {};

  if (!orderId || typeof orderId !== "string") errors.push("orderId (string) is required");

  if (value == null || typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push("value must be a non-negative integer (minor units, e.g. cents)");
  }

  if (!currency || typeof currency !== "string" || !ISO_CURRENCY.test(currency)) {
    errors.push("currency must be a 3-letter ISO code, e.g. USD");
  }

  if (email != null && typeof email !== "string") errors.push("email must be a string");

  if (occurredAt != null) {
    const d = new Date(occurredAt);
    if (isNaN(d.getTime())) errors.push("occurredAt must be a valid date");
  }

  if (itemCount != null && (!Number.isInteger(itemCount) || itemCount < 0)) {
    errors.push("itemCount must be a non-negative integer");
  }

  return errors;
}

function mount(app) {
  const router = express.Router();
  // Ensure JSON body parsing for this router even if the app hasn't globally.
  router.use(express.json({ limit: "32kb" }));

  // POST /api/v1/events/purchase
  router.post("/purchase", async (req, res) => {
    let auth;
    try {
      auth = await authenticate(req.headers.authorization);
    } catch (err) {
      return res.status(err.status || 401).json({ error: err.message || "Unauthorized" });
    }

    const limit = rateLimit(auth.apiKey.id);
    res.set("X-RateLimit-Remaining", String(limit.remaining));
    if (!limit.ok) {
      res.set("Retry-After", String(Math.ceil((limit.resetAt - Date.now()) / 1000)));
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    const errors = validatePurchase(req.body);
    if (errors.length) {
      return res.status(400).json({ error: "Validation failed", details: errors });
    }

    const { email, orderId, value, currency, occurredAt, itemCount } = req.body;

    try {
      // getAgenda() is async (resolves once Mongo is connected); await it first.
      const agenda = await getAgenda();
      await agenda.now("ingest-conversion", {
        org: auth.org,
        email: email || null,
        orderId: String(orderId),
        sourceType: "api",
        revenue: value,
        currency,
        itemCount: itemCount != null ? itemCount : undefined,
        occurredAt: occurredAt || undefined,
        raw: req.body,
      });
    } catch (err) {
      console.error("[eventsApi] enqueue ingest-conversion failed:", err);
      return res.status(500).json({ error: "Failed to enqueue event" });
    }

    // Accepted — attribution runs async on the worker.
    return res.status(202).json({ accepted: true, orderId: String(orderId) });
  });

  app.use("/api/v1/events", router);
}

module.exports = { mount, validatePurchase, rateLimit, _buckets: buckets };
