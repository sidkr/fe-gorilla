// Integration tests for the three campaign-report cloud functions against a real
// Parse Server + in-memory Mongo, exercising the POPULATED-DATA paths that the
// existing `reports.test.ts` does not: rate math, link-breakdown unique-clicker
// dedup, recipient pagination + filters, and report-specific tenant isolation.
//
// The big gap this closes: nothing in the existing suite seeds CampaignSend or
// EmailEvent rows. We seed them here directly via Parse, saving as the signed-in
// user so the tenancy beforeSave hook stamps `organization` + the role ACL
// automatically (see server/cloud/lib/tenancy.js + tenantHooks.js) — exactly how
// the real send pipeline will create them.
//
// As in tenancy.test.ts / reports.test.ts, Parse.User.become() is blocked
// server-side, so we act as a user by passing { sessionToken } to every
// save / query / cloud-run.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

interface CampaignReport {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  counts: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    unsubscribes: number;
  };
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
}

interface LinkBreakdown {
  campaignId: string;
  delivered: number;
  links: { url: string; uniqueClicks: number; clickRate: number }[];
}

interface RecipientsPage {
  campaignId: string;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  rows: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    opened: boolean;
    clicked: boolean;
    openedAt: string | null;
    lastClickedAt: string | null;
    bounceReason: string | null;
  }[];
}

