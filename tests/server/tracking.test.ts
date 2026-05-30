// Tracking HTTP endpoint tests: open pixel, click redirect, unsubscribe.
//
// Boots a tiny Express app with routes/tracking.mount(app), and hits it with the
// node http client. The route libs require("parse/node") — the SAME SDK
// singleton startTestParseServer initializes — so master-key writes from the
// handlers land in the in-memory Parse Server with no extra wiring.
//
// Tokens are minted with the real signToken so the route's verifyToken accepts
// them. Test data (org/campaign/contact/send) is created directly with the
// master key (no cloud functions needed for the tracking surface).
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const require = createRequire(import.meta.url);

// ── tiny http helper: returns { status, headers, body } without following 302 ──
function hit(
  port: number,
  method: string,
  path: string,
  opts: { body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: opts.headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body != null) req.write(opts.body);
    req.end();
  });
}

describe("tracking endpoints", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let trackingTokens: any;
  let server: http.Server;
  let port: number;

  const MK = { useMasterKey: true } as const;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    trackingTokens = require("../../server/lib/trackingTokens");

    // Boot a tiny Express app with just the tracking routes mounted.
    const app = express();
    app.set("trust proxy", true); // so req.ip honors X-Forwarded-For in tests
    require("../../server/routes/tracking").mount(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    port = addr.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    await ctx.stop();
  });

  // ── fixture builders (master-key, no cloud fns) ────────────────────────────--
  async function makeOrg(name: string) {
    const Organization = Parse.Object.extend("Organization");
    const o = new Organization();
    o.set("name", name);
    await o.save(null, MK);
    return o;
  }
  async function makeCampaign(org: any, name: string) {
    const Campaign = Parse.Object.extend("Campaign");
    const c = new Campaign();
    c.set("organization", org);
    c.set("name", name);
    c.set("status", "sent");
    await c.save(null, MK);
    return c;
  }
  async function makeContact(org: any, email: string) {
    const Contact = Parse.Object.extend("Contact");
    const c = new Contact();
    c.set("organization", org);
    c.set("email", email);
    c.set("status", "subscribed");
    await c.save(null, MK);
    return c;
  }
  async function makeSend(org: any, campaign: any, contact: any) {
    const CampaignSend = Parse.Object.extend("CampaignSend");
    const s = new CampaignSend();
    s.set("organization", org);
    s.set("campaign", campaign);
    s.set("contact", contact);
    s.set("email", contact.get("email"));
    s.set("status", "sent");
    await s.save(null, MK);
    return s;
  }

  async function eventsForSend(sendId: string, type: string) {
    const q = new Parse.Query("EmailEvent");
    q.equalTo("campaignSend", Parse.Object.extend("CampaignSend").createWithoutData(sendId));
    q.equalTo("type", type);
    return q.find(MK);
  }

  // ── open pixel ─────────────────────────────────────────────────────────────--
  describe("GET /t/o/:token", () => {
    it("records an open, sets openedAt + openCount once, returns the GIF", async () => {
      const org = await makeOrg("OpenCo");
      const campaign = await makeCampaign(org, "Open Campaign");
      const contact = await makeContact(org, "open@example.com");
      const send = await makeSend(org, campaign, contact);
      const token = trackingTokens.openToken(send.id);

      const res = await hit(port, "GET", `/t/o/${token}`, {
        headers: {
          "user-agent": "TestMail/1.0",
          "x-forwarded-for": "203.0.113.7",
        },
      });

      // Response is always the GIF, no-store.
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/gif");
      expect(res.headers["cache-control"]).toContain("no-store");
      expect(res.body.slice(0, 3).toString("ascii")).toBe("GIF");

      // The record happens out-of-band (event write, then setFirst + counter) —
      // poll on the LAST write in the chain so the whole side-effect has settled.
      await waitFor(async () => {
        const c = await new Parse.Query("Campaign").get(campaign.id, MK);
        return c.get("openCount") === 1;
      });

      const events = await eventsForSend(send.id, "open");
      expect(events.length).toBe(1);
      expect(events[0].get("userAgent")).toBe("TestMail/1.0");
      expect(events[0].get("ipAddress")).toBe("203.0.113.0"); // IP anonymized

      const fresh = await new Parse.Query("CampaignSend").get(send.id, MK);
      expect(fresh.get("openedAt")).toBeInstanceOf(Date);

      const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
      expect(freshCampaign.get("openCount")).toBe(1);

      // A SECOND open writes another event but does NOT double the unique count.
      const res2 = await hit(port, "GET", `/t/o/${token}`, {
        headers: { "user-agent": "TestMail/1.0" },
      });
      expect(res2.status).toBe(200);
      await waitFor(async () => (await eventsForSend(send.id, "open")).length === 2);

      const campaignAfter = await new Parse.Query("Campaign").get(campaign.id, MK);
      expect(campaignAfter.get("openCount")).toBe(1); // still 1 — unique
    });

    it("returns the GIF for an invalid token without writing anything", async () => {
      const before = await new Parse.Query("EmailEvent").count(MK);
      const res = await hit(port, "GET", `/t/o/not.a.real.token`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("image/gif");
      // No event written.
      await new Promise((r) => setTimeout(r, 150));
      const after = await new Parse.Query("EmailEvent").count(MK);
      expect(after).toBe(before);
    });
  });

  // ── click redirect ─────────────────────────────────────────────────────────--
  describe("GET /t/c/:token", () => {
    it("records a click and 302-redirects to the url", async () => {
      const org = await makeOrg("ClickCo");
      const campaign = await makeCampaign(org, "Click Campaign");
      const contact = await makeContact(org, "click@example.com");
      const send = await makeSend(org, campaign, contact);
      const dest = "https://example.com/sale?x=1";
      const token = trackingTokens.clickToken(send.id, dest, "lnk1");

      const res = await hit(port, "GET", `/t/c/${token}`);
      expect(res.status).toBe(302);
      expect(res.headers["location"]).toBe(dest);

      await waitFor(async () => {
        const c = await new Parse.Query("Campaign").get(campaign.id, MK);
        return c.get("clickCount") === 1;
      });
      const events = await eventsForSend(send.id, "click");
      expect(events.length).toBe(1);
      expect(events[0].get("linkUrl")).toBe(dest);
      expect(events[0].get("linkId")).toBe("lnk1");

      const fresh = await new Parse.Query("CampaignSend").get(send.id, MK);
      expect(fresh.get("clickedAt")).toBeInstanceOf(Date);
      const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
      expect(freshCampaign.get("clickCount")).toBe(1);
    });

    it("400s on an invalid token (no redirect)", async () => {
      const res = await hit(port, "GET", `/t/c/garbage`);
      expect(res.status).toBe(400);
      expect(res.headers["location"]).toBeUndefined();
    });

    it("400s when the token type is wrong (open token on click route)", async () => {
      const open = trackingTokens.openToken("whatever");
      const res = await hit(port, "GET", `/t/c/${open}`);
      expect(res.status).toBe(400);
    });
  });

  // ── unsubscribe ────────────────────────────────────────────────────────────--
  describe("GET /u/:token", () => {
    it("renders a confirm page with a POST form for a valid token", async () => {
      const token = trackingTokens.unsubToken("somesend");
      const res = await hit(port, "GET", `/u/${token}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
      const html = res.body.toString("utf8");
      expect(html).toContain("Unsubscribe from these emails?");
      expect(html).toContain('method="POST"');
      expect(html).toContain(`action="/u/${token}"`);
    });

    it("renders an invalid-link page for a bad token", async () => {
      const res = await hit(port, "GET", `/u/garbage`);
      expect(res.status).toBe(400);
      expect(res.body.toString("utf8")).toContain("invalid");
    });
  });

  describe("POST /u/:token", () => {
    it("suppresses, unsubscribes the contact, bumps the counter, and is idempotent", async () => {
      const org = await makeOrg("UnsubCo");
      const campaign = await makeCampaign(org, "Unsub Campaign");
      const contact = await makeContact(org, "Unsub@Example.com");
      const send = await makeSend(org, campaign, contact);
      const token = trackingTokens.unsubToken(send.id);

      const res = await hit(port, "POST", `/u/${token}`, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "0",
        },
        body: "",
      });
      expect(res.status).toBe(200);
      expect(res.body.toString("utf8")).toContain("unsubscribed");

      // Suppression row (email lowercased by the lib).
      const supp = new Parse.Query("Suppression");
      supp.equalTo("organization", org);
      supp.equalTo("email", "unsub@example.com");
      const row = await supp.first(MK);
      expect(row).toBeDefined();
      expect(row!.get("reason")).toBe("unsubscribe");

      // Contact flipped.
      const freshContact = await new Parse.Query("Contact").get(contact.id, MK);
      expect(freshContact.get("unsubscribed")).toBe(true);
      expect(freshContact.get("status")).toBe("unsubscribed");
      expect(freshContact.get("unsubscribedAt")).toBeInstanceOf(Date);

      // Send + counter + event.
      const freshSend = await new Parse.Query("CampaignSend").get(send.id, MK);
      expect(freshSend.get("unsubscribedAt")).toBeInstanceOf(Date);
      const freshCampaign = await new Parse.Query("Campaign").get(campaign.id, MK);
      expect(freshCampaign.get("unsubscribeCount")).toBe(1);
      expect((await eventsForSend(send.id, "unsubscribe")).length).toBe(1);

      // Idempotent: a one-click retry still 200s and does NOT double the counter.
      const res2 = await hit(port, "POST", `/u/${token}`, {
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String("List-Unsubscribe=One-Click".length),
        },
        body: "List-Unsubscribe=One-Click",
      });
      expect(res2.status).toBe(200);
      const campaignAfter = await new Parse.Query("Campaign").get(campaign.id, MK);
      expect(campaignAfter.get("unsubscribeCount")).toBe(1); // still 1
    });

    it("400s on an invalid token and writes no suppression", async () => {
      const before = await new Parse.Query("Suppression").count(MK);
      const res = await hit(port, "POST", `/u/garbage`, {
        headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "0" },
        body: "",
      });
      expect(res.status).toBe(400);
      await new Promise((r) => setTimeout(r, 150));
      const after = await new Parse.Query("Suppression").count(MK);
      expect(after).toBe(before);
    });
  });
});

// Poll an async predicate until true or timeout (the open/click handlers write
// out-of-band, so the HTTP response returns before the DB write completes).
async function waitFor(pred: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await pred()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}
