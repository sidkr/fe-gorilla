// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for Audience (a.k.a. the `List` class) — create, list, get,
// archive, and resolve a list to its Contact[] for campaign fanout. CommonJS.
//
// An "Audience" in the product UI maps 1:1 to the `List` Parse class (the
// Features.md "AudienceList" name is superseded — see DECISIONS #9). Tenancy is
// automatic: the tenantHooks beforeSave stamps `organization` + a role ACL on
// every new List, so we never set those by hand. We resolve the caller's org
// only for explicit `equalTo("organization", org)` filtering / index locality.
//
// Cloud functions:
//   createAudience({ name, description? })            → { id, name, contactCount }
//   listAudiences()                                   → [{ id, name, description, contactCount, createdAt }, ...]
//   getAudience({ id })                               → { id, name, description, contactCount, createdAt }
//   archiveAudience({ id })                           → { ok } (soft: sets archived=true)
//   resolveAudienceRecipients({ id, excludeSuppressed? }) → [{ id, email, firstName, lastName }, ...]
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");

const MAX_NAME_LEN = 80;

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

function audienceToJSON(list) {
  return {
    id: list.id,
    name: list.get("name") || "",
    description: list.get("description") || "",
    contactCount: list.get("contactCount") || 0,
    archived: list.get("archived") === true,
    createdAt: list.createdAt ? list.createdAt.toISOString() : null,
  };
}

// ── createAudience ────────────────────────────────────────────────────────────
// Requires a non-empty name (≤80 chars, F-05). The tenancy hook stamps org+ACL.
Parse.Cloud.define("createAudience", async (request) => {
  const user = requireUser(request);
  const name = (request.params && request.params.name) || "";
  const description = (request.params && request.params.description) || "";

  const trimmed = String(name).trim();
  if (!trimmed) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Audience name is required.");
  }
  if (trimmed.length > MAX_NAME_LEN) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      `Audience name must be ${MAX_NAME_LEN} characters or fewer.`,
    );
  }

  const List = Parse.Object.extend("List");
  const list = new List();
  list.set("name", trimmed);
  if (description) list.set("description", String(description).trim());
  list.set("contactCount", 0);
  list.set("archived", false);

  // Save AS THE USER (sessionToken) so the tenancy beforeSave stamps org + ACL.
  await list.save(null, { sessionToken: user.getSessionToken() });
  return audienceToJSON(list);
});

// ── listAudiences ───────────────────────────────────────────────────────────--
// All non-archived lists for the caller's org, newest first. ACL already
// isolates; the org filter is for index locality + explicitness.
Parse.Cloud.define("listAudiences", async (request) => {
  const user = requireUser(request);
  const includeArchived =
    request.params && request.params.includeArchived === true;
  const org = await getUserOrg(user, { useMasterKey: true });

  const q = new Parse.Query("List");
  q.equalTo("organization", org);
  if (!includeArchived) q.notEqualTo("archived", true);
  q.descending("createdAt");
  q.limit(1000);

  const rows = await q.find({ sessionToken: user.getSessionToken() });
  return rows.map(audienceToJSON);
});

// ── getAudience ───────────────────────────────────────────────────────────────
Parse.Cloud.define("getAudience", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Audience id is required.");
  }

  const q = new Parse.Query("List");
  let list;
  try {
    list = await q.get(id, { sessionToken: user.getSessionToken() });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Audience not found.");
  }
  return audienceToJSON(list);
});

// ── archiveAudience ───────────────────────────────────────────────────────────
// Soft-archive: hides the list from the default listing. We do NOT hard-delete
// (Features F-05 only allows hard delete when contactCount === 0; archiving is
// the safe always-available action and keeps contact history intact).
Parse.Cloud.define("archiveAudience", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Audience id is required.");
  }

  const q = new Parse.Query("List");
  let list;
  try {
    list = await q.get(id, { sessionToken: user.getSessionToken() });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Audience not found.");
  }
  list.set("archived", true);
  await list.save(null, { sessionToken: user.getSessionToken() });
  return { ok: true };
});

// ── resolveAudienceRecipients ───────────────────────────────────────────────--
// Returns the Contact rows on a list that are eligible to receive a campaign:
// status === "subscribed", optionally minus any org Suppression rows. Used by
// the send pipeline (Sending.md §5). Runs with the master key so fanout works
// from a worker context too, but still scopes by the resolved org.
Parse.Cloud.define("resolveAudienceRecipients", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  const excludeSuppressed =
    !request.params || request.params.excludeSuppressed !== false; // default true
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Audience id is required.");
  }

  const org = await getUserOrg(user, { useMasterKey: true });

  // Confirm the list belongs to the caller's org (session-scoped read).
  try {
    await new Parse.Query("List").get(id, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Audience not found.");
  }

  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("lists", id);
  q.equalTo("status", "subscribed");
  q.notEqualTo("deleted", true);
  q.limit(100000);
  const contacts = await q.find({ useMasterKey: true });

  let suppressed = new Set();
  if (excludeSuppressed) {
    const sq = new Parse.Query("Suppression");
    sq.equalTo("organization", org);
    sq.limit(100000);
    const supp = await sq.find({ useMasterKey: true });
    suppressed = new Set(
      supp.map((s) => String(s.get("email") || "").toLowerCase()),
    );
  }

  return contacts
    .filter((c) => !suppressed.has(String(c.get("email") || "").toLowerCase()))
    .map((c) => ({
      id: c.id,
      email: c.get("email"),
      firstName: c.get("firstName") || "",
      lastName: c.get("lastName") || "",
    }));
});
