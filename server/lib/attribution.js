// ─────────────────────────────────────────────────────────────────────────────
// attribution.js — last-touch attribution matcher for revenue events. CommonJS.
//
// Given a purchase event (org + email + occurredAt), decide which CampaignSend —
// if any — should get credit, using the last-touch model (RevenueAttribution §2):
//
//   1. Most-recent CLICK within `windowDays` (default 7) for this org+contact
//      → attributionModel = "last_click".
//   2. Else most-recent OPEN within 1 day  → "last_open" (weaker signal).
//   3. Else null (unattributed)            → "unattributed".
//
// Open/click signals are read from the EmailEvent class, which the send +
// tracking pipeline writes one row per engagement event:
//   EmailEvent { organization, campaign, campaignSend, contact, type, timestamp }
// where type ∈ { "open", "click", "delivered", "bounce", ... }. We only look at
// "click" and "open". The event-occurred time lives on `timestamp` (NOT createdAt).
//
// Contact is resolved by lowercased email within the org. This module only
// resolves *who* to credit; all money/counter math lives in the ingest job.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");

const MK = { useMasterKey: true };
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_WINDOW_DAYS = 1;

// Resolve a Contact for an org by lowercased email. Returns the Parse.Object or null.
async function resolveContact(P, org, email) {
  const normEmail = String(email || "").trim().toLowerCase();
  if (!normEmail) return null;
  const q = new P.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("email", normEmail);
  return (await q.first(MK)) || null;
}

// Most-recent EmailEvent of `type` for org+contact within [occurredAt - days, occurredAt].
// Returns the Parse.Object (campaignSend + campaign included) or null.
async function mostRecentEvent(P, org, contact, type, occurredAt, days) {
  const since = new Date(occurredAt.getTime() - days * DAY_MS);
  const q = new P.Query("EmailEvent");
  q.equalTo("organization", org);
  q.equalTo("contact", contact);
  q.equalTo("type", type);
  q.greaterThanOrEqualTo("timestamp", since);
  q.lessThanOrEqualTo("timestamp", occurredAt);
  q.descending("timestamp");
  q.include("campaignSend");
  q.include("campaign");
  return (await q.first(MK)) || null;
}

// Pull the campaign for an attributing event: prefer the event's own pointer,
// else fall back to the campaignSend's campaign pointer.
function campaignFor(event, campaignSend) {
  return (
    event.get("campaign") ||
    (campaignSend && campaignSend.get("campaign")) ||
    null
  );
}

/**
 * Attribute an order to a CampaignSend via last-touch click → open → none.
 *
 * @param {Object} args
 * @param {Parse} [args.Parse]        - injected SDK (tests); falls back to the module's Parse.
 * @param {Parse.Object} args.org     - Organization object/pointer.
 * @param {string} args.email         - purchaser email (case-insensitive).
 * @param {Date|string} args.occurredAt - when the purchase happened.
 * @param {number} [args.windowDays=7]  - click lookback window in days.
 * @returns {Promise<{contact, campaignSend, campaign, attributionModel, attributionWindowDays}>}
 */
async function attributeOrder({ Parse: injected, org, email, occurredAt, windowDays = 7 }) {
  const P = injected || Parse;
  const when = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);

  const contact = await resolveContact(P, org, email);

  // No known contact → cannot attribute by behavior.
  if (!contact) {
    return {
      contact: null,
      campaignSend: null,
      campaign: null,
      attributionModel: "unattributed",
      attributionWindowDays: windowDays,
    };
  }

  // 1. Last-touch click within the click window.
  const click = await mostRecentEvent(P, org, contact, "click", when, windowDays);
  if (click) {
    const campaignSend = click.get("campaignSend") || null;
    return {
      contact,
      campaignSend,
      campaign: campaignFor(click, campaignSend),
      attributionModel: "last_click",
      attributionWindowDays: windowDays,
    };
  }

  // 2. Fallback: last-touch open within the (shorter) open window.
  const open = await mostRecentEvent(P, org, contact, "open", when, OPEN_WINDOW_DAYS);
  if (open) {
    const campaignSend = open.get("campaignSend") || null;
    return {
      contact,
      campaignSend,
      campaign: campaignFor(open, campaignSend),
      attributionModel: "last_open",
      attributionWindowDays: OPEN_WINDOW_DAYS,
    };
  }

  // 3. Known contact, no behavioral signal in window → unattributed.
  return {
    contact,
    campaignSend: null,
    campaign: null,
    attributionModel: "unattributed",
    attributionWindowDays: windowDays,
  };
}

module.exports = { attributeOrder, resolveContact, OPEN_WINDOW_DAYS };
