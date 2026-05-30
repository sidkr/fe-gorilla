// ─────────────────────────────────────────────────────────────────────────────
// Settings cloud functions. CommonJS. Required from main.js after the tenancy
// spine.
//
// Two surfaces:
//   1. ORG PROFILE — the caller's Organization general settings (name, default
//      sender, reply-to, timezone, physical mailing address for CAN-SPAM
//      footers). The Organization is NOT a per-tenant class; it has a bespoke
//      ACL set at signup (members role read, owner write). We resolve + edit it
//      with the master key (the writer may not be the owner; any org member can
//      manage settings in the MVP), but only ever the caller's OWN org.
//
//   2. SENDER IDENTITIES — `SenderIdentity` is per-tenant (PER_TENANT_CLASSES),
//      so tenantHooks stamps `organization` + a role ACL on every new row. We
//      never set those by hand; we create as the user and let the hook fill in
//      the rest, and rely on the row-level ACL for isolation.
//
// Cloud functions:
//   getOrgSettings()                                       → OrgSettings
//   updateOrgSettings({ patch })                           → OrgSettings
//   listSenderIdentities()                                 → SenderIdentity[]
//   createSenderIdentity({ fromName, fromEmail })          → SenderIdentity
//   verifySenderIdentity({ id })                           → SenderIdentity
//   deleteSenderIdentity({ id })                           → { ok }
//
// OrgSettings JSON shape (mirrored by composables/app/useSettings.ts):
//   { id, name, slug, plan, defaultFromName, defaultFromEmail, replyTo,
//     timezone, address, monthlySendCap, monthlySendCount }
// SenderIdentity JSON shape:
//   { id, fromName, fromEmail, status, createdAt }
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");

const MK = { useMasterKey: true };
const MAX_NAME_LEN = 120;

// A pragmatic email shape check — not RFC-perfect, but rejects the obvious junk
// (missing @, missing domain dot, spaces). Real deliverability verification is
// the send pipeline's job.
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

function isValidEmail(s) {
  return typeof s === "string" && EMAIL_RE.test(s.trim());
}

function orgToJSON(org) {
  return {
    id: org.id,
    name: org.get("name") || "",
    slug: org.get("slug") || "",
    plan: org.get("plan") || "free",
    defaultFromName: org.get("defaultFromName") || "",
    defaultFromEmail: org.get("defaultFromEmail") || "",
    replyTo: org.get("replyTo") || "",
    timezone: org.get("timezone") || "UTC",
    address: org.get("address") || "",
    monthlySendCap:
      typeof org.get("monthlySendCap") === "number"
        ? org.get("monthlySendCap")
        : 0,
    monthlySendCount:
      typeof org.get("monthlySendCount") === "number"
        ? org.get("monthlySendCount")
        : 0,
  };
}

function senderToJSON(s) {
  return {
    id: s.id,
    fromName: s.get("fromName") || "",
    fromEmail: s.get("fromEmail") || "",
    status: s.get("status") || "pending",
    createdAt: s.get("createdAt") ? s.get("createdAt").toISOString() : null,
  };
}

// ── getOrgSettings ─────────────────────────────────────────────────────────--
// Full general-settings view of the caller's org (incl. timezone + address that
// getMyOrg omits). Master-key fetch so we always read every field regardless of
// ACL races; getUserOrg already pins this to the caller's own org.
Parse.Cloud.define("getOrgSettings", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);
  return orgToJSON(org);
});

