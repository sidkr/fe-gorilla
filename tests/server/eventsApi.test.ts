// Inbound events API tests (R2) — POST /api/v1/events/purchase, over real HTTP.
//
// Follows webhook-route.test.ts: server/ is CommonJS loaded via createRequire
// (vitest's vi.mock does NOT intercept CJS), so we patch the two outbound seams
// the route captures BEFORE requiring eventsApi.js:
//   - lib/agendaInstance.getAgenda  (eventsApi destructures it on require)
//   - lib/apiKeyAuth.authenticate   (eventsApi destructures it on require)
// No Parse/Mongo needed — the route only validates, auth-checks, and enqueues.
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import express from "express";

const require = createRequire(import.meta.url);

// ── enqueue seam ──────────────────────────────────────────────────────────────
const enqueued: Array<{ name: string; data: any }> = [];
let enqueueThrows = false;

// ── auth seam ─────────────────────────────────────────────────────────────────
let authResult: { org: any; apiKey: any } | null = { org: { id: "org1" }, apiKey: { id: "key1" } };

function post(
  port: number,
  path: string,
  body: any,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path,
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(data),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: any = null;
          try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = raw; }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const VALID_BODY = { email: "buyer@example.com", orderId: "ORD-1", value: 4999, currency: "USD" };
const AUTH = { authorization: "Bearer gk_live_xxx" };

describe("events API", () => {
  let server: http.Server;
  let port: number;
  let buckets: Map<string, any>;

  beforeAll(async () => {
    // Patch the seams BEFORE eventsApi.js requires/destructures them.
    const agendaMod = require("../../server/lib/agendaInstance");
    agendaMod.getAgenda = async () => ({
      now: async (name: string, data: any) => {
        if (enqueueThrows) throw new Error("enqueue failed");
        enqueued.push({ name, data });
      },
    });
    const authMod = require("../../server/lib/apiKeyAuth");
    authMod.authenticate = async (header: string) => {
      if (!authResult) {
        const e: any = new Error("Invalid API key");
        e.status = 401;
        throw e;
      }
      return authResult;
    };

    const eventsApi = require("../../server/routes/eventsApi");
    buckets = eventsApi._buckets;
    const app = express();
    eventsApi.mount(app);
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
  });

  beforeEach(() => {
    enqueued.length = 0;
    enqueueThrows = false;
    authResult = { org: { id: "org1" }, apiKey: { id: "key1" } };
    buckets.clear(); // reset the in-memory rate limiter between tests
  });

  it("202s a valid purchase and enqueues ingest-conversion with sourceType api", async () => {
    const res = await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(true);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].name).toBe("ingest-conversion");
    expect(enqueued[0].data).toMatchObject({
      org: { id: "org1" },
      orderId: "ORD-1",
      sourceType: "api",
      revenue: 4999,
      currency: "USD",
      email: "buyer@example.com",
    });
  });

  it("401s when auth fails and does not enqueue", async () => {
    authResult = null;
    const res = await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
    expect(res.status).toBe(401);
    expect(enqueued).toHaveLength(0);
  });

  it("400s when value is not an integer (no float money)", async () => {
    const res = await post(port, "/api/v1/events/purchase", { ...VALID_BODY, value: 49.99 }, AUTH);
    expect(res.status).toBe(400);
    expect(enqueued).toHaveLength(0);
  });

  it("400s when orderId or currency is missing/invalid", async () => {
    const res = await post(port, "/api/v1/events/purchase", { value: 100, currency: "us" }, AUTH);
    expect(res.status).toBe(400);
    expect(enqueued).toHaveLength(0);
  });

  it("is idempotent at enqueue level: same orderId yields a stable dedupe key", async () => {
    await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
    await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
    // Both enqueue with identical (org, orderId, sourceType); the ingest job
    // dedupes downstream on that key.
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0].data).toMatchObject({ orderId: "ORD-1", sourceType: "api" });
    expect(enqueued[1].data).toMatchObject({ orderId: "ORD-1", sourceType: "api" });
  });

  it("500s (not 202) if the enqueue throws", async () => {
    enqueueThrows = true;
    const res = await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
    expect(res.status).toBe(500);
  });

  it("429s once the per-key rate limit (default 120/window) is exceeded", async () => {
    let saw429 = false;
    let firstStatus = 0;
    for (let i = 0; i < 130; i++) {
      const r = await post(port, "/api/v1/events/purchase", VALID_BODY, AUTH);
      if (i === 0) firstStatus = r.status;
      if (r.status === 429) { saw429 = true; break; }
    }
    expect(firstStatus).toBe(202);
    expect(saw429).toBe(true);
  });
});
