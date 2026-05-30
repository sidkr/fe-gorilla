// Tracking-route GAP coverage (testing plan §3.9). tracking.test.ts already
// covers TRK-1/2/3/5/7/9/10/11/12. This file fills the flagged gaps:
//   TRK-4  open token TYPE mismatch (unsub token on /t/o) → GIF, no write
//   TRK-6  click unique-count (second click doesn't double clickCount)
//   TRK-8  click token without `url` → 400, no redirect
//   TRK-13 token outlives a DELETED send → graceful (GIF / 302 / 200, no crash)
//   TRK-14 unsub uses the send's email SNAPSHOT when the contact pointer is missing
//   TRK-15 anonymizeIp helper (unit)
//
// Same harness as tracking.test.ts: in-memory Parse + a tiny Express app with
// routes/tracking.mount(app), hit over node http (no 302 follow). Real tokens
// minted via trackingTokens so verifyToken accepts them.
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const require = createRequire(import.meta.url);

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
          resolve({ status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks) }),
        );
      },
    );
    req.on("error", reject);
    if (opts.body != null) req.write(opts.body);
    req.end();
  });
}

async function waitFor(pred: () => Promise<boolean>, timeoutMs = 5000) {
  const start = Date.now();
  while (true) {
    if (await pred()) return;
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe("tracking endpoints — gap coverage", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let trackingTokens: any;
  let tracking: any;
  let server: http.Server;
  let port: number;

  const MK = { useMasterKey: true } as const;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    trackingTokens = require("../../server/lib/trackingTokens");
    tracking = require("../../server/routes/tracking");

    const app = express();
    app.set("trust proxy", true);
    tracking.mount(app);
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

  // ── fixtures (master-key) ─────────────────────────────────────────────────-
  async function makeOrg(name: string) {
    const o = new (Parse.Object.extend("Organization"))();
    o.set("name", name);
    await o.save(null, MK);
    return o;
  }
  async function makeCampaign(org: any, name: string) {
    const c = new (Parse.Object.extend("Campaign"))();
    c.set("organization", org);
    c.set("name", name);
    c.set("status", "sent");
    await c.save(null, MK);
    return c;
  }
  async function makeContact(org: any, email: string) {
    const c = new (Parse.Object.extend("Contact"))();
    c.set("organization", org);
    c.set("email", email);
    c.set("status", "subscribed");
    await c.save(null, MK);
    return c;
  }
  async function makeSend(org: any, campaign: any, contact: any | null, email?: string) {
    const s = new (Parse.Object.extend("CampaignSend"))();
    s.set("organization", org);
    s.set("campaign", campaign);
    if (contact) s.set("contact", contact);
    s.set("email", email ?? (contact ? contact.get("email") : "noone@example.com"));
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

  // ── TRK-4 — open route ignores a wrong-type token ───────────────────────────
  it("TRK-4: an unsub token on /t/o returns the GIF and writes nothing", async () => {
    const org = await makeOrg("TypeMismatchCo");
    const campaign = await makeCampaign(org, "TM Campaign");
    const contact = await makeContact(org, "tm@example.com");
    const send = await makeSend(org, campaign, contact);
    const wrongToken = trackingTokens.unsubToken(send.id); // t:"u" on the open route

    const before = await new Parse.Query("EmailEvent").count(MK);
    const res = await hit(port, "GET", `/t/o/${wrongToken}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");

    // No open event should ever be written for a non-"o" payload.
    await new Promise((r) => setTimeout(r, 150));
    const after = await new Parse.Query("EmailEvent").count(MK);
    expect(after).toBe(before);
    expect((await eventsForSend(send.id, "open")).length).toBe(0);
  });

  // ── TRK-6 — click unique-count ──────────────────────────────────────────────
  it("TRK-6: a second click writes another event but clickCount stays 1 (unique)", async () => {
    const org = await makeOrg("ClickUniqueCo");
    const campaign = await makeCampaign(org, "CU Campaign");
    const contact = await makeContact(org, "cu@example.com");
    const send = await makeSend(org, campaign, contact);
    const dest = "https://example.com/deal";
    const token = trackingTokens.clickToken(send.id, dest, "lnkA");

    const r1 = await hit(port, "GET", `/t/c/${token}`);
    expect(r1.status).toBe(302);
    expect(r1.headers["location"]).toBe(dest);
    await waitFor(async () => {
      const c = await new Parse.Query("Campaign").get(campaign.id, MK);
      return c.get("clickCount") === 1;
    });

    const r2 = await hit(port, "GET", `/t/c/${token}`);
    expect(r2.status).toBe(302);
    await waitFor(async () => (await eventsForSend(send.id, "click")).length === 2);

    const campaignAfter = await new Parse.Query("Campaign").get(campaign.id, MK);
    expect(campaignAfter.get("clickCount")).toBe(1); // unique — not doubled
    expect((await eventsForSend(send.id, "click")).length).toBe(2); // both events recorded
  });

  // ── TRK-8 — click token with no url → 400, no redirect ─────────────────────-
  it("TRK-8: a click token lacking a url is rejected 400 with no Location", async () => {
    // Mint a structurally-valid click token (t:"c") but WITHOUT a url field.
    const noUrlToken = trackingTokens.signToken({ t: "c", sendId: "anysend" });
    const res = await hit(port, "GET", `/t/c/${noUrlToken}`);
    expect(res.status).toBe(400);
    expect(res.headers["location"]).toBeUndefined();
  });

  // ── TRK-13 — token outlives a deleted send → graceful ──────────────────────-
  it("TRK-13: tokens for a deleted send degrade gracefully (GIF / 302 / 200, no crash)", async () => {
    const org = await makeOrg("DeletedSendCo");
    const campaign = await makeCampaign(org, "DS Campaign");
    const contact = await makeContact(org, "ds@example.com");
    const send = await makeSend(org, campaign, contact);
    const sendId = send.id;
    const dest = "https://example.com/after-delete";

    const openTok = trackingTokens.openToken(sendId);
    const clickTok = trackingTokens.clickToken(sendId, dest, "lnk");
    const unsubTok = trackingTokens.unsubToken(sendId);

    // Delete the send; the tokens are now "orphaned".
    await send.destroy(MK);

    // Open: still the GIF, no event written (loadSend returns null).
    const evBefore = await new Parse.Query("EmailEvent").count(MK);
    const ro = await hit(port, "GET", `/t/o/${openTok}`);
    expect(ro.status).toBe(200);
    expect(ro.headers["content-type"]).toContain("image/gif");

    // Click: the url lives in the token, so we still 302 even without the send.
    const rc = await hit(port, "GET", `/t/c/${clickTok}`);
    expect(rc.status).toBe(302);
    expect(rc.headers["location"]).toBe(dest);

    // Unsub: 200 (no crash), no suppression written for a missing send.
    const supBefore = await new Parse.Query("Suppression").count(MK);
    const ru = await hit(port, "POST", `/u/${unsubTok}`, {
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "0" },
      body: "",
    });
    expect(ru.status).toBe(200);

    // Give the fire-and-forget open/click handlers time to (not) write.
    await new Promise((r) => setTimeout(r, 200));
    const evAfter = await new Parse.Query("EmailEvent").count(MK);
    expect(evAfter).toBe(evBefore); // no events for an orphaned send
    const supAfter = await new Parse.Query("Suppression").count(MK);
    expect(supAfter).toBe(supBefore); // no suppression for an orphaned send
  });

  // ── TRK-14 — unsub falls back to the send's email snapshot ──────────────────-
  it("TRK-14: POST /u suppresses using send.email when the contact pointer is missing", async () => {
    const org = await makeOrg("SnapshotCo");
    const campaign = await makeCampaign(org, "Snap Campaign");
    // Send with NO contact pointer, only an email snapshot.
    const send = await makeSend(org, campaign, null, "Snapshot@Example.com");
    const token = trackingTokens.unsubToken(send.id);

    const res = await hit(port, "POST", `/u/${token}`, {
      headers: { "content-type": "application/x-www-form-urlencoded", "content-length": "0" },
      body: "",
    });
    expect(res.status).toBe(200);

    await waitFor(async () => {
      const q = new Parse.Query("Suppression");
      q.equalTo("organization", org);
      q.equalTo("email", "snapshot@example.com"); // lowercased by the suppression lib
      return (await q.first(MK)) != null;
    });
    const q = new Parse.Query("Suppression");
    q.equalTo("organization", org);
    q.equalTo("email", "snapshot@example.com");
    const row = await q.first(MK);
    expect(row).toBeTruthy();
    expect(row!.get("reason")).toBe("unsubscribe");

    // The send's first-unsub timestamp + the unsubscribe event are still recorded.
    const fresh = await new Parse.Query("CampaignSend").get(send.id, MK);
    expect(fresh.get("unsubscribedAt")).toBeInstanceOf(Date);
    expect((await eventsForSend(send.id, "unsubscribe")).length).toBe(1);
  });

  // ── TRK-15 — anonymizeIp helper (unit) ─────────────────────────────────────-
  it("TRK-15: anonymizeIp zeros the IPv4 last octet, leaves IPv6/undefined", () => {
    expect(tracking.anonymizeIp("203.0.113.7")).toBe("203.0.113.0");
    expect(tracking.anonymizeIp("10.20.30.40")).toBe("10.20.30.0");
    // IPv6 is left intact (we only anonymize dotted-quad IPv4).
    expect(tracking.anonymizeIp("2001:db8::1")).toBe("2001:db8::1");
    expect(tracking.anonymizeIp(undefined)).toBeUndefined();
    expect(tracking.anonymizeIp("")).toBeUndefined();
    expect(tracking.anonymizeIp(12345 as any)).toBeUndefined();
  });
});
