// ─────────────────────────────────────────────────────────────────────────────
// Organization + user signup cloud code. CommonJS.
//
// Owns the tenant-creation transaction (signUpWithOrg), the _User normalization
// beforeSave, and getMyOrg for frontend hydration. See DECISIONS #10.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { membersRoleName } = require("./lib/tenancy");

// ── helpers ──────────────────────────────────────────────────────────────────

function norm(s) {
  return typeof s === "string" ? s.trim().toLowerCase() : s;
}

// URL-safe slug from a name, plus a short random suffix for uniqueness.
function slugify(name) {
  const base = String(name || "org")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}

// Derive a company display name when the user didn't give one.
function deriveCompanyName(company, name, username) {
  if (company && company.trim()) return company.trim();
  if (name && name.trim()) return `${name.trim()}'s organization`;
  return `${(username || "my").split("@")[0]}'s organization`;
}

// ── signUpWithOrg ─────────────────────────────────────────────────────────────
// Runs while the caller is anonymous. Creates _User + Organization + members
// role transactionally-ish (Mongo has no multi-doc txn here), with best-effort
// cleanup if a later step fails. Returns a usable session token.
Parse.Cloud.define("signUpWithOrg", async (request) => {
  const { username, password, email, name, company } = request.params || {};

  if (!username || !password) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "username and password are required.",
    );
  }

  const normUsername = norm(username);
  const normEmail = norm(email || username);

  // (a) Create the _User via signUp so it gets a session token.
  const user = new Parse.User();
  user.set("username", normUsername);
  user.set("password", password);
  user.set("email", normEmail);
  if (name) user.set("name", name);

  let signedUp;
  try {
    // Create the account with the master key (cloud code runs as master).
    signedUp = await user.signUp(null, { useMasterKey: true });
  } catch (err) {
    if (err && err.code === Parse.Error.USERNAME_TAKEN) {
      throw new Parse.Error(
        Parse.Error.USERNAME_TAKEN, // 202
        "An account with this email already exists.",
      );
    }
    if (err && err.code === Parse.Error.EMAIL_TAKEN) {
      throw new Parse.Error(
        Parse.Error.USERNAME_TAKEN, // normalize email-taken → 202 too
        "An account with this email already exists.",
      );
    }
    throw err;
  }

  const userId = signedUp.id;

  // From here on, clean up the user if a later step throws.
  let org = null;
  let role = null;
  try {
    // (b) Create the Organization with a unique slug.
    const Organization = Parse.Object.extend("Organization");
    org = new Organization();
    org.set("name", deriveCompanyName(company, name, normUsername));
    org.set("slug", slugify(company || name || normUsername));
    org.set("plan", "free");
    org.set("defaultFromName", (name && name.trim()) || "Gorilla User");
    org.set("defaultFromEmail", "");
    org.set("monthlySendCap", 10000);
    org.set("monthlySendCount", 0);
    org.set("timezone", "UTC");

    // Org ACL: owner read+write; the members role gets read once it exists.
    // We re-set the role ACL after the role is created (need orgId first).
    const provisionalAcl = new Parse.ACL();
    provisionalAcl.setReadAccess(signedUp, true);
    provisionalAcl.setWriteAccess(signedUp, true);
    org.setACL(provisionalAcl);
    await org.save(null, { useMasterKey: true });

    const orgId = org.id;
    const roleName = membersRoleName(orgId);

    // (c) Create the members role. Its own ACL lets the role read itself
    // (so role resolution works) — no public access.
    const roleAcl = new Parse.ACL();
    roleAcl.setPublicReadAccess(false);
    roleAcl.setPublicWriteAccess(false);
    roleAcl.setRoleReadAccess(roleName, true);

    role = new Parse.Role(roleName, roleAcl);
    role.getUsers().add(signedUp);
    await role.save(null, { useMasterKey: true });

    // Tighten the org ACL: members role read, owner write.
    const orgAcl = new Parse.ACL();
    orgAcl.setRoleReadAccess(roleName, true);
    orgAcl.setReadAccess(signedUp, true);
    orgAcl.setWriteAccess(signedUp, true);
    org.setACL(orgAcl);
    await org.save(null, { useMasterKey: true });

    // (d) Attach org + role to the user, save with master key.
    signedUp.set("organization", org);
    signedUp.set("role", "owner");
    await signedUp.save(null, { useMasterKey: true });

    // (e) Mint a session token for the new user. A master-key signUp does not
    // issue one, so we create a session explicitly. logIn returns a user with a
    // fresh session token without mutating server-global current-user state in
    // a way that matters here (we read the token off the returned object).
    const loggedIn = await Parse.User.logIn(normUsername, password);
    const sessionToken = loggedIn.getSessionToken();

    return {
      sessionToken,
      userId,
      orgId,
      orgName: org.get("name"),
    };
  } catch (err) {
    // Best-effort cleanup so a half-built tenant doesn't linger.
    try {
      if (role) await role.destroy({ useMasterKey: true });
    } catch (_) {/* ignore */}
    try {
      if (org) await org.destroy({ useMasterKey: true });
    } catch (_) {/* ignore */}
    try {
      await signedUp.destroy({ useMasterKey: true });
    } catch (_) {/* ignore */}
    throw err;
  }
});

// ── _User beforeSave ──────────────────────────────────────────────────────────
// Lowercase/trim username + email on every save. Only touch fields that are
// dirty so we don't churn existing sessions/objects unnecessarily.
Parse.Cloud.beforeSave(Parse.User, (request) => {
  const user = request.object;
  if (user.dirty("username")) {
    const u = user.get("username");
    if (typeof u === "string") user.set("username", u.trim().toLowerCase());
  }
  if (user.dirty("email")) {
    const e = user.get("email");
    if (typeof e === "string") user.set("email", e.trim().toLowerCase());
  }
});

// ── getMyOrg ──────────────────────────────────────────────────────────────────
// Returns the caller's org as a plain object for frontend hydration.
Parse.Cloud.define("getMyOrg", async (request) => {
  const user = request.user;
  if (!user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "Must be logged in to read your organization.",
    );
  }
  const ptr = user.get("organization");
  if (!ptr) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "User is not attached to an organization.",
    );
  }
  // Fetch with master key so we always get the fields regardless of ACL races.
  const org = await ptr.fetch({ useMasterKey: true });
  return {
    id: org.id,
    name: org.get("name"),
    slug: org.get("slug"),
    plan: org.get("plan"),
    defaultFromName: org.get("defaultFromName"),
    defaultFromEmail: org.get("defaultFromEmail"),
    monthlySendCap: org.get("monthlySendCap"),
  };
});
