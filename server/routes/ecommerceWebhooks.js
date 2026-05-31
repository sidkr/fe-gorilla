// ─────────────────────────────────────────────────────────────────────────────
// Public ecommerce webhook routes (Shopify, WooCommerce).
// RevenueAttribution §4 path A / §7 (R3). CommonJS.
//
// No auth — each request is verified via a per-StoreConnection HMAC secret.
// Pattern mirrors routes/webhooks.js (SNS/SES): capture the RAW body, verify the
// signature against the raw bytes, FAST-ACK 200, enqueue async, never block. The
// platform's webhook delivery must get a quick 200 so it doesn't retry-storm.
//
// Mounted in routes/index.js via `require("./ecommerceWebhooks").mount(app)`.
// The nuxt.config `/webhooks/**` proxy rule already forwards these to :8080.
//
//   POST /webhooks/shopify       — X-Shopify-Hmac-SHA256 (base64 HMAC-SHA256 of
//                                  raw body); shop via X-Shopify-Shop-Domain.
//                                  Handles orders/create + refunds/create.
//   POST /webhooks/woocommerce   — X-WC-Webhook-Signature (base64 HMAC-SHA256);
//                                  shop via X-WC-Webhook-Source. orders + refunds.
//
// Money is INTEGER MINOR UNITS end to end ("49.95" -> 4995). Refunds → negative
// revenue Conversions with a DISTINCT orderId suffix so they don't collide with
// the original order under ingest's (org, orderId, sourceType) idempotency key.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const crypto = require("crypto");
const Parse = require("parse/node");
const { getAgenda } = require("../lib/agendaInstance");

// ingest-conversion is the shared R1 job. jobNames.js is orchestrator-owned and
// does not yet export it — use a local constant (REPORTED in integration deltas).
const INGEST_CONVERSION = "ingest-conversion";

