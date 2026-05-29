// ─────────────────────────────────────────────────────────────────────────────
// Suppression list helpers. CommonJS. Master-key. Sending.md §5 + §12.
//
// Per-org suppression (DECISIONS #4): once an email lands here for a given org,
// no future send to that (org, email) pair goes out. Unique on (organization,
// email). Emails are lowercased on the way in.
//
// Reasons (Sending.md §5): "hard_bounce" | "soft_bounce_threshold" |
//                          "complaint" | "unsubscribe" | "manual".
//
// These run inside worker jobs + the fanout/ingest pipeline — always master key.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");

const MK = { useMasterKey: true };

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Coerce an Organization id or pointer/object into a pointer for queries/saves.
function toOrgPointer(orgPointerOrId) {
  if (!orgPointerOrId) return null;
  if (typeof orgPointerOrId === "string") {
    const Organization = Parse.Object.extend("Organization");
    return Organization.createWithoutData(orgPointerOrId);
  }
  return orgPointerOrId; // already a Parse.Object / pointer
}

function orgId(orgPointerOrId) {
  if (!orgPointerOrId) return null;
  return typeof orgPointerOrId === "string" ? orgPointerOrId : orgPointerOrId.id;
}

// True if (org, email) is suppressed. O(log n) via the unique compound index.
async function isSuppressed(orgPointerOrId, email) {
  const org = toOrgPointer(orgPointerOrId);
  if (!org) return false;
  const q = new Parse.Query("Suppression");
  q.equalTo("organization", org);
  q.equalTo("email", normalizeEmail(email));
  const hit = await q.first(MK);
  return !!hit;
}

// Upsert a suppression on (organization, email). Idempotent: a repeat call for
// the same pair updates lastEventAt + bumps eventCount instead of creating a
// duplicate. Returns the Suppression Parse.Object.
//
//   addSuppression({ organization, email, reason, campaign? })
async function addSuppression({ organization, email, reason, campaign } = {}) {
  if (!organization) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "addSuppression requires an organization.",
    );
  }
  const org = toOrgPointer(organization);
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "addSuppression requires an email.");
  }

  const q = new Parse.Query("Suppression");
  q.equalTo("organization", org);
  q.equalTo("email", normalized);
  let row = await q.first(MK);

  const now = new Date();
  if (row) {
    row.set("lastEventAt", now);
    row.increment("eventCount", 1);
    // Escalate reason to a harder one if applicable, but never downgrade.
    if (reason && shouldOverrideReason(row.get("reason"), reason)) {
      row.set("reason", reason);
    }
  } else {
    const Suppression = Parse.Object.extend("Suppression");
    row = new Suppression();
    row.set("organization", org);
    row.set("email", normalized);
    row.set("reason", reason || "manual");
    row.set("firstSuppressedAt", now);
    row.set("lastEventAt", now);
    row.set("eventCount", 1);
  }
  if (campaign) row.set("lastCampaign", campaign);

  await row.save(null, MK);
  return row;
}

// Ranking so a later soft event never downgrades a hard suppression.
const REASON_RANK = {
  soft_bounce_threshold: 1,
  unsubscribe: 2,
  manual: 2,
  complaint: 3,
  hard_bounce: 3,
};
function shouldOverrideReason(existing, incoming) {
  return (REASON_RANK[incoming] || 0) > (REASON_RANK[existing] || 0);
}

module.exports = {
  isSuppressed,
  addSuppression,
  normalizeEmail,
  toOrgPointer,
  orgId,
};
