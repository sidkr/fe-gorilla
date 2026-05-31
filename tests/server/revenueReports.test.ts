// Revenue REPORTING tests (RevenueAttribution §5, R2 reporting half).
//
// Covers the reporting layer on top of the R1 Conversion spine:
//   - getCampaignReport now carries a revenue block
//     (revenue, orders, aov, conversionRate, revenuePerRecipient, currency)
//   - getRevenueOverview org rollup (totals, AOV, trend, top campaigns,
//     attribution-model breakdown, attributed-vs-unattributed split)
//   - getDashboardMetrics carries revenueTotal / orderCount / aov from the
//     denormalized Campaign counters.
//
// Money is INTEGER MINOR UNITS throughout. We seed Conversion rows + Campaign
// counters directly with the master key (per the task brief) so the reporting
// assertions are independent of R1's matcher/ingest wiring. As elsewhere,
// Parse.User.become() is blocked server-side, so we act as a user via
// { sessionToken } on every cloud-run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const MK = { useMasterKey: true } as const;

describe("revenue reporting cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  }, 60000);

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

  function orgPointer(orgId: string) {
    const Org = Parse.Object.extend("Organization");
    return Org.createWithoutData(orgId);
  }

  // Create a sent Campaign (master key) with optional denormalized counters.
  async function makeCampaign(
    orgId: string,
    name: string,
    counters: { revenueTotal?: number; conversionCount?: number; orderCount?: number; deliveredCount?: number } = {},
  ) {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("organization", orgPointer(orgId));
    c.set("name", name);
    c.set("status", "sent");
    for (const [k, v] of Object.entries(counters)) c.set(k, v);
    await c.save(null, MK);
    return c;
  }

  // Seed a Conversion row directly (the task explicitly allows this). revenue is
  // integer MINOR UNITS. campaign is optional → unattributed when omitted.
  async function makeConversion(
    orgId: string,
    opts: {
      orderId: string;
      revenue: number;
      campaign?: any;
      attributionModel?: string;
      occurredAt?: Date;
      currency?: string;
    },
  ) {
    const Conversion = Parse.Object.extend("Conversion");
    const conv = new Conversion();
    conv.set("organization", orgPointer(orgId));
    conv.set("orderId", opts.orderId);
    conv.set("sourceType", "manual");
    conv.set("revenue", opts.revenue);
    conv.set("currency", opts.currency || "USD");
    conv.set("itemCount", 1);
    conv.set("occurredAt", opts.occurredAt || new Date());
    conv.set("attributionModel", opts.attributionModel || (opts.campaign ? "last_click" : "unattributed"));
    conv.set("attributionWindowDays", 7);
    if (opts.campaign) conv.set("campaign", opts.campaign);
    await conv.save(null, MK);
    return conv;
  }

  // ── getCampaignReport revenue block ──────────────────────────────────────────
  it("getCampaignReport includes revenue, orders, aov, conversionRate, revenuePerRecipient", async () => {
    const u = await signUp("CampRevCo", "camprev@example.com");
    // deliveredCount = 10 so the conversion-rate / per-recipient denominators are real.
    const campaign = await makeCampaign(u.orgId, "Revenue Report Campaign", { deliveredCount: 10 });

    await makeConversion(u.orgId, { orderId: "RR-1", revenue: 3000, campaign });
    await makeConversion(u.orgId, { orderId: "RR-2", revenue: 5000, campaign });

    const res = (await Parse.Cloud.run(
      "getCampaignReport",
      { campaignId: campaign.id },
      { sessionToken: u.sessionToken },
    )) as any;

    // Engagement block still present.
    expect(res.counts.delivered).toBe(10);

    // Revenue block (minor units).
    expect(res.revenue).toBe(8000);
    expect(res.orders).toBe(2);
    expect(res.aov).toBe(4000); // 8000 / 2
    expect(res.conversionRate).toBeCloseTo(2 / 10, 6); // orders / delivered
    expect(res.revenuePerRecipient).toBe(800); // 8000 / 10
    expect(res.currency).toBe("USD");
  });

  it("getCampaignReport returns honest revenue zeros for a campaign with no conversions", async () => {
    const u = await signUp("NoRevCo", "norev@example.com");
    const campaign = await makeCampaign(u.orgId, "No Revenue", { deliveredCount: 5 });

    const res = (await Parse.Cloud.run(
      "getCampaignReport",
      { campaignId: campaign.id },
      { sessionToken: u.sessionToken },
    )) as any;

    expect(res.revenue).toBe(0);
    expect(res.orders).toBe(0);
    expect(res.aov).toBe(0);
    expect(res.conversionRate).toBe(0);
    expect(res.revenuePerRecipient).toBe(0);
  });

  // ── getRevenueOverview org rollup ────────────────────────────────────────────
  it("getRevenueOverview totals, AOV, top campaigns, and attributed/unattributed split", async () => {
    const u = await signUp("OverviewCo", "overview@example.com");
    const big = await makeCampaign(u.orgId, "Big Earner");
    const small = await makeCampaign(u.orgId, "Small Earner");

    // big: 9000 (2 orders), small: 1000 (1 order), unattributed: 2000 (1 order).
    await makeConversion(u.orgId, { orderId: "OV-1", revenue: 4000, campaign: big });
    await makeConversion(u.orgId, { orderId: "OV-2", revenue: 5000, campaign: big });
    await makeConversion(u.orgId, { orderId: "OV-3", revenue: 1000, campaign: small });
    await makeConversion(u.orgId, { orderId: "OV-4", revenue: 2000 }); // unattributed

    const res = (await Parse.Cloud.run(
      "getRevenueOverview",
      {},
      { sessionToken: u.sessionToken },
    )) as any;

    expect(res.totalRevenue).toBe(12000);
    expect(res.orderCount).toBe(4);
    expect(res.aov).toBe(3000); // 12000 / 4
    expect(res.currency).toBe("USD");

    // attributed = campaign-linked (10000 / 3 orders); unattributed = 2000 / 1.
    expect(res.attributed.revenue).toBe(10000);
    expect(res.attributed.orders).toBe(3);
    expect(res.unattributed.revenue).toBe(2000);
    expect(res.unattributed.orders).toBe(1);

    // top campaigns sorted by revenue desc, with resolved names + AOV.
    expect(res.topCampaigns.length).toBe(2);
    expect(res.topCampaigns[0].campaignId).toBe(big.id);
    expect(res.topCampaigns[0].revenue).toBe(9000);
    expect(res.topCampaigns[0].name).toBe("Big Earner");
    expect(res.topCampaigns[0].aov).toBe(4500); // 9000 / 2
    expect(res.topCampaigns[1].campaignId).toBe(small.id);

    // model breakdown (default last_click for attributed, unattributed bucket).
    const lc = res.byModel.find((m: any) => m.model === "last_click");
    expect(lc).toBeTruthy();
    expect(lc.revenue).toBe(10000);
    const un = res.byModel.find((m: any) => m.model === "unattributed");
    expect(un.revenue).toBe(2000);

    // trend buckets present and summing to the total.
    const trendRevenue = res.trend.reduce((a: number, d: any) => a + d.revenue, 0);
    expect(trendRevenue).toBe(12000);
    const trendOrders = res.trend.reduce((a: number, d: any) => a + d.orders, 0);
    expect(trendOrders).toBe(4);
  });

  it("getRevenueOverview returns clean zeros for a fresh org", async () => {
    const u = await signUp("FreshRevCo", "freshrev@example.com");
    const res = (await Parse.Cloud.run(
      "getRevenueOverview",
      {},
      { sessionToken: u.sessionToken },
    )) as any;

    expect(res.totalRevenue).toBe(0);
    expect(res.orderCount).toBe(0);
    expect(res.aov).toBe(0);
    expect(res.topCampaigns).toEqual([]);
    expect(res.attributed).toEqual({ revenue: 0, orders: 0 });
    expect(res.unattributed).toEqual({ revenue: 0, orders: 0 });
  });

  it("getRevenueOverview isolates revenue per org", async () => {
    const a = await signUp("RevIsoA", "reviso-a@example.com");
    const b = await signUp("RevIsoB", "reviso-b@example.com");

    const campA = await makeCampaign(a.orgId, "A campaign");
    await makeConversion(a.orgId, { orderId: "ISO-1", revenue: 5000, campaign: campA });

    const resA = (await Parse.Cloud.run("getRevenueOverview", {}, { sessionToken: a.sessionToken })) as any;
    const resB = (await Parse.Cloud.run("getRevenueOverview", {}, { sessionToken: b.sessionToken })) as any;

    expect(resA.totalRevenue).toBe(5000);
    expect(resB.totalRevenue).toBe(0);
  });

  // ── getDashboardMetrics revenue rollup ───────────────────────────────────────
  it("getDashboardMetrics includes revenueTotal, orderCount, and AOV from Campaign counters", async () => {
    const u = await signUp("DashRevCo", "dashrev@example.com");
    // Seed the denormalized Campaign counters (maintained by R1's ingest path).
    await makeCampaign(u.orgId, "Dash C1", { revenueTotal: 6000, orderCount: 1, conversionCount: 1 });
    await makeCampaign(u.orgId, "Dash C2", { revenueTotal: 6000, orderCount: 2, conversionCount: 2 });

    const res = (await Parse.Cloud.run(
      "getDashboardMetrics",
      {},
      { sessionToken: u.sessionToken },
    )) as any;

    expect(res).toHaveProperty("revenue");
    expect(res.revenue.total).toBe(12000);
    expect(res.revenue.orders).toBe(3);
    expect(res.revenue.aov).toBe(4000); // 12000 / 3
  });

  it("getDashboardMetrics revenue is all-zero for a fresh org", async () => {
    const u = await signUp("DashFreshCo", "dashfresh@example.com");
    const res = (await Parse.Cloud.run(
      "getDashboardMetrics",
      {},
      { sessionToken: u.sessionToken },
    )) as any;
    expect(res.revenue).toEqual({ total: 0, orders: 0, aov: 0, currency: "USD" });
  });
});
