/**
 * API key cloud functions (R2).
 *
 * createApiKey — mint a key for the caller's org. Returns the RAW key ONCE;
 *                only a hash is persisted. Sets organization + a role ACL
 *                explicitly (ApiKey is not yet in PER_TENANT_CLASSES, so the
 *                tenant beforeSave does not stamp it — same approach the R1
 *                ingest job uses for Conversion).
 * listApiKeys  — list the org's keys (prefix + metadata; never the raw key).
 * revokeApiKey — soft-revoke by setting revokedAt.
 *
 * Org-scoped via getUserOrg (returns the Organization Parse.Object/pointer).
 */

const Parse = require("parse/node");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");
const { generateKey } = require("../lib/apiKeyAuth");

const MK = { useMasterKey: true };
const DEFAULT_SCOPES = ["events:write"];

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "You must be signed in.");
  }
  return request.user;
}

function ptrId(org) {
  if (!org) return null;
  return typeof org === "string" ? org : org.id;
}

function serialize(k) {
  return {
    objectId: k.id,
    name: k.get("name") || null,
    keyPrefix: k.get("keyPrefix"),
    scopes: k.get("scopes") || [],
    lastUsedAt: k.get("lastUsedAt") || null,
    revokedAt: k.get("revokedAt") || null,
    createdAt: k.createdAt ? k.createdAt.toISOString() : null,
  };
}

Parse.Cloud.define("createApiKey", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};
  const { name, scopes } = p;
  if (!name || !String(name).trim()) {
    throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "name is required");
  }

  const org = await getUserOrg(user, MK);
  const { raw, keyPrefix, keyHash } = generateKey();

  const ApiKey = Parse.Object.extend("ApiKey");
  const apiKey = new ApiKey();
  apiKey.set("organization", org);
  apiKey.set("name", String(name).trim());
  apiKey.set("keyPrefix", keyPrefix);
  apiKey.set("keyHash", keyHash);
  apiKey.set(
    "scopes",
    Array.isArray(scopes) && scopes.length ? scopes.map(String) : DEFAULT_SCOPES
  );

  // ApiKey is not per-tenant yet → set the org-role ACL explicitly.
  const orgId = ptrId(org);
  if (orgId) apiKey.setACL(orgRoleACL(orgId));

  await apiKey.save(null, MK);

  // Raw key returned exactly once — never persisted, never retrievable again.
  return { ...serialize(apiKey), key: raw };
});

Parse.Cloud.define("listApiKeys", async (request) => {
  const user = requireUser(request);
  const org = await getUserOrg(user, MK);

  const ApiKey = Parse.Object.extend("ApiKey");
  const q = new Parse.Query(ApiKey);
  q.equalTo("organization", org);
  q.descending("createdAt");
  q.limit(1000);
  const rows = await q.find(MK);
  return rows.map(serialize);
});

Parse.Cloud.define("revokeApiKey", async (request) => {
  const user = requireUser(request);
  const id = request.params && request.params.id;
  if (!id) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, "id is required");

  const org = await getUserOrg(user, MK);
  const ApiKey = Parse.Object.extend("ApiKey");
  const q = new Parse.Query(ApiKey);
  q.equalTo("organization", org); // org-scoped: can't revoke another org's key
  const key = await q.get(id, MK).catch(() => null);
  if (!key) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "API key not found");

  if (!key.get("revokedAt")) {
    key.set("revokedAt", new Date());
    await key.save(null, MK);
  }
  return serialize(key);
});

module.exports = {};
