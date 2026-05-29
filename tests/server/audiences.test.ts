// Cloud-function tests for the Audiences (List) feature. Boots a real Parse
// Server + in-memory Mongo, signs up tenants via signUpWithOrg, and acts as a
// tenant by passing { sessionToken } to each cloud run (Parse.User.become() is
// blocked server-side — see tenancy.test.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("audiences cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function signUp(company: string, username: string) {
    return Parse.Cloud.run("signUpWithOrg", {
      username,
      password: "hunter2hunter2",
      company,
    }) as Promise<{ sessionToken: string; userId: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  it("createAudience creates a List with name + zero count", async () => {
    const a = await signUp("AudCo", "aud-create@example.com");
    const res = (await Parse.Cloud.run(
      "createAudience",
      { name: "Newsletter", description: "Weekly" },
      as(a.sessionToken),
    )) as { id: string; name: string; contactCount: number; description: string };

    expect(res.id).toBeTruthy();
    expect(res.name).toBe("Newsletter");
    expect(res.description).toBe("Weekly");
    expect(res.contactCount).toBe(0);

    // Org + ACL stamped by tenancy hook.
    const list = await new Parse.Query("List").get(res.id, { useMasterKey: true });
    expect(list.get("organization").id).toBe(a.orgId);
  });

  it("createAudience rejects empty + over-long names", async () => {
    const a = await signUp("AudCo2", "aud-bad@example.com");
    await expect(
      Parse.Cloud.run("createAudience", { name: "   " }, as(a.sessionToken)),
    ).rejects.toMatchObject({});
    await expect(
      Parse.Cloud.run("createAudience", { name: "x".repeat(81) }, as(a.sessionToken)),
    ).rejects.toMatchObject({});
  });

  it("listAudiences returns only the caller's non-archived lists", async () => {
    const a = await signUp("ListCoA", "list-a@example.com");
    const b = await signUp("ListCoB", "list-b@example.com");

    await Parse.Cloud.run("createAudience", { name: "A-one" }, as(a.sessionToken));
    await Parse.Cloud.run("createAudience", { name: "A-two" }, as(a.sessionToken));
    await Parse.Cloud.run("createAudience", { name: "B-one" }, as(b.sessionToken));

    const aList = (await Parse.Cloud.run("listAudiences", {}, as(a.sessionToken))) as any[];
    const bList = (await Parse.Cloud.run("listAudiences", {}, as(b.sessionToken))) as any[];

    expect(aList.map((x) => x.name).sort()).toEqual(["A-one", "A-two"]);
    expect(bList.map((x) => x.name)).toEqual(["B-one"]);
  });

  it("getAudience returns a single list; archiveAudience hides it", async () => {
    const a = await signUp("ArchCo", "arch@example.com");
    const created = (await Parse.Cloud.run(
      "createAudience",
      { name: "Archive me" },
      as(a.sessionToken),
    )) as { id: string };

    const got = (await Parse.Cloud.run("getAudience", { id: created.id }, as(a.sessionToken))) as {
      name: string;
    };
    expect(got.name).toBe("Archive me");

    const arch = (await Parse.Cloud.run("archiveAudience", { id: created.id }, as(a.sessionToken))) as {
      ok: boolean;
    };
    expect(arch.ok).toBe(true);

    const after = (await Parse.Cloud.run("listAudiences", {}, as(a.sessionToken))) as any[];
    expect(after.find((x) => x.id === created.id)).toBeUndefined();

    const withArchived = (await Parse.Cloud.run(
      "listAudiences",
      { includeArchived: true },
      as(a.sessionToken),
    )) as any[];
    expect(withArchived.find((x) => x.id === created.id)?.archived).toBe(true);
  });

  it("resolveAudienceRecipients returns subscribed contacts minus suppressed", async () => {
    const a = await signUp("ResolveCo", "resolve@example.com");
    const list = (await Parse.Cloud.run(
      "createAudience",
      { name: "Recipients" },
      as(a.sessionToken),
    )) as { id: string };

    await Parse.Cloud.run(
      "addContact",
      { audienceId: list.id, email: "sub1@example.com" },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "addContact",
      { audienceId: list.id, email: "sub2@example.com" },
      as(a.sessionToken),
    );
    // A non-subscribed contact should NOT be a recipient.
    await Parse.Cloud.run(
      "addContact",
      { audienceId: list.id, email: "pending@example.com", status: "pending" },
      as(a.sessionToken),
    );

    const recips = (await Parse.Cloud.run(
      "resolveAudienceRecipients",
      { id: list.id },
      as(a.sessionToken),
    )) as Array<{ email: string }>;
    expect(recips.map((r) => r.email).sort()).toEqual([
      "sub1@example.com",
      "sub2@example.com",
    ]);

    // Suppress sub1 → drops out when excludeSuppressed (default).
    await Parse.Cloud.run(
      "updateContact",
      { id: (await findContact(a.sessionToken, "sub1@example.com")).id, patch: { status: "unsubscribed" } },
      as(a.sessionToken),
    );
    const after = (await Parse.Cloud.run(
      "resolveAudienceRecipients",
      { id: list.id },
      as(a.sessionToken),
    )) as Array<{ email: string }>;
    // sub1 is now unsubscribed (not "subscribed") AND suppressed → only sub2.
    expect(after.map((r) => r.email)).toEqual(["sub2@example.com"]);
  });

  async function findContact(token: string, email: string) {
    const q = new Parse.Query("Contact");
    q.equalTo("email", email);
    const c = await q.first({ sessionToken: token });
    if (!c) throw new Error(`contact ${email} not found`);
    return c;
  }
});
