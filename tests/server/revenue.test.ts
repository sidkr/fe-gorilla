// Revenue attribution spine tests (RevenueAttribution R1): matcher + ingest job
// + Conversion idempotency + Campaign counter accuracy + Contact LTV rollup.
//
// Drives the pure handlers directly against the in-memory Parse Server. Signals
// (open/click) are written as EmailEvent rows ({ type, timestamp, pointers }) —
// the same shape the send + tracking pipeline produces.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require AFTER the harness
// initializes the Parse SDK so their require("parse/node") resolves to the
// configured singleton.
const require = createRequire(import.meta.url);

const MK = { useMasterKey: true } as const;
const DAY = 24 * 60 * 60 * 1000;

describe("revenue attribution spine", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let attributeOrder: any;
  let ingestConversion: any;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    attributeOrder = require("../../server/lib/attribution").attributeOrder;
    ingestConversion = require("../../server/worker/jobs/ingestConversion").handle;
  }, 60000);

  afterAll(async () => {
    await ctx.stop();
  });

  // ── fixtures (master key; no per-tenant beforeSave needed for these) ──────────
  async function makeOrg() {
    const org = new (Parse.Object.extend("Organization"))();
    await org.save(null, MK);
    return org;
  }
  async function makeContact(org: any, email: string) {
    const c = new (Parse.Object.extend("Contact"))();
    c.set("organization", org);
    c.set("email", email.toLowerCase());
    await c.save(null, MK);
    return c;
  }
  async function makeCampaign(org: any) {
    const c = new (Parse.Object.extend("Campaign"))();
    c.set("organization", org);
    await c.save(null, MK);
    return c;
  }
  async function makeSend(org: any, campaign: any, contact: any) {
    const s = new (Parse.Object.extend("CampaignSend"))();
    s.set("organization", org);
    s.set("campaign", campaign);
    s.set("contact", contact);
    await s.save(null, MK);
    return s;
  }
  async function makeEvent(
    org: any, campaign: any, send: any, contact: any, type: string, timestamp: Date,
  ) {
    const e = new (Parse.Object.extend("EmailEvent"))();
    e.set("organization", org);
    e.set("campaign", campaign);
    e.set("campaignSend", send);
    e.set("contact", contact);
    e.set("type", type);
    e.set("timestamp", timestamp);
    await e.save(null, MK);
    return e;
  }
  async function getCampaign(id: string) {
    return new Parse.Query(Parse.Object.extend("Campaign")).get(id, MK);
  }
  async function getContact(id: string) {
    return new Parse.Query(Parse.Object.extend("Contact")).get(id, MK);
  }

  // ── attribution matcher ─────────────────────────────────────────────────────
  it("credits the most-recent click within the 7-day window (last_click)", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "Buyer@Example.com");
    const campA = await makeCampaign(org);
    const campB = await makeCampaign(org);
    const sendA = await makeSend(org, campA, contact);
    const sendB = await makeSend(org, campB, contact);

    const now = new Date();
    await makeEvent(org, campA, sendA, contact, "click", new Date(now.getTime() - 5 * DAY));
    await makeEvent(org, campB, sendB, contact, "click", new Date(now.getTime() - 2 * DAY));

    const res = await attributeOrder({
      Parse, org, email: "buyer@example.com", occurredAt: now, windowDays: 7,
    });

    expect(res.attributionModel).toBe("last_click");
    expect(res.campaignSend.id).toBe(sendB.id); // most-recent click wins
    expect(res.campaign.id).toBe(campB.id);
    expect(res.contact.id).toBe(contact.id);
  });

  it("returns unattributed when the only click is outside the window", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "stale@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "click", new Date(now.getTime() - 10 * DAY));

    const res = await attributeOrder({
      Parse, org, email: "stale@example.com", occurredAt: now, windowDays: 7,
    });

    expect(res.attributionModel).toBe("unattributed");
    expect(res.campaignSend).toBeNull();
    expect(res.campaign).toBeNull();
  });

  it("falls back to last_open within 1 day when there is no click", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "opener@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "open", new Date(now.getTime() - 12 * 60 * 60 * 1000));

    const res = await attributeOrder({
      Parse, org, email: "opener@example.com", occurredAt: now, windowDays: 7,
    });

    expect(res.attributionModel).toBe("last_open");
    expect(res.campaignSend.id).toBe(send.id);
    expect(res.attributionWindowDays).toBe(1);
  });

  it("does not fall back to an open older than 1 day", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "oldopen@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "open", new Date(now.getTime() - 2 * DAY));

    const res = await attributeOrder({
      Parse, org, email: "oldopen@example.com", occurredAt: now, windowDays: 7,
    });
    expect(res.attributionModel).toBe("unattributed");
  });

  it("prefers a click over an in-window open (last-touch precedence)", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "both@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    // Open is more recent, but a click anywhere in the window outranks an open.
    await makeEvent(org, camp, send, contact, "click", new Date(now.getTime() - 3 * DAY));
    await makeEvent(org, camp, send, contact, "open", new Date(now.getTime() - 1 * 60 * 60 * 1000));

    const res = await attributeOrder({
      Parse, org, email: "both@example.com", occurredAt: now, windowDays: 7,
    });
    expect(res.attributionModel).toBe("last_click");
  });

  it("returns unattributed for an unknown email", async () => {
    const org = await makeOrg();
    const res = await attributeOrder({
      Parse, org, email: "nobody@example.com", occurredAt: new Date(), windowDays: 7,
    });
    expect(res.attributionModel).toBe("unattributed");
    expect(res.contact).toBeNull();
  });

  // ── ingest job ──────────────────────────────────────────────────────────────
  it("writes a Conversion, bumps campaign counters + contact LTV (last_click)", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "ltv@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "click", new Date(now.getTime() - 1 * DAY));

    const res = await ingestConversion({
      Parse, org, email: "ltv@example.com", orderId: "order-1",
      sourceType: "manual", revenue: 4999, currency: "USD", itemCount: 2, occurredAt: now,
    });

    expect(res.ok).toBe(true);
    expect(res.duplicate).toBeUndefined();
    expect(res.attributionModel).toBe("last_click");
    expect(res.attributed).toBe(true);

    const freshCamp = await getCampaign(camp.id);
    expect(freshCamp.get("revenueTotal")).toBe(4999);
    expect(freshCamp.get("conversionCount")).toBe(1);
    expect(freshCamp.get("orderCount")).toBe(1);

    const freshContact = await getContact(contact.id);
    expect(freshContact.get("totalRevenue")).toBe(4999);
    expect(freshContact.get("orderCount")).toBe(1);
    expect(freshContact.get("lastOrderAt")).toBeInstanceOf(Date);

    // Conversion row persisted with the frozen-contract fields.
    const conv = await new Parse.Query("Conversion").get(res.conversionId, MK);
    expect(conv.get("revenue")).toBe(4999);
    expect(conv.get("currency")).toBe("USD");
    expect(conv.get("orderId")).toBe("order-1");
    expect(conv.get("sourceType")).toBe("manual");
    expect(conv.get("attributionModel")).toBe("last_click");
    expect(conv.get("campaign").id).toBe(camp.id);
  });

  it("is idempotent on (org, orderId, sourceType) — double ingest does not double count", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "dupe@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "click", new Date(now.getTime() - 1 * DAY));

    const args = {
      Parse, org, email: "dupe@example.com", orderId: "order-dupe",
      sourceType: "shopify", revenue: 1000, currency: "USD", itemCount: 1, occurredAt: now,
    };

    const first = await ingestConversion(args);
    const second = await ingestConversion(args);

    expect(first.duplicate).toBeUndefined();
    expect(second.duplicate).toBe(true);
    expect(second.conversionId).toBe(first.conversionId);

    const freshCamp = await getCampaign(camp.id);
    expect(freshCamp.get("revenueTotal")).toBe(1000); // not 2000
    expect(freshCamp.get("orderCount")).toBe(1);

    const freshContact = await getContact(contact.id);
    expect(freshContact.get("totalRevenue")).toBe(1000);
    expect(freshContact.get("orderCount")).toBe(1);

    // A different sourceType for the same orderId is a DISTINCT key → not a dup.
    const other = await ingestConversion({ ...args, sourceType: "manual" });
    expect(other.duplicate).toBeUndefined();
  });

  it("accumulates campaign counters across multiple distinct orders", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "multi@example.com");
    const camp = await makeCampaign(org);
    const send = await makeSend(org, camp, contact);

    const now = new Date();
    await makeEvent(org, camp, send, contact, "click", new Date(now.getTime() - 1 * DAY));

    await ingestConversion({
      Parse, org, email: "multi@example.com", orderId: "m-1",
      sourceType: "manual", revenue: 500, currency: "USD", itemCount: 1, occurredAt: now,
    });
    await ingestConversion({
      Parse, org, email: "multi@example.com", orderId: "m-2",
      sourceType: "manual", revenue: 1500, currency: "USD", itemCount: 3, occurredAt: now,
    });

    const freshCamp = await getCampaign(camp.id);
    expect(freshCamp.get("revenueTotal")).toBe(2000);
    expect(freshCamp.get("conversionCount")).toBe(2);
    expect(freshCamp.get("orderCount")).toBe(2);

    const freshContact = await getContact(contact.id);
    expect(freshContact.get("totalRevenue")).toBe(2000);
    expect(freshContact.get("orderCount")).toBe(2);
  });

  it("unattributed order with a known contact: no campaign credit, LTV still rolls up", async () => {
    const org = await makeOrg();
    const contact = await makeContact(org, "noattr@example.com"); // no events → unattributed

    const res = await ingestConversion({
      Parse, org, email: "noattr@example.com", orderId: "u-1",
      sourceType: "manual", revenue: 2500, currency: "USD", itemCount: 1, occurredAt: new Date(),
    });

    expect(res.attributionModel).toBe("unattributed");
    expect(res.attributed).toBe(false);
    expect(res.campaignId).toBeNull();

    const freshContact = await getContact(contact.id);
    expect(freshContact.get("totalRevenue")).toBe(2500);
    expect(freshContact.get("orderCount")).toBe(1);
  });

  it("unattributed order with an unknown contact: writes Conversion only, no rollups", async () => {
    const org = await makeOrg();
    const res = await ingestConversion({
      Parse, org, email: "ghost@example.com", orderId: "g-1",
      sourceType: "manual", revenue: 700, currency: "USD", itemCount: 1, occurredAt: new Date(),
    });

    expect(res.attributionModel).toBe("unattributed");
    expect(res.contactId).toBeNull();
    expect(res.conversionId).toBeTruthy();
  });
});
