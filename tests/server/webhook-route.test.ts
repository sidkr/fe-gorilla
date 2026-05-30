// SES webhook ROUTE tests (Sending.md §6/§7; testing plan §3.10 WHK-1..10).
//
// The webhook-ingest *handler* is covered by webhookIngest.test.ts and the SNS
// signature *verify* by webhooksAuth.test.ts. This file covers the ROUTE WIRING
// in server/routes/webhooks.js over real HTTP:
//   - SubscriptionConfirmation → 200 + best-effort GET of SubscribeURL
//   - Notification → parse Message + enqueue WEBHOOK_INGEST + fast-ack 200
//   - malformed Message JSON → 200 (stop SNS retries), nothing enqueued
//   - real-mode bad auth → 403
//   - enqueue failure → still 200 (never a 5xx → no SNS retry storm)
//   - text/plain body parsing (express.json({type:"*/*"}))
//
// IMPORTANT: server/ is CommonJS loaded via createRequire, which vitest's
// vi.mock does NOT intercept. So we patch the two outbound seams the route
// captures at module-load time DIRECTLY, BEFORE requiring webhooks.js:
//   - lib/agendaInstance.getAgenda  (webhooks destructures it on require)
//   - https.get                     (webhooks keeps the module ref; mutate .get)
// No in-memory Parse is needed — this route never touches Parse.
import http from "node:http";
import { createRequire } from "node:module";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";

const require = createRequire(import.meta.url);

// ── enqueue seam state ────────────────────────────────────────────────────────
const enqueued: Array<{ name: string; data: any }> = [];
let agendaThrows = false;
const fakeAgenda = {
  now: async (name: string, data: any) => {
    enqueued.push({ name, data });
  },
};

// ── SubscribeURL GET seam state ───────────────────────────────────────────────
const subscribeUrlHits: string[] = [];
function fakeHttpsGet(url: any, cb?: any) {
  subscribeUrlHits.push(String(url));
  const res: any = {
    statusCode: 200,
    setEncoding() {},
    resume() {},
    on(ev: string, fn: any) {
      if (ev === "end") setTimeout(fn, 0);
      return res;
    },
  };
  if (typeof cb === "function") cb(res);
  const req: any = { on: () => req };
  return req;
}

// tiny http client that does NOT follow redirects.
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

const WEBHOOK_INGEST = require("../../server/lib/jobNames").WEBHOOK_INGEST;

function postSns(
  port: number,
  body: any,
  contentType = "text/plain; charset=UTF-8",
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  return hit(port, "POST", "/api/webhooks/ses", {
    headers: { "content-type": contentType, "content-length": String(Buffer.byteLength(raw)) },
    body: raw,
  });
}

function sesEvent() {
  return {
    eventType: "Delivery",
    mail: { messageId: "ses-msg-1", timestamp: "2026-05-29T00:00:00.000Z" },
    delivery: { timestamp: "2026-05-29T00:00:01.000Z" },
  };
}