describe("campaign report cloud functions (populated data)", () => {
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

  // Create a campaign as the user; the tenancy hook stamps org + ACL.
  async function makeCampaign(st: string, fields: Record<string, unknown> = {}) {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set({ name: "Campaign", status: "sent", ...fields });
    await c.save(null, { sessionToken: st });
    return c;
  }

  async function makeContact(st: string, fields: Record<string, unknown> = {}) {
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set({ email: "c@example.com", status: "subscribed", ...fields });
    await c.save(null, { sessionToken: st });
    return c;
  }

  // Seed a CampaignSend row as the user (hook stamps org + ACL). Returns it.
  async function makeSend(
    st: string,
    campaign: any,
    fields: Record<string, unknown> = {},
  ) {
    const CampaignSend = Parse.Object.extend("CampaignSend");
    const s = new CampaignSend();
    s.set({ campaign, ...fields });
    await s.save(null, { sessionToken: st });
    return s;
  }

  // Seed an EmailEvent row as the user (hook stamps org + ACL). Returns it.
  async function makeEvent(
    st: string,
    campaign: any,
    fields: Record<string, unknown> = {},
  ) {
    const EmailEvent = Parse.Object.extend("EmailEvent");
    const e = new EmailEvent();
    e.set({ campaign, type: "click", ...fields });
    await e.save(null, { sessionToken: st });
    return e;
  }

  const report = (st: string, campaignId: string) =>
    Parse.Cloud.run("getCampaignReport", { campaignId }, { sessionToken: st }) as Promise<CampaignReport>;
  const linkBreakdown = (st: string, campaignId: string) =>
    Parse.Cloud.run("getCampaignLinkBreakdown", { campaignId }, { sessionToken: st }) as Promise<LinkBreakdown>;
  const recipients = (st: string, params: Record<string, unknown>) =>
    Parse.Cloud.run("getCampaignRecipients", params, { sessionToken: st }) as Promise<RecipientsPage>;

  // ── getCampaignReport rate math ────────────────────────────────────────────
  describe("getCampaignReport rate math", () => {
    it("RPT-R01: zeros (not NaN) for an unsent draft", async () => {
      const u = await signUp("R01Co", "r01@example.com");
      const c = await makeCampaign(u.sessionToken, { name: "Unsent", status: "draft" });
      const r = await report(u.sessionToken, c.id);

      expect(r.name).toBe("Unsent");
      expect(r.status).toBe("draft");
      expect(r.counts.sent).toBe(0);
      expect(r.counts.delivered).toBe(0);
      expect(r.rates).toEqual({ open: 0, click: 0, bounce: 0, unsubscribe: 0 });
      for (const v of Object.values(r.rates)) expect(Number.isNaN(v)).toBe(false);
    });

    it("RPT-R02: denormalized counters drive all six counts + rates", async () => {
      const u = await signUp("R02Co", "r02@example.com");
      const c = await makeCampaign(u.sessionToken, {
        sentCount: 1000,
        deliveredCount: 950,
        openCount: 380,
        clickCount: 95,
        bounceCount: 50,
        unsubscribeCount: 19,
      });
      const r = await report(u.sessionToken, c.id);

      expect(r.counts).toEqual({
        sent: 1000,
        delivered: 950,
        opens: 380,
        clicks: 95,
        bounces: 50,
        unsubscribes: 19,
      });
      expect(r.rates.open).toBeCloseTo(380 / 950, 5); // 0.4
      expect(r.rates.click).toBeCloseTo(95 / 950, 5); // 0.1
      expect(r.rates.bounce).toBeCloseTo(50 / 1000, 5); // 0.05 — over sent
      expect(r.rates.unsubscribe).toBeCloseTo(19 / 950, 5); // over delivered
    });

    it("RPT-R03: open/click weighted by DELIVERED not sent", async () => {
      const u = await signUp("R03Co", "r03@example.com");
      const c = await makeCampaign(u.sessionToken, {
        sentCount: 1000,
        deliveredCount: 190,
        openCount: 95,
        clickCount: 95,
      });
      const r = await report(u.sessionToken, c.id);
      // 95/190 = 0.5; if it used sent (1000) it would be 0.095.
      expect(r.rates.open).toBeCloseTo(0.5, 5);
      expect(r.rates.click).toBeCloseTo(0.5, 5);
    });

    it("RPT-R04: bounce weighted by SENT not delivered", async () => {
      const u = await signUp("R04Co", "r04@example.com");
      const c = await makeCampaign(u.sessionToken, {
        sentCount: 1000,
        deliveredCount: 950,
        bounceCount: 50,
      });
      const r = await report(u.sessionToken, c.id);
      expect(r.rates.bounce).toBeCloseTo(50 / 1000, 5);
    });

    it("RPT-R05: delivered falls back to max(sent - bounces, 0) with no sends", async () => {
      const u = await signUp("R05Co", "r05@example.com");
      // No deliveredCount, no sentCount → sent falls back to CampaignSend count
      // (0 pre-pipeline), bounceCount 0 → delivered = max(0 - 0, 0) = 0.
      const c = await makeCampaign(u.sessionToken, { bounceCount: 0 });
      const r = await report(u.sessionToken, c.id);
      expect(r.counts.sent).toBe(0);
      expect(r.counts.delivered).toBe(0);
    });

    it("RPT-R06: sent falls back to the CampaignSend row count when no sentCount", async () => {
      const u = await signUp("R06Co", "r06@example.com");
      const c = await makeCampaign(u.sessionToken);
      for (let i = 0; i < 3; i++) await makeSend(u.sessionToken, c, { email: `s${i}@x.com` });

      const r = await report(u.sessionToken, c.id);
      expect(r.counts.sent).toBe(3);
      // delivered = max(sent - bounces, 0) = 3.
      expect(r.counts.delivered).toBe(3);
    });

    it("RPT-R07: delivered never negative when bounces exceed sent", async () => {
      const u = await signUp("R07Co", "r07@example.com");
      // No deliveredCount; bounceCount > sent (sent falls back to 0 sends).
      const c = await makeCampaign(u.sessionToken, { bounceCount: 5 });
      const r = await report(u.sessionToken, c.id);
      expect(r.counts.delivered).toBe(0);
      expect(r.counts.delivered).toBeGreaterThanOrEqual(0);
    });

    it("RPT-R08: sentAt serializes to an ISO string, null when unset", async () => {
      const u = await signUp("R08Co", "r08@example.com");
      const when = new Date("2026-05-12T16:00:00.000Z");
      const c1 = await makeCampaign(u.sessionToken, { sentAt: when });
      const c2 = await makeCampaign(u.sessionToken, {}); // no sentAt

      const r1 = await report(u.sessionToken, c1.id);
      const r2 = await report(u.sessionToken, c2.id);
      expect(r1.sentAt).toBe(when.toISOString());
      expect(r2.sentAt).toBeNull();
    });

    it("RPT-R09: missing campaignId is rejected (OTHER_CAUSE)", async () => {
      const u = await signUp("R09Co", "r09@example.com");
      await expect(
        Parse.Cloud.run("getCampaignReport", {}, { sessionToken: u.sessionToken }),
      ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
    });

    it("RPT-R10: unknown campaign id → OBJECT_NOT_FOUND", async () => {
      const u = await signUp("R10Co", "r10@example.com");
      await expect(report(u.sessionToken, "doesNotExist")).rejects.toMatchObject({
        code: Parse.Error.OBJECT_NOT_FOUND,
      });
    });

    it("RPT-R11: unauthenticated → INVALID_SESSION_TOKEN", async () => {
      await expect(
        Parse.Cloud.run("getCampaignReport", { campaignId: "x" }),
      ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    });
  });

  // ── getCampaignLinkBreakdown ───────────────────────────────────────────────
  describe("getCampaignLinkBreakdown", () => {
    it("RPT-B01: empty list + delivered 0 pre-pipeline", async () => {
      const u = await signUp("B01Co", "b01@example.com");
      const c = await makeCampaign(u.sessionToken);
      const res = await linkBreakdown(u.sessionToken, c.id);
      expect(res.links).toEqual([]);
      expect(res.delivered).toBe(0);
      expect(res.campaignId).toBe(c.id);
    });

    it("RPT-B02: unique clickers deduped per URL, sorted desc, rate over delivered", async () => {
      const u = await signUp("B02Co", "b02@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st, { deliveredCount: 100 });
      const c1 = await makeContact(st, { email: "c1@x.com" });
      const c2 = await makeContact(st, { email: "c2@x.com" });
      const URL_A = "https://example.com/a";
      const URL_B = "https://example.com/b";

      // url A: c1 twice (dedup → 1) + c2 once → 2 unique clickers.
      await makeEvent(st, c, { url: URL_A, contact: c1 });
      await makeEvent(st, c, { url: URL_A, contact: c1 });
      await makeEvent(st, c, { url: URL_A, contact: c2 });
      // url B: c1 once → 1 unique clicker.
      await makeEvent(st, c, { url: URL_B, contact: c1 });

      const res = await linkBreakdown(st, c.id);
      expect(res.delivered).toBe(100);
      expect(res.links).toHaveLength(2);
      // Sorted by uniqueClicks desc → A first.
      expect(res.links[0].url).toBe(URL_A);
      expect(res.links[0].uniqueClicks).toBe(2);
      expect(res.links[0].clickRate).toBeCloseTo(2 / 100, 5);
      expect(res.links[1].url).toBe(URL_B);
      expect(res.links[1].uniqueClicks).toBe(1);
      expect(res.links[1].clickRate).toBeCloseTo(1 / 100, 5);
    });

    it("RPT-B03: click events with no url bucket under (unknown)", async () => {
      const u = await signUp("B03Co", "b03@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st, { deliveredCount: 10 });
      const contact = await makeContact(st);
      await makeEvent(st, c, { contact }); // no url

      const res = await linkBreakdown(st, c.id);
      expect(res.links).toHaveLength(1);
      expect(res.links[0].url).toBe("(unknown)");
      expect(res.links[0].uniqueClicks).toBe(1);
    });

    it("RPT-B04: event with no contact counts via its event id", async () => {
      const u = await signUp("B04Co", "b04@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st, { deliveredCount: 10 });
      await makeEvent(st, c, { url: "https://example.com/a" }); // no contact

      const res = await linkBreakdown(st, c.id);
      expect(res.links).toHaveLength(1);
      expect(res.links[0].uniqueClicks).toBe(1);
    });

    it("RPT-B05: non-click events are ignored", async () => {
      const u = await signUp("B05Co", "b05@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st, { deliveredCount: 10 });
      const contact = await makeContact(st);
      await makeEvent(st, c, { type: "open", contact, url: "https://example.com/a" });

      const res = await linkBreakdown(st, c.id);
      expect(res.links).toEqual([]);
    });

    it("RPT-B06: clickRate guarded to 0 when delivered is 0", async () => {
      const u = await signUp("B06Co", "b06@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st); // no deliveredCount
      const contact = await makeContact(st);
      await makeEvent(st, c, { url: "https://example.com/a", contact });

      const res = await linkBreakdown(st, c.id);
      expect(res.delivered).toBe(0);
      expect(res.links[0].uniqueClicks).toBe(1);
      expect(res.links[0].clickRate).toBe(0);
      expect(Number.isNaN(res.links[0].clickRate)).toBe(false);
    });

    it("RPT-B07: unknown id / unauthenticated rejected", async () => {
      const u = await signUp("B07Co", "b07@example.com");
      await expect(linkBreakdown(u.sessionToken, "nope")).rejects.toMatchObject({
        code: Parse.Error.OBJECT_NOT_FOUND,
      });
      await expect(
        Parse.Cloud.run("getCampaignLinkBreakdown", { campaignId: "x" }),
      ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    });
  });

  // ── getCampaignRecipients pagination + filters ─────────────────────────────
  describe("getCampaignRecipients", () => {
    it("RPT-P01: empty page shape pre-pipeline", async () => {
      const u = await signUp("P01Co", "p01@example.com");
      const c = await makeCampaign(u.sessionToken);
      const res = await recipients(u.sessionToken, { campaignId: c.id, page: 1, perPage: 50 });
      expect(res).toMatchObject({ rows: [], total: 0, page: 1, perPage: 50, totalPages: 1 });
    });

    it("RPT-P02: pagination math (120 sends, page 2, perPage 50)", async () => {
      const u = await signUp("P02Co", "p02@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      const CampaignSend = Parse.Object.extend("CampaignSend");
      const batch = [];
      for (let i = 0; i < 120; i++) {
        const s = new CampaignSend();
        s.set({ campaign: c, email: `r${i}@x.com`, status: "sent" });
        batch.push(s);
      }
      await Parse.Object.saveAll(batch, { sessionToken: st });

      const res = await recipients(st, { campaignId: c.id, page: 2, perPage: 50 });
      expect(res.total).toBe(120);
      expect(res.totalPages).toBe(3);
      expect(res.page).toBe(2);
      expect(res.perPage).toBe(50);
      expect(res.rows).toHaveLength(50);
    });

    it("RPT-P03: perPage clamped to MAX (100)", async () => {
      const u = await signUp("P03Co", "p03@example.com");
      const c = await makeCampaign(u.sessionToken);
      const res = await recipients(u.sessionToken, { campaignId: c.id, perPage: 5000 });
      expect(res.perPage).toBe(100);
    });

    it("RPT-P04: perPage 0 → default 50; negative → clamped to 1", async () => {
      const u = await signUp("P04Co", "p04@example.com");
      const c = await makeCampaign(u.sessionToken);
      const zero = await recipients(u.sessionToken, { campaignId: c.id, perPage: 0 });
      expect(zero.perPage).toBe(50); // 0 is falsy → default via ||
      const neg = await recipients(u.sessionToken, { campaignId: c.id, perPage: -5 });
      expect(neg.perPage).toBe(1); // Math.max(perPage, 1)
    });

    it("RPT-P05: page floored at 1 for 0 / negative / NaN", async () => {
      const u = await signUp("P05Co", "p05@example.com");
      const c = await makeCampaign(u.sessionToken);
      for (const page of [0, -3, "notanumber"]) {
        const res = await recipients(u.sessionToken, { campaignId: c.id, page });
        expect(res.page).toBe(1);
      }
    });

    it("RPT-P06: default perPage is 50 when omitted", async () => {
      const u = await signUp("P06Co", "p06@example.com");
      const c = await makeCampaign(u.sessionToken);
      const res = await recipients(u.sessionToken, { campaignId: c.id });
      expect(res.perPage).toBe(50);
    });

    // Shared fixture for the filter cases: a campaign with a mix of statuses.
    async function seedMixedSends(st: string, c: any) {
      // 2 opened, 1 clicked (also opened), 1 bounced, 1 unsubscribed, 1 plain sent.
      await makeSend(st, c, { email: "o1@x.com", opened: true });
      await makeSend(st, c, { email: "o2@x.com", opened: true });
      await makeSend(st, c, { email: "cl@x.com", opened: true, clicked: true });
      await makeSend(st, c, { email: "b@x.com", status: "bounced" });
      await makeSend(st, c, { email: "un@x.com", status: "unsubscribed" });
      await makeSend(st, c, { email: "plain@x.com", status: "sent" });
    }

    it("RPT-P07: filter opened returns only opened rows", async () => {
      const u = await signUp("P07Co", "p07@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const res = await recipients(st, { campaignId: c.id, filter: "opened" });
      expect(res.total).toBe(3);
      expect(res.rows.every((r) => r.opened === true)).toBe(true);
    });

    it("RPT-P08: filter clicked returns only clicked rows", async () => {
      const u = await signUp("P08Co", "p08@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const res = await recipients(st, { campaignId: c.id, filter: "clicked" });
      expect(res.total).toBe(1);
      expect(res.rows.every((r) => r.clicked === true)).toBe(true);
    });

    it("RPT-P09: filter bounced returns only status=bounced rows", async () => {
      const u = await signUp("P09Co", "p09@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const res = await recipients(st, { campaignId: c.id, filter: "bounced" });
      expect(res.total).toBe(1);
      expect(res.rows.every((r) => r.status === "bounced")).toBe(true);
    });

    it("RPT-P10: filter unsubscribed returns only status=unsubscribed rows", async () => {
      const u = await signUp("P10Co", "p10@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const res = await recipients(st, { campaignId: c.id, filter: "unsubscribed" });
      expect(res.total).toBe(1);
      expect(res.rows.every((r) => r.status === "unsubscribed")).toBe(true);
    });

    it("RPT-P11: filter notOpened returns rows where opened !== true (incl. missing)", async () => {
      const u = await signUp("P11Co", "p11@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const res = await recipients(st, { campaignId: c.id, filter: "notOpened" });
      // bounced + unsubscribed + plain sent = 3 (the 3 opened are excluded).
      expect(res.total).toBe(3);
      expect(res.rows.every((r) => r.opened !== true)).toBe(true);
    });

    it("RPT-P12: filter all / unknown applies no constraint", async () => {
      const u = await signUp("P12Co", "p12@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      await seedMixedSends(st, c);
      const all = await recipients(st, { campaignId: c.id, filter: "all" });
      const xyzzy = await recipients(st, { campaignId: c.id, filter: "xyzzy" });
      expect(all.total).toBe(6);
      expect(xyzzy.total).toBe(6);
    });

    it("RPT-P13: row shape carries contact include + derived fields", async () => {
      const u = await signUp("P13Co", "p13@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      const contact = await makeContact(st, {
        email: "person@x.com",
        firstName: "Ada",
        lastName: "Lovelace",
      });
      const openedAt = new Date("2026-05-13T10:00:00.000Z");
      const clickedAt = new Date("2026-05-13T11:00:00.000Z");
      await makeSend(st, c, {
        contact,
        email: "person@x.com",
        status: "sent",
        opened: true,
        clicked: true,
        openedAt,
        lastClickedAt: clickedAt,
      });

      const res = await recipients(st, { campaignId: c.id });
      expect(res.rows).toHaveLength(1);
      const row = res.rows[0];
      expect(row.email).toBe("person@x.com");
      expect(row.firstName).toBe("Ada");
      expect(row.lastName).toBe("Lovelace");
      expect(row.status).toBe("sent");
      expect(row.opened).toBe(true);
      expect(row.clicked).toBe(true);
      expect(row.openedAt).toBe(openedAt.toISOString());
      expect(row.lastClickedAt).toBe(clickedAt.toISOString());
      expect(row.bounceReason).toBeNull();
    });

    it("RPT-P14: email falls back to contact.email, then empty string", async () => {
      const u = await signUp("P14Co", "p14@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      const contact = await makeContact(st, { email: "fallback@x.com" });
      // Send with no email but a contact that has one.
      await makeSend(st, c, { contact });
      // Send with neither email nor contact.
      await makeSend(st, c, {});

      const res = await recipients(st, { campaignId: c.id });
      const emails = res.rows.map((r) => r.email).sort();
      expect(emails).toContain("fallback@x.com");
      expect(emails).toContain("");
    });

    it("RPT-P15: rows ordered newest-first by createdAt", async () => {
      const u = await signUp("P15Co", "p15@example.com");
      const st = u.sessionToken;
      const c = await makeCampaign(st);
      // Save sequentially so createdAt strictly increases.
      const first = await makeSend(st, c, { email: "first@x.com" });
      const second = await makeSend(st, c, { email: "second@x.com" });
      const third = await makeSend(st, c, { email: "third@x.com" });

      const res = await recipients(st, { campaignId: c.id });
      expect(res.rows.map((r) => r.id)).toEqual([third.id, second.id, first.id]);
    });

    it("RPT-P16: unknown id / unauthenticated rejected", async () => {
      const u = await signUp("P16Co", "p16@example.com");
      await expect(recipients(u.sessionToken, { campaignId: "nope" })).rejects.toMatchObject({
        code: Parse.Error.OBJECT_NOT_FOUND,
      });
      await expect(
        Parse.Cloud.run("getCampaignRecipients", { campaignId: "x" }),
      ).rejects.toMatchObject({ code: Parse.Error.INVALID_SESSION_TOKEN });
    });
  });

  // ── Tenant isolation ───────────────────────────────────────────────────────
  describe("tenant isolation", () => {
    it("RPT-T01: getCampaignReport across orgs → OBJECT_NOT_FOUND", async () => {
      const a = await signUp("TIso-RA", "tiso-ra@example.com");
      const b = await signUp("TIso-RB", "tiso-rb@example.com");
      const c = await makeCampaign(a.sessionToken, { sentCount: 100 });
      await expect(report(b.sessionToken, c.id)).rejects.toMatchObject({
        code: Parse.Error.OBJECT_NOT_FOUND,
      });
    });

    it("RPT-T02: getCampaignLinkBreakdown across orgs → OBJECT_NOT_FOUND", async () => {
      const a = await signUp("TIso-BA", "tiso-ba@example.com");
      const b = await signUp("TIso-BB", "tiso-bb@example.com");
      const c = await makeCampaign(a.sessionToken);
      await expect(linkBreakdown(b.sessionToken, c.id)).rejects.toMatchObject({
        code: Parse.Error.OBJECT_NOT_FOUND,
      });
    });

    it("RPT-T03: getCampaignRecipients across orgs → OBJECT_NOT_FOUND", async () => {
      const a = await signUp("TIso-PA", "tiso-pa@example.com");
      const b = await signUp("TIso-PB", "tiso-pb@example.com");
      const c = await makeCampaign(a.sessionToken);
      await expect(
        recipients(b.sessionToken, { campaignId: c.id }),
      ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
    });

    it("RPT-T04: recipients don't leak across orgs", async () => {
      const a = await signUp("TIso-LA", "tiso-la@example.com");
      const b = await signUp("TIso-LB", "tiso-lb@example.com");
      const ca = await makeCampaign(a.sessionToken);
      const cb = await makeCampaign(b.sessionToken);
      // 3 sends for A, 1 for B.
      for (let i = 0; i < 3; i++) await makeSend(a.sessionToken, ca, { email: `a${i}@x.com` });
      await makeSend(b.sessionToken, cb, { email: "b0@x.com" });

      const resA = await recipients(a.sessionToken, { campaignId: ca.id });
      const resB = await recipients(b.sessionToken, { campaignId: cb.id });
      expect(resA.total).toBe(3);
      expect(resB.total).toBe(1);
      expect(resA.rows.every((r) => r.email.startsWith("a"))).toBe(true);
      expect(resB.rows.every((r) => r.email.startsWith("b"))).toBe(true);
    });
  });
});
