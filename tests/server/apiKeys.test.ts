// API-key tests (R2). Real Parse Server + in-memory Mongo, mirroring
// audiences.test.ts. server/ is CommonJS loaded via createRequire (vitest's
// vi.mock does NOT intercept CJS) — so we require the modules under test
// directly against the SAME Parse SDK singleton the cloud code uses.
//
// cloud/main.js does NOT yet require apiKeys.js (it's a shared file the
// orchestrator owns — REPORTED in integration deltas). We require apiKeys.js
// here so its Parse.Cloud.define(...) calls register against the running server.
//
// Coverage:
//   - createApiKey returns the raw key ONCE and persists only a hash
//   - createApiKey stamps org + role ACL; requires a name
//   - listApiKeys / revokeApiKey are org-scoped; never leak the hash
//   - apiKeyAuth.authenticate: valid → org; revoked / bad / missing → 401
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const require = createRequire(import.meta.url);

describe("api keys", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let apiKeyAuth: any;

  const MK = { useMasterKey: true } as const;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    // Register the API-key cloud fns against the running server, then grab the
    // auth lib (it reads the same parseClient SDK singleton).
    require("../../server/cloud/apiKeys");
    apiKeyAuth = require("../../server/lib/apiKeyAuth");
  });

  afterAll(async () => {
    await ctx.stop();
  });

  let counter = 0;
  async function signUp(company: string) {
    counter += 1;
    return Parse.Cloud.run("signUpWithOrg", {
      username: `apikey-${counter}@example.com`,
      password: "hunter2hunter2",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  interface Key {
    objectId: string;
    name: string | null;
    keyPrefix: string;
    scopes: string[];
    revokedAt: string | null;
    key?: string;
  }

  it("createApiKey returns the raw key once and stores only a hash", async () => {
    const a = await signUp("KeyCo");
    const created = (await Parse.Cloud.run(
      "createApiKey",
      { name: "Storefront" },
      as(a.sessionToken),
    )) as Key;

    // Raw key returned exactly once, branded prefix.
    expect(created.key).toMatch(/^gk_live_/);
    expect(created.keyPrefix).toMatch(/^gk_live_/);
    expect(created.scopes).toContain("events:write");

    // Persisted row stores only a hash — never the raw key.
    const row = await new Parse.Query("ApiKey").get(created.objectId, MK);
    expect(row.get("keyHash")).toBeTruthy();
    expect(row.get("keyHash")).not.toBe(created.key);
    expect(row.get("keyPrefix")).toBe(created.keyPrefix);
    // org pointer stamped + role ACL restricts to the org.
    expect(row.get("organization").id).toBe(a.orgId);
    const acl = row.getACL();
    expect(acl.getRoleReadAccess(`org_${a.orgId}_members`)).toBe(true);
    expect(acl.getPublicReadAccess()).toBe(false);
  });

  it("createApiKey requires a name", async () => {
    const a = await signUp("NoNameCo");
    await expect(
      Parse.Cloud.run("createApiKey", {}, as(a.sessionToken)),
    ).rejects.toMatchObject({});
  });

  it("listApiKeys is org-scoped and never returns the hash", async () => {
    const a = await signUp("ListA");
    const b = await signUp("ListB");
    await Parse.Cloud.run("createApiKey", { name: "A1" }, as(a.sessionToken));
    await Parse.Cloud.run("createApiKey", { name: "A2" }, as(a.sessionToken));
    await Parse.Cloud.run("createApiKey", { name: "B1" }, as(b.sessionToken));

    const aKeys = (await Parse.Cloud.run("listApiKeys", {}, as(a.sessionToken))) as Key[];
    const bKeys = (await Parse.Cloud.run("listApiKeys", {}, as(b.sessionToken))) as Key[];

    expect(aKeys.map((k) => k.name).sort()).toEqual(["A1", "A2"]);
    expect(bKeys.map((k) => k.name)).toEqual(["B1"]);
    // No raw key, no hash leaked through the serializer.
    expect(JSON.stringify(aKeys)).not.toContain("keyHash");
    expect(aKeys.every((k) => !("key" in k))).toBe(true);
  });

  it("revokeApiKey soft-revokes and blocks auth thereafter", async () => {
    const a = await signUp("RevokeCo");
    const created = (await Parse.Cloud.run(
      "createApiKey",
      { name: "Revoke me" },
      as(a.sessionToken),
    )) as Key;

    const revoked = (await Parse.Cloud.run(
      "revokeApiKey",
      { id: created.objectId },
      as(a.sessionToken),
    )) as Key;
    expect(revoked.revokedAt).toBeTruthy();

    // The revoked key no longer authenticates.
    await expect(
      apiKeyAuth.authenticate("Bearer " + created.key),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("revokeApiKey cannot touch another org's key", async () => {
    const a = await signUp("OwnerCo");
    const b = await signUp("AttackerCo");
    const created = (await Parse.Cloud.run(
      "createApiKey",
      { name: "Owned" },
      as(a.sessionToken),
    )) as Key;
    await expect(
      Parse.Cloud.run("revokeApiKey", { id: created.objectId }, as(b.sessionToken)),
    ).rejects.toMatchObject({});
  });

  // ── apiKeyAuth.authenticate (against the real ApiKey rows) ────────────────--
  it("authenticate accepts a valid key and resolves the org", async () => {
    const a = await signUp("AuthCo");
    const created = (await Parse.Cloud.run(
      "createApiKey",
      { name: "Live" },
      as(a.sessionToken),
    )) as Key;

    const out = await apiKeyAuth.authenticate("Bearer " + created.key);
    expect(out.org.id).toBe(a.orgId);
    expect(out.apiKey.id).toBe(created.objectId);
    // lastUsedAt is updated best-effort (fire-and-forget save) — poll for it.
    let lastUsed: any = null;
    for (let i = 0; i < 40 && !lastUsed; i++) {
      const row = await new Parse.Query("ApiKey").get(created.objectId, MK);
      lastUsed = row.get("lastUsedAt");
      if (!lastUsed) await new Promise((r) => setTimeout(r, 25));
    }
    expect(lastUsed).toBeInstanceOf(Date);
  });

  it("authenticate rejects a bad key and a missing header", async () => {
    await expect(apiKeyAuth.authenticate("Bearer gk_live_nope")).rejects.toMatchObject({
      status: 401,
    });
    await expect(apiKeyAuth.authenticate("")).rejects.toMatchObject({ status: 401 });
  });

  it("generateKey produces a self-consistent hash + prefix", () => {
    const { raw, keyPrefix, keyHash } = apiKeyAuth.generateKey();
    expect(raw.startsWith("gk_live_")).toBe(true);
    expect(apiKeyAuth.hashKey(raw)).toBe(keyHash);
    expect(apiKeyAuth.parsePrefix(raw)).toBe(keyPrefix);
  });
});
