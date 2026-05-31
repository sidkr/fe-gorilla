import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import crypto from "crypto";
import express from "express";
import type { Server } from "http";
import { createRequire } from "node:module";

// ---------------------------------------------------------------------------
// Boots a REAL express app with the ecommerce webhook routes mounted and drives
// it over HTTP, so the raw-body base64 HMAC path runs end to end.
//
// vi.mock("parse/node") proved unreliable here (the real SDK still loaded), so
// we MONKEYPATCH the real parse/node singleton's Parse.Query with an in-memory
// fake, and stub the agenda instance via the require cache — both the route and
// this test share the same CJS module registry through createRequire.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

const db: { stores: any[] } = { stores: [] };
const enqueued: { name: string; data: any }[] = [];

function seedStore(provider: string, shopDomain: string, secret: string, org: any = { id: "org1" }) {
  const store = {
    id: "store_" + provider + "_" + shopDomain,
    attrs: {
      provider,
      shopDomain,
      webhookSecret: secret,
      organization: org,
      status: "pending",
    } as Record<string, any>,
    get(k: string) {
      return this.attrs[k];
    },
    set(k: string, v: any) {
      this.attrs[k] = v;
    },
    async save() {
      return this;
    },
  };
  db.stores.push(store);
  return store;
}

class FakeQuery {
  eqs: Record<string, any> = {};
  constructor(_cls: any) {}
  equalTo(k: string, v: any) {
    this.eqs[k] = v;
    return this;
  }
  async first() {
    return (
      db.stores.find((s) =>
        Object.keys(this.eqs).every((k) => s.attrs[k] === this.eqs[k]),
      ) || null
    );
  }
}

let mount: (app: any) => void;
let toMinorUnits: (amount: any) => number;

let server: Server;
let baseUrl = "";

beforeAll(() => {
  // Patch the real Parse singleton's Query with our in-memory fake.
  const Parse: any = require("parse/node");
  Parse.Query = FakeQuery as any;

  // Stub the shared agenda instance so enqueues are captured, not run.
  const agendaPath = require.resolve("../../server/lib/agendaInstance");
  require.cache[agendaPath] = {
    id: agendaPath,
    filename: agendaPath,
    loaded: true,
    exports: {
      getAgenda: async () => ({
        now: async (name: string, data: any) => {
          enqueued.push({ name, data });
        },
      }),
    },
  } as any;

  // Load the route AFTER patching so it binds to the patched Parse + agenda.
  const mod = require("../../server/routes/ecommerceWebhooks");
  mount = mod.mount;
  toMinorUnits = mod.toMinorUnits;
});

