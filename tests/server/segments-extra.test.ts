// Extra server-integration coverage for the Segment cloud functions, targeting
// the high-value gaps called out in docs/testing/segments.md §5 that the
// existing tests/server/segments.test.ts does NOT exercise:
//
//   DT-02  last_n_days compiles to an ABSOLUTE timestamp (eval/send agree)
//   PV-02  ad-hoc preview never writes a Segment row
//   PV-03  saved dynamic eval (non-preview) refreshes lastEvaluatedAt
//   PV-04  saved dynamic eval with preview:true skips the cache write
//   PV-05  evaluateSegment requires rules or id
//   SD-04  update dynamic→static snapshots + sets staticContacts
//   SD-05  update static→dynamic unsets staticContacts + recounts live
//   EM-01  empty conditions → org-scoped match (all contacts), no throw
//   SD-02  static count is FROZEN when a new matching contact is added
//   SD-03  dynamic count MOVES when a new matching contact is added
//
// SD-02/SD-03 mutate the dataset, so they sign up a SEPARATE org on the same
// server and assert only that org's (org-scoped) counts — keeping the shared
// fixture counts stable (per the doc's §6 guidance) without a second server.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// NOTE on ordering: the DT-02 compiler-unit cases live at the BOTTOM of this
// file on purpose. They `require("../../server/cloud/segments.js")` to reach the
// exported `compileRules`. Requiring that module runs its `Parse.Cloud.define`
// calls; if that happened before a Parse Server boots, the server's init would
// later wipe the cloud registry and the cached module would not re-define
// ("Invalid function"). By running the server-backed describes first (their
// beforeAll boots a server which loads the module through main.js with defines
// intact) and the unit cases last, the require is always a warm cache hit.

// ── shared-fixture cases (no dataset mutation that drifts shared counts) ────────
describe("segments-extra: preview cache + kind-switch + empty rules", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let session: string;

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: "seg-extra@example.com",
      password: "hunter2hunter2",
      company: "ExtraCo",
    })) as { sessionToken: string };
    session = r.sessionToken;

    const Contact = Parse.Object.extend("Contact");
    const make = async (attrs: Record<string, unknown>) => {
      const c = new Contact();
      Object.entries(attrs).forEach(([k, v]) => c.set(k, v));
      await c.save(null, { sessionToken: session });
      return c;
    };
    // 3 subscribed + 1 unsubscribed → 4 total in org.
    await make({ email: "a@gmail.com", status: "subscribed" });
    await make({ email: "b@gmail.com", status: "subscribed" });
    await make({ email: "c@gmail.com", status: "subscribed" });
    await make({ email: "d@yahoo.com", status: "unsubscribed" });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  const run = (name: string, params: Record<string, unknown>) =>
    Parse.Cloud.run(name, params, { sessionToken: session });

  it("PV-05: evaluateSegment requires either rules or id", async () => {
    await expect(run("evaluateSegment", {})).rejects.toMatchObject({});
  });

  it("EM-01: empty conditions matches the whole org (4) without throwing", async () => {
    const { count } = (await run("evaluateSegment", {
      rules: { op: "and", conditions: [] },
    })) as { count: number };
    expect(count).toBe(4);
  });

  it("PV-02: ad-hoc preview does not create or touch any Segment row", async () => {
    const before = (await run("listSegments", {})) as unknown[];
    await run("evaluateSegment", {
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
      preview: true,
    });
    const after = (await run("listSegments", {})) as unknown[];
    expect(after.length).toBe(before.length);
  });

  it("PV-03 / PV-04: non-preview eval refreshes lastEvaluatedAt; preview:true does not", async () => {
    const created = (await run("createSegment", {
      name: "Subs",
      kind: "dynamic",
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    })) as { id: string; lastEvaluatedAt: string };
    const t0 = new Date(created.lastEvaluatedAt).getTime();

    // preview:true → cache MUST NOT move.
    await run("evaluateSegment", { id: created.id, preview: true });
    const afterPreview = (await run("getSegment", { id: created.id })) as { lastEvaluatedAt: string };
    expect(new Date(afterPreview.lastEvaluatedAt).getTime()).toBe(t0);

    // Wait a tick so the timestamp is observably different, then non-preview eval.
    await new Promise((res) => setTimeout(res, 25));
    await run("evaluateSegment", { id: created.id });
    const afterReal = (await run("getSegment", { id: created.id })) as {
      lastEvaluatedAt: string;
      lastCount: number;
    };
    expect(new Date(afterReal.lastEvaluatedAt).getTime()).toBeGreaterThan(t0);
    expect(afterReal.lastCount).toBe(3);
  });

  it("SD-04: update dynamic→static snapshots matching ids into staticContacts", async () => {
    const created = (await run("createSegment", {
      name: "Switch to static",
      kind: "dynamic",
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    })) as { id: string; staticContacts: string[] };
    expect(created.staticContacts).toEqual([]); // dynamic has none

    const updated = (await run("updateSegment", { id: created.id, kind: "static" })) as {
      kind: string;
      staticContacts: string[];
      lastCount: number;
    };
    expect(updated.kind).toBe("static");
    expect(updated.staticContacts.length).toBe(3);
    expect(updated.lastCount).toBe(3);
  });

  it("SD-05: update static→dynamic unsets staticContacts and recounts live", async () => {
    const created = (await run("createSegment", {
      name: "Switch to dynamic",
      kind: "static",
      rules: { op: "and", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    })) as { id: string; staticContacts: string[] };
    expect(created.staticContacts.length).toBe(3);

    const updated = (await run("updateSegment", { id: created.id, kind: "dynamic" })) as {
      kind: string;
      staticContacts: string[];
      lastCount: number;
    };
    expect(updated.kind).toBe("dynamic");
    expect(updated.staticContacts).toEqual([]); // unset
    expect(updated.lastCount).toBe(3);
  });

  // ── SD-02 / SD-03: static-frozen vs dynamic-live divergence ──────────────────
  // This ADDS a contact mid-test. To keep the describe-level ExtraCo counts
  // (used by EM-01 etc. above) stable, it signs up a SEPARATE org (DivergeCo) on
  // the same server and creates/queries only that org's contacts — segment
  // counts are org-scoped, so the new contact can't drift the shared assertions.
  it("SD-02/SD-03: static stays frozen while dynamic moves after a new matching contact", async () => {
    const d = (await Parse.Cloud.run("signUpWithOrg", {
      username: "seg-diverge@example.com",
      password: "hunter2hunter2",
      company: "DivergeCo",
    })) as { sessionToken: string };
    const dSession = d.sessionToken;
    const dRun = (name: string, params: Record<string, unknown>) =>
      Parse.Cloud.run(name, params, { sessionToken: dSession });

    const Contact = Parse.Object.extend("Contact");
    const makeSub = async (email: string) => {
      const c = new Contact();
      c.set("email", email);
      c.set("status", "subscribed");
      await c.save(null, { sessionToken: dSession });
    };
    // Start with 2 subscribed contacts in DivergeCo.
    await makeSub("one@x.com");
    await makeSub("two@x.com");

    const rules = {
      op: "and",
      conditions: [{ field: "status", operator: "eq", value: "subscribed" }],
    };
    const staticSeg = (await dRun("createSegment", {
      name: "Static subs", kind: "static", rules,
    })) as { id: string; lastCount: number };
    const dynamicSeg = (await dRun("createSegment", {
      name: "Dynamic subs", kind: "dynamic", rules,
    })) as { id: string; lastCount: number };
    expect(staticSeg.lastCount).toBe(2);
    expect(dynamicSeg.lastCount).toBe(2);

    // Add a THIRD subscribed contact to DivergeCo.
    await makeSub("three@x.com");

    // SD-02: static eval ignores the newcomer — still the frozen snapshot of 2.
    const staticEval = (await dRun("evaluateSegment", { id: staticSeg.id })) as { count: number };
    expect(staticEval.count).toBe(2);

    // SD-03: dynamic eval reflects current data — now 3.
    const dynamicEval = (await dRun("evaluateSegment", { id: dynamicSeg.id })) as { count: number };
    expect(dynamicEval.count).toBe(3);
  });
});

