// Cloud-function tests for suppression management (Track C, F-28):
// manual add (paste/CSV) + dedupe, list with search + pagination, and remove
// (which writes a SuppressionAuditLog row). Uses the in-memory Parse server,
// same harness as settings.test.ts.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("suppression management cloud functions", () => {
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
      username: `supp-${counter}@example.com`,
      password: "hunter2hunter2",
      name: "Test User",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  it("addSuppressions adds valid emails, ignores junk, and dedupes the input", async () => {
    const a = await signUp("SuppAddCo");
    const res = (await Parse.Cloud.run(
      "addSuppressions",
      { emails: "A@b.com, a@b.com, not-an-email, c@d.com", reason: "manual" },
      as(a.sessionToken),
    )) as { added: number; skipped: number; total: number };
    // A@b.com and a@b.com collapse to one; not-an-email dropped → 2 unique valid.
    expect(res.total).toBe(2);
    expect(res.added).toBe(2);
    expect(res.skipped).toBe(0);
  });

  it("addSuppressions skips an address already suppressed", async () => {
    const a = await signUp("SuppDupeCo");
    await Parse.Cloud.run(
      "addSuppressions",
      { emails: "dupe@x.com" },
      as(a.sessionToken),
    );
    const res = (await Parse.Cloud.run(
      "addSuppressions",
      { emails: "dupe@x.com, fresh@x.com" },
      as(a.sessionToken),
    )) as { added: number; skipped: number; total: number };
    expect(res.added).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it("addSuppressions rejects when no valid emails are provided", async () => {
    const a = await signUp("SuppEmptyCo");
    await expect(
      Parse.Cloud.run("addSuppressions", { emails: "garbage, also-bad" }, as(a.sessionToken)),
    ).rejects.toMatchObject({});
  });

  it("listSuppressions returns a paginated shape and search filters by email", async () => {
    const a = await signUp("SuppListCo");
    await Parse.Cloud.run(
      "addSuppressions",
      { emails: "alice@list.com, bob@list.com, carol@other.com" },
      as(a.sessionToken),
    );

    const all = (await Parse.Cloud.run("listSuppressions", {}, as(a.sessionToken))) as any;
    expect(all.total).toBe(3);
    expect(all.results.length).toBe(3);
    expect(all.page).toBe(0);
    expect(all.hasMore).toBe(false);

    const filtered = (await Parse.Cloud.run(
      "listSuppressions",
      { search: "list.com" },
      as(a.sessionToken),
    )) as any;
    expect(filtered.total).toBe(2);
    expect(filtered.results.every((r: any) => r.email.includes("list.com"))).toBe(true);
  });

  it("removeSuppression deletes the row and writes an audit log entry", async () => {
    const a = await signUp("SuppRemoveCo");
    await Parse.Cloud.run("addSuppressions", { emails: "gone@x.com" }, as(a.sessionToken));
    const list = (await Parse.Cloud.run("listSuppressions", {}, as(a.sessionToken))) as any;
    const target = list.results.find((r: any) => r.email === "gone@x.com");
    expect(target).toBeTruthy();

    const res = (await Parse.Cloud.run(
      "removeSuppression",
      { id: target.id },
      as(a.sessionToken),
    )) as { removed: boolean; email: string };
    expect(res.removed).toBe(true);
    expect(res.email).toBe("gone@x.com");

    // Gone from the list.
    const after = (await Parse.Cloud.run("listSuppressions", {}, as(a.sessionToken))) as any;
    expect(after.results.find((r: any) => r.email === "gone@x.com")).toBeUndefined();

    // Audit row was written (master-key read, class auto-created on first save).
    const auditQ = new Parse.Query("SuppressionAuditLog");
    auditQ.equalTo("email", "gone@x.com");
    auditQ.equalTo("action", "remove");
    const audit = await auditQ.first({ useMasterKey: true });
    expect(audit).toBeTruthy();
  });

  it("removeSuppression throws OBJECT_NOT_FOUND for an unknown id", async () => {
    const a = await signUp("SuppMissingCo");
    await expect(
      Parse.Cloud.run("removeSuppression", { id: "doesNotExist" }, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  it("isolates suppressions across orgs", async () => {
    const a = await signUp("SuppIsoA");
    const b = await signUp("SuppIsoB");
    await Parse.Cloud.run("addSuppressions", { emails: "onlya@iso.com" }, as(a.sessionToken));

    const seenByB = (await Parse.Cloud.run("listSuppressions", {}, as(b.sessionToken))) as any;
    expect(seenByB.results.some((r: any) => r.email === "onlya@iso.com")).toBe(false);
  });

  it("requires a session", async () => {
    await expect(Parse.Cloud.run("listSuppressions", {})).rejects.toMatchObject({});
    await expect(Parse.Cloud.run("addSuppressions", { emails: "x@y.com" })).rejects.toMatchObject({});
  });
});
