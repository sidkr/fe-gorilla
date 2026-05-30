// ─────────────────────────────────────────────────────────────────────────────
// Campaign counter helpers. CommonJS. Master-key.
//
// The send pipeline keeps denormalized engagement counters on Campaign so the
// reports surface reads them without aggregating EmailEvent rows. Writes are
// atomic increments (Parse `increment` op compiles to Mongo $inc) so concurrent
// webhook-ingest jobs don't clobber each other.
//
// Counter fields (mirror bootstrapSchemas.js Campaign):
//   recipientCount, sentCount, deliveredCount, openCount, clickCount,
//   bounceCount, unsubscribeCount
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");

const MK = { useMasterKey: true };

const COUNTER_FIELDS = new Set([
  "recipientCount",
  "sentCount",
  "deliveredCount",
  "openCount",
  "clickCount",
  "bounceCount",
  "unsubscribeCount",
]);

function toCampaignPointer(campaignId) {
  if (!campaignId) return null;
  if (typeof campaignId === "string") {
    const Campaign = Parse.Object.extend("Campaign");
    return Campaign.createWithoutData(campaignId);
  }
  return campaignId; // already a Parse.Object / pointer
}

// Atomically bump a Campaign counter by `by` (default 1). Uses Parse.increment so
// the save is a Mongo $inc — safe under concurrent webhook ingest.
async function bumpCounter(campaignId, field, by = 1) {
  if (!COUNTER_FIELDS.has(field)) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `bumpCounter: unknown counter field "${field}".`,
    );
  }
  const campaign = toCampaignPointer(campaignId);
  if (!campaign) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "bumpCounter requires a campaign.");
  }
  campaign.increment(field, by);
  await campaign.save(null, MK);
  return campaign;
}

// "Set only if not already set" for first-event timestamps (openedAt/clickedAt/
// unsubscribedAt on a CampaignSend). Fetches current value, writes only when
// empty — returns true if it set, false if a value already existed. Pass a
// CampaignSend Parse.Object (already fetched) for the cheapest path.
async function setFirst(campaignSend, field, date = new Date()) {
  if (!campaignSend || typeof campaignSend.get !== "function") {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "setFirst requires a CampaignSend Parse.Object.",
    );
  }
  if (campaignSend.get(field)) return false; // already set → first-event already recorded
  campaignSend.set(field, date);
  await campaignSend.save(null, MK);
  return true;
}

// Flip a Campaign sending → sent once every CampaignSend has left "queued"
// (i.e. each recipient row reached a terminal state: sent/failed/suppressed).
// Called from the send-email job after each row is processed. Idempotent and
// safe under the job's concurrency: the queued-count check plus the
// status === "sending" guard mean a late/duplicate call just no-ops. Returns
// true only on the single call that actually performs the flip.
async function finalizeCampaignIfComplete(campaignId) {
  const id = typeof campaignId === "string" ? campaignId : campaignId && campaignId.id;
  if (!id) return false;

  const pendingQ = new Parse.Query("CampaignSend");
  pendingQ.equalTo("campaign", toCampaignPointer(id));
  pendingQ.equalTo("status", "queued");
  const pending = await pendingQ.count(MK);
  if (pending > 0) return false;

  const campaign = await new Parse.Query("Campaign").get(id, MK);
  if (campaign.get("status") !== "sending") return false;

  campaign.set("status", "sent");
  if (!campaign.get("sentAt")) campaign.set("sentAt", new Date());
  await campaign.save(null, MK);
  return true;
}

module.exports = {
  bumpCounter,
  setFirst,
  finalizeCampaignIfComplete,
  COUNTER_FIELDS,
  toCampaignPointer,
};