// ── updateOrgSettings ──────────────────────────────────────────────────────--
// Patch the editable general settings: name, defaultFromName, defaultFromEmail,
// replyTo, timezone, address. `slug`, `plan`, and the send counters are NOT
// editable here. Email fields are format-validated. Written with the master key
// because the org ACL grants write to the owner only, but any member may manage
// settings in the MVP — getUserOrg guarantees we only ever touch the caller's
// own org.
Parse.Cloud.define("updateOrgSettings", async (request) => {
  const user = requireUser(request);
  const patch = (request.params && request.params.patch) || {};
  const org = await getUserOrg(user, MK);

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) {
      throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Organization name cannot be empty.");
    }
    if (name.length > MAX_NAME_LEN) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        `Name must be ${MAX_NAME_LEN} characters or fewer.`,
      );
    }
    org.set("name", name);
  }

  if (patch.defaultFromName != null) {
    org.set("defaultFromName", String(patch.defaultFromName).trim());
  }

  if (patch.defaultFromEmail != null) {
    const email = String(patch.defaultFromEmail).trim();
    // Allow clearing the default sender; validate when non-empty.
    if (email && !isValidEmail(email)) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        "Default from-email is not a valid email address.",
      );
    }
    org.set("defaultFromEmail", email.toLowerCase());
  }

  if (patch.replyTo != null) {
    const replyTo = String(patch.replyTo).trim();
    if (replyTo && !isValidEmail(replyTo)) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        "Reply-to is not a valid email address.",
      );
    }
    org.set("replyTo", replyTo.toLowerCase());
  }

  if (patch.timezone != null) {
    org.set("timezone", String(patch.timezone).trim() || "UTC");
  }

  if (patch.address != null) {
    org.set("address", String(patch.address));
  }

  await org.save(null, MK);
  return orgToJSON(org);
});

// ── listSenderIdentities ───────────────────────────────────────────────────--
// All sender identities for the caller's org, newest first. ACL already
// isolates; the org filter is for index locality + explicitness.
Parse.Cloud.define("listSenderIdentities", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);

  const q = new Parse.Query("SenderIdentity");
  q.equalTo("organization", org);
  q.descending("createdAt");
  q.limit(1000);

  const rows = await q.find({ sessionToken: user.getSessionToken() });
  return rows.map(senderToJSON);
});

// ── createSenderIdentity ───────────────────────────────────────────────────--
// New sender pair. fromEmail is validated + lowercased; fromName required.
// status defaults to "pending". One identity per (org, fromEmail) — enforced
// here explicitly (the schema index isn't unique, and tests may skip bootstrap).
// Created AS THE USER so tenancy stamps org + ACL.
Parse.Cloud.define("createSenderIdentity", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};

  const fromName = String(p.fromName == null ? "" : p.fromName).trim();
  if (!fromName) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A from-name is required.");
  }
  if (fromName.length > MAX_NAME_LEN) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      `From-name must be ${MAX_NAME_LEN} characters or fewer.`,
    );
  }

  const fromEmail = String(p.fromEmail == null ? "" : p.fromEmail).trim().toLowerCase();
  if (!isValidEmail(fromEmail)) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "From-email is not a valid email address.",
    );
  }

  const org = await getUserOrg(user, MK);
  const sessionToken = user.getSessionToken();

  // Enforce unique sender email per org with a friendly error.
  const dupQ = new Parse.Query("SenderIdentity");
  dupQ.equalTo("organization", org);
  dupQ.equalTo("fromEmail", fromEmail);
  const clash = await dupQ.first({ useMasterKey: true });
  if (clash) {
    throw new Parse.Error(
      Parse.Error.DUPLICATE_VALUE,
      `A sender identity for "${fromEmail}" already exists.`,
    );
  }

  const SenderIdentity = Parse.Object.extend("SenderIdentity");
  const s = new SenderIdentity();
  s.set("fromName", fromName);
  s.set("fromEmail", fromEmail);
  s.set("status", "pending");

  // Save as the user so the tenancy beforeSave stamps org + ACL.
  await s.save(null, { sessionToken });
  return senderToJSON(s);
});

// ── verifySenderIdentity ───────────────────────────────────────────────────--
// MVP STUB: flip status to "verified". Real verification (sending a confirmation
// email / domain DNS checks) is the send pipeline's responsibility in a later
// wave — this just unblocks the UI + send selection. Session-scoped.
Parse.Cloud.define("verifySenderIdentity", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Sender identity id is required.");
  }
  const sessionToken = user.getSessionToken();

  let s;
  try {
    s = await new Parse.Query("SenderIdentity").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Sender identity not found.");
  }

  s.set("status", "verified");
  await s.save(null, { sessionToken });
  return senderToJSON(s);
});

// ── deleteSenderIdentity ───────────────────────────────────────────────────--
// Remove a sender identity. Session-scoped (ACL prevents cross-org deletes).
Parse.Cloud.define("deleteSenderIdentity", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Sender identity id is required.");
  }
  const sessionToken = user.getSessionToken();

  let s;
  try {
    s = await new Parse.Query("SenderIdentity").get(id, { sessionToken });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Sender identity not found.");
  }
  await s.destroy({ sessionToken });
  return { ok: true };
});
