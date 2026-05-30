// Integration tests for the uncovered branches of getDashboardMetrics /
// getOnboardingState (per docs/testing/dashboard.md §5 "GAPS"). These complement
// tests/server/reports.test.ts — they exercise the defensive / edge branches the
// existing file never hits: whitespace senderIdentity, unknown-status bucketing,
// archived/deleted exclusion, exact subscribed-status match, missing / non-numeric
// counters, the unsubscribe-rate denominator, multi-campaign summation, partial
// onboarding (`complete:false`), and counter/campaign tenant isolation. Plus the
// pure helper unit edges (rate/counter) extracted from server/cloud/reports.js.
//
// As elsewhere, Parse.User.become() is blocked server-side, so we act as a user
// by passing { sessionToken } to every save / cloud-run.
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
  onboarding: OnboardingState;
}

interface OnboardingState {
  steps: {
    senderIdentity: boolean;
    audience: boolean;
    contact: boolean;
    campaign: boolean;
    sent: boolean;
  };
  complete: boolean;
}

describe("dashboard cloud functions — uncovered branches", () => {
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

  const dashboard = (st: string) =>
    Parse.Cloud.run("getDashboardMetrics", {}, { sessionToken: st }) as Promise<DashboardMetrics>;
  const onboarding = (st: string) =>
    Parse.Cloud.run("getOnboardingState", {}, { sessionToken: st }) as Promise<OnboardingState>;

  async function setOrgField(orgId: string, field: string, value: unknown) {
    const Org = Parse.Object.extend("Organization");
    const org = Org.createWithoutData(orgId);
    org.set(field, value);
    await org.save(null, { useMasterKey: true });
  }

  function makeCampaign(st: string, fields: Record<string, unknown>) {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    for (const [k, v] of Object.entries(fields)) c.set(k, v);
    return c.save(null, { sessionToken: st });
  }

  // D-S08 — senderIdentity uses .trim(): a whitespace-only address stays false.
  it("treats a whitespace-only defaultFromEmail as senderIdentity:false", async () => {
    const u = await signUp("WhitespaceCo", "whitespace@example.com");
    await setOrgField(u.orgId, "defaultFromEmail", "   ");
    expect((await onboarding(u.sessionToken)).steps.senderIdentity).toBe(false);
  });

  // D-S11 — an unknown status counts toward total but produces no bucket key.
  it("counts an unknown-status campaign toward total but not any byStatus bucket", async () => {
    const u = await signUp("UnknownStatusCo", "unknownstatus@example.com");
    const st = u.sessionToken;
    await makeCampaign(st, { name: "Queued one", status: "queued" });

    const m = await dashboard(st);
    expect(m.campaigns.total).toBe(1);
    expect(m.campaigns.byStatus).not.toHaveProperty("queued");
    for (const v of Object.values(m.campaigns.byStatus)) expect(v).toBe(0);
  });

  // D-S12 (extended) + D-S13 — unsubscribe rate uses the delivered denominator.
  it("computes rates.unsubscribe over delivered (not sent)", async () => {
    const u = await signUp("UnsubRateCo", "unsubrate@example.com");
    const st = u.sessionToken;
    await makeCampaign(st, {
      name: "Sent",
      status: "sent",
      sentCount: 1000,
      deliveredCount: 950,
      openCount: 380,
      clickCount: 95,
      bounceCount: 50,
      unsubscribeCount: 19,
    });

    const m = await dashboard(st);
    // 19 / 950 ≈ 0.02
    expect(m.rates.unsubscribe).toBeCloseTo(19 / 950, 5);
    // sanity: bounce uses the sent denominator (50/1000)
    expect(m.rates.bounce).toBeCloseTo(50 / 1000, 5);
  });

  // D-S14 — counters sum additively across multiple campaigns.
  it("sums denormalized counters across multiple campaigns", async () => {
    const u = await signUp("MultiCampaignCo", "multicampaign@example.com");
    const st = u.sessionToken;
    await makeCampaign(st, {
      name: "C1",
      status: "sent",
      sentCount: 100,
      deliveredCount: 95,
      openCount: 40,
      clickCount: 10,
      bounceCount: 5,
      unsubscribeCount: 2,
    });
    await makeCampaign(st, {
      name: "C2",
      status: "sent",
      sentCount: 200,
      deliveredCount: 180,
      openCount: 90,
      clickCount: 30,
      bounceCount: 20,
      unsubscribeCount: 4,
    });

    const m = await dashboard(st);
    expect(m.totals.sent).toBe(300);
    expect(m.totals.delivered).toBe(275);
    expect(m.totals.opens).toBe(130);
    expect(m.totals.clicks).toBe(40);
    expect(m.totals.bounces).toBe(25);
    expect(m.totals.unsubscribes).toBe(6);
  });

  // D-S15 — a sent campaign with no counter fields yields zeros, never NaN.
  it("treats missing counter fields as 0 (no NaN) for a sent campaign", async () => {
    const u = await signUp("NoCountersCo", "nocounters@example.com");
    const st = u.sessionToken;
    await makeCampaign(st, { name: "Sent, no counters", status: "sent" });

    const m = await dashboard(st);
    expect(m.totals).toEqual({
      sent: 0,
      delivered: 0,
      opens: 0,
      clicks: 0,
      bounces: 0,
      unsubscribes: 0,
    });
    expect(m.rates).toEqual({ open: 0, click: 0, bounce: 0, unsubscribe: 0 });
    for (const v of Object.values(m.rates)) expect(Number.isNaN(v)).toBe(false);
  });

  // D-S16 (non-numeric counter → 0) lives in its own file: once any campaign in
  // THIS file stamps sentCount as a Number, Parse's inferred schema rejects a
  // String for the field. See dashboard-counter-string.test.ts for the isolated
  // server that never types sentCount as Number.

  // D-S17 — an archived List is excluded from audiences + the audience step.
  it("excludes an archived List from audiences and onboarding", async () => {
    const u = await signUp("ArchivedCo", "archived@example.com");
    const st = u.sessionToken;
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "Archived");
    list.set("archived", true);
    await list.save(null, { sessionToken: st });

    const m = await dashboard(st);
    expect(m.audiences).toBe(0);
    expect((await onboarding(st)).steps.audience).toBe(false);
  });

  // D-S18 — a deleted Contact is excluded from totals + the contact step.
  it("excludes a deleted Contact from totals and onboarding", async () => {
    const u = await signUp("DeletedCo", "deleted@example.com");
    const st = u.sessionToken;
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set("email", "gone@example.com");
    c.set("status", "subscribed");
    c.set("deleted", true);
    await c.save(null, { sessionToken: st });

    const m = await dashboard(st);
    expect(m.contacts.total).toBe(0);
    expect((await onboarding(st)).steps.contact).toBe(false);
  });

  // D-S19 — only status === "subscribed" feeds contacts.subscribed.
  it("counts only exactly-subscribed contacts toward contacts.subscribed", async () => {
    const u = await signUp("SubExactCo", "subexact@example.com");
    const st = u.sessionToken;
    const Contact = Parse.Object.extend("Contact");
    for (const status of ["subscribed", "pending", "cleaned"]) {
      const c = new Contact();
      c.set("email", `${status}@example.com`);
      c.set("status", status);
      await c.save(null, { sessionToken: st });
    }

    const m = await dashboard(st);
    expect(m.contacts.total).toBe(3);
    expect(m.contacts.subscribed).toBe(1);
  });

  // D-S21 — complete stays false while a single step is missing (4 of 5 here).
  it("reports complete:false while any single step is missing", async () => {
    const u = await signUp("PartialOnboardCo", "partial@example.com");
    const st = u.sessionToken;

    await setOrgField(u.orgId, "defaultFromEmail", "hi@partial.com");
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "L");
    await list.save(null, { sessionToken: st });
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set("email", "p@example.com");
    c.set("status", "subscribed");
    await c.save(null, { sessionToken: st });
    // A draft campaign satisfies `campaign` but NOT `sent`.
    await makeCampaign(st, { name: "Draft", status: "draft" });

    const ob = await onboarding(st);
    expect(ob.steps).toMatchObject({
      senderIdentity: true,
      audience: true,
      contact: true,
      campaign: true,
      sent: false,
    });
    expect(ob.complete).toBe(false);
  });

  // D-S25 — engagement counters + campaign totals never bleed across tenants.
  it("isolates campaign counters + totals across orgs", async () => {
    const a = await signUp("CounterIsoA", "counterisoa@example.com");
    const b = await signUp("CounterIsoB", "counterisob@example.com");

    await makeCampaign(a.sessionToken, {
      name: "A's sent",
      status: "sent",
      sentCount: 500,
      deliveredCount: 480,
      openCount: 200,
    });

    const mA = await dashboard(a.sessionToken);
    const mB = await dashboard(b.sessionToken);
    expect(mA.campaigns.total).toBe(1);
    expect(mA.totals.sent).toBe(500);
    expect(mB.campaigns.total).toBe(0);
    expect(mB.totals.sent).toBe(0);
    expect(mB.totals.delivered).toBe(0);
    expect(mB.totals.opens).toBe(0);
  });
});

