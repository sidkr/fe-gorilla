// Conversion pixel (R2) tests for routes/tracking.js — GET /t/p/:token, over
// real HTTP against a real Parse Server (so loadSend resolves a real
// CampaignSend → org → contact). server/ is CommonJS via createRequire, so we
// patch the enqueue seam (lib/agendaInstance.getAgenda) BEFORE requiring
// tracking.js, then mount it on a tiny Express app.
//
// Coverage:
//   - valid pixel token → GIF + enqueue ingest-conversion (sourceType "pixel"),
//     carrying the resolved org + contact email + integer-minor-unit revenue
//   - invalid / wrong-type token → GIF, no enqueue
//   - missing orderId → GIF, no enqueue (no idempotency key)
//   - non-integer value coerced to 0 (never a float)
//   - the pixel token resolves org + contact email and normalizes currency
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const require = createRequire(import.meta.url);

const enqueued: Array<{ name: string; data: any }> = [];

function get(port: number, path: string): Promise<{ status: number; body: Buffer; headers: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks), headers: res.headers }),
      );
    });
    req.on("error", reject);
    req.end();
  });
}

// The pixel handler enqueues out-of-band (after the GIF). Poll for the result.
async function waitForEnqueue(n = 1, timeoutMs = 3000) {
  const start = Date.now();
  while (enqueued.length < n) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((r) => setTimeout(r, 15));
  }
}

describe("conversion pixel GET /t/p/:token", () => {
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

    // Patch the enqueue seam BEFORE tracking.js destructures getAgenda.
    const agendaMod = require("../../server/lib/agendaInstance");
    agendaMod.getAgenda = async () => ({
      now: async (name: string, data: any) => { enqueued.push({ name, data }); },
    });

    tracking = require("../../server/routes/tracking");
    const app = express();
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

  beforeEach(() => {
    enqueued.length = 0;
  });

  async function makeSend(orgName: string, email: string | null) {
    const Organization = Parse.Object.extend("Organization");
    const org = new Organization();
    org.set("name", orgName);
    await org.save(null, MK);

    let contact: any = null;
    if (email) {
      const Contact = Parse.Object.extend("Contact");
      contact = new Contact();
      contact.set("organization", org);
      contact.set("email", email);
      contact.set("status", "subscribed");
      await contact.save(null, MK);
    }

    const CampaignSend = Parse.Object.extend("CampaignSend");
    const send = new CampaignSend();
    send.set("organization", org);
    if (contact) send.set("contact", contact);
    if (email) send.set("email", email);
    send.set("status", "sent");
    await send.save(null, MK);
    return { org, send, contact };
  }

  function pixelToken(sendId: string) {
    return trackingTokens.signToken({ t: "p", sendId });
  }

  it("returns a GIF and enqueues ingest-conversion (sourceType pixel)", async () => {
    const { send, org } = await makeSend("PixelCo", "buyer@example.com");
    const res = await get(port, `/t/p/${pixelToken(send.id)}?value=2500&orderId=ORD-9&currency=eur`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/gif");
    expect(res.body.slice(0, 3).toString("ascii")).toBe("GIF");

    await waitForEnqueue();
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].name).toBe("ingest-conversion");
    expect(enqueued[0].data).toMatchObject({
      email: "buyer@example.com",
      orderId: "ORD-9",
      sourceType: "pixel",
      revenue: 2500, // integer minor units
      currency: "EUR", // normalized
    });
    expect(enqueued[0].data.org.id).toBe(org.id);
  });

  it("does not enqueue for an invalid token", async () => {
    const res = await get(port, `/t/p/not.a.token?orderId=ORD-1&value=100`);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(enqueued).toHaveLength(0);
  });

  it("does not enqueue when orderId is missing (no idempotency key)", async () => {
    const { send } = await makeSend("NoOrderCo", "x@example.com");
    const res = await get(port, `/t/p/${pixelToken(send.id)}?value=100`);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(enqueued).toHaveLength(0);
  });

  it("treats a non-integer value as 0 (never coerces a float)", async () => {
    const { send } = await makeSend("FloatCo", null);
    await get(port, `/t/p/${pixelToken(send.id)}?value=12.50&orderId=ORD-2`);
    await waitForEnqueue();
    expect(enqueued[0].data).toMatchObject({ revenue: 0, orderId: "ORD-2", email: null });
  });

  it("resolves org + contact email from the pixel token and normalizes currency", async () => {
    const { send, org } = await makeSend("HandoffCo", "vip@example.com");
    await get(port, `/t/p/${pixelToken(send.id)}?orderId=ORD-3&value=999&currency=usd`);
    await waitForEnqueue();
    expect(enqueued[0].data).toMatchObject({
      email: "vip@example.com",
      orderId: "ORD-3",
      revenue: 999,
      currency: "USD",
      sourceType: "pixel",
    });
    expect(enqueued[0].data.org.id).toBe(org.id);
  });
});
