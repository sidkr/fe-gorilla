// Integration tests for signUpWithOrg / getMyOrg branches NOT already covered
// by tests/server/tenancy.test.ts. Real Parse Server + in-memory Mongo via
// startTestParseServer(). Covers, from docs/testing/auth-marketing.md:
//   INT-04  getMyOrg rejects an anonymous caller (209)
//   INT-09  missing username/password rejected (OTHER_CAUSE)
//   INT-11  slug uniqueness across same-named orgs
//   INT-12  returned session token is usable for an authed getMyOrg
//   INT-10  company-name derivation fallbacks (P2)
//
// As in tenancy.test.ts: Parse.User.become() is blocked server-side, so we act
// as a user by passing { sessionToken } from signUpWithOrg into Cloud.run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("auth: signUpWithOrg / getMyOrg extra branches", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function signUp(params: Record<string, unknown>) {
    return Parse.Cloud.run("signUpWithOrg", params) as Promise<{
      sessionToken: string;
      userId: string;
      orgId: string;
      orgName: string;
    }>;
  }

  it("INT-04: getMyOrg rejects an anonymous caller (INVALID_SESSION_TOKEN/209)", async () => {
    // No sessionToken and no master key → the cloud fn has no request.user.
    await expect(Parse.Cloud.run("getMyOrg", {})).rejects.toMatchObject({
      code: Parse.Error.INVALID_SESSION_TOKEN,
    });
  });

  it("INT-09: missing username/password is rejected (OTHER_CAUSE)", async () => {
    await expect(Parse.Cloud.run("signUpWithOrg", {})).rejects.toMatchObject({
      code: Parse.Error.OTHER_CAUSE,
    });
    // Password only (no username) is also rejected.
    await expect(
      Parse.Cloud.run("signUpWithOrg", { password: "hunter2hunter2" }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("INT-11: same-named orgs get distinct slugs sharing the same base", async () => {
    const a = await signUp({
      username: "acme1@example.com",
      password: "hunter2hunter2",
      company: "Acme",
    });
    const b = await signUp({
      username: "acme2@example.com",
      password: "hunter2hunter2",
      company: "Acme",
    });

    const orgA = await new Parse.Query("Organization").get(a.orgId, {
      useMasterKey: true,
    });
    const orgB = await new Parse.Query("Organization").get(b.orgId, {
      useMasterKey: true,
    });

    const slugA = orgA.get("slug");
    const slugB = orgB.get("slug");
    expect(slugA).not.toBe(slugB);
    expect(slugA.startsWith("acme-")).toBe(true);
    expect(slugB.startsWith("acme-")).toBe(true);
  });

  it("INT-12: the returned session token is usable for an authed getMyOrg", async () => {
    const r = await signUp({
      username: "usable@example.com",
      password: "hunter2hunter2",
      company: "UsableCo",
    });
    expect(r.sessionToken).toBeTruthy();

    const org = (await Parse.Cloud.run(
      "getMyOrg",
      {},
      { sessionToken: r.sessionToken },
    )) as { id: string; name: string; plan: string; monthlySendCap: number };

    expect(org.id).toBe(r.orgId);
    expect(org.name).toBe("UsableCo");
    expect(org.plan).toBe("free");
    expect(org.monthlySendCap).toBe(10000);
  });

  it("INT-10: derives org name from name then username when company is blank", async () => {
    // company:"" + name:"Bob" → "Bob's organization"
    const byName = await signUp({
      username: "bobby@example.com",
      password: "hunter2hunter2",
      name: "Bob",
      company: "",
    });
    expect(byName.orgName).toBe("Bob's organization");

    // only a username (no company, no name) → "<localpart>'s organization"
    const byUsername = await signUp({
      username: "carl@example.com",
      password: "hunter2hunter2",
    });
    expect(byUsername.orgName).toBe("carl's organization");
  });
});
