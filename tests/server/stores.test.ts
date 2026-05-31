import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import { createRequire } from "node:module";

// ---------------------------------------------------------------------------
// Unit tests for the StoreConnection cloud functions (server/cloud/stores.js).
//
// vi.mock("parse/node") proved unreliable under this repo's vitest setup (the
// real SDK still loaded), so instead we MONKEYPATCH the real parse/node
// singleton — the same object stores.js gets from its own require("parse/node").
// We:
//   - add Parse.Cloud.define to capture the registered handlers,
//   - swap Parse.Object / Parse.Query for in-memory fakes,
//   - stub the tenancy helpers stores.js imports.
// Then we require stores.js (CJS) so its define() calls land in our capture.
// ---------------------------------------------------------------------------
const require = createRequire(import.meta.url);

const db: { stores: any[] } = { stores: [] };
const cloudFns: Record<string, (req: any) => Promise<any>> = {};
let idSeq = 0;

class FakeObject {
  className: string;
  attrs: Record<string, any> = {};
  id: string | undefined;
  acl: any = null;
  constructor(className: string) {
    this.className = className;
  }
  static extend(className: string) {
    return class extends FakeObject {
      constructor() {
        super(className);
      }
    };
  }
  set(k: string, v: any) {
    this.attrs[k] = v;
  }
  get(k: string) {
    return this.attrs[k];
  }
  setACL(a: any) {
    this.acl = a;
  }
  async save() {
    if (!this.id) this.id = "id_" + ++idSeq;
    if (this.className === "StoreConnection" && !db.stores.includes(this)) {
      db.stores.push(this);
    }
    return this;
  }
  async destroy() {
    db.stores = db.stores.filter((s) => s !== this);
    return this;
  }
}

class FakeQuery {
  className: string;
  eqs: Record<string, any> = {};
  constructor(cls: any) {
    // Parse.Query may be constructed with a class name string or a subclass.
    this.className = typeof cls === "string" ? cls : new cls().className;
  }
  equalTo(k: string, v: any) {
    this.eqs[k] = v;
    return this;
  }
  descending() {
    return this;
  }
  limit() {
    return this;
  }
  _match(o: any) {
    return Object.keys(this.eqs).every((k) => {
      const want = this.eqs[k];
      const got = o.attrs[k];
      if (k === "organization") return (got && got.id) === (want && want.id);
      return got === want;
    });
  }
  async find() {
    return db.stores.filter((o) => this._match(o));
  }
  async get(id: string) {
    const found = db.stores.find((o) => o.id === id && this._match(o));
    if (!found) {
      const ParseErr: any = require("parse/node").Error;
      throw new ParseErr(101, "not found");
    }
    return found;
  }
}

class FakeACL {
  roles: Record<string, any> = {};
  setRoleReadAccess(r: string, v: boolean) {
    (this.roles[r] = this.roles[r] || {}).read = v;
  }
  setRoleWriteAccess(r: string, v: boolean) {
    (this.roles[r] = this.roles[r] || {}).write = v;
  }
  setPublicReadAccess() {}
  setPublicWriteAccess() {}
}

// Patch the real Parse singleton + the tenancy module in require's cache, then
// load stores.js — all share the same module registry via createRequire.
beforeAll(() => {
  const Parse: any = require("parse/node");
  Parse.Object = FakeObject;
  Parse.Query = FakeQuery as any;
  Parse.ACL = FakeACL as any;
  Parse.Cloud = Parse.Cloud || {};
  Parse.Cloud.define = (name: string, fn: any) => {
    cloudFns[name] = fn;
  };
  // Parse.Error already exists on the real SDK with the code constants we use.

  // Stub the tenancy helpers stores.js requires (resolve org from the test user).
  const tenancyPath = require.resolve("../../server/cloud/lib/tenancy");
  require.cache[tenancyPath] = {
    id: tenancyPath,
    filename: tenancyPath,
    loaded: true,
    exports: {
      getUserOrg: async (user: any) => user._org,
      orgRoleACL: (orgId: string) => ({ _aclForOrg: orgId }),
    },
  } as any;

  // Load the module under test — its define() calls populate cloudFns.
  require("../../server/cloud/stores");
});

