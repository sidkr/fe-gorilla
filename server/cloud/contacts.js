// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for Contact — single + bulk create, list, update,
// soft-delete, and a GDPR-style hard-delete. Plus the afterSave/afterDelete
// triggers that keep `List.contactCount` denormalized (F-05). CommonJS.
//
// Tenancy is automatic (tenantHooks beforeSave stamps org + ACL on create). We
// only resolve the caller's org for explicit filtering. Email is stored
// lowercased and is unique per org — the schema bootstrap created the unique
// (organization, email) index; we ALSO check explicitly so we can return a
// friendly "already on the list" error (and so it holds in test envs that don't
// run the bootstrap).
//
// Cloud functions:
//   addContact({ audienceId, email, firstName?, lastName?, status?, customFields? })
//                                                     → { id, email, ... }
//   addContactsBulk({ audienceId, contacts: [{...}] }) → { added, updated, skipped }
//   importContactsCsv({ audienceId, csv, consentAttested }) → NOT_IMPLEMENTED (later wave)
//   listContacts({ audienceId, page?, perPage?, search? }) → { rows, total, page, perPage }
//   updateContact({ id, patch })                      → { id, ... }
//   deleteContact({ id })                             → { ok } (soft delete)
//   deleteContactData({ email })                      → { ok, removed } (GDPR hard delete)
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg, orgPointer } = require("./lib/tenancy");
const { validateCustomFields } = require("./lib/customFields");

const VALID_STATUSES = ["subscribed", "unsubscribed", "cleaned", "pending"];

// The rich standard string fields a contact may carry beyond email/name/status.
// Each is an optional free-text String column on Contact.
const STD_STRING_FIELDS = ["company", "phone", "city", "country", "timezone"];
const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;
// Pragmatic RFC-5322-ish check; the real gate is the unique index + send-time
// validation. Good enough to reject obvious garbage at the API boundary.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function contactToJSON(c) {
  return {
    id: c.id,
    email: c.get("email") || "",
    firstName: c.get("firstName") || "",
    lastName: c.get("lastName") || "",
    status: c.get("status") || "subscribed",
    company: c.get("company") || "",
    phone: c.get("phone") || "",
    city: c.get("city") || "",
    country: c.get("country") || "",
    timezone: c.get("timezone") || "",
    tags: c.get("tags") || [],
    consent: c.get("consent") || null,
    customFields: c.get("customFields") || {},
    lists: c.get("lists") || [],
    deleted: c.get("deleted") === true,
    createdAt: c.createdAt ? c.createdAt.toISOString() : null,
    updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
  };
}

// Load the org's CustomField registry as plain {key,type,enumValues} objects,
// the shape validateCustomFields expects. Master key — the registry is org-wide.
async function loadRegistry(org) {
  const q = new Parse.Query("CustomField");
  q.equalTo("organization", org);
  q.ascending("order");
  q.limit(1000);
  const rows = await q.find({ useMasterKey: true });
  return rows.map((f) => ({
    key: f.get("key"),
    type: f.get("type"),
    enumValues: f.get("enumValues") || [],
  }));
}

