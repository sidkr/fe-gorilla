// Cloud-function tests for sending-domain verification (Track C, F-04):
// createSendingDomain returns 3 DNS records + pending status, listSendingDomains,
// verifyDomain flips status (mock pass when DNS unresolvable), deleteSendingDomain.
// Uses the in-memory Parse server, same harness as settings.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("sending-domain cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  let counter = 0;
  async function signUp(company: string) {
    counter += 1;
    return Parse.Cloud.run("signUpWithOrg", {
      username: `dom-${counter}@example.com`,
      password: "hunter2hunter2",
      name: "Test User",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  it("createSendingDomain normalizes the domain and returns 3 DNS records", async () => {
    const a = await signUp("DomCreateCo");
    const d = (await Parse.Cloud.run(
      "createSendingDomain",
      { domain: "HTTPS://Example.com/" },
      as(a.sessionToken),
    )) as any;
    expect(d.domain).toBe("example.com");
    expect(d.status).toBe("pending");
    expect(d.verified).toBe(false);
    expect(d.records.length).toBe(3);
    const kinds = d.records.map((r: any) => r.kind).sort();
    expect(kinds).toEqual(["DKIM", "DMARC", "SPF"]);
    expect(d.selector).toMatch(/^grla/);
  });

  it("createSendingDomain rejects an invalid domain", async () => {
    const a = await signUp("DomBadCo");
    await expect(
      Parse.Cloud.run("createSendingDomain", { domain: "not a domain" }, as(a.sessionToken)),
    ).rejects.toMatchObject({});
  });

  it("createSendingDomain dedupes an existing domain for the org", async () => {
    const a = await signUp("DomDupeCo");
    const first = (await Parse.Cloud.run(
      "createSendingDomain",
      { domain: "dupe.com" },
      as(a.sessionToken),
    )) as any;
    const second = (await Parse.Cloud.run(
      "createSendingDomain",
      { domain: "dupe.com" },
      as(a.sessionToken),
    )) as any;
    expect(second.id).toBe(first.id);

    const list = (await Parse.Cloud.run("listSendingDomains", {}, as(a.sessionToken))) as any[];
    expect(list.filter((d) => d.domain === "dupe.com").length).toBe(1);
  });

  it("verifyDomain flips status to verified (mock pass when DNS unresolvable)", async () => {
    const a = await signUp("DomVerifyCo");
    const d = (await Parse.Cloud.run(
      "createSendingDomain",
      // A .invalid TLD never resolves → all lookups null → mock pass.
      { domain: "no-such-domain-xyz-12345.invalid" },
      as(a.sessionToken),
    )) as any;
    expect(d.status).toBe("pending");

    const res = (await Parse.Cloud.run("verifyDomain", { id: d.id }, as(a.sessionToken))) as any;
    expect(res.status).toBe("verified");
    expect(res.verified).toBe(true);
    expect(res.mocked).toBe(true);
    expect(res.checks.length).toBe(3);

    // Persisted.
    const list = (await Parse.Cloud.run("listSendingDomains", {}, as(a.sessionToken))) as any[];
    expect(list.find((x) => x.id === d.id).status).toBe("verified");
  });

  it("verifyDomain throws OBJECT_NOT_FOUND for an unknown id", async () => {
    const a = await signUp("DomMissingCo");
    await expect(
      Parse.Cloud.run("verifyDomain", { id: "doesNotExist" }, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  it("deleteSendingDomain removes the row", async () => {
    const a = await signUp("DomDeleteCo");
    const d = (await Parse.Cloud.run(
      "createSendingDomain",
      { domain: "delete.com" },
      as(a.sessionToken),
    )) as any;
    const res = (await Parse.Cloud.run(
      "deleteSendingDomain",
      { id: d.id },
      as(a.sessionToken),
    )) as { deleted: boolean };
    expect(res.deleted).toBe(true);
    const list = (await Parse.Cloud.run("listSendingDomains", {}, as(a.sessionToken))) as any[];
    expect(list.find((x) => x.id === d.id)).toBeUndefined();
  });

  it("isolates sending domains across orgs", async () => {
    const a = await signUp("DomIsoA");
    const b = await signUp("DomIsoB");
    await Parse.Cloud.run("createSendingDomain", { domain: "onlya-iso.com" }, as(a.sessionToken));
    const seenByB = (await Parse.Cloud.run("listSendingDomains", {}, as(b.sessionToken))) as any[];
    expect(seenByB.some((d) => d.domain === "onlya-iso.com")).toBe(false);
  });

  it("requires a session", async () => {
    await expect(Parse.Cloud.run("listSendingDomains", {})).rejects.toMatchObject({});
    await expect(
      Parse.Cloud.run("createSendingDomain", { domain: "x.com" }),
    ).rejects.toMatchObject({});
  });
});