function userInOrg(orgId: string) {
  return { id: "u_" + orgId, _org: { id: orgId } };
}

beforeEach(() => {
  db.stores = [];
  idSeq = 0;
});

describe("createStoreConnection", () => {
  it("creates a pending store with a generated secret + webhook URL, org-scoped + ACL set", async () => {
    const user = userInOrg("orgA");
    const res = await cloudFns.createStoreConnection({
      user,
      params: { provider: "shopify", shopDomain: "Demo.myshopify.com/" },
    });
    expect(res.provider).toBe("shopify");
    expect(res.shopDomain).toBe("demo.myshopify.com"); // normalized
    expect(res.status).toBe("pending");
    expect(res.webhookSecret).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
    expect(res.webhookUrl).toContain("/webhooks/shopify");
    expect(db.stores.length).toBe(1);
    expect(db.stores[0].attrs.organization.id).toBe("orgA");
    expect(db.stores[0].acl).toBeTruthy(); // ACL set explicitly
    expect(db.stores[0].attrs.webhookSecret).toBe(res.webhookSecret);
  });

  it("rejects an unknown provider", async () => {
    await expect(
      cloudFns.createStoreConnection({
        user: userInOrg("orgA"),
        params: { provider: "nope", shopDomain: "x.com" },
      }),
    ).rejects.toThrow();
    expect(db.stores.length).toBe(0);
  });

  it("rejects a missing shop domain", async () => {
    await expect(
      cloudFns.createStoreConnection({
        user: userInOrg("orgA"),
        params: { provider: "shopify", shopDomain: "" },
      }),
    ).rejects.toThrow();
  });

  it("requires an authenticated user", async () => {
    await expect(
      cloudFns.createStoreConnection({ params: { provider: "shopify", shopDomain: "x.com" } }),
    ).rejects.toThrow();
  });
});

describe("listStoreConnections (org isolation)", () => {
  it("returns only the caller's org stores and never exposes the secret", async () => {
    const userA = userInOrg("orgA");
    const userB = userInOrg("orgB");

    await cloudFns.createStoreConnection({
      user: userA,
      params: { provider: "shopify", shopDomain: "a.myshopify.com" },
    });
    await cloudFns.createStoreConnection({
      user: userB,
      params: { provider: "woocommerce", shopDomain: "b.example.com" },
    });

    const listA = await cloudFns.listStoreConnections({ user: userA });
    expect(listA.length).toBe(1);
    expect(listA[0].shopDomain).toBe("a.myshopify.com");
    expect(listA[0].webhookSecret).toBeUndefined();
    expect(listA[0].webhookUrl).toContain("/webhooks/shopify");

    const listB = await cloudFns.listStoreConnections({ user: userB });
    expect(listB.length).toBe(1);
    expect(listB[0].provider).toBe("woocommerce");
  });
});

describe("deleteStoreConnection (org isolation)", () => {
  it("deletes the caller's own store", async () => {
    const user = userInOrg("orgA");
    const created = await cloudFns.createStoreConnection({
      user,
      params: { provider: "shopify", shopDomain: "a.myshopify.com" },
    });
    const res = await cloudFns.deleteStoreConnection({ user, params: { id: created.id } });
    expect(res.deleted).toBe(true);
    expect(db.stores.length).toBe(0);
  });

  it("cannot delete another org's store (OBJECT_NOT_FOUND)", async () => {
    const userA = userInOrg("orgA");
    const userB = userInOrg("orgB");
    const created = await cloudFns.createStoreConnection({
      user: userA,
      params: { provider: "shopify", shopDomain: "a.myshopify.com" },
    });
    await expect(
      cloudFns.deleteStoreConnection({ user: userB, params: { id: created.id } }),
    ).rejects.toThrow();
    expect(db.stores.length).toBe(1); // still there
  });
});
