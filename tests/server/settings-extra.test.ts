// Additional cloud-function tests for settings — the uncovered SRV cases in
// docs/testing/settings.md beyond tests/server/settings.test.ts:
//
//   updateOrgSettings: name length (OS-06), invalid reply-to (OS-08),
//     clearing optional emails (OS-09/10), blank tz → UTC (OS-11), counters
//     inert (OS-14), partial patch (OS-15), address verbatim (OS-16),
//     settings tenant isolation on *update* (OS-17), more invalid-email corpus.
//   createSenderIdentity: long from-name (SI-04), case-insensitive dup (SI-06).
//   listSenderIdentities: newest-first order (SI-08), empty list (SI-09).
//   verifySenderIdentity: missing id (SI-11), bogus id (SI-12).
//   deleteSenderIdentity: missing id (SI-14), bogus id (SI-15).
//   cross-tenant: A unaffected after B's failed attempts (TEN-05).
//   no-session: broaden to all six fns (OS-18 / SI-16 full).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("settings cloud functions — extended coverage", () => {
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
      username: `setx-${counter}@example.com`,
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

  const getOrg = (token: string) =>
    Parse.Cloud.run("getOrgSettings", {}, as(token)) as Promise<OrgSettings>;
  const patchOrg = (token: string, patch: Record<string, unknown>) =>
    Parse.Cloud.run("updateOrgSettings", { patch }, as(token)) as Promise<OrgSettings>;

  // ── updateOrgSettings ──────────────────────────────────────────────────────

  it("OS-02: shape defaults are typed (strings/UTC/free/0 counters), never undefined", async () => {
    const a = await signUp("DefaultsCo");
    const s = await getOrg(a.sessionToken);
    // String fields are always strings (never undefined/null), even when unset.
    expect(s.name).toBeTypeOf("string");
    expect(s.defaultFromName).toBeTypeOf("string");
    expect(s.defaultFromEmail).toBe("");
    expect(s.replyTo).toBe("");
    expect(s.timezone).toBe("UTC");
    expect(s.plan).toBe("free");
    expect(s.address).toBe("");
    // Counters default to the number 0, never undefined/null.
    expect(s.monthlySendCount).toBe(0);
    expect(typeof s.monthlySendCap).toBe("number");
  });

  it("OS-06: rejects a name over 120 chars", async () => {
    const a = await signUp("LongNameCo");
    await expect(
      patchOrg(a.sessionToken, { name: "x".repeat(121) }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
    // Boundary: exactly 120 is accepted.
    const ok = await patchOrg(a.sessionToken, { name: "y".repeat(120) });
    expect(ok.name).toBe("y".repeat(120));
  });

  it("OS-07 (corpus): rejects each malformed default from-email", async () => {
    const a = await signUp("EmailCorpusCo");
    const corpus = ["nope", "a@b", "a b@c.com", "@nodomain.com", "missing@.com"];
    for (const bad of corpus) {
      await expect(
        patchOrg(a.sessionToken, { defaultFromEmail: bad }),
      ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
    }
  });

  it("OS-08: rejects an invalid reply-to", async () => {
    const a = await signUp("ReplyToCo");
    await expect(
      patchOrg(a.sessionToken, { replyTo: "bad" }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("OS-09: allows clearing default from-email after it was set", async () => {
    const a = await signUp("ClearFromCo");
    await patchOrg(a.sessionToken, { defaultFromEmail: "set@acme.com" });
    const cleared = await patchOrg(a.sessionToken, { defaultFromEmail: "" });
    expect(cleared.defaultFromEmail).toBe("");
  });

  it("OS-10: allows clearing reply-to", async () => {
    const a = await signUp("ClearReplyCo");
    await patchOrg(a.sessionToken, { replyTo: "reply@acme.com" });
    const cleared = await patchOrg(a.sessionToken, { replyTo: "" });
    expect(cleared.replyTo).toBe("");
  });

  it("OS-11: a blank timezone falls back to UTC", async () => {
    const a = await signUp("BlankTzCo");
    await patchOrg(a.sessionToken, { timezone: "America/New_York" });
    const back = await patchOrg(a.sessionToken, { timezone: "   " });
    expect(back.timezone).toBe("UTC");
  });

  it("OS-14: send counters are inert (not written by updateOrgSettings)", async () => {
    const a = await signUp("CountersCo");
    const before = await getOrg(a.sessionToken);
    const after = await patchOrg(a.sessionToken, {
      monthlySendCap: 99,
      monthlySendCount: 99,
    });
    expect(after.monthlySendCap).toBe(before.monthlySendCap);
    expect(after.monthlySendCount).toBe(before.monthlySendCount);
  });

  it("OS-15: a partial patch leaves omitted fields intact", async () => {
    const a = await signUp("PartialCo");
    await patchOrg(a.sessionToken, {
      name: "Full Co",
      defaultFromName: "Full Team",
      defaultFromEmail: "full@acme.com",
      timezone: "Asia/Tokyo",
    });
    const after = await patchOrg(a.sessionToken, { address: "New Address" });
    expect(after.address).toBe("New Address");
    expect(after.name).toBe("Full Co");
    expect(after.defaultFromName).toBe("Full Team");
    expect(after.defaultFromEmail).toBe("full@acme.com");
    expect(after.timezone).toBe("Asia/Tokyo");
  });

  it("OS-16: address is stored verbatim incl. newlines (not trimmed)", async () => {
    const a = await signUp("AddressCo");
    const after = await patchOrg(a.sessionToken, { address: "  Line 1\nLine 2  " });
    expect(after.address).toBe("  Line 1\nLine 2  ");
  });

  it("OS-17: updateOrgSettings only touches the caller's own org", async () => {
    const a = await signUp("IsoUpdateA");
    const b = await signUp("IsoUpdateB");
    const bBefore = await getOrg(b.sessionToken);
    await patchOrg(a.sessionToken, { name: "A Was Here" });
    const bAfter = await getOrg(b.sessionToken);
    expect(bAfter.name).toBe(bBefore.name);
    expect(bAfter.name).not.toBe("A Was Here");
  });

  // ── createSenderIdentity ────────────────────────────────────────────────────

  it("SI-04: rejects a from-name over 120 chars", async () => {
    const a = await signUp("LongSenderNameCo");
    await expect(
      Parse.Cloud.run(
        "createSenderIdentity",
        { fromName: "x".repeat(121), fromEmail: "ok@acme.com" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("SI-06: duplicate check is case-insensitive", async () => {
    const a = await signUp("CaseDupCo");
    await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "One", fromEmail: "dup@acme.com" },
      as(a.sessionToken),
    );
    await expect(
      Parse.Cloud.run(
        "createSenderIdentity",
        { fromName: "Two", fromEmail: "DUP@Acme.com" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: Parse.Error.DUPLICATE_VALUE });
  });

  // ── listSenderIdentities ────────────────────────────────────────────────────

  it("SI-08: list is ordered newest-first", async () => {
    const a = await signUp("OrderCo");
    const first = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "First", fromEmail: "first@acme.com" },
      as(a.sessionToken),
    )) as Sender;
    const second = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "Second", fromEmail: "second@acme.com" },
      as(a.sessionToken),
    )) as Sender;
    const rows = (await Parse.Cloud.run(
      "listSenderIdentities",
      {},
      as(a.sessionToken),
    )) as Sender[];
    expect(rows[0].id).toBe(second.id);
    expect(rows[1].id).toBe(first.id);
  });

  it("SI-09: an immediately-listed new org returns an empty array", async () => {
    const a = await signUp("EmptyListCo");
    const rows = (await Parse.Cloud.run(
      "listSenderIdentities",
      {},
      as(a.sessionToken),
    )) as Sender[];
    expect(rows).toEqual([]);
  });

  // ── verifySenderIdentity ────────────────────────────────────────────────────

  it("SI-11: verify with no id is rejected", async () => {
    const a = await signUp("VerifyNoIdCo");
    await expect(
      Parse.Cloud.run("verifySenderIdentity", {}, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("SI-12: verify a non-existent id is rejected with OBJECT_NOT_FOUND", async () => {
    const a = await signUp("VerifyBogusCo");
    await expect(
      Parse.Cloud.run("verifySenderIdentity", { id: "doesNotExist01" }, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  // ── deleteSenderIdentity ────────────────────────────────────────────────────

  it("SI-14: delete with no id is rejected", async () => {
    const a = await signUp("DelNoIdCo");
    await expect(
      Parse.Cloud.run("deleteSenderIdentity", {}, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("SI-15: delete a non-existent id is rejected with OBJECT_NOT_FOUND", async () => {
    const a = await signUp("DelBogusCo");
    await expect(
      Parse.Cloud.run("deleteSenderIdentity", { id: "doesNotExist01" }, as(a.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  // ── cross-tenant ────────────────────────────────────────────────────────────

  it("TEN-05: A's verify + delete still work after B's failed cross-tenant attempts", async () => {
    const a = await signUp("Ten5A");
    const b = await signUp("Ten5B");
    const made = (await Parse.Cloud.run(
      "createSenderIdentity",
      { fromName: "OnlyA", fromEmail: "ten5@a.com" },
      as(a.sessionToken),
    )) as Sender;

    // B fails on both.
    await expect(
      Parse.Cloud.run("verifySenderIdentity", { id: made.id }, as(b.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
    await expect(
      Parse.Cloud.run("deleteSenderIdentity", { id: made.id }, as(b.sessionToken)),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });

    // A's own ops succeed afterwards.
    const verified = (await Parse.Cloud.run(
      "verifySenderIdentity",
      { id: made.id },
      as(a.sessionToken),
    )) as Sender;
    expect(verified.status).toBe("verified");
    const del = (await Parse.Cloud.run(
      "deleteSenderIdentity",
      { id: made.id },
      as(a.sessionToken),
    )) as { ok: boolean };
    expect(del.ok).toBe(true);
  });

  // ── no-session (full OS-18 / SI-16) ─────────────────────────────────────────

  it("OS-18 / SI-16: every settings fn rejects without a session", async () => {
    await expect(Parse.Cloud.run("getOrgSettings", {})).rejects.toMatchObject({
      code: Parse.Error.INVALID_SESSION_TOKEN,
    });
    await expect(
      Parse.Cloud.run("updateOrgSettings", { patch: { name: "X" } }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    await expect(Parse.Cloud.run("listSenderIdentities", {})).rejects.toMatchObject({
      code: Parse.Error.INVALID_SESSION_TOKEN,
    });
    await expect(
      Parse.Cloud.run("createSenderIdentity", { fromName: "A", fromEmail: "a@b.co" }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    await expect(
      Parse.Cloud.run("verifySenderIdentity", { id: "x" }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    await expect(
      Parse.Cloud.run("deleteSenderIdentity", { id: "x" }),
    ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
  });
});
