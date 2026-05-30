// ─────────────────────────────────────────────────────────────────────────────
// Tenant stamping hooks. CommonJS. Required from main.js AFTER organizations.js.
//
// For EVERY per-tenant class, a beforeSave that:
//   - On NEW objects (no request.original):
//       * requires request.user (unless master-key write), else UNAUTHORIZED
//       * resolves the user's org and stamps `organization` if not already set
//       * stamps a role-restricted ACL (orgRoleACL) if no explicit ACL is set
//   - On UPDATES:
//       * leaves organization + ACL alone
//       * rejects any attempt to change `organization` to a DIFFERENT org
//
// Master-key writes (workers, cloud fns using master key) bypass the user
// requirement. They may set `organization` themselves; if they do, we stamp the
// matching ACL when none is present so worker-created rows stay isolated.
//
// THIS IS WHY FEATURE CODE NEEDS NO TENANCY BOILERPLATE: a logged-in client (or
// the editor) can `new Parse.Object("Campaign")` + save, and org + ACL appear
// automatically. See DECISIONS #10.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const {
  PER_TENANT_CLASSES,
  orgRoleACL,
  getUserOrg,
} = require("./lib/tenancy");

// ── Feature beforeSave extension registry ───────────────────────────────────
// Parse permits only ONE beforeSave per class. The tenancy stamp owns it, so a
// feature that needs its own beforeSave logic (e.g. compileBlocks → MJML/HTML
// on Campaign, denormalized counters, slug generation) MUST register here
// instead of calling Parse.Cloud.beforeSave again (which would silently clobber
// the tenancy stamp and break isolation).
//
// Contract for feature modules (required AFTER this file, per main.js order):
//   const { registerBeforeSave } = require("./tenantHooks");
//   registerBeforeSave("Campaign", async (request) => { ... });
// Extensions run AFTER tenant stamping, in registration order, on both insert
// and update. Throw a Parse.Error to abort the save. A class may have many.
const EXTRA_HOOKS = Object.create(null);

function registerBeforeSave(className, fn) {
  if (!PER_TENANT_CLASSES.includes(className)) {
    throw new Error(
      `registerBeforeSave: "${className}" is not a per-tenant class (${PER_TENANT_CLASSES.join(", ")}).`,
    );
  }
  (EXTRA_HOOKS[className] || (EXTRA_HOOKS[className] = [])).push(fn);
}

async function runExtras(className, request) {
  const hooks = EXTRA_HOOKS[className];
  if (!hooks) return;
  for (const fn of hooks) await fn(request);
}

// Detect whether the incoming object already carries a non-default ACL.
// A brand-new object has a null ACL until something sets one.
function hasExplicitACL(object) {
  return !!object.getACL();
}

function makeBeforeSave(className) {
  return async function tenantStamp(request) {
    const object = request.object;
    const isNew = !request.original;
    const isMaster = request.master === true;
    const user = request.user;

    if (isNew) {
      let orgId = null;

      // Resolve the org from whichever source is available.
      const existingOrgPtr = object.get("organization");

      if (existingOrgPtr && existingOrgPtr.id) {
        // Caller (likely a worker / cloud fn with master key) already set it.
        orgId = existingOrgPtr.id;
      } else if (user) {
        // Normal client/cloud path: derive from the logged-in user.
        const org = await getUserOrg(user, { useMasterKey: true });
        object.set("organization", org);
        orgId = org.id;
      } else if (isMaster) {
        // Master-key write with no org provided and no user. We can't infer a
        // tenant — let it through (degenerate maintenance path). Skip extras
        // too: without a tenant context feature hooks have nothing to act on.
        return;
      } else {
        // Anonymous client trying to create a tenant object → reject.
        throw new Parse.Error(
          Parse.Error.OPERATION_FORBIDDEN,
          `Must be authenticated to create a ${className}.`,
        );
      }

      // Stamp the role-restricted ACL unless the caller set one explicitly.
      if (orgId && !hasExplicitACL(object)) {
        object.setACL(orgRoleACL(orgId));
      }

      await runExtras(className, request);
      return;
    }

    // ── UPDATE path ───────────────────────────────────────────────────────────
    // Leave org + ACL as-is, but forbid moving a row to another org.
    if (object.dirty("organization")) {
      const original = request.original;
      const beforePtr = original && original.get("organization");
      const afterPtr = object.get("organization");
      const beforeId = beforePtr && beforePtr.id;
      const afterId = afterPtr && afterPtr.id;
      if (beforeId && afterId && beforeId !== afterId) {
        throw new Parse.Error(
          Parse.Error.OPERATION_FORBIDDEN,
          `Cannot move a ${className} to a different organization.`,
        );
      }
    }

    await runExtras(className, request);
  };
}

for (const className of PER_TENANT_CLASSES) {
  Parse.Cloud.beforeSave(className, makeBeforeSave(className));
}

module.exports = { registerBeforeSave };
