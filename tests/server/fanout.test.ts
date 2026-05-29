// campaign-fanout worker job tests (Sending.md §7 step 3).
//
// Drives the pure handler directly (no live Agenda): handle({campaignId}, {
// enqueue: stub }). Boots the shared Parse harness, signs up an org, builds a
// List + Contacts (subscribed / unsubscribed / suppressed / non-subscribed) via
// cloud functions so list membership + org stamping match production, and a
// queued Campaign via master key. Asserts the CampaignSend rows, campaign flip,
// mergeFields snapshot, enqueue fan-out, and idempotency on re-run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require.
const require = createRequire(import.meta.url);

const MK = { useMasterKey: true } as const;

describe("campaign-fanout job", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let fanout: any;
  let suppression: any;

  let sessionToken: string;
  let orgId: string;
  let listId: string;
  let campaignId: string;

  function as(token: string) {
    return { sessionToken: token };
  }

  async function addContact(fields: Record<string, unknown>) {
    return Parse.Cloud.run(
      "addContact",
      { audienceId: listId, ...fields },
      as(sessionToken),
    ) as Promise<{ id: string; email: string }>;
  }

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;

    fanout = require("../../server/worker/jobs/campaignFanout");
    suppression = require("../../server/lib/suppression");

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "fanout@example.com",
      password: "hunter2hunter2",
      company: "Fanout Co",
    })) as { sessionToken: string; orgId: string };
    sessionToken = r.sessionToken;
    orgId = r.orgId;

    const list = (await Parse.Cloud.run(
      "createAudience",
      { name: "Fanout List" },
      as(sessionToken),
    )) as { id: string };
    listId = list.id;

    // 2 plain subscribed, 1 with rich + custom fields (merge snapshot check),
    // 1 unsubscribed (excluded), 1 subscribed-but-suppressed (excluded).
    await addContact({ email: "Alice@Example.com", firstName: "Alice" });
    await addContact({ email: "bob@example.com", firstName: "Bob" });
    await addContact({
      email: "carol@example.com",
      firstName: "Carol",
      lastName: "Q",
      company: "Acme",
      city: "Berlin",
      country: "DE",
      timezone: "Europe/Berlin",
    });

    // Unsubscribed contact → excluded by the fanout filter.
    const unsub = await addContact({ email: "dan@example.com", firstName: "Dan" });
    const danObj = await new Parse.Query("Contact").get(unsub.id, MK);
    danObj.set("unsubscribed", true);
    await danObj.save(null, MK);

    // Subscribed but on the suppression list → excluded.
    await addContact({ email: "eve@example.com", firstName: "Eve" });
    await suppression.addSuppression({
      organization: orgId,
      email: "eve@example.com",
      reason: "hard_bounce",
    });

    // Stamp a custom field on Carol to verify mergeFields.custom snapshot.
    const carol = await new Parse.Query("Contact")
      .equalTo("email", "carol@example.com")
      .first(MK);
    carol!.set("customFields", { plan: "pro" });
    await carol!.save(null, MK);

    // Queued campaign targeting the list (master key; org pointer stamped).
    const Organization = Parse.Object.extend("Organization");
    const orgPtr = Organization.createWithoutData(orgId);
    const Campaign = Parse.Object.extend("Campaign");
    const campaign = new Campaign();
    campaign.set("organization", orgPtr);
    campaign.set("name", "Spring Sale");
    campaign.set("subject", "Hi {{firstName}}");
    campaign.set("fromName", "Fanout Co");
    campaign.set("fromEmail", "hello@send.example.com");
    campaign.set("audienceId", listId);
    campaign.set("compiledHtml", "<body><p>Hi {{firstName}}</p></body>");
    campaign.set("status", "queued");
    await campaign.save(null, MK);
    campaignId = campaign.id;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  // 4 subscribed total minus 1 unsubscribed (dan) minus 1 suppressed (eve) = 3.
  it("creates one CampaignSend per eligible recipient, flips the campaign", async () => {
    const enqueued: any[] = [];
    const enqueue = async (name: string, data: any) => {
      enqueued.push({ name, data });
    };

    const res = await fanout.handle({ campaignId }, { enqueue });
    expect(res.recipientCount).toBe(3);

    const sends = await new Parse.Query("CampaignSend")
      .equalTo("campaign", Parse.Object.extend("Campaign").createWithoutData(campaignId))
      .find(MK);
    expect(sends.length).toBe(3);

    const emails = sends.map((s) => s.get("email")).sort();
    expect(emails).toEqual(["alice@example.com", "bob@example.com", "carol@example.com"]);

    // Excluded addresses produced no row.
    expect(emails).not.toContain("dan@example.com");
    expect(emails).not.toContain("eve@example.com");

    // Every row is queued + org-scoped.
    for (const s of sends) {
      expect(s.get("status")).toBe("queued");
      expect(s.get("organization").id).toBe(orgId);
    }

    // Campaign flipped to sending with the recipient count.
    const campaign = await new Parse.Query("Campaign").get(campaignId, MK);
    expect(campaign.get("status")).toBe("sending");
    expect(campaign.get("recipientCount")).toBe(3);

    // One SEND_EMAIL enqueued per created send, carrying sendId + campaignId.
    expect(enqueued.length).toBe(3);
    const sendIds = sends.map((s) => s.id).sort();
    expect(enqueued.map((e) => e.data.sendId).sort()).toEqual(sendIds);
    for (const e of enqueued) {
      expect(e.name).toBe("send-email");
      expect(e.data.campaignId).toBe(campaignId);
    }
  });

  it("snapshots mergeFields (flat std keys + nested custom)", async () => {
    const carolSend = await new Parse.Query("CampaignSend")
      .equalTo("email", "carol@example.com")
      .first(MK);
    const mf = carolSend!.get("mergeFields");
    expect(mf.firstName).toBe("Carol");
    expect(mf.lastName).toBe("Q");
    expect(mf.email).toBe("carol@example.com");
    expect(mf.company).toBe("Acme");
    expect(mf.city).toBe("Berlin");
    expect(mf.country).toBe("DE");
    expect(mf.timezone).toBe("Europe/Berlin");
    expect(mf.custom).toEqual({ plan: "pro" });
  });

  it("re-running fanout creates no duplicate CampaignSend rows (idempotent)", async () => {
    // The campaign is now "sending" from the first run, so a straight re-run
    // bails on the status guard. Reset to "queued" to exercise the duplicate-key
    // path: rows already exist, so none are recreated and nothing is enqueued.
    const campaign = await new Parse.Query("Campaign").get(campaignId, MK);
    campaign.set("status", "queued");
    await campaign.save(null, MK);

    const enqueued: any[] = [];
    const res = await fanout.handle(
      { campaignId },
      { enqueue: async (name: string, data: any) => enqueued.push({ name, data }) },
    );
    expect(res.recipientCount).toBe(3);

    const count = await new Parse.Query("CampaignSend")
      .equalTo("campaign", Parse.Object.extend("Campaign").createWithoutData(campaignId))
      .count(MK);
    expect(count).toBe(3); // no duplicates

    // Existing rows weren't re-created → nothing newly enqueued.
    expect(enqueued.length).toBe(0);
  });

  it("bails when the campaign is not queued", async () => {
    // After the prior test the campaign is "sending" again.
    const enqueued: any[] = [];
    const res = await fanout.handle(
      { campaignId },
      { enqueue: async (...a: any[]) => enqueued.push(a) },
    );
    expect(res.recipientCount).toBe(0);
    expect(enqueued.length).toBe(0);
  });
});