describe("POST /api/webhooks/ses (route wiring)", () => {
  let server: http.Server;
  let port: number;
  const ORIG_MODE = process.env.AWS_SES_MODE;
  let origHttpsGet: any;

  beforeAll(async () => {
    // Patch agendaInstance.getAgenda BEFORE webhooks.js requires/destructures it.
    const agendaMod = require("../../server/lib/agendaInstance");
    agendaMod.getAgenda = async () => {
      if (agendaThrows) throw new Error("agenda connect failed");
      return fakeAgenda;
    };

    // Patch https.get (webhooks keeps the module ref and calls https.get(...)).
    const https = require("https");
    origHttpsGet = https.get;
    https.get = fakeHttpsGet;

    const app = express();
    require("../../server/routes/webhooks").mount(app);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address();
    if (!addr || typeof addr === "string") throw new Error("no port");
    port = addr.port;
  });

  afterAll(async () => {
    process.env.AWS_SES_MODE = ORIG_MODE;
    if (origHttpsGet) require("https").get = origHttpsGet;
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  });

  afterEach(() => {
    enqueued.length = 0;
    subscribeUrlHits.length = 0;
    agendaThrows = false;
    process.env.AWS_SES_MODE = ORIG_MODE;
  });

  // ── SubscriptionConfirmation handshake ───────────────────────────────────── WHK-1
  it("confirms a SubscriptionConfirmation: 200 + best-effort GET of SubscribeURL", async () => {
    process.env.AWS_SES_MODE = "mock";
    const subscribeUrl = "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=xyz";
    const res = await postSns(port, {
      Type: "SubscriptionConfirmation",
      MessageId: "sub-1",
      TopicArn: "arn:aws:sns:us-east-1:1:gorilla",
      SubscribeURL: subscribeUrl,
      Token: "tok",
      Message: "You have chosen to subscribe",
      Timestamp: "2026-05-29T00:00:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(subscribeUrlHits).toContain(subscribeUrl);
    // A subscription handshake must never be enqueued as an ingest job.
    expect(enqueued.length).toBe(0);
  });

  // ── Notification → enqueue ────────────────────────────────────────────────── WHK-2 / WHK-3 / WHK-10
  it("parses a Notification Message and enqueues WEBHOOK_INGEST with the parsed event", async () => {
    process.env.AWS_SES_MODE = "mock"; // trusts structurally-valid unsigned payloads
    const event = sesEvent();
    const res = await postSns(port, {
      Type: "Notification",
      MessageId: "n-1",
      TopicArn: "arn",
      Message: JSON.stringify(event),
      Timestamp: "2026-05-29T00:00:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(1);
    expect(enqueued[0].name).toBe(WEBHOOK_INGEST);
    expect(enqueued[0].data).toEqual({ event });
    expect(subscribeUrlHits.length).toBe(0);
  });

  it("parses a text/plain SNS body (express.json type:'*/*')", async () => {
    process.env.AWS_SES_MODE = "mock";
    const event = sesEvent();
    const res = await postSns(
      port,
      { Type: "Notification", MessageId: "n-tp", TopicArn: "arn", Message: JSON.stringify(event), Timestamp: "t" },
      "text/plain",
    );
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(1);
    expect(enqueued[0].data).toEqual({ event });
  });

  // ── malformed Message JSON → fast-ack 200, no enqueue ─────────────────────── WHK-7
  it("acks 200 on malformed Message JSON and enqueues nothing", async () => {
    process.env.AWS_SES_MODE = "mock";
    const res = await postSns(port, {
      Type: "Notification",
      MessageId: "n-bad",
      TopicArn: "arn",
      Message: "{not valid json",
      Timestamp: "t",
    });
    expect(res.status).toBe(200); // never 5xx — SNS must not retry-storm
    expect(enqueued.length).toBe(0);
  });

  // ── enqueue failure → still 200 (never 5xx) ───────────────────────────────── WHK-8
  it("acks 200 even when the enqueue (getAgenda/now) throws", async () => {
    process.env.AWS_SES_MODE = "mock";
    agendaThrows = true;
    const res = await postSns(port, {
      Type: "Notification",
      MessageId: "n-enqfail",
      TopicArn: "arn",
      Message: JSON.stringify(sesEvent()),
      Timestamp: "t",
    });
    expect(res.status).toBe(200); // fast-ack, no SNS retry storm
    expect(enqueued.length).toBe(0); // the enqueue blew up
  });

  // ── real-mode auth gate ───────────────────────────────────────────────────── WHK-4 / WHK-5
  it("real mode rejects a Notification with no Signature/SigningCertURL (403)", async () => {
    process.env.AWS_SES_MODE = "real";
    const res = await postSns(port, {
      Type: "Notification",
      MessageId: "n-real-unsigned",
      TopicArn: "arn",
      Message: JSON.stringify(sesEvent()),
      Timestamp: "t",
    });
    expect(res.status).toBe(403);
    expect(enqueued.length).toBe(0);
  });

  it("real mode rejects a SigningCertURL on a non-amazonaws host (403)", async () => {
    process.env.AWS_SES_MODE = "real";
    const res = await postSns(port, {
      Type: "Notification",
      MessageId: "n-real-evil",
      TopicArn: "arn",
      Message: JSON.stringify(sesEvent()),
      Timestamp: "t",
      SignatureVersion: "1",
      Signature: Buffer.from("x").toString("base64"),
      SigningCertURL: "https://evil.com/cert.pem",
    });
    expect(res.status).toBe(403);
    expect(enqueued.length).toBe(0);
  });

  it("real mode rejects a SubscriptionConfirmation it can't verify (403, no SubscribeURL GET)", async () => {
    process.env.AWS_SES_MODE = "real";
    const res = await postSns(port, {
      Type: "SubscriptionConfirmation",
      MessageId: "sub-real",
      TopicArn: "arn",
      SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription",
      Token: "tok",
      Message: "confirm",
      Timestamp: "t",
    });
    expect(res.status).toBe(403);
    // The unverified handshake must NOT trigger an outbound GET.
    expect(subscribeUrlHits.length).toBe(0);
  });

  // ── unknown Type → 200, no work ───────────────────────────────────────────── WHK-9
  it("acks 200 on an unknown SNS Type and does no work", async () => {
    process.env.AWS_SES_MODE = "mock";
    const res = await postSns(port, {
      Type: "Whatever",
      MessageId: "n-unknown",
      TopicArn: "arn",
      Message: JSON.stringify(sesEvent()),
      Timestamp: "t",
    });
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(0);
    expect(subscribeUrlHits.length).toBe(0);
  });
});