beforeEach(async () => {
  db.stores = [];
  enqueued.length = 0;

  const app = express();
  mount(app);
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function hmac(rawBody: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

// `connection: "close"` keeps each test hermetic: every test uses a fresh server
// on a new port and closes it in afterEach; undici keep-alive would otherwise
// pool a socket to an already-closed server and cross requests between tests.
async function postShopify(body: object, headers: Record<string, string>) {
  const raw = JSON.stringify(body);
  return fetch(`${baseUrl}/webhooks/shopify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", connection: "close", ...headers },
    body: raw,
  });
}

async function postWoo(body: object, headers: Record<string, string>) {
  const raw = JSON.stringify(body);
  return fetch(`${baseUrl}/webhooks/woocommerce`, {
    method: "POST",
    headers: { "Content-Type": "application/json", connection: "close", ...headers },
    body: raw,
  });
}

// ---------------------------------------------------------------------------

describe("toMinorUnits", () => {
  it("converts decimal strings to integer minor units", () => {
    expect(toMinorUnits("49.95")).toBe(4995);
    expect(toMinorUnits("100")).toBe(10000);
    expect(toMinorUnits("0.01")).toBe(1);
    expect(toMinorUnits("")).toBe(0);
    expect(toMinorUnits(undefined)).toBe(0);
  });
});

describe("Shopify webhook", () => {
  const SECRET = "shh-secret";
  const DOMAIN = "demo.myshopify.com";

  it("valid HMAC -> enqueues a Conversion with correct minor-units revenue + sourceType", async () => {
    seedStore("shopify", DOMAIN, SECRET);
    const order = {
      id: 1001,
      email: "Buyer@Example.com",
      total_price: "49.95",
      currency: "USD",
      created_at: "2026-05-01T00:00:00Z",
      line_items: [{ quantity: 2 }, { quantity: 1 }],
    };
    const res = await postShopify(order, {
      "X-Shopify-Shop-Domain": DOMAIN,
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-SHA256": hmac(JSON.stringify(order), SECRET),
    });
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(1);
    const { name, data } = enqueued[0];
    expect(name).toBe("ingest-conversion");
    expect(data.sourceType).toBe("shopify");
    expect(data.revenue).toBe(4995);
    expect(data.orderId).toBe("1001");
    expect(data.email).toBe("buyer@example.com");
    expect(data.itemCount).toBe(3);
    expect(data.currency).toBe("USD");
    expect(data.org).toEqual({ id: "org1" });
  });

  it("bad HMAC -> 401 and nothing enqueued", async () => {
    seedStore("shopify", DOMAIN, SECRET);
    const order = { id: 5, total_price: "10.00", currency: "USD", line_items: [] };
    const res = await postShopify(order, {
      "X-Shopify-Shop-Domain": DOMAIN,
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-SHA256": "deadbeefnotvalid",
    });
    expect(res.status).toBe(401);
    expect(enqueued.length).toBe(0);
  });

  it("unknown shop -> 404 and nothing enqueued (even with a valid-looking header)", async () => {
    const order = { id: 7, total_price: "10.00", currency: "USD", line_items: [] };
    const res = await postShopify(order, {
      "X-Shopify-Shop-Domain": "ghost.myshopify.com",
      "X-Shopify-Topic": "orders/create",
      "X-Shopify-Hmac-SHA256": hmac(JSON.stringify(order), "whatever"),
    });
    expect(res.status).toBe(404);
    expect(enqueued.length).toBe(0);
  });

  it("refund -> negative revenue Conversion with a distinct orderId", async () => {
    seedStore("shopify", DOMAIN, SECRET);
    const refund = {
      id: 999,
      order_id: 1001,
      currency: "USD",
      created_at: "2026-05-02T00:00:00Z",
      transactions: [{ amount: "20.00" }],
      refund_line_items: [{ quantity: 1, subtotal: "20.00" }],
    };
    const res = await postShopify(refund, {
      "X-Shopify-Shop-Domain": DOMAIN,
      "X-Shopify-Topic": "refunds/create",
      "X-Shopify-Hmac-SHA256": hmac(JSON.stringify(refund), SECRET),
    });
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(1);
    const { data } = enqueued[0];
    expect(data.revenue).toBe(-2000);
    expect(data.orderId).toContain("1001:refund");
    expect(data.orderId).not.toBe("1001");
    expect(data.sourceType).toBe("shopify");
  });

  it("idempotent double-delivery: same refund -> identical distinct orderId both times", async () => {
    seedStore("shopify", DOMAIN, SECRET);
    const refund = {
      id: 999,
      order_id: 1001,
      currency: "USD",
      transactions: [{ amount: "20.00" }],
    };
    const hdrs = {
      "X-Shopify-Shop-Domain": DOMAIN,
      "X-Shopify-Topic": "refunds/create",
      "X-Shopify-Hmac-SHA256": hmac(JSON.stringify(refund), SECRET),
    };
    await postShopify(refund, hdrs);
    await postShopify(refund, hdrs);
    expect(enqueued.length).toBe(2);
    // Deterministic orderId -> ingest-conversion dedupes downstream.
    expect(enqueued[0].data.orderId).toBe(enqueued[1].data.orderId);
  });
});

describe("WooCommerce webhook", () => {
  const SECRET = "woo-secret";
  const DOMAIN = "shop.example.com";

  it("valid signature -> enqueues a woocommerce Conversion", async () => {
    seedStore("woocommerce", DOMAIN, SECRET);
    const order = {
      id: 42,
      total: "120.50",
      currency: "EUR",
      status: "processing",
      billing: { email: "Woo@Example.com" },
      line_items: [{ quantity: 3 }],
      date_created: "2026-05-03T00:00:00Z",
    };
    const res = await postWoo(order, {
      "X-WC-Webhook-Source": DOMAIN,
      "X-WC-Webhook-Signature": hmac(JSON.stringify(order), SECRET),
    });
    expect(res.status).toBe(200);
    expect(enqueued.length).toBe(1);
    const { data } = enqueued[0];
    expect(data.sourceType).toBe("woocommerce");
    expect(data.revenue).toBe(12050);
    expect(data.currency).toBe("EUR");
    expect(data.orderId).toBe("42");
    expect(data.email).toBe("woo@example.com");
    expect(data.itemCount).toBe(3);
  });

  it("bad signature -> 401, nothing enqueued", async () => {
    seedStore("woocommerce", DOMAIN, SECRET);
    const order = { id: 1, total: "1.00", currency: "EUR", line_items: [] };
    const res = await postWoo(order, {
      "X-WC-Webhook-Source": DOMAIN,
      "X-WC-Webhook-Signature": "wrong",
    });
    expect(res.status).toBe(401);
    expect(enqueued.length).toBe(0);
  });

  it("refunded order -> negative revenue with a :refund orderId", async () => {
    seedStore("woocommerce", DOMAIN, SECRET);
    const order = {
      id: 77,
      total: "50.00",
      currency: "EUR",
      status: "refunded",
      billing: { email: "woo@example.com" },
      line_items: [{ quantity: 1 }],
      refunds: [{ total: "-50.00" }],
    };
    const res = await postWoo(order, {
      "X-WC-Webhook-Source": DOMAIN,
      "X-WC-Webhook-Signature": hmac(JSON.stringify(order), SECRET),
    });
    expect(res.status).toBe(200);
    const { data } = enqueued[0];
    expect(data.revenue).toBeLessThan(0);
    expect(data.orderId).toBe("77:refund");
  });
});
