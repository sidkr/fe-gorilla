// Cloud-function tests for settings: org general settings (read + patch +
// email validation) and sender identities (CRUD, verify stub, duplicate guard,
// cross-org isolation).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("settings cloud functions", () => {
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
      username: `set-${counter}@example.com`,
      password: "hunter2hunter2",
      name: "Test User",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  interface OrgSettings {
    id: string;
    name: string;
    slug: string;
    plan: string;
    defaultFromName: string;
    defaultFromEmail: string;
    replyTo: string;
    timezone: string;
    address: string;
    monthlySendCap: number;
    monthlySendCount: number;
  }
  interface Sender {
    id: string;
    fromName: string;
    fromEmail: string;
    status: string;
    createdAt: string | null;
  }

  // ── Org settings ──────────────────────────────────────────────────────────

  it("getOrgSettings returns the full org profile incl. timezone + address", async () => {
    const a = await signUp("ProfileCo");
    const s = (await Parse.Cloud.run("getOrgSettings", {}, as(a.sessionToken))) as OrgSettings;
    expect(s.id).toBe(a.orgId);
    expect(s.slug).toBeTruthy();
    expect(s.plan).toBe("free");
    expect(s.timezone).toBe("UTC");
    expect(s.address).toBe("");
    expect(typeof s.monthlySendCap).toBe("number");
  });

  it("updateOrgSettings patches editable fields and persists", async () => {
    const a = await signUp("PatchCo");
    const updated = (await Parse.Cloud.run(
      "updateOrgSettings",
      {
        patch: {
          name: "Patched Co",
          defaultFromName: "Patch Team",
          defaultFromEmail: "Hello@Patch.com",
          replyTo: "reply@patch.com",
          timezone: "America/New_York",
          address: "1 Patch Way, Springfield",
        },
      },
      as(a.sessionToken),
    )) as OrgSettings;
    expect(updated.name).toBe("Patched Co");
    expect(updated.defaultFromName).toBe("Patch Team");
    // Email lowercased.
    expect(updated.defaultFromEmail).toBe("hello@patch.com");
    expect(updated.replyTo).toBe("reply@patch.com");
    expect(updated.timezone).toBe("America/New_York");
    expect(updated.address).toBe("1 Patch Way, Springfield");

    // Re-read confirms persistence.
    const reread = (await Parse.Cloud.run("getOrgSettings", {}, as(a.sessionToken))) as OrgSettings;
    expect(reread.name).toBe("Patched Co");
    expect(reread.address).toBe("1 Patch Way, Springfield");
  });

  it("updateOrgSettings rejects an invalid default from-email", async () => {
    const a = await signUp("BadEmailCo");
    await expect(
      Parse.Cloud.run(
        "updateOrgSettings",
        { patch: { defaultFromEmail: "not-an-email" } },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("updateOrgSettings rejects an empty name", async () => {
    const a = await signUp("EmptyNameCo");
    await expect(
      Parse.Cloud.run(
        "updateOrgSettings",
        { patch: { name: "   " } },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("updateOrgSettings does not change slug or plan", async () => {
    const a = await signUp("ImmutableCo");
    const before = (await Parse.Cloud.run("getOrgSettings", {}, as(a.sessionToken))) as OrgSettings;
    const after = (await Parse.Cloud.run(
      "updateOrgSettings",
      { patch: { name: "Renamed", slug: "hacked", plan: "enterprise" } },
      as(a.sessionToken),
    )) as OrgSettings;
    expect(after.slug).toBe(before.slug);
    expect(after.plan).toBe("free");
  });

  // ── Sender identities ─────────────────────────────────────────────────────

  it("createSenderIdentity defaults status to pending and validates email", async () => {
    const a = await signUp("SenderCo");
    const s = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "Acme Team", fromEmail: "Hello@Acme.com" },
      as(a.sessionToken),
    )) as Sender;
    expect(s.fromName).toBe("Acme Team");
    expect(s.fromEmail).toBe("hello@acme.com"); // lowercased
    expect(s.status).toBe("pending");

    await expect(
      Parse.Cloud.run(
        "createSenderIdentity",
        { fromName: "Bad", fromEmail: "nope" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});

    await expect(
      Parse.Cloud.run(
        "createSenderIdentity",
        { fromName: "", fromEmail: "ok@acme.com" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("createSenderIdentity rejects a duplicate email in the same org", async () => {
    const a = await signUp("DupSenderCo");
    await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "One", fromEmail: "dup@acme.com" },
      as(a.sessionToken),
    );
    await expect(
      Parse.Cloud.run(
        "createSenderIdentity",
        { fromName: "Two", fromEmail: "dup@acme.com" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: Parse.Error.DUPLICATE_VALUE });
  });

  it("listSenderIdentities returns the org's senders", async () => {
    const a = await signUp("ListSenderCo");
    await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "A", fromEmail: "a@list.com" },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "B", fromEmail: "b@list.com" },
      as(a.sessionToken),
    );
    const rows = (await Parse.Cloud.run("listSenderIdentities", {}, as(a.sessionToken))) as Sender[];
    const emails = rows.map((r) => r.fromEmail).sort();
    expect(emails).toEqual(["a@list.com", "b@list.com"]);
  });

  it("verifySenderIdentity flips status to verified (MVP stub)", async () => {
    const a = await signUp("VerifyCo");
    const s = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "V", fromEmail: "v@verify.com" },
      as(a.sessionToken),
    )) as Sender;
    expect(s.status).toBe("pending");
    const verified = (await Parse.Cloud.run(
      "verifySenderIdentity",
      { id: s.id },
      as(a.sessionToken),
    )) as Sender;
    expect(verified.status).toBe("verified");
  });

  it("deleteSenderIdentity removes the row", async () => {
    const a = await signUp("DelSenderCo");
    const s = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "D", fromEmail: "d@del.com" },
      as(a.sessionToken),
    )) as Sender;
    const res = (await Parse.Cloud.run(
      "deleteSenderIdentity",
      { id: s.id },
      as(a.sessionToken),
    )) as { ok: boolean };
    expect(res.ok).toBe(true);
    const rows = (await Parse.Cloud.run("listSenderIdentities", {}, as(a.sessionToken))) as Sender[];
    expect(rows.find((r) => r.id === s.id)).toBeUndefined();
  });

  it("isolates sender identities across orgs", async () => {
    const a = await signUp("OrgSenderA");
    const b = await signUp("OrgSenderB");
    const made = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "OnlyA", fromEmail: "only@a.com" },
      as(a.sessionToken),
    )) as Sender;

    const seenByB = (await Parse.Cloud.run("listSenderIdentities", {}, as(b.sessionToken))) as Sender[];
    expect(seenByB.some((r) => r.fromEmail === "only@a.com")).toBe(false);

    // B cannot verify or delete A's sender (ACL hides it → not found).
    await expect(
      Parse.Cloud.run("verifySenderIdentity", { id: made.id }, as(b.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
    await expect(
      Parse.Cloud.run("deleteSenderIdentity", { id: made.id }, as(b.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });

    // B may reuse the same email — uniqueness is per-org.
    const bSender = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "AlsoOK", fromEmail: "only@a.com" },
      as(b.sessionToken),
    )) as Sender;
    expect(bSender.fromEmail).toBe("only@a.com");
  });

  it("requires a session for settings calls", async () => {
    await expect(Parse.Cloud.run("getOrgSettings", {})).rejects.toMatchObject({});
    await expect(Parse.Cloud.run("listSenderIdentities", {})).rejects.toMatchObject({});
  });
});
