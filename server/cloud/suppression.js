// ─────────────────────────────────────────────────────────────────────────────
// Suppression management cloud functions (Track C, F-28).
//
// The Suppression class is populated automatically by the send pipeline on
// bounce/complaint (server/lib/suppression.js). These functions add a manual
// management surface on top: list (search + pagination), manual add (paste/CSV),
// and remove (which writes a SuppressionAuditLog row before deleting).
//
// Org-scoped: org resolved from the authed user via getUserOrg (pins to the
// caller's OWN org). Suppression is in PER_TENANT_CLASSES, so creating a row as
// the user auto-stamps organization + a role ACL; the manual-add path reuses the
// lib helper (master key, sets org explicitly). Mirrors server/cloud/settings.js.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");
const { addSuppression, normalizeEmail } = require("../lib/suppression");

const MK = { useMasterKey: true };
const PAGE_SIZE = 50;

// Reasons the manual surface understands. Anything else collapses to "manual".
const MANUAL_REASONS = ["manual", "unsubscribe"];

// Irrevocable reasons (Sending.md §5): a hard bounce or a spam complaint must
// stay suppressed — re-sending to these addresses wrecks deliverability/sender
// reputation and, for complaints, can violate anti-spam law. They are the
// highest-rank reasons (REASON_RANK 3) and CANNOT be removed from the list.
const IRREVOCABLE_REASONS = ["hard_bounce", "complaint"];

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "You must be signed in.");
  }
  return request.user;
}

// Parse a paste/CSV blob or array into a flat list of unique, valid lowercased
// emails. Permissive shape check — real validation is SES's job.
function parseEmails(input) {
  let raw = [];
  if (Array.isArray(input)) raw = input;
  else if (typeof input === "string") raw = input.split(/[\s,;]+/);

  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const email = normalizeEmail(item);
    if (!email) continue;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

function suppressionToJSON(s) {
  const campaign = s.get("lastCampaign");
  return {
    id: s.id,
    email: s.get("email") || "",
    reason: s.get("reason") || "manual",
    campaignId: campaign ? campaign.id : null,
    eventCount: s.get("eventCount") || 1,
    addedAt: s.get("firstSuppressedAt")
      ? s.get("firstSuppressedAt").toISOString()
      : s.get("createdAt")
        ? s.get("createdAt").toISOString()
        : null,
    lastEventAt: s.get("lastEventAt") ? s.get("lastEventAt").toISOString() : null,
  };
}

// ── listSuppressions ────────────────────────────────────────────────────────-
// Paginated, optionally search-filtered list of the caller's org suppressions,
// newest first.
Parse.Cloud.define("listSuppressions", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const { search, page } = request.params || {};
  const pageNum = Math.max(0, parseInt(page, 10) || 0);
  const term = search && String(search).trim().toLowerCase();

  function baseQuery() {
    const q = new Parse.Query("Suppression");
    q.equalTo("organization", org);
    if (term) q.contains("email", term);
    return q;
  }

  const listQ = baseQuery();
  listQ.descending("firstSuppressedAt");
  listQ.limit(PAGE_SIZE);
  listQ.skip(pageNum * PAGE_SIZE);

  const [rows, total] = await Promise.all([
    listQ.find(MK),
    baseQuery().count(MK),
  ]);

  return {
    results: rows.map(suppressionToJSON),
    total,
    page: pageNum,
    pageSize: PAGE_SIZE,
    hasMore: (pageNum + 1) * PAGE_SIZE < total,
  };
});

// ── addSuppressions ─────────────────────────────────────────────────────────-
// Manual add from a paste/CSV blob (or array). reason defaults to "manual".
// Idempotent per (org, email): re-adding an existing address bumps its event
// count instead of duplicating, and is counted as "skipped".
Parse.Cloud.define("addSuppressions", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const { emails, reason } = request.params || {};
  const finalReason = MANUAL_REASONS.includes(reason) ? reason : "manual";

  const parsed = parseEmails(emails);
  if (!parsed.length) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "No valid email addresses provided.");
  }

  let added = 0;
  let skipped = 0;
  for (const email of parsed) {
    // Pre-check existence so we can honestly report added vs skipped — the lib
    // helper is an idempotent upsert and doesn't surface a created flag.
    const existsQ = new Parse.Query("Suppression");
    existsQ.equalTo("organization", org);
    existsQ.equalTo("email", email);
    const existing = await existsQ.first(MK);

    await addSuppression({ organization: org, email, reason: finalReason });
    if (existing) skipped += 1;
    else added += 1;
  }

  return { added, skipped, total: parsed.length };
});

// ── removeSuppression ───────────────────────────────────────────────────────-
// Remove one suppression. Writes a SuppressionAuditLog row BEFORE destroying so
// the removal is always traceable. Org-scoped lookup.
Parse.Cloud.define("removeSuppression", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "A suppression id is required.");

  const q = new Parse.Query("Suppression");
  q.equalTo("organization", org);
  q.equalTo("objectId", id);
  const obj = await q.first(MK);
  if (!obj) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Suppression not found.");

  // Irrevocable reasons (hard bounce / complaint) can never be un-suppressed.
  // Re-mailing them tanks deliverability and, for complaints, risks legal
  // exposure. Reject before writing the audit row or destroying anything.
  const reason = obj.get("reason");
  if (IRREVOCABLE_REASONS.includes(reason)) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      `This address is permanently suppressed (${reason}) and cannot be removed.`,
    );
  }

  const email = obj.get("email");

  // Audit row first. SuppressionAuditLog is NOT a per-tenant class (no beforeSave
  // stamp), so we set organization + ACL explicitly here.
  const AuditLog = Parse.Object.extend("SuppressionAuditLog");
  const audit = new AuditLog();
  audit.set("organization", org);
  audit.set("action", "remove");
  audit.set("email", email);
  audit.set("reason", obj.get("reason"));
  audit.set("suppressionId", obj.id);
  audit.set("actorId", user.id);
  audit.setACL(orgRoleACL(org.id));
  await audit.save(null, MK);

  await obj.destroy(MK);
  return { removed: true, id, email };
});

module.exports = { parseEmails };
