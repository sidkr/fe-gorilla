// Integration tests for the Segment cloud functions against a real Parse Server
// + in-memory Mongo. Covers: rule DSL → query compilation (text/number/date/
// boolean operators), evaluateSegment counts (ad-hoc + saved), static vs dynamic
// kinds, list scoping, CRUD, and tenant isolation.
//
// Note (same as tenancy.test.ts): Parse.User.become() is blocked server-side.
// We act as a user by passing { sessionToken } to each save/query/cloud-run,
// which is exactly how a client session is scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

describe("segments", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  // A signed-up user/org we build a fixture dataset under.
  let session: string;
  let listId: string;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;

    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "seg-owner@example.com",
      password: "hunter2hunter2",
      company: "SegCo",
    })) as { sessionToken: string };
    session = r.sessionToken;

    // A List to scope some contacts to.
    const List = Parse.Object.extend("List");
    const list = new List();
    list.set("name", "Newsletter");
    await list.save(null, { sessionToken: session });
    listId = list.id;

    const Contact = Parse.Object.extend("Contact");

    // Helper to create a contact AS the user (org + ACL auto-stamped).
    const make = async (attrs: Record<string, unknown>, inList = false) => {
      const c = new Contact();
      Object.entries(attrs).forEach(([k, v]) => c.set(k, v));
      if (inList) c.set("lists", [list]);
      await c.save(null, { sessionToken: session });
      return c;
    };

    const now = Date.now();
    const day = 86400000;

    // gmail + subscribed + in list, recent signup, plan=pro, score=80, vip=true
    // Acme, NYC US, tags [vip, beta], tier=gold, renews_at recent
    await make(
      {
        email: "a@gmail.com",
        status: "subscribed",
        firstName: "Ann",
        company: "Acme",
        phone: "+1-555-0100",
        city: "New York",
        country: "US",
        timezone: "America/New_York",
        tags: ["vip", "beta"],
        subscribedAt: new Date(now - 2 * day),
        customFields: { plan: "pro", score: 80, vip: true, tier: "gold", renews_at: new Date(now - 3 * day).toISOString() },
      },
      true,
    );
    // gmail + subscribed, older signup, plan=free, score=10
    // Globex, London GB, tags [beta], tier=silver, renews_at old
    await make({
      email: "b@gmail.com",
      status: "subscribed",
      firstName: "Bob",
      company: "Globex",
      phone: "+44-20-0000",
      city: "London",
      country: "GB",
      timezone: "Europe/London",
      tags: ["beta"],
      subscribedAt: new Date(now - 100 * day),
      customFields: { plan: "free", score: 10, vip: false, tier: "silver", renews_at: new Date(now - 200 * day).toISOString() },
    });
    // yahoo + unsubscribed, no tags
    await make({
      email: "c@yahoo.com",
      status: "unsubscribed",
      firstName: "Cara",
      company: "Acme",
      city: "New York",
      country: "US",
      subscribedAt: new Date(now - 5 * day),
      customFields: { plan: "pro", score: 50, tier: "gold" },
    });
    // gmail + subscribed, no firstName, recent, tags [vip]
    await make(
      {
        email: "d@gmail.com",
        status: "subscribed",
        country: "US",
        tags: ["vip"],
        subscribedAt: new Date(now - 1 * day),
        customFields: { plan: "free", score: 95, vip: true, renews_at: new Date(now - 1 * day).toISOString() },
      },
      true,
    );

    // Register custom-field definitions so the registry resolves their types.
    // score=number, vip=boolean, plan=text, tier=enum, renews_at=date.
    const cf = (params: Record<string, unknown>) =>
      Parse.Cloud.run("createCustomField", params, { sessionToken: session });
    await cf({ label: "Plan", key: "plan", type: "text" });
    await cf({ label: "Score", key: "score", type: "number" });
    await cf({ label: "VIP", key: "vip", type: "boolean" });
    await cf({ label: "Tier", key: "tier", type: "enum", enumValues: ["gold", "silver", "bronze"] });
    await cf({ label: "Renews At", key: "renews_at", type: "date" });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  const run = (name: string, params: Record<string, unknown>) =>
    Parse.Cloud.run(name, params, { sessionToken: session });

  // ── compilation / evaluation ───────────────────────────────────────────────

  it("text: contains compiles + counts (3 gmail addresses)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "email", operator: "contains", value: "@gmail.com" }],
      },
    })) as { count: number };
    expect(count).toBe(3);
  });

  it("text: eq on status (3 subscribed)", async () => {
    const { count, sample } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "status", operator: "eq", value: "subscribed" }],
      },
    })) as { count: number; sample: unknown[] };
    expect(count).toBe(3);
    expect(sample.length).toBeGreaterThan(0);
  });

  it("text: is_empty on firstName (1 contact has no firstName)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "firstName", operator: "is_empty" }],
      },
    })) as { count: number };
    expect(count).toBe(1);
  });

  it("AND of two conditions narrows (gmail AND subscribed = 3)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [
          { field: "email", operator: "contains", value: "@gmail.com" },
          { field: "status", operator: "eq", value: "subscribed" },
        ],
      },
    })) as { count: number };
    expect(count).toBe(3);
  });

  it("OR widens (yahoo OR unsubscribed = 1)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "or",
        conditions: [
          { field: "email", operator: "ends_with", value: "@yahoo.com" },
          { field: "status", operator: "eq", value: "unsubscribed" },
        ],
      },
    })) as { count: number };
    expect(count).toBe(1);
  });

  it("number: gte on customFields.score (>=80 → 2)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "customFields.score", operator: "gte", value: 80 }],
      },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("number: in on customFields.score", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "customFields.score", operator: "in", value: [10, 50] }],
      },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("boolean: eq on customFields.vip (true → 2)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "customFields.vip", operator: "eq", value: true }],
      },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("date: last_n_days compiles to absolute gte (signed up in last 7d → 3)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "subscribedAt", operator: "last_n_days", value: 7 }],
      },
    })) as { count: number };
    expect(count).toBe(3);
  });

  it("date: after (signed up after 50 days ago → 3)", async () => {
    const cutoff = new Date(Date.now() - 50 * 86400000).toISOString();
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [{ field: "subscribedAt", operator: "after", value: cutoff }],
      },
    })) as { count: number };
    expect(count).toBe(3);
  });

  // ── new std fields ──────────────────────────────────────────────────────────

  it("std text: eq on company (Acme → 2)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "company", operator: "eq", value: "Acme" }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("std text: eq on country (US → 3)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "country", operator: "eq", value: "US" }] },
    })) as { count: number };
    expect(count).toBe(3);
  });

  it("std text: contains on city + starts_with on timezone", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [
          { field: "city", operator: "contains", value: "York" },
          { field: "timezone", operator: "starts_with", value: "America/" },
        ],
      },
    })) as { count: number };
    expect(count).toBe(1); // only Ann (NYC + America/New_York)
  });

  it("std text: is_not_empty on phone (2 have a phone)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "phone", operator: "is_not_empty" }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  // ── tags (Array membership) ───────────────────────────────────────────────--

  it("tags: contains 'vip' → 2 (Ann, d@)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "tags", operator: "contains", value: "vip" }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("tags: contains 'beta' → 2 (Ann, Bob)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "tags", operator: "contains", value: "beta" }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("tags: contains vip AND beta → 1 (Ann only)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [
          { field: "tags", operator: "contains", value: "vip" },
          { field: "tags", operator: "contains", value: "beta" },
        ],
      },
    })) as { count: number };
    expect(count).toBe(1);
  });

  it("tags: not_contains 'vip' (subscribed only) → Bob is the subscribed non-vip", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: {
        op: "and",
        conditions: [
          { field: "tags", operator: "not_contains", value: "vip" },
          { field: "status", operator: "eq", value: "subscribed" },
        ],
      },
    })) as { count: number };
    expect(count).toBe(1); // Bob (beta only); Cara is unsubscribed and untagged
  });

  it("tags: is_empty → 1 (Cara has no tags)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "tags", operator: "is_empty" }] },
    })) as { count: number };
    expect(count).toBe(1);
  });

  // ── registry-validated custom fields ──────────────────────────────────────--

  it("enum custom field: tier eq gold → 2 (Ann, Cara)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "customFields.tier", operator: "eq", value: "gold" }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("enum custom field: tier in [gold, silver] → 3", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "customFields.tier", operator: "in", value: ["gold", "silver"] }] },
    })) as { count: number };
    expect(count).toBe(3);
  });

  it("date custom field: renews_at last_n_days 7 → 2 (Ann, d@)", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "customFields.renews_at", operator: "last_n_days", value: 7 }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("date custom field: renews_at after 50 days ago → 2", async () => {
    const cutoff = new Date(Date.now() - 50 * 86400000).toISOString();
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "customFields.renews_at", operator: "after", value: cutoff }] },
    })) as { count: number };
    expect(count).toBe(2);
  });

  it("rejects a custom field not in the registry", async () => {
    await expect(
      run("evaluateSegment", {
        rules: { op: "and", conditions: [{ field: "customFields.bogus", operator: "eq", value: "x" }] },
      }),
    ).rejects.toMatchObject({});
  });

  it("rejects an operator not valid for the field's registry type (gt on enum)", async () => {
    await expect(
      run("evaluateSegment", {
        rules: { op: "and", conditions: [{ field: "customFields.tier", operator: "gt", value: 1 }] },
      }),
    ).rejects.toMatchObject({});
  });

  it("createSegment persists a tags + custom-field rule and caches its count", async () => {
    const seg = (await run("createSegment", {
      name: "VIP gold",
      kind: "dynamic",
      rules: {
        op: "and",
        conditions: [
          { field: "tags", operator: "contains", value: "vip" },
          { field: "customFields.tier", operator: "eq", value: "gold" },
        ],
      },
    })) as { id: string; lastCount: number };
    expect(seg.lastCount).toBe(1); // only Ann is vip-tagged + gold
  });

  it("rejects a disallowed field", async () => {
    await expect(
      run("evaluateSegment", {
        rules: { op: "and", conditions: [{ field: "password", operator: "eq", value: "x" }] },
      }),
    ).rejects.toMatchObject({});
  });

  it("rejects an operator that doesn't match the field type", async () => {
    await expect(
      run("evaluateSegment", {
        rules: { op: "and", conditions: [{ field: "email", operator: "gt", value: 1 }] },
      }),
    ).rejects.toMatchObject({});
  });

  // ── CRUD ────────────────────────────────────────────────────────────────────

  it("createSegment (dynamic) persists rules + caches a count", async () => {
    const seg = (await run("createSegment", {
      name: "Gmail subscribers",
      kind: "dynamic",
      rules: {
        op: "and",
        conditions: [
          { field: "email", operator: "contains", value: "@gmail.com" },
          { field: "status", operator: "eq", value: "subscribed" },
        ],
      },
    })) as { id: string; kind: string; lastCount: number; rules: unknown };
    expect(seg.id).toBeTruthy();
    expect(seg.kind).toBe("dynamic");
    expect(seg.lastCount).toBe(3);
    expect(seg.rules).toBeTruthy();
  });

  it("createSegment (static) snapshots matching contact ids", async () => {
    const seg = (await run("createSegment", {
      name: "VIP snapshot",
      kind: "static",
      rules: {
        op: "and",
        conditions: [{ field: "customFields.vip", operator: "eq", value: true }],
      },
    })) as { id: string; kind: string; staticContacts: string[]; lastCount: number };
    expect(seg.kind).toBe("static");
    expect(seg.staticContacts.length).toBe(2);
    expect(seg.lastCount).toBe(2);

    // Evaluating a saved static segment returns the snapshot count.
    const evalRes = (await run("evaluateSegment", { id: seg.id })) as {
      count: number;
      sample: unknown[];
    };
    expect(evalRes.count).toBe(2);
    expect(evalRes.sample.length).toBe(2);
  });

  it("createSegment scoped to a list only counts members of that list", async () => {
    const seg = (await run("createSegment", {
      name: "Newsletter gmail",
      kind: "dynamic",
      list: listId,
      rules: {
        op: "and",
        conditions: [{ field: "email", operator: "contains", value: "@gmail.com" }],
      },
    })) as { id: string; lastCount: number; list: string | null };
    expect(seg.list).toBe(listId);
    // Only 2 gmail contacts are in the Newsletter list (a@ and d@).
    expect(seg.lastCount).toBe(2);

    const evalRes = (await run("evaluateSegment", { id: seg.id })) as { count: number };
    expect(evalRes.count).toBe(2);
  });

  it("listSegments returns the org's segments", async () => {
    const segs = (await run("listSegments", {})) as Array<{ id: string; name: string }>;
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(segs.every((s) => s.id && s.name)).toBe(true);
  });

  it("getSegment returns a single segment with its rules", async () => {
    const created = (await run("createSegment", {
      name: "Fetch me",
      kind: "dynamic",
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    })) as { id: string };
    const got = (await run("getSegment", { id: created.id })) as {
      id: string;
      name: string;
      rules: { conditions: unknown[] };
    };
    expect(got.id).toBe(created.id);
    expect(got.name).toBe("Fetch me");
    expect(got.rules.conditions.length).toBe(1);
  });

  it("updateSegment recompiles the count", async () => {
    const created = (await run("createSegment", {
      name: "To update",
      kind: "dynamic",
      rules: {
        op: "and",
        conditions: [{ field: "status", operator: "eq", value: "subscribed" }],
      },
    })) as { id: string; lastCount: number };
    expect(created.lastCount).toBe(3);

    const updated = (await run("updateSegment", {
      id: created.id,
      rules: {
        op: "and",
        conditions: [{ field: "status", operator: "eq", value: "unsubscribed" }],
      },
    })) as { lastCount: number };
    expect(updated.lastCount).toBe(1);
  });

  it("deleteSegment removes it", async () => {
    const created = (await run("createSegment", {
      name: "To delete",
      kind: "dynamic",
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    })) as { id: string };
    const res = (await run("deleteSegment", { id: created.id })) as { ok: boolean };
    expect(res.ok).toBe(true);
    await expect(
      Parse.Cloud.run("evaluateSegment", { id: created.id }, { sessionToken: session }),
    ).rejects.toMatchObject({});
  });

  // ── tenant isolation ──────────────────────────────────────────────────────

  it("a different org cannot evaluate / sees zero contacts", async () => {
    const other = (await Parse.Cloud.run("signUpWithOrg", {
      username: "seg-other@example.com",
      password: "hunter2hunter2",
      company: "OtherCo",
    })) as { sessionToken: string };

    // OtherCo evaluates the same gmail rule — zero, because no contacts in its org.
    const { count } = (await Parse.Cloud.run(
      "evaluateSegment",
      {
        rules: {
          op: "and",
          conditions: [{ field: "email", operator: "contains", value: "@gmail.com" }],
        },
      },
      { sessionToken: other.sessionToken },
    )) as { count: number };
    expect(count).toBe(0);

    // OtherCo's listSegments does not see SegCo's segments.
    const segs = (await Parse.Cloud.run("listSegments", {}, {
      sessionToken: other.sessionToken,
    })) as unknown[];
    expect(segs.length).toBe(0);
  });
});
