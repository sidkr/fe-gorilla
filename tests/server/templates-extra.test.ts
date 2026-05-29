// Additional integration + data-integrity tests for the Templates feature,
// beyond tests/server/templates.test.ts. Covers the doc's high-value gaps:
//
//   • Seeding: exact library size, upsert RECONCILIATION (edit a system body in
//     the DB → reseed reverts it) with identity preserved, single-flight gate,
//     lazy/boot seed, global+public-read ACL.            (TPL-S01,S03,S04,S05,S06,S07)
//   • Category data-file integrity (pure, no Parse): 49 defs, per-file counts,
//     globally-unique seedKeys, valid blocks, footer-last-exactly-once, metadata,
//     per-type prop contracts.                            (TPL-D01–D07)
//   • listTemplates: Basics-first / Blank-leading / CAT_ORDER, body blocks for
//     preview, system dedup by seedKey, org newest-first.  (TPL-L02,L03,L04,L05,L06)
//   • useTemplate: fresh deep-cloned ids, copied subject/preheader + name, Blank
//     → footer-only, error paths, fork-own-org-template.   (TPL-U02,U03,U04,U05,U06)
//   • saveAsTemplate: fresh ids, name required/trim/max-length, missing
//     campaignId, cross-tenant campaign read.              (TPL-A02–A07)
//   • deleteTemplate: missing id, cross-tenant.            (TPL-X03,X04)
//   • Tenant isolation: any tenant can fork a system template.   (TPL-T04)
//
// As elsewhere, Parse.User.become() is blocked — act as a user by passing
// { sessionToken } to every Cloud.run / Query; use { useMasterKey: true } only
// for setup/assertions that must bypass ACLs.
import { createRequire } from "node:module";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

const requireCjs = createRequire(import.meta.url);

// templates.js calls Parse.Cloud.define at module load. That function only
// exists once the Parse Server has wired Parse.Cloud onto the shared SDK
// instance. If we required templates.js at the TOP of this file (before the
// server boots) we would (a) hit the no-op stub and, worse, (b) poison the
// module cache so the Parse Server's own `require("./templates")` returns our
// stubbed copy and never registers the cloud functions. So we require it
// LAZILY in beforeAll, AFTER startTestParseServer has booted — at which point
// the cached, properly-registered module is returned.
type TemplatesModule = {
  SYSTEM_TEMPLATES: Array<{
    seedKey: string;
    name: string;
    category: string;
    subject: string | null;
    previewText: string | null;
    body: () => { version: number; blocks: any[] };
  }>;
  seedSystemTemplatesOnce: () => Promise<{ seeded: number; updated: number; total: number }>;
};
let SYSTEM_TEMPLATES: TemplatesModule["SYSTEM_TEMPLATES"];
let seedSystemTemplatesOnce: TemplatesModule["seedSystemTemplatesOnce"];

// The system library GROWS as packs are added (started at 49; "*-pack" category
// files extend it). So — like the existing templates.test.ts — we assert the
// invariants against the LIVE library size (`EXPECTED_TOTAL`, captured in
// beforeAll from SYSTEM_TEMPLATES.length) rather than a frozen magic number. The
// 6 original starter keys must always remain present.
let EXPECTED_TOTAL = 0;
const STARTER_KEYS = [
  "system/basic",
  "system/blank",
  "system/newsletter",
  "system/plain-text",
  "system/product-announcement",
  "system/welcome",
];
const BLOCK_TYPES = new Set([
  "heading",
  "paragraph",
  "image",
  "button",
  "divider",
  "spacer",
  "footer",
]);
// CAT_ORDER mirrors listTemplates' ordering in server/cloud/templates.js. We
// allow extra trailing categories (packs may introduce new ones) — any category
// NOT in this list ranks after all listed ones, so the non-decreasing-rank check
// in TPL-L03 still holds as long as listed categories keep their relative order.
const CAT_ORDER = [
  "Basics",
  "Newsletters",
  "Announcements",
  "Product launches",
  "Welcome & onboarding",
  "Promotions & sales",
  "Events & webinars",
  "E-commerce",
  "Re-engagement & surveys",
  "Seasonal & holiday",
];
// Known categories are derived from the live library in beforeAll so new packs
// (e.g. "Transactional & notifications") don't make TPL-D06 stale.
let KNOWN_CATEGORIES = new Set<string>();

