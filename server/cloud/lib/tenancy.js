// ─────────────────────────────────────────────────────────────────────────────
// Tenancy spine — the shared contract every feature agent builds on.
// CommonJS (server/package.json is "type":"commonjs").
//
// HOW MULTI-TENANCY WORKS HERE (read this before touching any per-tenant class):
//
//   - Every signup creates an `Organization` + a `_Role` named
//     `org_<orgId>_members`. The signing-up user is added to that role
//     (see organizations.js → signUpWithOrg).
//   - Every per-tenant object (List, Contact, Segment, Campaign, ...) carries:
//       (a) an `organization` pointer, AND
//       (b) an ACL granting read+write to `role:org_<orgId>_members` only
//           (no public access).
//   - A `beforeSave` hook (tenantHooks.js) STAMPS both of those automatically on
//     every NEW per-tenant object. So feature cloud functions and client code do
//     NOT need to set `organization` or the ACL themselves — just create the
//     object as a logged-in user and save it. The hook fills in the rest.
//   - Cross-tenant leakage is impossible by construction: a query run with the
//     wrong session token returns zero rows because the ACL filter executes
//     inside Parse/Mongo. The `organization` pointer is a convenience for
//     explicit filtering + index locality, NOT the security boundary.
//   - The master key bypasses ACL. Workers / cloud code use it deliberately for
//     fanout + webhook ingestion. Client code never sees the master key.
//
// See Architecture.md §2.1 and DECISIONS.md #10.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");

// The canonical per-tenant classes (DECISIONS #9). Every class in this list is
// org-scoped: it gets an `organization` pointer + a role-restricted ACL stamped
// on create by tenantHooks.js, and a CLP that disables public access via
// bootstrapSchemas.js. `Organization` and `_User` are NOT in this list — they
// have their own bespoke ACL/CLP rules.
const PER_TENANT_CLASSES = [
  "List",
  "Contact",
  "Segment",
  "Campaign",
  "Template",
  "CampaignSend",
  "EmailEvent",
  "Suppression",
  "CustomField",
  "SenderIdentity",
  "SendingDomain",
  "SuppressionAuditLog",
  "ImportJob",
  "Form",
  "FormSubmission",
  "Automation",
  "AutomationStep",
  "AutomationEnrollment",
];

// The per-org members role name. One role per organization; the user(s) of that
// org are members of it. All per-tenant ACLs reference `role:<this>`.
function membersRoleName(orgId) {
  return `org_${orgId}_members`;
}

// A Parse.ACL that grants read+write to the org's members role ONLY.
// No public read, no public write. This is the row-level isolation primitive.
function orgRoleACL(orgId) {
  const acl = new Parse.ACL();
  const role = membersRoleName(orgId);
  acl.setRoleReadAccess(role, true);
  acl.setRoleWriteAccess(role, true);
  // Explicitly no public access (Parse.ACL defaults to none, but be explicit).
  acl.setPublicReadAccess(false);
  acl.setPublicWriteAccess(false);
  return acl;
}

// Build an unfetched Organization pointer from an id. Handy for `equalTo`
// filters and for setting the `organization` field without a round-trip.
//   q.equalTo("organization", orgPointer(orgId));
function orgPointer(orgId) {
  const Organization = Parse.Object.extend("Organization");
  return Organization.createWithoutData(orgId);
}

// Resolve the caller's Organization Parse.Object from their _User.
// Feature cloud functions should call this to get the org for the request:
//
//   const { getUserOrg } = require("./lib/tenancy");
//   Parse.Cloud.define("listFoo", async (request) => {
//     const org = await getUserOrg(request.user, { useMasterKey: true });
//     const q = new Parse.Query("Foo");
//     q.equalTo("organization", org); // ACL already isolates; this is explicit.
//     ...
//   });
//
// Throws a clear Parse.Error if the user has no organization pointer.
async function getUserOrg(user, opts = {}) {
  if (!user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "No authenticated user; cannot resolve organization.",
    );
  }
  const ptr = user.get("organization");
  if (!ptr) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "User is not attached to an organization. This should never happen for an account created via signUpWithOrg.",
    );
  }
  // The pointer may be unfetched (e.g. inside a beforeSave where only the
  // pointer is present). Fetch it so callers get a full object.
  if (typeof ptr.fetch === "function" && !ptr.get("slug")) {
    return ptr.fetch(opts);
  }
  return ptr;
}

module.exports = {
  PER_TENANT_CLASSES,
  membersRoleName,
  orgRoleACL,
  orgPointer,
  getUserOrg,
};
