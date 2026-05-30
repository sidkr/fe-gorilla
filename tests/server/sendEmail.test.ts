// send-email worker job tests. Drives the handler directly (no live Agenda) and
// asserts the full render → send → record pipeline against the in-memory Parse
// Server with the default mock SES adapter (AWS_SES_MODE unset → "mock").
//
// Coverage:
//   - happy path: merged + tracked HTML reaches the MockSentMessage, the
//     CampaignSend flips to "sent" with a sesMessageId, an "accepted" EmailEvent
//     is written, and Campaign.sentCount is incremented.
//   - suppressed recipient: status → "suppressed", nothing sent.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require.
const require = createRequire(import.meta.url);

const MK = { useMasterKey: true } as const;

const COMPILED_HTML =
  "<body>Hi {{firstName}}! " +
  '<a href="https://shop.example.com/sale">Shop now</a> ' +
  '<a href="{{unsubscribeUrl}}">unsubscribe</a></body>';

describe("send-email worker job", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let handle: (data: { sendId: string; campaignId: string }) => Promise<void>;

  let orgId: string;
  let suppression: any;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;

    // Load the job + suppression lib AFTER the harness initializes the SDK so
    // their require("parse/node") resolves to the configured singleton.
    handle = require("../../server/worker/jobs/sendEmail").handle;
    suppression = require("../../server/lib/suppression");

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "sender@example.com",
      password: "hunter2hunter2",
      email: "sender@example.com",
      name: "Sender",
      company: "Send Co",
    })) as { sessionToken: string; orgId: string };
    orgId = r.orgId;
    expect(orgId).toBeTruthy();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  function orgPointer() {
    return Parse.Object.extend("Organization").createWithoutData(orgId);
  }

  async function makeCampaign() {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("organization", orgPointer());
    c.set("name", "Spring Sale");
    c.set("subject", "Big news");
    c.set("fromName", "Acme");
    c.set("fromEmail", "promos@acme.test");
    c.set("replyTo", "reply@acme.test");
    c.set("compiledHtml", COMPILED_HTML); // set directly → skips MJML recompile
    await c.save(null, MK);
    return c;
  }

  async function makeQueuedSend(campaign: any, email: string) {
    const CampaignSend = Parse.Object.extend("CampaignSend");
    const s = new CampaignSend();
    s.set("organization", orgPointer());
    s.set("campaign", campaign);
    s.set("email", email);
    s.set("status", "queued");
    s.set("mergeFields", { firstName: "Pat" });
    await s.save(null, MK);
    return s;
  }

  it("renders, tracks, sends, and records an accepted event", async () => {
    const campaign = await makeCampaign();
    const send = await makeQueuedSend(campaign, "pat@example.com");

    await handle({ sendId: send.id, campaignId: campaign.id });

    // The mock adapter persisted a MockSentMessage for this CampaignSend.
    const mq = new Parse.Query("MockSentMessage");
    mq.equalTo("campaignSend", send);
    const msg = await mq.first(MK);
    expect(msg).toBeDefined();

    const html = msg!.get("html") as string;
    // merge field resolved
    expect(html).toContain("Hi Pat!");
    expect(html).not.toContain("{{firstName}}");
    // open pixel present, pointing at /t/o/
    expect(html).toMatch(/<img src="[^"]*\/t\/o\/[^"]+"/);
    // shop link rewritten through /t/c/ (original href replaced)
    expect(html).toContain("/t/c/");
    expect(html).not.toContain('href="https://shop.example.com/sale"');
    // unsubscribe placeholder replaced with a real /u/ link
    expect(html).toContain("/u/");
    expect(html).not.toContain("{{unsubscribeUrl}}");

    // From / to / headers
    expect(msg!.get("from")).toBe("Acme <promos@acme.test>");
    expect(msg!.get("to")).toBe("pat@example.com");
    expect(msg!.get("replyTo")).toBe("reply@acme.test");
    expect(msg!.get("subject")).toBe("Big news");
    expect(msg!.get("headers")["List-Unsubscribe"]).toMatch(/\/u\//);

    // CampaignSend flipped to "sent" with the mock messageId.
    const fresh = await new Parse.Query("CampaignSend").get(send.id, MK);
    expect(fresh.get("status")).toBe("sent");
    expect(fresh.get("sesMessageId")).toBe(msg!.get("messageId"));
    expect(fresh.get("sesMessageId")).toMatch(/^mock-/);
    expect(fresh.get("sentAt")).toBeInstanceOf(Date);

    // An "accepted" EmailEvent exists for this send.
    const eq = new Parse.Query("EmailEvent");
    eq.equalTo("campaignSend", send);
    eq.equalTo("type", "accepted");
    const ev = await eq.first(MK);
    expect(ev).toBeDefined();
    expect(ev!.get("type")).toBe("accepted");

    // Campaign.sentCount incremented.
    const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(freshCampaign.get("sentCount")).toBe(1);
  });

  it("skips a suppressed recipient (status suppressed, no send)", async () => {
    const campaign = await makeCampaign();
    const email = "blocked@example.com";

    await suppression.addSuppression({
      organization: orgId,
      email,
      reason: "hard_bounce",
    });

    const send = await makeQueuedSend(campaign, email);

    await handle({ sendId: send.id, campaignId: campaign.id });

    const fresh = await new Parse.Query("CampaignSend").get(send.id, MK);
    expect(fresh.get("status")).toBe("suppressed");
    expect(fresh.get("sesMessageId")).toBeUndefined();

    // No MockSentMessage written for this send.
    const mq = new Parse.Query("MockSentMessage");
    mq.equalTo("campaignSend", send);
    expect(await mq.count(MK)).toBe(0);

    // sentCount untouched on this campaign.
    const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(freshCampaign.get("sentCount") || 0).toBe(0);
  });

  it("is a no-op when the send is not queued (retry / cancel guard)", async () => {
    const campaign = await makeCampaign();
    const send = await makeQueuedSend(campaign, "already@example.com");
    send.set("status", "sent"); // simulate an already-processed row
    await send.save(null, MK);

    await handle({ sendId: send.id, campaignId: campaign.id });

    const mq = new Parse.Query("MockSentMessage");
    mq.equalTo("campaignSend", send);
    expect(await mq.count(MK)).toBe(0);

    const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(freshCampaign.get("sentCount") || 0).toBe(0);
  });

  // ── campaign finalize: sending → sent once every row leaves the queue ──────
  async function makeSendingCampaign() {
    const campaign = await makeCampaign();
    campaign.set("status", "sending");
    await campaign.save(null, MK);
    return campaign;
  }

  it("flips a single-recipient campaign to sent + stamps sentAt", async () => {
    const campaign = await makeSendingCampaign();
    const send = await makeQueuedSend(campaign, "finalize-1@example.com");

    await handle({ sendId: send.id, campaignId: campaign.id });

    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sent");
    expect(fresh.get("sentAt")).toBeInstanceOf(Date);
  });

  it("stays 'sending' until the last recipient leaves the queue", async () => {
    const campaign = await makeSendingCampaign();
    const a = await makeQueuedSend(campaign, "finalize-a@example.com");
    const b = await makeQueuedSend(campaign, "finalize-b@example.com");

    await handle({ sendId: a.id, campaignId: campaign.id });
    let fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sending");

    await handle({ sendId: b.id, campaignId: campaign.id });
    fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sent");
  });

  it("finalizes even when the only recipient is suppressed", async () => {
    const campaign = await makeSendingCampaign();
    const email = "finalize-blocked@example.com";
    await suppression.addSuppression({ organization: orgId, email, reason: "manual" });
    const send = await makeQueuedSend(campaign, email);

    await handle({ sendId: send.id, campaignId: campaign.id });

    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("sent");
  });

  it("does not finalize a campaign that isn't 'sending'", async () => {
    const campaign = await makeCampaign();
    campaign.set("status", "paused");
    await campaign.save(null, MK);
    const send = await makeQueuedSend(campaign, "finalize-paused@example.com");

    await handle({ sendId: send.id, campaignId: campaign.id });

    const fresh = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(fresh.get("status")).toBe("paused");
    expect(fresh.get("sentAt")).toBeFalsy();
  });
});