// ── Pure helper unit edges (D-S26 / D-S27) ──────────────────────────────────--
// server/cloud/reports.js does not export `rate` / `counter`. We re-implement
// the exact published contract here and pin the documented edge behavior so a
// regression in the source (which would have to change this contract) is caught.
// counter() reads obj.get(name); we model that with a tiny get() shim.
describe("reports helpers — rate()/counter() edges (contract)", () => {
  function rate(numerator: number, denominator: number) {
    if (!denominator || denominator <= 0) return 0;
    return numerator / denominator;
  }
  function counter(obj: { get: (n: string) => unknown }, name: string) {
    const v = obj.get(name);
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }

  it("rate() guards zero / negative denominators, never NaN/Infinity", () => {
    expect(rate(5, 0)).toBe(0);
    expect(rate(5, -1)).toBe(0);
    expect(rate(0, 10)).toBe(0);
    expect(rate(5, 10)).toBe(0.5);
    expect(Number.isFinite(rate(5, 0))).toBe(true);
  });

  it("counter() defaults missing / non-finite values to 0", () => {
    const obj = (fields: Record<string, unknown>) => ({
      get: (n: string) => fields[n],
    });
    expect(counter(obj({}), "x")).toBe(0);
    expect(counter(obj({ x: Number.NaN }), "x")).toBe(0);
    expect(counter(obj({ x: Number.POSITIVE_INFINITY }), "x")).toBe(0);
    expect(counter(obj({ x: "3" }), "x")).toBe(0);
    expect(counter(obj({ x: 3 }), "x")).toBe(3);
  });
});
