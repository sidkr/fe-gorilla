// Integration tests for the Dashboard + Reports cloud functions against a real
// Parse Server + in-memory Mongo.
//
// Covers: getDashboardMetrics (zeros for a fresh org, then counts move as Lists
// + Contacts are created), org isolation, and the campaign report / link /
// recipient functions returning graceful zeros + empty arrays pre-send-pipeline.
//
// As in tenancy.test.ts, Parse.User.become() is blocked server-side, so we act
// as a user by passing { sessionToken } to every query / save / cloud-run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

interface DashboardMetrics {
  audiences: number;
  contacts: { total: number; subscribed: number };
  campaigns: { total: number; byStatus: Record<string, number> };
  totals: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    unsubscribes: number;
  };
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
}

describe("dashboard + reports cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function signUp(company: string, email: string) {
    return Parse.Cloud.run("signUpWithOrg", {
      username: email,
      password: "hunter2hunter2",
      email,
      company,
    }) as Promise<{ sessionToken: string; userId: string; orgId: string }>;
  }

  async function dashboard(sessionToken: string) {
    return Parse.Cloud.run("getDashboardMetrics", {}, { sessionToken }) as Promise<DashboardMetrics>;
  }

  it("requires authentication", async () => {
    await expect(Parse.Cloud.run("getDashboardMetrics", {})).rejects.toMatchObject({
      code: Parse.Error.INVALID_SESSION_TOKEN,
    });
  });

  it("returns all-zero metrics for a freshly-signed-up org", async () => {
    const u = await signUp("FreshCo", "fresh@example.com");
    const m = await dashboard(u.sessionToken);

    expect(m.audiences).toBe(0);
    expect(m.contacts).toEqual({ total: 0, subscribed: 0 });
    expect(m.campaigns.total).toBe(0);
    // Every known status bucket present and zero.
    for (const v of Object.values(m.campaigns.byStatus)) expect(v).toBe(0);
    expect(m.totals).toEqual({
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
      bounces: 0,
      unsubscribes: 0,
    });
    // No division-by-zero → clean zeros, not NaN.
    expect(m.rates).toEqual({ open: 0, click: 0, bounce: 0, unsubscribe: 0 });
  });

  it("counts move when a List + Contacts are created", async () => {
    const u = await signUp("GrowthCo", "growth@example.com");
    const st = u.sessionToken;

    // Create a List as the user (tenancy hook stamps org + ACL).
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "Newsletter");
    await list.save(null, { sessionToken: st });

    // Three subscribed contacts + one unsubscribed.
    const Contact = Parse.Object.extend("Contact");
    for (let i = 0; i < 3; i++) {
      const c = new Contact();
      c.set("email", `sub${i}@example.com`);
      c.set("status", "subscribed");
      c.set("lists", [list.id]);
      await c.save(null, { sessionToken: st });
    }
    const unsub = new Contact();
    unsub.set("email", "unsub@example.com");
    unsub.set("status", "unsubscribed");
    await unsub.save(null, { sessionToken: st });

    const m = await dashboard(st);
    expect(m.audiences).toBe(1);
    expect(m.contacts.total).toBe(4);
    expect(m.contacts.subscribed).toBe(3);
    // Engagement totals stay zero — no send pipeline.
    expect(m.totals.sent).toBe(0);
  });

  it("buckets campaigns by status", async () => {
    const u = await signUp("CampaignCo", "campaign@example.com");
    const st = u.sessionToken;

    const Campaign = Parse.Object.extend("Campaign");
    const statuses = ["draft", "draft", "sending", "sent"];
    for (const status of statuses) {
      const c = new Campaign();
      c.set("name", `Campaign ${status}`);
      c.set("status", status);
      await c.save(null, { sessionToken: st });
    }

    const m = await dashboard(st);
    expect(m.campaigns.total).toBe(4);
    expect(m.campaigns.byStatus.draft).toBe(2);
    expect(m.campaigns.byStatus.sending).toBe(1);
    expect(m.campaigns.byStatus.sent).toBe(1);
    expect(m.campaigns.byStatus.scheduled).toBe(0);
  });

  it("sums denormalized Campaign counters into lifetime totals + rates", async () => {
    const u = await signUp("CounterCo", "counter@example.com");
    const st = u.sessionToken;

    // Simulate a campaign the (future) send pipeline has stamped with counters.
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Sent campaign");
    c.set("status", "sent");
    c.set("sentCount", 1000);
    c.set("deliveredCount", 950);
    c.set("openCount", 380);
    c.set("clickCount", 95);
    c.set("bounceCount", 50);
    c.set("unsubscribeCount", 19);
    await c.save(null, { sessionToken: st });

    const m = await dashboard(st);
    expect(m.totals.sent).toBe(1000);
    expect(m.totals.delivered).toBe(950);
    expect(m.totals.opens).toBe(380);
    expect(m.totals.clicks).toBe(95);
    // open = 380/950 = 0.4, click = 95/950 = 0.1, bounce = 50/1000 = 0.05
    expect(m.rates.open).toBeCloseTo(0.4, 5);
    expect(m.rates.click).toBeCloseTo(0.1, 5);
    expect(m.rates.bounce).toBeCloseTo(0.05, 5);
  });

  it("isolates dashboard metrics per org", async () => {
    const a = await signUp("IsoA", "isoa@example.com");
    const b = await signUp("IsoB", "isob@example.com");

    // A creates a List; B must not see it in B's dashboard.
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "A only");
    await list.save(null, { sessionToken: a.sessionToken });

    const mA = await dashboard(a.sessionToken);
    const mB = await dashboard(b.sessionToken);
    expect(mA.audiences).toBe(1);
    expect(mB.audiences).toBe(0);
  });

  it("getCampaignReport returns zeros for a campaign with no sends", async () => {
    const u = await signUp("ReportCo", "report@example.com");
    const st = u.sessionToken;

    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Unsent draft");
    c.set("status", "draft");
    await c.save(null, { sessionToken: st });

    const report = (await Parse.Cloud.run(
      "getCampaignReport",
      { campaignId: c.id },
      { sessionToken: st },
    )) as { counts: Record<string, number>; rates: Record<string, number>; name: string };

    expect(report.name).toBe("Unsent draft");
    expect(report.counts.sent).toBe(0);
    expect(report.counts.delivered).toBe(0);
    expect(report.rates.open).toBe(0);
  });

  it("getCampaignReport uses denormalized counters when present", async () => {
    const u = await signUp("ReportCo2", "report2@example.com");
    const st = u.sessionToken;

    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "Counted");
    c.set("status", "sent");
    c.set("sentCount", 200);
    c.set("deliveredCount", 190);
    c.set("openCount", 95);
    await c.save(null, { sessionToken: st });

    const report = (await Parse.Cloud.run(
      "getCampaignReport",
      { campaignId: c.id },
      { sessionToken: st },
    )) as { counts: Record<string, number>; rates: Record<string, number> };

    expect(report.counts.sent).toBe(200);
    expect(report.counts.delivered).toBe(190);
    expect(report.rates.open).toBeCloseTo(0.5, 5); // 95/190
  });

  it("getCampaignReport rejects an unknown campaign id", async () => {
    const u = await signUp("ReportCo3", "report3@example.com");
    await expect(
      Parse.Cloud.run(
        "getCampaignReport",
        { campaignId: "doesNotExist" },
        { sessionToken: u.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  it("getCampaignLinkBreakdown returns an empty list pre-pipeline", async () => {
    const u = await signUp("LinkCo", "link@example.com");
    const st = u.sessionToken;

    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "No clicks");
    c.set("status", "sent");
    await c.save(null, { sessionToken: st });

    const res = (await Parse.Cloud.run(
      "getCampaignLinkBreakdown",
      { campaignId: c.id },
      { sessionToken: st },
    )) as { links: unknown[]; delivered: number };
    expect(res.links).toEqual([]);
    expect(res.delivered).toBe(0);
  });

  it("getCampaignRecipients returns an empty page pre-pipeline", async () => {
    const u = await signUp("RecipCo", "recip@example.com");
    const st = u.sessionToken;

    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("name", "No recipients");
    c.set("status", "sent");
    await c.save(null, { sessionToken: st });

    const res = (await Parse.Cloud.run(
      "getCampaignRecipients",
      { campaignId: c.id, page: 1, perPage: 50 },
      { sessionToken: st },
    )) as { rows: unknown[]; total: number; page: number; totalPages: number };
    expect(res.rows).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.page).toBe(1);
    expect(res.totalPages).toBe(1);
  });
});
