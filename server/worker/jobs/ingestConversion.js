// ─────────────────────────────────────────────────────────────────────────────
// ingest-conversion worker job. CommonJS. RevenueAttribution §4 / §7 (R1).
//
// Given a purchase event, attribute it and roll up revenue. Idempotent on
// (organization, orderId, sourceType) so webhook retries / pixel double-fires
// don't double-count.
//
// Steps:
//   1. Idempotency check on (org, orderId, sourceType) — bail if a Conversion exists.
//   2. attributeOrder() → find the CampaignSend/campaign/contact to credit.
//   3. Write a Conversion. The class is NOT in PER_TENANT_CLASSES yet, so we set
//      organization + a role-restricted ACL explicitly (the tenant beforeSave does
//      not fire for it). Works either way once it's added to the list.
//   4. When attributed to a campaign: bump Campaign revenueTotal / conversionCount /
//      orderCount (atomic $inc via bumpCampaignCounters).
//   5. When a contact resolved: bump Contact totalRevenue / orderCount / lastOrderAt
//      (LTV rollup for segmentation), even if behaviorally unattributed.
//
// Money is INTEGER MINOR UNITS (e.g. cents) end to end.
//
// Pattern (webhookIngest.js): register(agenda) wires the job; handle(data) is a
// pure async fn tests call directly with a plain data object — no live Agenda.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { attributeOrder } = require("../../lib/attribution");
const { bumpCampaignCounters } = require("../../lib/campaignCounters");
const { orgRoleACL } = require("../../cloud/lib/tenancy");

const MK = { useMasterKey: true };

// jobNames.js is SHARED (orchestrator owns it) — use a local fallback constant.
// REPORTED in integration deltas so it can be promoted into JOB_NAMES.
const INGEST_CONVERSION = "ingest-conversion";

function ptrId(v) {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

// Find an existing Conversion for the idempotency key (org, orderId, sourceType).
async function findExisting(P, org, orderId, sourceType) {
  const q = new P.Query("Conversion");
  q.equalTo("organization", org);
  q.equalTo("orderId", orderId);
  q.equalTo("sourceType", sourceType);
  return (await q.first(MK)) || null;
}

/**
 * Ingest a single conversion event.
 *
 * @param {Object} data
 * @param {Parse} [data.Parse]      - injected SDK (tests); falls back to module Parse.
 * @param {Parse.Object} data.org   - Organization.
 * @param {string} data.email       - purchaser email.
 * @param {string} data.orderId     - external order id (idempotency).
 * @param {string} [data.sourceType="manual"] - shopify|woocommerce|api|pixel|manual.
 * @param {number} data.revenue     - INTEGER minor units.
 * @param {string} [data.currency="USD"] - ISO 4217.
 * @param {number} [data.itemCount=0]
 * @param {Date|string} [data.occurredAt] - purchase time (defaults to now).
 * @param {Object} [data.raw]       - original payload for replay/debug.
 * @param {number} [data.windowDays=7] - click attribution window.
 */
async function handle(data) {
  const {
    Parse: injected,
    org,
    email,
    orderId,
    sourceType = "manual",
    revenue,
    currency = "USD",
    itemCount = 0,
    occurredAt,
    raw,
    windowDays = 7,
  } = data || {};
  const P = injected || Parse;

  if (!org) throw new P.Error(P.Error.VALIDATION_ERROR, "ingest-conversion: org required");
  if (!orderId) throw new P.Error(P.Error.VALIDATION_ERROR, "ingest-conversion: orderId required");

  const when = occurredAt
    ? occurredAt instanceof Date
      ? occurredAt
      : new Date(occurredAt)
    : new Date();
  // Money is integer minor units; coerce defensively.
  const revenueMinor = Math.trunc(Number(revenue) || 0);
  const items = Math.trunc(Number(itemCount) || 0);

  // 1. Idempotency: a repeated event for the same order must not double-count.
  const existing = await findExisting(P, org, orderId, sourceType);
  if (existing) {
    return { ok: true, duplicate: true, conversionId: existing.id };
  }

  // 2. Attribute.
  const { contact, campaignSend, campaign, attributionModel, attributionWindowDays } =
    await attributeOrder({ Parse: P, org, email, occurredAt: when, windowDays });

  // 3. Write the Conversion with explicit org + ACL (class not yet per-tenant).
  const Conversion = P.Object.extend("Conversion");
  const conversion = new Conversion();
  conversion.set("organization", org);
  conversion.set("orderId", orderId);
  conversion.set("sourceType", sourceType);
  conversion.set("revenue", revenueMinor);
  conversion.set("currency", currency);
  conversion.set("itemCount", items);
  conversion.set("occurredAt", when);
  conversion.set("attributionModel", attributionModel);
  conversion.set("attributionWindowDays", attributionWindowDays);
  if (raw) conversion.set("raw", raw);
  if (contact) conversion.set("contact", contact);
  if (campaign) conversion.set("campaign", campaign);
  if (campaignSend) conversion.set("campaignSend", campaignSend);
  const orgId = ptrId(org);
  if (orgId) conversion.setACL(orgRoleACL(orgId));
  await conversion.save(null, MK);

  const attributed = attributionModel !== "unattributed";

  // 4. Campaign counter rollup — only when attributed to a campaign.
  if (campaign) {
    await bumpCampaignCounters(campaign, {
      revenueTotal: revenueMinor,
      conversionCount: 1,
      orderCount: 1,
    });
  }

  // 5. Contact LTV rollup — whenever a contact resolved (even if unattributed).
  if (contact) {
    contact.increment("totalRevenue", revenueMinor);
    contact.increment("orderCount", 1);
    const prevLast = contact.get("lastOrderAt");
    if (!prevLast || when > prevLast) {
      contact.set("lastOrderAt", when);
    }
    await contact.save(null, MK);
  }

  return {
    ok: true,
    conversionId: conversion.id,
    attributionModel,
    attributed,
    contactId: contact ? contact.id : null,
    campaignId: campaign ? campaign.id : null,
    campaignSendId: campaignSend ? campaignSend.id : null,
  };
}

function register(agenda) {
  agenda.define(INGEST_CONVERSION, { concurrency: 20 }, (job) => handle(job.attrs.data));
}

module.exports = { register, handle, INGEST_CONVERSION };