// One Parse Server for the whole file. We boot it in this outer beforeAll and
// only THEN require templates.js (see the lazy-require note above), so both the
// data-file suite and the server suite read the same properly-registered module.
let ctx: TestParseServer;
let Parse: TestParseServer["Parse"];

beforeAll(async () => {
  ctx = await startTestParseServer();
  Parse = ctx.Parse;
  // Now the Parse Server has loaded main.js → templates.js and registered the
  // cloud functions; require the (cached) module for its pure exports.
  const mod = requireCjs("../../server/cloud/templates.js") as TemplatesModule;
  SYSTEM_TEMPLATES = mod.SYSTEM_TEMPLATES;
  seedSystemTemplatesOnce = mod.seedSystemTemplatesOnce;
  EXPECTED_TOTAL = SYSTEM_TEMPLATES.length;
  KNOWN_CATEGORIES = new Set(SYSTEM_TEMPLATES.map((d) => d.category));
});

afterAll(async () => {
  if (ctx) await ctx.stop();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. Category data-file integrity — pure (reads SYSTEM_TEMPLATES export).
// ─────────────────────────────────────────────────────────────────────────────
describe("templates data-file integrity (pure)", () => {
  it("TPL-D01: SYSTEM_TEMPLATES is a non-empty array (≥ the 49-template baseline)", () => {
    expect(Array.isArray(SYSTEM_TEMPLATES)).toBe(true);
    // The library started at 49 and only grows as packs are added; assert the
    // floor so an accidental drop below the original library is still caught.
    expect(SYSTEM_TEMPLATES.length).toBeGreaterThanOrEqual(49);
    expect(SYSTEM_TEMPLATES.length).toBe(EXPECTED_TOTAL);
  });

  it("TPL-D02: the 6 original starters plus the original category files total 49", () => {
    // The 8 ORIGINAL per-category files (pre-pack) hold a stable 38 defs; with
    // the 6 starters that is the historical 49-template baseline. Pack files
    // (counted separately below) add to that. Validate the original counts
    // directly so a dropped def in a foundational file is caught.
    expect(requireCjs("../../server/cloud/templates/newsletters").length).toBe(5);
    expect(requireCjs("../../server/cloud/templates/product-launch").length).toBe(5);
    expect(requireCjs("../../server/cloud/templates/welcome-onboarding").length).toBe(5);
    expect(requireCjs("../../server/cloud/templates/promotions").length).toBe(6);
    expect(requireCjs("../../server/cloud/templates/events-webinars").length).toBe(5);
    expect(requireCjs("../../server/cloud/templates/ecommerce").length).toBe(6);
    expect(requireCjs("../../server/cloud/templates/reengagement").length).toBe(5);
    expect(requireCjs("../../server/cloud/templates/seasonal").length).toBe(6);
    const baseline = 6 + (5 + 5 + 5 + 6 + 5 + 6 + 5 + 6); // = 49
    expect(baseline).toBe(49);
    // Every original starter category is represented in the live library.
    const counts: Record<string, number> = {};
    for (const def of SYSTEM_TEMPLATES) counts[def.category] = (counts[def.category] || 0) + 1;
    expect(counts["Basics"]).toBeGreaterThanOrEqual(2); // basic + blank
    // The live library is the baseline plus any pack defs.
    expect(EXPECTED_TOTAL).toBeGreaterThanOrEqual(baseline);
  });

  it("TPL-D03: seedKeys are globally unique and include all 6 starter keys", () => {
    const keys = SYSTEM_TEMPLATES.map((d) => d.seedKey);
    const set = new Set(keys);
    expect(set.size).toBe(EXPECTED_TOTAL); // no duplicates
    for (const k of STARTER_KEYS) expect(set.has(k)).toBe(true);
  });

  it("TPL-D04: every def builds a valid Body with well-formed blocks", () => {
    for (const def of SYSTEM_TEMPLATES) {
      const b = def.body();
      expect(b).toBeTruthy();
      expect(b.version).toBe(1);
      expect(Array.isArray(b.blocks)).toBe(true);
      expect(b.blocks.length).toBeGreaterThan(0);
      for (const blk of b.blocks) {
        expect(typeof blk.id).toBe("string");
        expect(blk.id).toMatch(/^b_.{5}$/);
        expect(BLOCK_TYPES.has(blk.type)).toBe(true);
        expect(blk.props && typeof blk.props === "object").toBe(true);
      }
    }
  });

  it("TPL-D05: footer is the last block, present exactly once, with CAN-SPAM props", () => {
    for (const def of SYSTEM_TEMPLATES) {
      const blocks = def.body().blocks;
      const footers = blocks.filter((b: any) => b.type === "footer");
      expect(footers.length).toBe(1); // exactly one footer
      expect(blocks[blocks.length - 1].type).toBe("footer"); // and it is last
      const fp = footers[0].props;
      expect(typeof fp.businessAddress).toBe("string");
      expect(fp.businessAddress.length).toBeGreaterThan(0);
      expect(fp.showUnsubscribe).toBe(true);
      expect(fp.showWebVersion).toBe(true);
    }
  });

  it("TPL-D06: every def has required metadata", () => {
    for (const def of SYSTEM_TEMPLATES) {
      expect(typeof def.name).toBe("string");
      expect(def.name.trim().length).toBeGreaterThan(0);
      expect(def.seedKey.startsWith("system/")).toBe(true);
      expect(KNOWN_CATEGORIES.has(def.category)).toBe(true);
      expect(def.subject === null || typeof def.subject === "string").toBe(true);
      expect(def.previewText === null || typeof def.previewText === "string").toBe(true);
    }
  });

  it("TPL-D07: block prop contracts hold per type", () => {
    const isHex = (c: any) => typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c);
    const isAlign = (a: any) =>
      a === undefined || a === "left" || a === "center" || a === "right";
    for (const def of SYSTEM_TEMPLATES) {
      for (const blk of def.body().blocks) {
        const p = blk.props;
        switch (blk.type) {
          case "heading":
            expect([1, 2, 3]).toContain(Number(p.level));
            expect(isAlign(p.align)).toBe(true);
            expect(isHex(p.color)).toBe(true);
            expect(typeof p.text).toBe("string");
            break;
          case "paragraph":
            expect(isAlign(p.align)).toBe(true);
            expect(isHex(p.color)).toBe(true);
            expect(typeof p.html).toBe("string");
            break;
          case "image":
            expect(typeof p.src).toBe("string");
            expect(typeof p.width).toBe("number");
            expect(isAlign(p.align)).toBe(true);
            break;
          case "button":
            expect(typeof p.label).toBe("string");
            expect(typeof p.href).toBe("string");
            expect(isHex(p.bg)).toBe(true);
            expect(isHex(p.fg)).toBe(true);
            expect(typeof p.radius).toBe("number");
            break;
          case "divider":
            expect(isHex(p.color)).toBe(true);
            expect(typeof p.thickness).toBe("number");
            break;
          case "spacer":
            expect(typeof p.height).toBe("number");
            break;
          case "footer":
            // validated in TPL-D05
            break;
        }
      }
    }
  });

  it("TPL-D08: blockId-generated ids are unique within a generated body", () => {
    for (const def of SYSTEM_TEMPLATES) {
      const ids = def.body().blocks.map((b: any) => b.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Server integration — boots a real Parse Server + in-memory Mongo.
// ─────────────────────────────────────────────────────────────────────────────
describe("templates server (extra coverage)", () => {
  let owner: { sessionToken: string; userId: string; orgId: string };
  let other: { sessionToken: string; userId: string; orgId: string };

  const signUp = (params: Record<string, unknown>) =>
    Parse.Cloud.run("signUpWithOrg", params) as Promise<{
      sessionToken: string;
      userId: string;
      orgId: string;
    }>;

  const listAs = (sessionToken: string) =>
    Parse.Cloud.run("listTemplates", {}, { sessionToken }) as Promise<{
      system: Array<any>;
      org: Array<any>;
    }>;

  beforeAll(async () => {
    owner = await signUp({
      username: "tpl-extra-owner@example.com",
      password: "hunter2hunter2",
      company: "ExtraTemplateCo",
    });
    other = await signUp({
      username: "tpl-extra-other@example.com",
      password: "hunter2hunter2",
      company: "ExtraOtherCo",
    });
    // Ensure the library is seeded once up front.
    await Parse.Cloud.run("seedSystemTemplates", {});
  });

  // ── Seeding ────────────────────────────────────────────────────────────────
  it("TPL-S01/S02: seeds exactly 49 system rows; re-seed reports seeded:0/updated:49", async () => {
    const count = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
    expect(count).toBe(EXPECTED_TOTAL);

    const again = await Parse.Cloud.run("seedSystemTemplates", {});
    expect(again.seeded).toBe(0);
    expect(again.updated).toBe(EXPECTED_TOTAL); // every def reconciled
    expect(again.total).toBe(EXPECTED_TOTAL);
  });

  it("TPL-S07: every system row is global with a public-read, no-write ACL", async () => {
    // Ensure seeding has fully converged before counting (idempotent) so this
    // assertion doesn't depend on the boot-seed / prior-test timing.
    await Parse.Cloud.run("seedSystemTemplates", {});
    const rows = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .limit(1000)
      .find({ useMasterKey: true });
    expect(rows.length).toBe(EXPECTED_TOTAL);
    for (const t of rows) {
      expect(t.get("organization")).toBeFalsy();
      const acl = t.getACL()!;
      expect(acl.getPublicReadAccess()).toBe(true);
      expect(acl.getPublicWriteAccess()).toBe(false);
    }
  });

  it("TPL-S03/S04: upsert reverts an edited body and preserves row identity", async () => {
    const Template = Parse.Object.extend("Template");
    const before = await new Parse.Query(Template)
      .equalTo("seedKey", "system/newsletter")
      .equalTo("isSystem", true)
      .first({ useMasterKey: true });
    expect(before).toBeTruthy();

    const originalObjectId = before!.id;
    const originalCreatedAt = before!.createdAt!.getTime();
    const def = SYSTEM_TEMPLATES.find((d) => d.seedKey === "system/newsletter")!;
    const codeBlockTypes = def.body().blocks.map((b: any) => b.type);
    const codeName = def.name;
    const codeCategory = def.category;

    // Vandalise the persisted row: change name, category, subject, previewText,
    // and the body blocks.
    before!.set("name", "HACKED NAME");
    before!.set("category", "Basics");
    before!.set("subject", "hacked subject");
    before!.set("previewText", "hacked preview");
    before!.set("body", { version: 1, blocks: [{ id: "b_xxxxx", type: "footer", props: {} }] });
    await before!.save(null, { useMasterKey: true });

    // Re-seed reconciles from code.
    await Parse.Cloud.run("seedSystemTemplates", {});

    const after = await new Parse.Query(Template).get(originalObjectId, {
      useMasterKey: true,
    });
    // Identity preserved (upsert in place, not delete+create).
    expect(after.id).toBe(originalObjectId);
    expect(after.createdAt!.getTime()).toBe(originalCreatedAt);
    // Content reconciled back to the code definition.
    expect(after.get("name")).toBe(codeName);
    expect(after.get("category")).toBe(codeCategory);
    expect(after.get("subject")).toBe(def.subject);
    expect(after.get("previewText")).toBe(def.previewText);
    expect(after.get("body").blocks.map((b: any) => b.type)).toEqual(codeBlockTypes);
    // seedKey / isSystem / ACL unchanged.
    expect(after.get("seedKey")).toBe("system/newsletter");
    expect(after.get("isSystem")).toBe(true);
    expect(after.getACL()!.getPublicReadAccess()).toBe(true);
    expect(after.getACL()!.getPublicWriteAccess()).toBe(false);
    // Total unchanged.
    const total = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
    expect(total).toBe(EXPECTED_TOTAL);
  });

  it("TPL-S05: overlapping seedSystemTemplatesOnce calls converge with no dupes", async () => {
    // Fire three overlapping seeds (no await between) directly against the
    // module's single-flight gate, then a later one that re-checks the DB.
    const results = await Promise.all([
      seedSystemTemplatesOnce(),
      seedSystemTemplatesOnce(),
      seedSystemTemplatesOnce(),
    ]);
    for (const r of results) expect(r.total).toBe(EXPECTED_TOTAL);

    // No duplicate seedKeys persisted.
    const rows = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .limit(1000)
      .find({ useMasterKey: true });
    const keys = rows.map((t) => t.get("seedKey"));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(EXPECTED_TOTAL);

    // Gate cleared: a later seed re-checks the DB and finds nothing missing.
    const later = await seedSystemTemplatesOnce();
    expect(later.seeded).toBe(0);
    expect(later.total).toBe(EXPECTED_TOTAL);
  });

  // ── listTemplates ────────────────────────────────────────────────────────────
  it("TPL-L02: system payload carries body blocks + preview metadata", async () => {
    const { system } = await listAs(owner.sessionToken);
    expect(system.length).toBe(EXPECTED_TOTAL);
    for (const t of system) {
      expect(Array.isArray(t.body.blocks)).toBe(true);
      expect(t.body.blocks.length).toBeGreaterThan(0);
      expect(typeof t.name).toBe("string");
      expect(t.seedKey).toBeTruthy();
      expect(typeof t.category).toBe("string");
      // subject/previewText/thumbUrl are string-or-null.
      expect(t.subject === null || typeof t.subject === "string").toBe(true);
      expect(t.previewText === null || typeof t.previewText === "string").toBe(true);
      expect(t.thumbUrl === null || typeof t.thumbUrl === "string").toBe(true);
    }
  });

  it("TPL-L03: ordering — Blank leads, Basics first, then CAT_ORDER", async () => {
    const { system } = await listAs(owner.sessionToken);
    expect(system[0].seedKey).toBe("system/blank");

    // Every Basics template comes before any non-Basics one.
    const firstNonBasics = system.findIndex((t) => t.category !== "Basics");
    const lastBasics = system.reduce(
      (acc, t, i) => (t.category === "Basics" ? i : acc),
      -1,
    );
    expect(lastBasics).toBeLessThan(firstNonBasics);

    // The sequence of category ranks is non-decreasing (CAT_ORDER respected),
    // ignoring Blank which is force-pinned to the front of Basics. This mirrors
    // the cloud's rank(): a category not in CAT_ORDER (e.g. a new pack category)
    // ranks AFTER all listed ones — so listed categories keep their relative
    // order and any new ones trail.
    const rank = (c: string) => {
      const i = CAT_ORDER.indexOf(c);
      return i < 0 ? CAT_ORDER.length : i;
    };
    const ranks = system.map((t) => rank(t.category));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThanOrEqual(ranks[i - 1]);
    }
  });

  it("TPL-L04: system bucket dedups by seedKey when a duplicate row exists", async () => {
    // Force a duplicate row for an existing seedKey via master key.
    const Template = Parse.Object.extend("Template");
    const dup = new Template();
    dup.set("seedKey", "system/blank");
    dup.set("name", "Blank (dup)");
    dup.set("isSystem", true);
    dup.set("category", "Basics");
    dup.set("organization", null);
    dup.set("body", { version: 1, blocks: [{ id: "b_dup00", type: "footer", props: {} }] });
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(true);
    acl.setPublicWriteAccess(false);
    dup.setACL(acl);
    await dup.save(null, { useMasterKey: true });

    try {
      const { system } = await listAs(owner.sessionToken);
      // listTemplates dedups by seedKey → still one entry per key, length 49.
      const blanks = system.filter((t) => t.seedKey === "system/blank");
      expect(blanks.length).toBe(1);
      expect(system.length).toBe(EXPECTED_TOTAL);
    } finally {
      await dup.destroy({ useMasterKey: true });
    }
  });

  it("TPL-L05: org bucket lists only the caller's templates, newest first", async () => {
    // Create two org templates at distinct times.
    const list = await listAs(owner.sessionToken);
    const basic = list.system.find((t) => t.seedKey === "system/basic")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: basic.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };

    const first = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Org first" },
      { sessionToken: owner.sessionToken },
    )) as { id: string };
    await new Promise((r) => setTimeout(r, 20));
    const second = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Org second" },
      { sessionToken: owner.sessionToken },
    )) as { id: string };

    try {
      const { org } = await listAs(owner.sessionToken);
      expect(org.length).toBe(2);
      expect(org.every((t) => t.isSystem === false)).toBe(true);
      // Newest (second) first.
      expect(org[0].id).toBe(second.id);
      expect(org[1].id).toBe(first.id);
    } finally {
      await Parse.Cloud.run("deleteTemplate", { id: first.id }, { sessionToken: owner.sessionToken });
      await Parse.Cloud.run("deleteTemplate", { id: second.id }, { sessionToken: owner.sessionToken });
    }
  });

  // ── useTemplate ──────────────────────────────────────────────────────────────
  it("TPL-U02: fork deep-clones — fresh ids and independent prop objects", async () => {
    const list = await listAs(owner.sessionToken);
    const news = list.system.find((t) => t.seedKey === "system/newsletter")!;
    const srcTpl = await new Parse.Query("Template").get(news.id, { useMasterKey: true });
    const srcBlocks = srcTpl.get("body").blocks;

    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: news.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };
    const campaign = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: owner.sessionToken,
    });
    const forked = campaign.get("body").blocks;

    const srcIds = new Set(srcBlocks.map((b: any) => b.id));
    expect(forked.every((b: any) => !srcIds.has(b.id))).toBe(true);
    expect(forked.map((b: any) => b.type)).toEqual(srcBlocks.map((b: any) => b.type));
    // Props deep-equal but are distinct object references.
    for (let i = 0; i < forked.length; i++) {
      expect(forked[i].props).toEqual(srcBlocks[i].props);
      expect(forked[i].props).not.toBe(srcBlocks[i].props);
    }
  });

  it("TPL-U03: fork copies subject/preheader and names the copy '<name> copy'", async () => {
    const list = await listAs(owner.sessionToken);
    const news = list.system.find((t) => t.seedKey === "system/newsletter")!;
    const tpl = await new Parse.Query("Template").get(news.id, { useMasterKey: true });

    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: news.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };
    const c = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: owner.sessionToken,
    });
    expect(c.get("name")).toBe(`${tpl.get("name")} copy`);
    expect(c.get("subject")).toBe(tpl.get("subject"));
    expect(c.get("preheader")).toBe(tpl.get("previewText"));
    expect(c.get("status")).toBe("draft");
    expect(c.get("fromName")).toBeFalsy();
    expect(c.get("audienceId")).toBeFalsy();
  });

  it("TPL-U04: forking Blank yields a footer-only draft", async () => {
    const list = await listAs(owner.sessionToken);
    const blank = list.system.find((t) => t.seedKey === "system/blank")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: blank.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };
    const c = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: owner.sessionToken,
    });
    const blocks = c.get("body").blocks;
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("footer");
  });

  it("TPL-U05: missing/unknown id rejected", async () => {
    await expect(
      Parse.Cloud.run("useTemplate", {}, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
    await expect(
      Parse.Cloud.run("useTemplate", { id: "doesNotExist" }, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  it("TPL-U06: a caller can fork their own org template", async () => {
    const list = await listAs(owner.sessionToken);
    const blank = list.system.find((t) => t.seedKey === "system/blank")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: blank.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };
    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Mine to reuse" },
      { sessionToken: owner.sessionToken },
    )) as { id: string };

    try {
      const fork = (await Parse.Cloud.run(
        "useTemplate",
        { id: tplId },
        { sessionToken: owner.sessionToken },
      )) as { campaignId: string };
      const c = await new Parse.Query("Campaign").get(fork.campaignId, {
        sessionToken: owner.sessionToken,
      });
      expect(c.get("body").blocks[c.get("body").blocks.length - 1].type).toBe("footer");
    } finally {
      await Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: owner.sessionToken });
    }
  });

  // ── saveAsTemplate ───────────────────────────────────────────────────────────
  async function ownerCampaignId(): Promise<string> {
    const list = await listAs(owner.sessionToken);
    const basic = list.system.find((t) => t.seedKey === "system/basic")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: basic.id },
      { sessionToken: owner.sessionToken },
    )) as { campaignId: string };
    return campaignId;
  }

  it("TPL-A02: saved template gets fresh ids, independent of the campaign", async () => {
    const campaignId = await ownerCampaignId();
    const campaign = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: owner.sessionToken,
    });
    const campIds = new Set(campaign.get("body").blocks.map((b: any) => b.id));

    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Independent layout" },
      { sessionToken: owner.sessionToken },
    )) as { id: string };
    try {
      const tpl = await new Parse.Query("Template").get(tplId, {
        sessionToken: owner.sessionToken,
      });
      const tplBlocks = tpl.get("body").blocks;
      expect(tplBlocks.every((b: any) => !campIds.has(b.id))).toBe(true);
      expect(tplBlocks.map((b: any) => b.type)).toEqual(
        campaign.get("body").blocks.map((b: any) => b.type),
      );
    } finally {
      await Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: owner.sessionToken });
    }
  });

  it("TPL-A03: name is required (blank/omitted rejected)", async () => {
    const campaignId = await ownerCampaignId();
    await expect(
      Parse.Cloud.run("saveAsTemplate", { campaignId, name: "  " }, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
    await expect(
      Parse.Cloud.run("saveAsTemplate", { campaignId }, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("TPL-A04: name longer than 80 chars rejected", async () => {
    const campaignId = await ownerCampaignId();
    await expect(
      Parse.Cloud.run(
        "saveAsTemplate",
        { campaignId, name: "x".repeat(81) },
        { sessionToken: owner.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("TPL-A05: name is trimmed before storing", async () => {
    const campaignId = await ownerCampaignId();
    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "  My layout  " },
      { sessionToken: owner.sessionToken },
    )) as { id: string };
    try {
      const tpl = await new Parse.Query("Template").get(tplId, {
        sessionToken: owner.sessionToken,
      });
      expect(tpl.get("name")).toBe("My layout");
    } finally {
      await Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: owner.sessionToken });
    }
  });

  it("TPL-A06: missing campaignId rejected", async () => {
    await expect(
      Parse.Cloud.run("saveAsTemplate", { name: "x" }, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("TPL-A07: cannot save-as from another tenant's campaign", async () => {
    const campaignId = await ownerCampaignId(); // owned by `owner`
    await expect(
      Parse.Cloud.run(
        "saveAsTemplate",
        { campaignId, name: "stolen" },
        { sessionToken: other.sessionToken },
      ),
    ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
  });

  // ── deleteTemplate ───────────────────────────────────────────────────────────
  it("TPL-X03: missing id rejected", async () => {
    await expect(
      Parse.Cloud.run("deleteTemplate", {}, { sessionToken: owner.sessionToken }),
    ).rejects.toMatchObject({ code: Parse.Error.OTHER_CAUSE });
  });

  it("TPL-X04: cannot delete another tenant's org template; it remains for owner", async () => {
    const campaignId = await ownerCampaignId();
    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Owner private" },
      { sessionToken: owner.sessionToken },
    )) as { id: string };
    try {
      await expect(
        Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: other.sessionToken }),
      ).rejects.toMatchObject({ code: Parse.Error.OBJECT_NOT_FOUND });
      // Still present for the owner.
      const still = await new Parse.Query("Template").get(tplId, {
        sessionToken: owner.sessionToken,
      });
      expect(still.id).toBe(tplId);
    } finally {
      await Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: owner.sessionToken });
    }
  });

  // ── Tenant isolation ─────────────────────────────────────────────────────────
  it("TPL-T04: any tenant can fork a system template; campaign stamped with their org", async () => {
    const list = await listAs(other.sessionToken);
    const news = list.system.find((t) => t.seedKey === "system/newsletter")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: news.id },
      { sessionToken: other.sessionToken },
    )) as { campaignId: string };

    const c = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: other.sessionToken,
    });
    expect(c.get("status")).toBe("draft");
    const stampedOrg = c.get("organization");
    expect(stampedOrg).toBeTruthy();
    expect(stampedOrg.id).toBe(other.orgId);
  });
});
