// ─────────────────────────────────────────────────────────────────────────────
// Revenue attribution cloud functions. CommonJS. RevenueAttribution §5 / §7 (R1).
//
//   recordConversion     — manual / API intake for a purchase event. Runs the
//                          ingest handler inline so callers get a synchronous,
//                          immediately-reportable result (and it's trivially
//                          testable). Defaults sourceType "manual".
//   getRevenueByCampaign — per-campaign revenue rollup read off the denormalized
//                          Campaign counters: { revenue, orders, aov, conversionCount }.
//
// Money is INTEGER MINOR UNITS (e.g. cents) end to end. Org-scoped via getUserOrg.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");
const { handle: ingestConversion } = require("../worker/jobs/ingestConversion");

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "You must be signed in.");
  }
  return request.user;
}

// ── recordConversion ──────────────────────────────────────────────────────────
// Manual / API intake. Org-scoped; enqueueing onto Agenda is the production path
// for async deployments, but running the handler inline keeps the manual/API
// surface simple and synchronously reportable (the handler is idempotent + pure).
Parse.Cloud.define("recordConversion", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const { email, orderId, value, currency, itemCount, occurredAt, sourceType } = p;

  if (!orderId) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "orderId is required.");
  }

  const org = await getUserOrg(user, { useMasterKey: true });

  return ingestConversion({
    Parse,
    org,
    email,
    orderId: String(orderId),
    sourceType: sourceType || "manual",
    revenue: value,
    currency: currency || "USD",
    itemCount: itemCount || 0,
    occurredAt,
    raw: { via: "recordConversion" },
  });
});

// ── getRevenueByCampaign ──────────────────────────────────────────────────────
// Per-campaign revenue rollup. Reads the denormalized Campaign counters the
// ingest job maintains; returns honest zeros for a campaign with no conversions.
// aov is in minor units, integer-rounded, divide-by-zero-guarded.
Parse.Cloud.define("getRevenueByCampaign", async (request) => {
  const user = requireUser(request);
  const campaignId = request.params && request.params.campaignId;
  if (!campaignId) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "campaignId is required.");
  }

  const st = user.getSessionToken();
  let campaign;
  try {
    // Session-scoped read — ACL isolates to the caller's org.
    campaign = await new Parse.Query("Campaign").get(campaignId, { sessionToken: st });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Campaign not found.");
  }

  const revenue = Number(campaign.get("revenueTotal")) || 0;
  const orders = Number(campaign.get("orderCount")) || 0;
  const conversionCount = Number(campaign.get("conversionCount")) || 0;
  const aov = orders > 0 ? Math.round(revenue / orders) : 0;

  return { revenue, orders, aov, conversionCount };
});

module.exports = {};
