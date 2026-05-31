// ─────────────────────────────────────────────────────────────────────────────
// StoreConnection cloud functions. RevenueAttribution §3 / §6 / §7 (R3).
// CommonJS.
//
// A StoreConnection represents a connected ecommerce store (Shopify,
// WooCommerce, ...). Inbound order/refund webhooks (routes/ecommerceWebhooks.js)
// are verified against the per-connection `webhookSecret` and resolved to an org
// via the shop domain.
//
// TENANCY: StoreConnection is NOT (yet) in PER_TENANT_CLASSES, so the tenantHooks
// beforeSave does NOT auto-stamp org + ACL. We therefore set both EXPLICITLY in
// code here (the orgRoleACL pattern), exactly as ingestConversion.js does for
// Conversion. Once the orchestrator adds it to PER_TENANT_CLASSES the explicit
// stamping is harmless (idempotent).
//
// Cloud functions (all org-scoped):
//   createStoreConnection({ provider, shopDomain })
//       → { id, provider, shopDomain, status, webhookUrl, webhookSecret, ... }
//         (webhookSecret returned ONCE for the user to paste into the store admin)
//   listStoreConnections() → [{ id, provider, shopDomain, status, lastEventAt, ... }]
//       (NEVER returns webhookSecret)
//   deleteStoreConnection({ id }) → { id, deleted: true }
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const crypto = require("crypto");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");

const MK = { useMasterKey: true };

const PROVIDERS = ["shopify", "woocommerce", "bigcommerce", "custom"];

// Default attribution settings applied to a new connection.
const DEFAULT_SETTINGS = { attributionWindowDays: 7, currency: "USD" };

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

function ptrId(v) {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

// Normalize a shop domain: lowercase, strip scheme + trailing slash. Inbound
// webhooks resolve a store by the same normalization, so the two MUST agree.
function normalizeShopDomain(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

// Build the public webhook URL for a provider. The host is configurable via
// PUBLIC_BASE_URL; falls back to a relative path so the UI still renders.
function webhookUrlFor(provider) {
  const base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/+$/, "");
  return `${base}/webhooks/${provider}`;
}

// Public JSON shape — NEVER includes webhookSecret or accessToken.
function storeToJSON(store) {
  return {
    id: store.id,
    provider: store.get("provider"),
    shopDomain: store.get("shopDomain"),
    status: store.get("status"),
    installedAt: store.get("installedAt")
      ? store.get("installedAt").toISOString()
      : null,
    lastEventAt: store.get("lastEventAt")
      ? store.get("lastEventAt").toISOString()
      : null,
    settings: store.get("settings") || {},
    webhookUrl: webhookUrlFor(store.get("provider")),
    createdAt: store.createdAt ? store.createdAt.toISOString() : null,
  };
}

// ── createStoreConnection ─────────────────────────────────────────────────────
// Generates a strong webhookSecret, status "pending", and returns the webhook
// URL + secret ONCE so the UI can display them for the user to paste into the
// store admin. Org + ACL set explicitly (class not yet per-tenant).
Parse.Cloud.define("createStoreConnection", async (request) => {
  const user = requireUser(request);
  const params = request.params || {};
  const org = await getUserOrg(user, MK);

  const provider = String(params.provider || "").toLowerCase();
  if (!PROVIDERS.includes(provider)) {
    throw new Parse.Error(
      Parse.Error.INVALID_QUERY,
      `Unknown provider: ${params.provider}`,
    );
  }
  const shopDomain = normalizeShopDomain(params.shopDomain);
  if (!shopDomain) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "shopDomain is required.");
  }

  // Strong webhook signing secret for the user to paste into the store admin.
  const webhookSecret = crypto.randomBytes(32).toString("hex");

  const StoreConnection = Parse.Object.extend("StoreConnection");
  const store = new StoreConnection();
  store.set("organization", org);
  store.set("provider", provider);
  store.set("shopDomain", shopDomain);
  store.set("status", "pending");
  store.set("webhookSecret", webhookSecret);
  store.set("accessToken", ""); // reserved for OAuth/outbound; empty for now
  store.set("installedAt", new Date());
  store.set("settings", { ...DEFAULT_SETTINGS });
  const orgId = ptrId(org);
  if (orgId) store.setACL(orgRoleACL(orgId));

  await store.save(null, MK);

  // Return the secret ONCE so the UI can display it. Subsequent list calls omit it.
  return { ...storeToJSON(store), webhookSecret };
});

// ── listStoreConnections ──────────────────────────────────────────────────────
// All connections for the caller's org, newest first. Never exposes the secret.
Parse.Cloud.define("listStoreConnections", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);

  const q = new Parse.Query("StoreConnection");
  q.equalTo("organization", org);
  q.descending("createdAt");
  q.limit(1000);
  const rows = await q.find(MK);
  return rows.map(storeToJSON);
});

// ── deleteStoreConnection ─────────────────────────────────────────────────────
// Org-isolated hard delete: the query is scoped to the caller's org so one org
// can never delete another org's connection (returns OBJECT_NOT_FOUND).
Parse.Cloud.define("deleteStoreConnection", async (request) => {
  const user = requireUser(request);
  const params = request.params || {};
  const org = await getUserOrg(user, MK);

  if (!params.id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "id is required.");
  }

  const q = new Parse.Query("StoreConnection");
  q.equalTo("organization", org); // org isolation
  let store;
  try {
    store = await q.get(params.id, MK);
  } catch (err) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "Store connection not found.",
    );
  }
  await store.destroy(MK);
  return { id: params.id, deleted: true };
});

module.exports = {
  PROVIDERS,
  normalizeShopDomain,
  webhookUrlFor,
};