// Normalize an incoming tags value to a clean array of non-empty trimmed
// strings (dedup). Accepts an array, or a comma-separated string. Anything else
// → []. Returns null when the caller did not send `tags` at all (so callers can
// distinguish "not provided" from "cleared to empty").
function normTags(raw) {
  if (raw === undefined) return null;
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === "string") arr = raw.split(",");
  const out = [];
  const seen = new Set();
  for (const t of arr) {
    const s = String(t == null ? "" : t).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

// Apply the rich standard fields (company/phone/city/country/timezone) from a
// raw params/row object onto a Contact. Only sets keys that were provided.
function applyStdStringFields(contact, src) {
  for (const f of STD_STRING_FIELDS) {
    if (src[f] != null) contact.set(f, String(src[f]));
  }
}

// Apply tags + consent if provided. consent is stored as-is when it's an object.
function applyTagsAndConsent(contact, src) {
  const tags = normTags(src.tags);
  if (tags !== null) contact.set("tags", tags);
  if (src.consent !== undefined) {
    if (src.consent && typeof src.consent === "object") {
      contact.set("consent", src.consent);
    } else if (src.consent === null) {
      contact.unset("consent");
    }
  }
}

// Clean a raw customFields map against the org registry and apply the result.
// `mode` "set" replaces the map; "merge" merges cleaned keys onto the existing
// map (used by bulk update of an existing contact). Returns the errors map so a
// caller could surface it; we do not reject (foundation contract: never throw).
async function applyCustomFields(contact, rawMap, registry, mode) {
  if (rawMap == null || typeof rawMap !== "object") return {};
  const { cleaned, errors } = validateCustomFields(rawMap, registry);
  if (mode === "merge") {
    contact.set("customFields", {
      ...(contact.get("customFields") || {}),
      ...cleaned,
    });
  } else {
    contact.set("customFields", cleaned);
  }
  return errors;
}

// Verify a List id belongs to the caller's org (session-scoped). Throws if not.
async function assertOwnedList(user, audienceId) {
  if (!audienceId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "audienceId is required.");
  }
  try {
    return await new Parse.Query("List").get(audienceId, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Audience not found.");
  }
}

// Find a contact by email within an org (master key — the count/dedupe path
// must see all rows regardless of session ACL races). Returns null if none.
async function findContactByEmail(org, email) {
  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("email", email);
  return (await q.first({ useMasterKey: true })) || null;
}

// ── addContact ────────────────────────────────────────────────────────────────
// Single contact onto a list. Duplicate email in the org → friendly 137-style
// error so the UI can offer "open contact" (F-08). If the contact exists but is
// soft-deleted, we revive it onto the list instead of erroring.
Parse.Cloud.define("addContact", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const email = normEmail(p.email);

  if (!email || !EMAIL_RE.test(email)) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A valid email is required.");
  }
  const status = VALID_STATUSES.includes(p.status) ? p.status : "subscribed";

  const list = await assertOwnedList(user, p.audienceId);
  const org = await getUserOrg(user, { useMasterKey: true });

  const existing = await findContactByEmail(org, email);
  if (existing && existing.get("deleted") !== true) {
    const err = new Parse.Error(
      Parse.Error.DUPLICATE_VALUE,
      "This email is already on the list.",
    );
    err.contactId = existing.id; // surfaced to UI for the "open contact" link
    throw err;
  }

  let contact;
  if (existing) {
    // Revive a soft-deleted contact.
    contact = existing;
    contact.set("deleted", false);
  } else {
    const Contact = Parse.Object.extend("Contact");
    contact = new Contact();
    contact.set("email", email);
  }
  contact.set("status", status);
  if (p.firstName != null) contact.set("firstName", String(p.firstName));
  if (p.lastName != null) contact.set("lastName", String(p.lastName));
  applyStdStringFields(contact, p);
  applyTagsAndConsent(contact, p);
  if (p.customFields && typeof p.customFields === "object") {
    const registry = await loadRegistry(org);
    await applyCustomFields(contact, p.customFields, registry, "set");
  }
  // Add the list id to the membership array (dedup).
  const lists = new Set(contact.get("lists") || []);
  lists.add(list.id);
  contact.set("lists", Array.from(lists));

  await contact.save(null, { sessionToken: user.getSessionToken() });
  return contactToJSON(contact);
});