// Decimal money string ("49.95") -> integer minor units (4995). Handles negative,
// missing, integer-string, and number inputs; rounds to kill float dust.
function toMinorUnits(amount) {
  if (amount === null || amount === undefined || amount === "") return 0;
  const n = Number(amount);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// Constant-time compare, length-guarded (timingSafeEqual throws on length diff).
function safeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// base64 HMAC-SHA256 of the raw body using the shared secret.
function hmacBase64(rawBuf, secret) {
  return crypto.createHmac("sha256", String(secret || "")).update(rawBuf).digest("base64");
}

function normalizeShopDomain(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

// Resolve a StoreConnection by provider + shop domain (master key — this is a
// privileged worker-style path; the secret check below is the real auth gate).
async function findStore(provider, shopDomain) {
  const norm = normalizeShopDomain(shopDomain);
  if (!norm) return null;
  const q = new Parse.Query("StoreConnection");
  q.equalTo("provider", provider);
  q.equalTo("shopDomain", norm);
  return (await q.first({ useMasterKey: true })) || null;
}

// Mark lastEventAt + promote pending -> connected. Best-effort; never throws.
async function touchStore(store) {
  try {
    store.set("lastEventAt", new Date());
    if (store.get("status") !== "connected") store.set("status", "connected");
    await store.save(null, { useMasterKey: true });
  } catch (e) {
    /* swallow — must not block the ack */
  }
}

// Enqueue resiliently — a queue hiccup must never turn into a 5xx (retry storm).
async function enqueueConversion(data) {
  try {
    const agenda = await getAgenda();
    await agenda.now(INGEST_CONVERSION, data);
  } catch (e) {
    console.error("[webhooks/ecom] enqueue failed:", e && e.message);
  }
}

// ── Shopify parsers ───────────────────────────────────────────────────────────

function parseShopifyOrder(order) {
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const itemCount = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
  return {
    email: String(order.email || order.contact_email || "").toLowerCase(),
    orderId: String(order.id != null ? order.id : order.order_id || ""),
    revenue: toMinorUnits(order.total_price),
    currency: order.currency || "USD",
    itemCount,
    occurredAt: order.created_at || order.processed_at || new Date().toISOString(),
  };
}

// Shopify refund: total comes from transactions[] (preferred) else refund_line_items[].
function parseShopifyRefund(refund) {
  const txns = Array.isArray(refund.transactions) ? refund.transactions : [];
  const rlis = Array.isArray(refund.refund_line_items) ? refund.refund_line_items : [];
  let total = 0;
  if (txns.length) {
    total = txns.reduce((s, t) => s + toMinorUnits(t.amount), 0);
  } else {
    total = rlis.reduce((s, r) => s + toMinorUnits(r.subtotal), 0);
  }
  const itemCount = rlis.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const baseOrderId = String(refund.order_id != null ? refund.order_id : refund.id || "");
  return {
    email: "", // refunds rarely carry email; ingest still records org-level revenue
    // Distinct + idempotent per refund (a refunded order may have several refunds).
    orderId: `${baseOrderId}:refund:${refund.id}`,
    revenue: -Math.abs(total), // negative revenue
    currency: refund.currency || "USD",
    itemCount,
    occurredAt: refund.created_at || refund.processed_at || new Date().toISOString(),
  };
}

// ── WooCommerce parser ────────────────────────────────────────────────────────

function parseWooOrder(order) {
  const lineItems = Array.isArray(order.line_items) ? order.line_items : [];
  const itemCount = lineItems.reduce((s, li) => s + (Number(li.quantity) || 0), 0);
  const email = String(
    (order.billing && order.billing.email) || order.email || "",
  ).toLowerCase();
  const refunds = Array.isArray(order.refunds) ? order.refunds : [];
  const isRefund = order.status === "refunded" || refunds.length > 0;

  if (isRefund) {
    // Woo refund totals are typically negative strings already; abs+negate to be safe.
    const refundTotal = refunds.reduce((s, r) => s + toMinorUnits(r.total), 0);
    return {
      email,
      orderId: `${order.id}:refund`,
      revenue: -Math.abs(refundTotal || toMinorUnits(order.total)),
      currency: order.currency || "USD",
      itemCount,
      occurredAt: order.date_modified || order.date_created || new Date().toISOString(),
      isRefund: true,
    };
  }

  return {
    email,
    orderId: String(order.id != null ? order.id : ""),
    revenue: toMinorUnits(order.total),
    currency: order.currency || "USD",
    itemCount,
    occurredAt: order.date_paid || order.date_created || new Date().toISOString(),
    isRefund: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

function mount(app) {
  const router = express.Router();

  // RAW body for HMAC verification — Shopify/Woo sign the exact bytes. We do NOT
  // use express.json here; we need Buffer access. `type: "*/*"` so any
  // Content-Type is captured.
  router.use(express.raw({ type: "*/*", limit: "5mb" }));

  // --- Shopify ---
  router.post("/shopify", async (req, res) => {
    const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    const shopDomain = req.get("X-Shopify-Shop-Domain") || "";
    const hmacHeader = req.get("X-Shopify-Hmac-SHA256") || "";
    const topic = String(req.get("X-Shopify-Topic") || "").toLowerCase();

    let store = null;
    try {
      store = await findStore("shopify", shopDomain);
    } catch (e) {
      store = null;
    }
    if (!store) return res.status(404).send("unknown shop");

    const expected = hmacBase64(rawBuf, store.get("webhookSecret"));
    if (!safeEqual(expected, hmacHeader)) return res.status(401).send("bad signature");

    let payload;
    try {
      payload = JSON.parse(rawBuf.toString("utf8"));
    } catch (e) {
      return res.status(200).send("ok"); // verified but unparseable — drop, don't retry
    }

    const org = store.get("organization");
    // Topic header drives create-vs-refund; fall back to payload shape.
    const isRefund =
      topic === "refunds/create" ||
      Array.isArray(payload.refund_line_items) ||
      Array.isArray(payload.transactions);
    const fields = isRefund ? parseShopifyRefund(payload) : parseShopifyOrder(payload);

    if (fields && fields.orderId) {
      await enqueueConversion({
        org,
        sourceType: "shopify",
        email: fields.email,
        orderId: fields.orderId,
        revenue: fields.revenue,
        currency: fields.currency,
        itemCount: fields.itemCount,
        occurredAt: fields.occurredAt,
        raw: payload,
      });
    }

    await touchStore(store);
    return res.status(200).send("ok");
  });

  // --- WooCommerce ---
  router.post("/woocommerce", async (req, res) => {
    const rawBuf = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || "");
    // Woo sends the store URL in X-WC-Webhook-Source; tolerate the Shopify header too.
    const shopHeader =
      req.get("X-WC-Webhook-Source") || req.get("X-Shopify-Shop-Domain") || "";
    const signature = req.get("X-WC-Webhook-Signature") || "";

    let store = null;
    try {
      store = await findStore("woocommerce", shopHeader);
    } catch (e) {
      store = null;
    }
    if (!store) return res.status(404).send("unknown shop");

    const expected = hmacBase64(rawBuf, store.get("webhookSecret"));
    if (!safeEqual(expected, signature)) return res.status(401).send("bad signature");

    let payload;
    try {
      payload = JSON.parse(rawBuf.toString("utf8"));
    } catch (e) {
      return res.status(200).send("ok");
    }

    const org = store.get("organization");
    const fields = parseWooOrder(payload);

    if (fields && fields.orderId) {
      await enqueueConversion({
        org,
        sourceType: "woocommerce",
        email: fields.email,
        orderId: fields.orderId,
        revenue: fields.revenue,
        currency: fields.currency,
        itemCount: fields.itemCount,
        occurredAt: fields.occurredAt,
        raw: payload,
      });
    }

    await touchStore(store);
    return res.status(200).send("ok");
  });

  app.use("/webhooks", router);
}

module.exports = {
  mount,
  // exported for unit tests
  toMinorUnits,
  hmacBase64,
  safeEqual,
  normalizeShopDomain,
  parseShopifyOrder,
  parseShopifyRefund,
  parseWooOrder,
  findStore,
  INGEST_CONVERSION,
};
