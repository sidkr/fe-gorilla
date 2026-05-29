// webhook-ingest handler tests (Sending.md §7/§8). Exercises the job's `handle`
// logic directly — NOT the live SNS HTTP path (signature/SubscribeURL fetch is
// network-dependent and out of scope here).
//
// Each case seeds a CampaignSend with a known sesMessageId, calls handle({event})
// with a realistic SES-via-SNS event body, and asserts the resulting status
// transition, EmailEvent row, Campaign counter bump, and Suppression upsert.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require.
const require = createRequire(import.meta.url);

describe("webhook-ingest handle()", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let webhookIngest: any;

  const MK = { useMasterKey: true };
  let orgId: string;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    webhookIngest = require("../../server/worker/jobs/webhookIngest");

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "webhooks@example.com",
      password: "hunter2hunter2",
      email: "webhooks@example.com",
      name: "Webhooks",
      company: "Webhook Co",
    })) as { orgId: string };
    orgId = r.orgId;
    expect(orgId).toBeTruthy();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  function orgPtr() {
    return Parse.Object.extend("Organization").createWithoutData(orgId);
  }

  // Seed a Campaign + Contact + CampaignSend; returns the saved objects.
  async function seedSend(opts: { email: string; messageId: string; softBounceCount?: number }) {
    const Campaign = Parse.Object.extend("Campaign");
    const campaign = new Campaign();
    campaign.set("organization", orgPtr());
    campaign.set("name", "Test Campaign");
    campaign.set("status", "sending");
    await campaign.save(null, MK);

    const Contact = Parse.Object.extend("Contact");
    const contact = new Contact();
    contact.set("organization", orgPtr());
    contact.set("email", opts.email);
    contact.set("status", "subscribed");
    if (opts.softBounceCount != null) contact.set("softBounceCount", opts.softBounceCount);
    await contact.save(null, MK);

    const CampaignSend = Parse.Object.extend("CampaignSend");
    const send = new CampaignSend();
    send.set("organization", orgPtr());
    send.set("campaign", campaign);
    send.set("contact", contact);
    send.set("email", opts.email);
    send.set("status", "sent");
    send.set("sesMessageId", opts.messageId);
    await send.save(null, MK);

    return { campaign, contact, send };
  }

  async function reload<T extends Parse.Object>(obj: T): Promise<T> {
    return (await new Parse.Query(obj.className).get(obj.id, MK)) as T;
  }

  async function emailEventsFor(send: Parse.Object) {
    const q = new Parse.Query("EmailEvent");
    q.equalTo("campaignSend", send);
    return q.find(MK);
  }

  async function suppressionFor(email: string) {
    const q = new Parse.Query("Suppression");
    q.equalTo("organization", orgPtr());
    q.equalTo("email", email.toLowerCase());
    return q.first(MK);
  }

  it("Delivery → status delivered, EmailEvent, deliveredCount bumped", async () => {
    const { campaign, send } = await seedSend({
      email: "delivered@example.com",
      messageId: "ses-delivery-1",
    });

    await webhookIngest.handle({
      event: {
        eventType: "Delivery",
        mail: { messageId: "ses-delivery-1", timestamp: "2026-05-29T10:00:00.000Z" },
        delivery: { timestamp: "2026-05-29T10:00:05.000Z" },
      },
    });

    const reloaded = await reload(send);
    expect(reloaded.get("status")).toBe("delivered");
    expect(reloaded.get("statusUpdatedAt")).toBeInstanceOf(Date);

    const events = await emailEventsFor(send);
    expect(events).toHaveLength(1);
    expect(events[0].get("type")).toBe("delivered");
    expect(events[0].get("timestamp")).toBeInstanceOf(Date);

    const c = await reload(campaign);
    expect(c.get("deliveredCount")).toBe(1);
  });

  it("Permanent Bounce → suppressed (hard_bounce), status bounced, bounceCount bumped", async () => {
    const { campaign, send } = await seedSend({
      email: "Hard.Bounce@Example.com",
      messageId: "ses-bounce-1",
    });

    await webhookIngest.handle({
      event: {
        eventType: "Bounce",
        mail: { messageId: "ses-bounce-1" },
        bounce: {
          bounceType: "Permanent",
          bounceSubType: "General",
          timestamp: "2026-05-29T11:00:00.000Z",
        },
      },
    });

    const reloaded = await reload(send);
    expect(reloaded.get("status")).toBe("bounced");
    expect(reloaded.get("bounceCategory")).toBe("permanent");
    expect(reloaded.get("bounceSubType")).toBe("General");

    const events = await emailEventsFor(send);
    expect(events).toHaveLength(1);
    expect(events[0].get("type")).toBe("bounce");
    expect(events[0].get("bounceCategory")).toBe("permanent");

    const c = await reload(campaign);
    expect(c.get("bounceCount")).toBe(1);

    const supp = await suppressionFor("hard.bounce@example.com");
    expect(supp).toBeDefined();
    expect(supp!.get("reason")).toBe("hard_bounce");
  });

  it("Transient Bounce → softBounceCount incremented, no suppression, status unchanged", async () => {
    const { campaign, contact, send } = await seedSend({
      email: "soft@example.com",
      messageId: "ses-bounce-soft-1",
      softBounceCount: 0,
    });

    await webhookIngest.handle({
      event: {
        eventType: "Bounce",
        mail: { messageId: "ses-bounce-soft-1" },
        bounce: { bounceType: "Transient", bounceSubType: "MailboxFull" },
      },
    });

    const c2 = await reload(contact);
    expect(c2.get("softBounceCount")).toBe(1);

    const reloaded = await reload(send);
    expect(reloaded.get("status")).toBe("sent"); // not promoted yet
    expect(reloaded.get("bounceCategory")).toBe("transient");

    const events = await emailEventsFor(send);
    expect(events).toHaveLength(1);
    expect(events[0].get("type")).toBe("bounce");

    expect(await suppressionFor("soft@example.com")).toBeUndefined();
    const c = await reload(campaign);
    expect(c.get("bounceCount") || 0).toBe(0);
  });

  it("Transient Bounce at threshold (>=5) → promoted to suppression + status bounced", async () => {
    const { campaign, send } = await seedSend({
      email: "softmax@example.com",
      messageId: "ses-bounce-soft-max",
      softBounceCount: 4, // this event makes it 5
    });

    await webhookIngest.handle({
      event: {
        eventType: "Bounce",
        mail: { messageId: "ses-bounce-soft-max" },
        bounce: { bounceType: "Transient", bounceSubType: "MailboxFull" },
      },
    });

    const reloaded = await reload(send);
    expect(reloaded.get("status")).toBe("bounced");

    const supp = await suppressionFor("softmax@example.com");
    expect(supp).toBeDefined();
    expect(supp!.get("reason")).toBe("soft_bounce_threshold");

    const c = await reload(campaign);
    expect(c.get("bounceCount")).toBe(1);
  });

  it("Complaint → suppressed (complaint), status complained, unsubscribeCount bumped", async () => {
    const { campaign, send } = await seedSend({
      email: "spamreport@example.com",
      messageId: "ses-complaint-1",
    });

    await webhookIngest.handle({
      event: {
        eventType: "Complaint",
        mail: { messageId: "ses-complaint-1" },
        complaint: { complaintFeedbackType: "abuse", timestamp: "2026-05-29T12:00:00.000Z" },
      },
    });

    const reloaded = await reload(send);
    expect(reloaded.get("status")).toBe("complained");

    const events = await emailEventsFor(send);
    expect(events).toHaveLength(1);
    expect(events[0].get("type")).toBe("complaint");

    const c = await reload(campaign);
    expect(c.get("unsubscribeCount")).toBe(1);

    const supp = await suppressionFor("spamreport@example.com");
    expect(supp).toBeDefined();
    expect(supp!.get("reason")).toBe("complaint");
  });

  it("unknown messageId → no-op (no throw, no rows)", async () => {
    await expect(
      webhookIngest.handle({
        event: { eventType: "Delivery", mail: { messageId: "does-not-exist" } },
      }),
    ).resolves.toBeUndefined();
  });
});