// ── addContactsBulk ───────────────────────────────────────────────────────────
// Array of contacts onto one list. Within-batch dedup collapses to last
// occurrence; existing org contacts are UPDATED (custom fields merged, added to
// the list) rather than erroring (F-07 semantics, manual path). Returns counts.
Parse.Cloud.define("addContactsBulk", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const incoming = Array.isArray(p.contacts) ? p.contacts : [];

  const list = await assertOwnedList(user, p.audienceId);
  const org = await getUserOrg(user, { useMasterKey: true });
  const sessionToken = user.getSessionToken();

  // Collapse within-batch duplicates to the last occurrence.
  const byEmail = new Map();
  let skipped = 0;
  for (const row of incoming) {
    const email = normEmail(row && row.email);
    if (!email || !EMAIL_RE.test(email)) {
      skipped += 1;
      continue;
    }
    byEmail.set(email, row);
  }

  let added = 0;
  let updated = 0;
  const Contact = Parse.Object.extend("Contact");
  const registry = await loadRegistry(org);

  for (const [email, row] of byEmail) {
    const existing = await findContactByEmail(org, email);
    let contact;
    if (existing) {
      contact = existing;
      if (contact.get("deleted") === true) contact.set("deleted", false);
      // Merge cleaned custom fields rather than clobber.
      await applyCustomFields(contact, row.customFields, registry, "merge");
      updated += 1;
    } else {
      contact = new Contact();
      contact.set("email", email);
      contact.set(
        "status",
        VALID_STATUSES.includes(row.status) ? row.status : "subscribed",
      );
      await applyCustomFields(contact, row.customFields, registry, "set");
      added += 1;
    }
    if (row.firstName != null) contact.set("firstName", String(row.firstName));
    if (row.lastName != null) contact.set("lastName", String(row.lastName));
    applyStdStringFields(contact, row);
    applyTagsAndConsent(contact, row);
    const lists = new Set(contact.get("lists") || []);
    lists.add(list.id);
    contact.set("lists", Array.from(lists));
    await contact.save(null, { sessionToken });
  }

  return { added, updated, skipped };
});

// ── importContactsCsv ─────────────────────────────────────────────────────────
// CSV import (F-07) is a later wave (column mapping wizard + batched job +
// errors.csv). Stub returns NOT_IMPLEMENTED so the contract is registered.
Parse.Cloud.define("importContactsCsv", async (request) => {
  requireUser(request);
  throw new Parse.Error(
    Parse.Error.COMMAND_UNAVAILABLE,
    "CSV import is not implemented yet. Use addContact / addContactsBulk.",
  );
});

// ── listContacts ──────────────────────────────────────────────────────────────
// Paginated list of a list's contacts (excludes soft-deleted). Optional `search`
// matches the email prefix. Returns rows + total for the pager (F-08 table).
Parse.Cloud.define("listContacts", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const list = await assertOwnedList(user, p.audienceId);
  const org = await getUserOrg(user, { useMasterKey: true });
  const sessionToken = user.getSessionToken();

  const page = Math.max(0, parseInt(p.page, 10) || 0);
  let perPage = parseInt(p.perPage, 10) || DEFAULT_PER_PAGE;
  perPage = Math.min(MAX_PER_PAGE, Math.max(1, perPage));

  function baseQuery() {
    const q = new Parse.Query("Contact");
    q.equalTo("organization", org);
    q.equalTo("lists", list.id);
    q.notEqualTo("deleted", true);
    if (p.search) {
      q.startsWith("email", normEmail(p.search));
    }
    if (p.status && VALID_STATUSES.includes(p.status)) {
      q.equalTo("status", p.status);
    }
    if (p.tag) {
      q.equalTo("tags", String(p.tag));
    }
    return q;
  }

  const total = await baseQuery().count({ sessionToken });

  const q = baseQuery();
  q.descending("createdAt");
  q.skip(page * perPage);
  q.limit(perPage);
  const rows = await q.find({ sessionToken });

  return {
    rows: rows.map(contactToJSON),
    total,
    page,
    perPage,
  };
});

