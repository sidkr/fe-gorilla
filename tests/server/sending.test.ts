// Cloud-function tests for the editor-facing send pipeline:
//   - sendTestEmail   → rejects with no compiled HTML; on a valid campaign sends
//                       a "[TEST]" message via the mock SES adapter with merge
//                       tags resolved + returns a messageId.
//   - scheduleSend    → VALIDATIONS reject (missing subject / missing compiled
//                       HTML / no recipients); a fully-valid campaign (List + a
//                       subscribed Contact) flips status to "queued" and returns
//                       recipientCount ≥ 1.
//   - cancelScheduledSend → reverts a queued campaign back to "draft".
//
// The mock SES adapter (AWS_SES_MODE default) writes a MockSentMessage per send,
// which we inspect. The Agenda enqueue may not connect in the test env; the fns
// wrap it in try/catch so the status flip still commits — we assert status, not
// the queue.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("sending cloud functions", () => {
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
      username: `send-${counter}@example.com`,
      password: "hunter2hunter2",
      email: `send-${counter}@example.com`,
      name: "Sender",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  // Create a Campaign directly as the caller (tenancy beforeSave stamps org +
  // ACL; the compileBlocks hook fills compiledHtml when `body` is set). Returns
  // the saved Parse.Object.
  async function makeCampaign(
    token: string,
    fields: Record<string, unknown>,
  ) {
    const c = new Parse.Object("Campaign");
    for (const [k, v] of Object.entries(fields)) c.set(k, v);
    if (!fields.status) c.set("status", "draft");
    await c.save(null, as(token));
    return c;
  }

  async function makeList(token: string, name: string) {
    const r = (await Parse.Cloud.run("createAudience", { name }, as(token))) as {
      id: string;
    };
    return r.id;
  }

  async function addContact(token: string, listId: string, email: string) {
    return Parse.Cloud.run(
      "addContact",
      { audienceId: listId, email, firstName: "Pat" },
      as(token),
    );
  }

  // ── sendTestEmail ─────────────────────────────────────────────────────────--
  describe("sendTestEmail", () => {
    it("rejects when compiledHtml is empty", async () => {
      const a = await signUp("TestEmptyCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "Draft",
        subject: "Hi",
        // no body/compiledHtml → nothing to send
      });
      await expect(
        Parse.Cloud.run(
          "sendTestEmail",
          { campaignId: c.id, to: "me@example.com" },
          as(a.sessionToken),
        ),
      ).rejects.toThrow(/save your design first/i);
    });

    it("rejects an invalid recipient address", async () => {
      const a = await signUp("BadAddrCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "C",
        subject: "S",
        compiledHtml: "<p>hi</p>",
      });
      await expect(
        Parse.Cloud.run(
          "sendTestEmail",
          { campaignId: c.id, to: "not-an-email" },
          as(a.sessionToken),
        ),
      ).rejects.toThrow(/valid email/i);
    });

    it("caps at 5 recipients", async () => {
      const a = await signUp("CapCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "C",
        subject: "S",
        compiledHtml: "<p>hi</p>",
      });
      const six = ["a", "b", "c", "d", "e", "f"]
        .map((x) => `${x}@example.com`)
        .join(",");
      await expect(
        Parse.Cloud.run(
          "sendTestEmail",
          { campaignId: c.id, to: six },
          as(a.sessionToken),
        ),
      ).rejects.toThrow(/limited to 5/i);
    });

    it("sends a [TEST] message with merge tags resolved + returns a messageId", async () => {
      const a = await signUp("TestSendCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "Promo",
        subject: "Spring sale",
        fromName: "Acme",
        fromEmail: "acme@send.gorilla.email",
        replyTo: "reply@acme.com",
        // {{firstName}} resolves to the caller's name ("Sender"); {{custom.x}}
        // with no value falls back to its inline default.
        compiledHtml:
          "<p>Hi {{firstName}}, code {{custom.code|SAVE10}}</p>",
      });

      const res = (await Parse.Cloud.run(
        "sendTestEmail",
        { campaignId: c.id, to: "you@example.com, you@example.com" }, // dedups
        as(a.sessionToken),
      )) as { ok: boolean; messageId: string; sentTo: string[] };

      expect(res.ok).toBe(true);
      expect(res.messageId).toMatch(/^mock-/);
      expect(res.sentTo).toEqual(["you@example.com"]);

      // Inspect the MockSentMessage the mock adapter persisted.
      const q = new Parse.Query("MockSentMessage");
      q.equalTo("messageId", res.messageId);
      const row = await q.first({ useMasterKey: true });
      expect(row).toBeTruthy();
      expect(row!.get("subject")).toBe("[TEST] Spring sale");
      expect(row!.get("to")).toBe("you@example.com");
      expect(row!.get("from")).toBe("Acme <acme@send.gorilla.email>");
      expect(row!.get("replyTo")).toBe("reply@acme.com");
      // Merge tags resolved: caller name + inline default.
      const html = row!.get("html") as string;
      expect(html).toContain("Hi Sender,");
      expect(html).toContain("code SAVE10");
      expect(html).not.toContain("{{");
    });

    it("uses default subject when the campaign has none", async () => {
      const a = await signUp("NoSubjCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "C",
        compiledHtml: "<p>x</p>",
      });
      const res = (await Parse.Cloud.run(
        "sendTestEmail",
        { campaignId: c.id, to: "z@example.com" },
        as(a.sessionToken),
      )) as { messageId: string };
      const q = new Parse.Query("MockSentMessage");
      q.equalTo("messageId", res.messageId);
      const row = await q.first({ useMasterKey: true });
      expect(row!.get("subject")).toBe("[TEST] (no subject)");
      expect(row!.get("from")).toBe("Gorilla <hello@send.gorilla.email>");
    });

    it("can't send a test for another org's campaign", async () => {
      const a = await signUp("OwnerCo");
      const b = await signUp("IntruderCo");
      const c = await makeCampaign(a.sessionToken, {
        name: "Private",
        subject: "S",
        compiledHtml: "<p>x</p>",
      });
      await expect(
        Parse.Cloud.run(
          "sendTestEmail",
          { campaignId: c.id, to: "x@example.com" },
          as(b.sessionToken),
        ),
      ).rejects.toThrow();
    });
  });

  // ── scheduleSend ──────────────────────────────────────────────────────────--
  describe("scheduleSend", () => {
    // Build a campaign that is valid except for the field under test.
    async function validBase(token: string, listId: string) {
      return {
        name: "Ready",
        subject: "Ready to send",
        fromEmail: "from@send.gorilla.email",
        fromName: "From",
        audienceId: listId,
        compiledHtml: "<p>Hello</p>",
        status: "draft",
      };
    }

    it("rejects when compiledHtml is missing", async () => {
      const a = await signUp("SchedNoHtml");
      const listId = await makeList(a.sessionToken, "L");
      await addContact(a.sessionToken, listId, "sub@example.com");
      const base = await validBase(a.sessionToken, listId);
      delete (base as any).compiledHtml;
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/save your design first/i);
    });

    it("rejects when subject is missing", async () => {
      const a = await signUp("SchedNoSubj");
      const listId = await makeList(a.sessionToken, "L");
      await addContact(a.sessionToken, listId, "sub@example.com");
      const base = await validBase(a.sessionToken, listId);
      delete (base as any).subject;
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/subject/i);
    });

    it("rejects when fromEmail is missing", async () => {
      const a = await signUp("SchedNoFrom");
      const listId = await makeList(a.sessionToken, "L");
      await addContact(a.sessionToken, listId, "sub@example.com");
      const base = await validBase(a.sessionToken, listId);
      delete (base as any).fromEmail;
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/from address/i);
    });

    it("rejects when audienceId is missing", async () => {
      const a = await signUp("SchedNoAud");
      const base = await validBase(a.sessionToken, "unused");
      delete (base as any).audienceId;
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/audience/i);
    });

    it("rejects when the audience has no subscribed recipients", async () => {
      const a = await signUp("SchedNoRcpt");
      const listId = await makeList(a.sessionToken, "Empty"); // no contacts
      const base = await validBase(a.sessionToken, listId);
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/no subscribed recipients/i);
    });

    it("flips a fully-valid campaign to queued and returns recipientCount ≥ 1", async () => {
      const a = await signUp("SchedOk");
      const listId = await makeList(a.sessionToken, "Subs");
      await addContact(a.sessionToken, listId, "one@example.com");
      await addContact(a.sessionToken, listId, "two@example.com");
      const c = await makeCampaign(a.sessionToken, await validBase(a.sessionToken, listId));

      const res = (await Parse.Cloud.run(
        "scheduleSend",
        { campaignId: c.id, when: "now" },
        as(a.sessionToken),
      )) as { ok: boolean; recipientCount: number; status: string };

      expect(res.ok).toBe(true);
      expect(res.status).toBe("queued");
      expect(res.recipientCount).toBeGreaterThanOrEqual(1);
      expect(res.recipientCount).toBe(2);

      // Persisted status reflects the flip.
      const reloaded = await new Parse.Query("Campaign").get(c.id, as(a.sessionToken));
      expect(reloaded.get("status")).toBe("queued");
    });

    it("schedules a future send and sets scheduledAt", async () => {
      const a = await signUp("SchedFuture");
      const listId = await makeList(a.sessionToken, "Subs");
      await addContact(a.sessionToken, listId, "one@example.com");
      const c = await makeCampaign(a.sessionToken, await validBase(a.sessionToken, listId));

      const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const res = (await Parse.Cloud.run(
        "scheduleSend",
        { campaignId: c.id, when: future },
        as(a.sessionToken),
      )) as { status: string };
      expect(res.status).toBe("scheduled");

      const reloaded = await new Parse.Query("Campaign").get(c.id, as(a.sessionToken));
      expect(reloaded.get("status")).toBe("scheduled");
      expect(reloaded.get("scheduledAt")).toBeInstanceOf(Date);
    });

    it("rejects a past scheduled time", async () => {
      const a = await signUp("SchedPast");
      const listId = await makeList(a.sessionToken, "Subs");
      await addContact(a.sessionToken, listId, "one@example.com");
      const c = await makeCampaign(a.sessionToken, await validBase(a.sessionToken, listId));
      const past = new Date(Date.now() - 60 * 1000).toISOString();
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: past }, as(a.sessionToken)),
      ).rejects.toThrow(/future/i);
    });

    it("rejects scheduling an already-sent campaign", async () => {
      const a = await signUp("SchedSent");
      const listId = await makeList(a.sessionToken, "Subs");
      await addContact(a.sessionToken, listId, "one@example.com");
      const base = await validBase(a.sessionToken, listId);
      (base as any).status = "sent";
      const c = await makeCampaign(a.sessionToken, base);
      await expect(
        Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken)),
      ).rejects.toThrow(/can't schedule/i);
    });
  });

  // ── cancelScheduledSend ───────────────────────────────────────────────────--
  describe("cancelScheduledSend", () => {
    it("reverts a queued campaign back to draft", async () => {
      const a = await signUp("CancelCo");
      const listId = await makeList(a.sessionToken, "Subs");
      await addContact(a.sessionToken, listId, "one@example.com");
      const c = await makeCampaign(a.sessionToken, {
        name: "Q",
        subject: "S",
        fromEmail: "f@send.gorilla.email",
        audienceId: listId,
        compiledHtml: "<p>x</p>",
        status: "draft",
      });
      await Parse.Cloud.run("scheduleSend", { campaignId: c.id, when: "now" }, as(a.sessionToken));

      const res = (await Parse.Cloud.run(
        "cancelScheduledSend",
        { campaignId: c.id },
        as(a.sessionToken),
      )) as { ok: boolean; status: string };
      expect(res.ok).toBe(true);
      expect(res.status).toBe("draft");

      const reloaded = await new Parse.Query("Campaign").get(c.id, as(a.sessionToken));
      expect(reloaded.get("status")).toBe("draft");
      expect(reloaded.get("scheduledAt")).toBeUndefined();
    });

    it("is a no-op on a draft campaign", async () => {
      const a = await signUp("CancelDraft");
      const c = await makeCampaign(a.sessionToken, { name: "D", status: "draft" });
      const res = (await Parse.Cloud.run(
        "cancelScheduledSend",
        { campaignId: c.id },
        as(a.sessionToken),
      )) as { ok: boolean; status: string };
      expect(res.ok).toBe(true);
      expect(res.status).toBe("draft");
    });
  });
});