// ── DT-02: last_n_days is absolute, asserted at the compiler unit level ─────────
// compileRules is exported from the cloud module; compiling with a fake org and
// inspecting query.toJSON() proves the operand is a fixed timestamp, not a
// relative "now" marker. No Parse Server needed for the assertion itself — see
// the ordering note at the top of this file for why this runs last.
describe("segments-extra: last_n_days determinism (DT-02)", () => {
  it("compiles last_n_days to an absolute gte timestamp (not a relative marker)", async () => {
    const { compileRules } = require("../../server/cloud/segments.js");
    const Parse = require("parse/node");
    const fakeOrg = new (Parse.Object.extend("Organization"))();
    fakeOrg.id = "org-fake";

    const before = Date.now();
    const q = compileRules(
      { op: "and", conditions: [{ field: "subscribedAt", operator: "last_n_days", value: 7 }] },
      fakeOrg,
    );
    const after = Date.now();

    const json = q.toJSON();
    const cmp = json.where.subscribedAt;
    expect(cmp).toBeTruthy();
    // The operand is a concrete Parse Date object, not a server-relative token.
    const gte = cmp.$gte;
    expect(gte).toBeTruthy();
    expect(gte.__type).toBe("Date");
    const operandMs = new Date(gte.iso).getTime();
    const expectedLow = before - 7 * 86400000 - 50;
    const expectedHigh = after - 7 * 86400000 + 50;
    expect(operandMs).toBeGreaterThanOrEqual(expectedLow);
    expect(operandMs).toBeLessThanOrEqual(expectedHigh);
  });

  it("two compiles of the same rule pin equal-ish absolute cutoffs (no drift across reuse)", async () => {
    const { compileRules } = require("../../server/cloud/segments.js");
    const Parse = require("parse/node");
    const fakeOrg = new (Parse.Object.extend("Organization"))();
    fakeOrg.id = "org-fake";
    const rule = { op: "and", conditions: [{ field: "subscribedAt", operator: "last_n_days", value: 30 }] };

    const a = compileRules(rule, fakeOrg).toJSON().where.subscribedAt.$gte.iso;
    const b = compileRules(rule, fakeOrg).toJSON().where.subscribedAt.$gte.iso;
    // Both are absolute ISO strings within a few ms of each other.
    expect(Math.abs(new Date(a).getTime() - new Date(b).getTime())).toBeLessThan(2000);
  });
});