// ── updateContact ─────────────────────────────────────────────────────────────
// Patch email / names / status / customFields / list membership. Editing email
// re-checks org uniqueness. Setting status=unsubscribed writes a Suppression
// row (reason "manual") per F-08/F-09.
Parse.Cloud.define("updateContact", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const id = p.id;
  const patch = p.patch || {};
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Contact id is required.");
  }

  const sessionToken = user.getSessionToken();
  const org = await getUserOrg(user, { useMasterKey: true });

  let contact;
  try {
    contact = await new Parse.Query("Contact").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Contact not found.");
  }

  if (patch.email != null) {
    const newEmail = normEmail(patch.email);
    if (!newEmail || !EMAIL_RE.test(newEmail)) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A valid email is required.");
    }
    if (newEmail !== contact.get("email")) {
      const clash = await findContactByEmail(org, newEmail);
      if (clash && clash.id !== contact.id && clash.get("deleted") !== true) {
        const err = new Parse.Error(
          Parse.Error.DUPLICATE_VALUE,
          "Another contact already uses this email.",
        );
        err.contactId = clash.id;
        throw err;
      }
      contact.set("email", newEmail);
    }
  }
  if (patch.firstName != null) contact.set("firstName", String(patch.firstName));
  if (patch.lastName != null) contact.set("lastName", String(patch.lastName));
  applyStdStringFields(contact, patch);
  applyTagsAndConsent(contact, patch);
  if (patch.customFields && typeof patch.customFields === "object") {
    const registry = await loadRegistry(org);
    await applyCustomFields(contact, patch.customFields, registry, "set");
  }
  if (Array.isArray(patch.lists)) {
    contact.set("lists", Array.from(new Set(patch.lists)));
  }

  let nowUnsubscribed = false;
  if (patch.status != null) {
    if (!VALID_STATUSES.includes(patch.status)) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Invalid status.");
    }
    nowUnsubscribed =
      patch.status === "unsubscribed" &&
      contact.get("status") !== "unsubscribed";
    contact.set("status", patch.status);
  }

  await contact.save(null, { sessionToken });

  // Manual unsubscribe → ensure a Suppression row exists (idempotent per email).
  if (nowUnsubscribed) {
    await ensureSuppression(org, contact.get("email"), "manual", sessionToken);
  }

  return contactToJSON(contact);
});

// Create a Suppression row for (org, email) if one doesn't already exist.
async function ensureSuppression(org, email, reason, sessionToken) {
  const e = normEmail(email);
  if (!e) return;
  const q = new Parse.Query("Suppression");
  q.equalTo("organization", org);
  q.equalTo("email", e);
  const existing = await q.first({ useMasterKey: true });
  if (existing) return;
  const Suppression = Parse.Object.extend("Suppression");
  const s = new Suppression();
  s.set("email", e);
  s.set("reason", reason);
  // Save as the user so tenancy stamps org + ACL.
  await s.save(null, { sessionToken });
}

// ── deleteContact (soft) ────────────────────────────────────────────────────--
// Marks deleted=true; keeps the row for history/audit. Removed from default
// listings and recipient resolution. afterSave recomputes affected counts.
Parse.Cloud.define("deleteContact", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Contact id is required.");
  }
  const sessionToken = user.getSessionToken();
  let contact;
  try {
    contact = await new Parse.Query("Contact").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Contact not found.");
  }
  contact.set("deleted", true);
  await contact.save(null, { sessionToken });
  return { ok: true };
});

// ── bulkDeleteContacts (soft) ─────────────────────────────────────────────────
// Soft-delete many contacts by id in one round-trip (table bulk action). Ids not
// in the caller's org are silently skipped (ACL hides them). Returns the count.
Parse.Cloud.define("bulkDeleteContacts", async (request) => {
  const user = requireUser(request);
  const ids = Array.isArray(request.params && request.params.ids)
    ? request.params.ids
    : [];
  if (ids.length === 0) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "ids[] is required.");
  }
  const sessionToken = user.getSessionToken();

  const q = new Parse.Query("Contact");
  q.containedIn("objectId", ids.map(String));
  q.notEqualTo("deleted", true);
  q.limit(1000);
  const rows = await q.find({ sessionToken });
  for (const c of rows) c.set("deleted", true);
  if (rows.length) await Parse.Object.saveAll(rows, { sessionToken });
  return { ok: true, deleted: rows.length };
});

