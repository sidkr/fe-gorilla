// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for Form — the authed builder side of signup forms (A2).
// CRUD, org-scoped. The *public* render/submit/confirm flow lives in
// server/routes/forms.js (no auth, master key, org resolved from the Form row).
//
// Tenancy: `Form` and `FormSubmission` are NOT yet in tenantHooks'
// PER_TENANT_CLASSES (see Integration deltas), so the beforeSave auto-stamp does
// NOT fire for them. We therefore set { organization } + a role-based ACL
// EXPLICITLY here, mirroring tenantHooks.buildOrgAcl. Once the classes are added
// to PER_TENANT_CLASSES the explicit stamp is harmless (idempotent).
//
// Cloud functions:
//   createForm({ name, targetListId?, fields?, doubleOptIn?, redirectUrl?,
//                submitButtonText?, status? })                 → formJSON
//   listForms({})                                              → { rows }
//   getForm({ id })                                            → formJSON
//   updateForm({ id, patch })                                  → formJSON
//   deleteForm({ id })                                         → { ok }
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");

const VALID_STATUSES = ["active", "inactive", "draft"];
const VALID_FIELD_TYPES = ["text", "email", "number", "checkbox", "select"];
const DEFAULT_FIELDS = [
  { key: "email", label: "Email", type: "email", required: true },
];

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

// Build the org role-ACL exactly as tenantHooks does for per-tenant classes.
// Reuse the canonical helper so the role name (`org_<id>_members`) stays in sync.
function buildOrgAcl(orgId) {
  return orgRoleACL(orgId);
}

// Normalize a fields[] payload into clean {key,label,type,required} rows.
// Always guarantees an email field exists (forms must capture an address).
function normFields(raw) {
  if (!Array.isArray(raw)) return DEFAULT_FIELDS.slice();
  const out = [];
  const seen = new Set();
  for (const f of raw) {
    if (!f || typeof f !== "object") continue;
    const key = String(f.key || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const type = VALID_FIELD_TYPES.includes(f.type) ? f.type : "text";
    out.push({
      key,
      label: String(f.label || key),
      type,
      required: f.required === true,
      ...(Array.isArray(f.options) ? { options: f.options.map(String) } : {}),
    });
  }
  if (!seen.has("email")) out.unshift(DEFAULT_FIELDS[0]);
  return out;
}

function formToJSON(f) {
  return {
    id: f.id,
    name: f.get("name") || "",
    fields: f.get("fields") || [],
    targetListId: f.get("targetListId") || "",
    doubleOptIn: f.get("doubleOptIn") === true,
    redirectUrl: f.get("redirectUrl") || "",
    submitButtonText: f.get("submitButtonText") || "Subscribe",
    status: f.get("status") || "active",
    submissionCount: f.get("submissionCount") || 0,
    createdAt: f.createdAt ? f.createdAt.toISOString() : null,
    updatedAt: f.updatedAt ? f.updatedAt.toISOString() : null,
  };
}

// Apply mutable fields from a raw source object onto a Form. Only sets keys
// that were actually provided so PATCH semantics hold.
function applyFormFields(form, src) {
  if (src.name != null) form.set("name", String(src.name).trim());
  if (src.targetListId != null) form.set("targetListId", String(src.targetListId));
  if (src.doubleOptIn != null) form.set("doubleOptIn", src.doubleOptIn === true);
  if (src.redirectUrl != null) form.set("redirectUrl", String(src.redirectUrl));
  if (src.submitButtonText != null) {
    form.set("submitButtonText", String(src.submitButtonText));
  }
  if (src.status != null && VALID_STATUSES.includes(src.status)) {
    form.set("status", src.status);
  }
  if (src.fields !== undefined) form.set("fields", normFields(src.fields));
}

// ── createForm ────────────────────────────────────────────────────────────────
Parse.Cloud.define("createForm", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const name = String(p.name || "").trim();
  if (!name) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A name is required.");
  }
  const org = await getUserOrg(user, { useMasterKey: true });
  if (!org) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "No organization for caller.");
  }

  const Form = Parse.Object.extend("Form");
  const form = new Form();
  form.set("organization", org);
  applyFormFields(form, p);
  // Sensible defaults for the freshly-created form.
  if (!form.get("fields")) form.set("fields", normFields(p.fields));
  if (!form.get("submitButtonText")) form.set("submitButtonText", "Subscribe");
  if (!form.get("status")) form.set("status", "active");
  form.set("submissionCount", 0);
  form.setACL(buildOrgAcl(org.id));

  await form.save(null, { useMasterKey: true });
  return formToJSON(form);
});

// ── listForms ─────────────────────────────────────────────────────────────────
Parse.Cloud.define("listForms", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, { useMasterKey: true });
  if (!org) return { rows: [] };

  const q = new Parse.Query("Form");
  q.equalTo("organization", org);
  q.descending("createdAt");
  q.limit(1000);
  const rows = await q.find({ useMasterKey: true });
  return { rows: rows.map(formToJSON) };
});

// ── getForm ───────────────────────────────────────────────────────────────────
Parse.Cloud.define("getForm", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Form id is required.");
  const org = await getUserOrg(user, { useMasterKey: true });

  let form;
  try {
    form = await new Parse.Query("Form").get(id, { useMasterKey: true });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }
  // Org guard — never leak another tenant's form.
  const formOrg = form.get("organization");
  if (!org || !formOrg || formOrg.id !== org.id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }
  return formToJSON(form);
});

// ── updateForm ────────────────────────────────────────────────────────────────
Parse.Cloud.define("updateForm", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const id = p.id;
  const patch = p.patch || p; // accept either {id,patch} or flat {id,...}
  if (!id) throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Form id is required.");
  const org = await getUserOrg(user, { useMasterKey: true });

  let form;
  try {
    form = await new Parse.Query("Form").get(id, { useMasterKey: true });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }
  const formOrg = form.get("organization");
  if (!org || !formOrg || formOrg.id !== org.id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }

  applyFormFields(form, patch);
  await form.save(null, { useMasterKey: true });
  return formToJSON(form);
});

// ── deleteForm ────────────────────────────────────────────────────────────────
Parse.Cloud.define("deleteForm", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Form id is required.");
  const org = await getUserOrg(user, { useMasterKey: true });

  let form;
  try {
    form = await new Parse.Query("Form").get(id, { useMasterKey: true });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }
  const formOrg = form.get("organization");
  if (!org || !formOrg || formOrg.id !== org.id) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Form not found.");
  }
  await form.destroy({ useMasterKey: true });
  return { ok: true };
});

module.exports = {
  // Exported for the public route + unit tests.
  buildOrgAcl,
  normFields,
  formToJSON,
};
