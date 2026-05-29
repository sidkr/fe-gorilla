// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for the per-org custom-field registry (`CustomField` class).
// CommonJS. Required from main.js after the tenancy spine.
//
// A CustomField is a tenant-scoped DATA-POINT DEFINITION: it declares that
// contacts in this org may carry a value under `customFields.<key>` of a given
// type. The registry is consumed by the contact-capture form (which fields to
// render), the segment rule builder (what to filter on), and the editor
// (merge-tags). Validation/coercion of actual contact values lives in
// lib/customFields.js (validateCustomFields) — this file owns the DEFINITIONS.
//
// Tenancy is automatic: `CustomField` is in PER_TENANT_CLASSES, so the
// tenantHooks beforeSave stamps `organization` + a role ACL on every new row. We
// never set those by hand; we only resolve the caller's org for explicit
// filtering / the uniqueness check.
//
// Cloud functions:
//   listCustomFields()                                   → CustomField[]
//   createCustomField({ label, type, enumValues?, required?, key? }) → CustomField
//   updateCustomField({ id, patch })                     → CustomField
//   deleteCustomField({ id })                            → { ok }
//
// CustomField JSON shape (the one contract the frontend mirrors):
//   { id, key, label, type, enumValues, required, order }
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");
const { FIELD_TYPES, slugifyKey } = require("./lib/customFields");

const MAX_LABEL_LEN = 80;

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

function fieldToJSON(f) {
  return {
    id: f.id,
    key: f.get("key") || "",
    label: f.get("label") || "",
    type: f.get("type") || "text",
    enumValues: f.get("enumValues") || [],
    required: f.get("required") === true,
    order: typeof f.get("order") === "number" ? f.get("order") : 0,
  };
}

// ── listCustomFields ──────────────────────────────────────────────────────────
// The org's full registry, ordered by `order` then label. ACL already isolates;
// the org filter is for index locality + explicitness.
Parse.Cloud.define("listCustomFields", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, { useMasterKey: true });

  const q = new Parse.Query("CustomField");
  q.equalTo("organization", org);
  q.ascending("order").addAscending("label");
  q.limit(1000);

  const rows = await q.find({ sessionToken: user.getSessionToken() });
  return rows.map(fieldToJSON);
});

// ── createCustomField ─────────────────────────────────────────────────────────
// Validate type ∈ FIELD_TYPES; derive `key` from the label via slugifyKey if not
// given; enforce unique key per org (DUPLICATE_VALUE if taken); enum requires a
// non-empty enumValues array. `order` defaults to the current field count so new
// fields append to the end. Created AS THE USER so tenancy stamps org + ACL.
Parse.Cloud.define("createCustomField", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};

  const label = String(p.label == null ? "" : p.label).trim();
  if (!label) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A field label is required.");
  }
  if (label.length > MAX_LABEL_LEN) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      `Label must be ${MAX_LABEL_LEN} characters or fewer.`,
    );
  }

  const type = p.type;
  if (!FIELD_TYPES.includes(type)) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      `type must be one of: ${FIELD_TYPES.join(", ")}.`,
    );
  }

  // enum fields must declare their allowed values.
  let enumValues = [];
  if (type === "enum") {
    enumValues = Array.isArray(p.enumValues)
      ? p.enumValues.map((v) => String(v)).filter((v) => v.length > 0)
      : [];
    if (enumValues.length === 0) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        "An enum field requires a non-empty enumValues list.",
      );
    }
  }

  // Derive the storage key from the label unless one was provided.
  const key = p.key ? slugifyKey(p.key) : slugifyKey(label);
  if (!key) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "Could not derive a valid key from the label; use letters or numbers.",
    );
  }

  const org = await getUserOrg(user, { useMasterKey: true });
  const sessionToken = user.getSessionToken();

  // Enforce unique key per org. The schema also has a unique compound index, but
  // we check explicitly so we can return a friendly error (and so it holds in
  // test envs that don't run the bootstrap).
  const dupQ = new Parse.Query("CustomField");
  dupQ.equalTo("organization", org);
  dupQ.equalTo("key", key);
  const clash = await dupQ.first({ useMasterKey: true });
  if (clash) {
    throw new Parse.Error(
      Parse.Error.DUPLICATE_VALUE,
      `A custom field with key "${key}" already exists.`,
    );
  }

  // `order` = current count, so new fields append.
  const countQ = new Parse.Query("CustomField");
  countQ.equalTo("organization", org);
  const order = await countQ.count({ useMasterKey: true });

  const CustomField = Parse.Object.extend("CustomField");
  const f = new CustomField();
  f.set("key", key);
  f.set("label", label);
  f.set("type", type);
  f.set("enumValues", enumValues);
  f.set("required", p.required === true);
  f.set("order", order);

  // Save as the user so the tenancy beforeSave stamps org + ACL.
  await f.save(null, { sessionToken });
  return fieldToJSON(f);
});

// ── updateCustomField ─────────────────────────────────────────────────────────
// Patch label / enumValues / required / order. `key` and `type` are immutable —
// changing them would orphan/corrupt every contact's stored value (a migration),
// so we reject the attempt with a clear message. Session-scoped.
Parse.Cloud.define("updateCustomField", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const id = p.id;
  const patch = p.patch || {};
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Custom field id is required.");
  }

  if ("key" in patch || "type" in patch) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "Changing a custom field's key or type is a data migration and is not allowed. Delete and recreate the field instead.",
    );
  }

  const sessionToken = user.getSessionToken();

  let f;
  try {
    f = await new Parse.Query("CustomField").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "Custom field not found.",
    );
  }

  if (patch.label != null) {
    const label = String(patch.label).trim();
    if (!label) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Label cannot be empty.");
    }
    if (label.length > MAX_LABEL_LEN) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        `Label must be ${MAX_LABEL_LEN} characters or fewer.`,
      );
    }
    f.set("label", label);
  }

  if (patch.enumValues != null) {
    // Only meaningful for enum fields; for others it's stored but unused.
    const vals = Array.isArray(patch.enumValues)
      ? patch.enumValues.map((v) => String(v)).filter((v) => v.length > 0)
      : [];
    if (f.get("type") === "enum" && vals.length === 0) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        "An enum field requires a non-empty enumValues list.",
      );
    }
    f.set("enumValues", vals);
  }

  if (patch.required != null) f.set("required", patch.required === true);

  if (patch.order != null) {
    const order = parseInt(patch.order, 10);
    if (Number.isFinite(order)) f.set("order", order);
  }

  await f.save(null, { sessionToken });
  return fieldToJSON(f);
});

// ── deleteCustomField ─────────────────────────────────────────────────────────
// Delete the definition only. MVP: we do NOT strip the corresponding values from
// existing contacts — those become "unknown keys" that validateCustomFields drops
// on the next save. A future migration can reclaim that storage; for now leaving
// the data is non-destructive and reversible (recreate the field with the same
// key to surface the values again). Session-scoped.
Parse.Cloud.define("deleteCustomField", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Custom field id is required.");
  }
  const sessionToken = user.getSessionToken();

  let f;
  try {
    f = await new Parse.Query("CustomField").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "Custom field not found.",
    );
  }
  await f.destroy({ sessionToken });
  return { ok: true };
});