// ── bulkTagContacts ──────────────────────────────────────────────────────────
// Add or remove a tag across many contacts in one call (table bulk action).
// `action` is "add" (default) or "remove". Returns how many rows were updated.
Parse.Cloud.define("bulkTagContacts", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const ids = Array.isArray(p.ids) ? p.ids : [];
  const tag = String(p.tag == null ? "" : p.tag).trim();
  const action = p.action === "remove" ? "remove" : "add";
  if (ids.length === 0) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "ids[] is required.");
  }
  if (!tag) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A tag is required.");
  }
  const sessionToken = user.getSessionToken();

  const q = new Parse.Query("Contact");
  q.containedIn("objectId", ids.map(String));
  q.notEqualTo("deleted", true);
  q.limit(1000);
  const rows = await q.find({ sessionToken });

  let changed = 0;
  for (const c of rows) {
    const set = new Set(c.get("tags") || []);
    const had = set.has(tag);
    if (action === "add") set.add(tag);
    else set.delete(tag);
    const nowHas = set.has(tag);
    if (had !== nowHas) {
      c.set("tags", Array.from(set));
      changed += 1;
    }
  }
  const dirty = rows.filter((c) => c.dirty("tags"));
  if (dirty.length) await Parse.Object.saveAll(dirty, { sessionToken });
  return { ok: true, updated: changed };
});

// ── deleteContactData (GDPR hard delete) ────────────────────────────────────--
// Permanently destroys every Contact row for an email in the caller's org AND
// adds a Suppression row so the address can never be re-imported/sent (right to
// erasure + do-not-contact). Returns how many contact rows were removed.
Parse.Cloud.define("deleteContactData", async (request) => {
  const user = requireUser(request);
  const email = normEmail(request.params && request.params.email);
  if (!email) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "email is required.");
  }
  const org = await getUserOrg(user, { useMasterKey: true });
  const sessionToken = user.getSessionToken();

  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("email", email);
  q.limit(1000);
  const rows = await q.find({ useMasterKey: true });

  // Suppress first so a concurrent re-add can't slip through, then destroy.
  await ensureSuppression(org, email, "gdpr", sessionToken);

  let removed = 0;
  for (const c of rows) {
    await c.destroy({ useMasterKey: true });
    removed += 1;
  }
  return { ok: true, removed };
});

// ─────────────────────────────────────────────────────────────────────────────
// List.contactCount maintenance
//
// Contact.afterSave / afterDelete recompute the denormalized contactCount on
// every List the contact touches (F-05). We count only NON-deleted, status !=
// "cleaned"? — no: contactCount tracks list membership of live contacts. We
// count rows where the list id is in `lists` and deleted != true.
//
// We must reconcile BOTH the lists the contact is on now AND any it was just
// removed from, so we union the current membership with the previous one.
// ─────────────────────────────────────────────────────────────────────────────

async function recomputeListCount(listId) {
  const q = new Parse.Query("Contact");
  q.equalTo("lists", listId);
  q.notEqualTo("deleted", true);
  const count = await q.count({ useMasterKey: true });

  let list;
  try {
    list = await new Parse.Query("List").get(listId, { useMasterKey: true });
  } catch (err) {
    return; // list gone; nothing to update
  }
  list.set("contactCount", count);
  await list.save(null, { useMasterKey: true });
}

Parse.Cloud.afterSave("Contact", async (request) => {
  const object = request.object;
  const original = request.original;
  const current = object.get("lists") || [];
  const previous = (original && original.get("lists")) || [];
  const affected = new Set([...current, ...previous]);
  for (const listId of affected) {
    if (listId) await recomputeListCount(listId);
  }
});

Parse.Cloud.afterDelete("Contact", async (request) => {
  const object = request.object;
  const lists = object.get("lists") || [];
  for (const listId of lists) {
    if (listId) await recomputeListCount(listId);
  }
});
