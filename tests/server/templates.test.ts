// Integration tests for the Templates feature (server/cloud/templates.js) against
// a real Parse Server + in-memory Mongo.
//
// Covers: idempotent system-template seeding (running twice → stable count, no dupes),
// listTemplates (system + org buckets), useTemplate (forks blocks into a new
// Campaign draft), saveAsTemplate (round-trips a campaign body → org template),
// deleteTemplate (org templates only; system templates rejected), and tenant
// isolation of org templates.
//
// As in tenancy.test.ts, Parse.User.become() is blocked server-side ("not
// memory-safe"), so we act as a given user by passing { sessionToken } to each
// cloud-run / query — exactly how a client session is scoped.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// The system library grows as we add starter/system templates, so tests assert
// the REAL seeded count is stable + idempotent (not a magic number) and that
// the original starter keys remain present. `systemCount` is captured in
// beforeAll from the live seed.
const STARTER_KEYS = [
  "system/basic",
  "system/blank",
  "system/newsletter",
  "system/plain-text",
  "system/product-announcement",
  "system/welcome",
];

describe("templates feature", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let session: string; // a signed-up user's session token
  let systemCount: number; // actual number of seeded system templates

  async function signUp(params: Record<string, unknown>) {
    return Parse.Cloud.run("signUpWithOrg", params) as Promise<{
      sessionToken: string;
      userId: string;
      orgId: string;
    }>;
  }

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    const r = await signUp({
      username: "tpl-owner@example.com",
      password: "hunter2hunter2",
      company: "TemplateCo",
    });
    session = r.sessionToken;

    // Capture the real seeded library size for stable, growth-proof assertions.
    await Parse.Cloud.run("seedSystemTemplates", {});
    systemCount = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("seeds the system library and is idempotent (stable count, no dupes)", async () => {
    expect(systemCount).toBeGreaterThanOrEqual(STARTER_KEYS.length);

    // Re-seeding must NOT create duplicates and must converge to the same total.
    const second = (await Parse.Cloud.run("seedSystemTemplates", {})) as {
      seeded: number;
      total: number;
    };
    expect(second.seeded).toBe(0);
    expect(second.total).toBe(systemCount);

    // And a third time for good measure.
    await Parse.Cloud.run("seedSystemTemplates", {});
    const count = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
    expect(count).toBe(systemCount);
  });

  it("seeded system templates are global (no org) with public-read ACL and valid blocks", async () => {
    const rows = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .limit(2000) // library has grown past Parse's default 100-row find cap
      .find({ useMasterKey: true });
    expect(rows.length).toBe(systemCount);
    for (const t of rows) {
      expect(t.get("organization")).toBeFalsy(); // global
      const acl = t.getACL();
      expect(acl!.getPublicReadAccess()).toBe(true);
      expect(acl!.getPublicWriteAccess()).toBe(false);
      const body = t.get("body");
      expect(body).toBeTruthy();
      expect(Array.isArray(body.blocks)).toBe(true);
      expect(body.blocks.length).toBeGreaterThan(0);
      // Every starter ends with a CAN-SPAM footer block.
      expect(body.blocks[body.blocks.length - 1].type).toBe("footer");
    }
  });

  it("listTemplates returns the system library and (initially) no org templates", async () => {
    const res = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: Array<{ id: string; seedKey: string | null; isSystem: boolean }>;
      org: unknown[];
    };
    expect(res.system.length).toBe(systemCount);
    expect(res.system.every((t) => t.isSystem)).toBe(true);
    expect(res.org.length).toBe(0);

    // The original starter keys must all still be present (subset of the library).
    const keys = new Set(res.system.map((t) => t.seedKey));
    for (const k of STARTER_KEYS) expect(keys.has(k)).toBe(true);
  });

  it("useTemplate forks a system template's blocks into a new Campaign draft", async () => {
    const list = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: Array<{ id: string; seedKey: string | null }>;
    };
    const newsletter = list.system.find((t) => t.seedKey === "system/newsletter")!;
    expect(newsletter).toBeTruthy();

    const srcTpl = await new Parse.Query("Template").get(newsletter.id, {
      useMasterKey: true,
    });
    const srcBlocks = srcTpl.get("body").blocks;

    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: newsletter.id },
      { sessionToken: session },
    )) as { campaignId: string };
    expect(campaignId).toBeTruthy();

    // The campaign is the caller's (session-readable), a draft, with the
    // template's block tree copied across (same types/length, fresh ids).
    const campaign = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: session,
    });
    expect(campaign.get("status")).toBe("draft");
    expect(campaign.get("organization")).toBeTruthy(); // stamped by tenantHooks
    const body = campaign.get("body");
    expect(body.version).toBe(1);
    expect(body.blocks.map((b: any) => b.type)).toEqual(
      srcBlocks.map((b: any) => b.type),
    );
    // Fresh ids (not shared with the template).
    const srcIds = new Set(srcBlocks.map((b: any) => b.id));
    expect(body.blocks.every((b: any) => !srcIds.has(b.id))).toBe(true);
  });

  it("saveAsTemplate round-trips a campaign body into an org template, then lists + deletes it", async () => {
    // Start from a campaign created via useTemplate (basic starter).
    const list = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: Array<{ id: string; seedKey: string | null }>;
    };
    const basic = list.system.find((t) => t.seedKey === "system/basic")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: basic.id },
      { sessionToken: session },
    )) as { campaignId: string };

    const campaign = await new Parse.Query("Campaign").get(campaignId, {
      sessionToken: session,
    });
    const campaignBlockTypes = campaign.get("body").blocks.map((b: any) => b.type);

    // Save it as a template.
    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "My reusable layout" },
      { sessionToken: session },
    )) as { id: string };
    expect(tplId).toBeTruthy();

    // It shows up in the org bucket (not system), with the same block types.
    const after = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: unknown[];
      org: Array<{ id: string; name: string; isSystem: boolean }>;
    };
    expect(after.org.length).toBe(1);
    expect(after.org[0].id).toBe(tplId);
    expect(after.org[0].name).toBe("My reusable layout");
    expect(after.org[0].isSystem).toBe(false);

    const savedTpl = await new Parse.Query("Template").get(tplId, {
      sessionToken: session,
    });
    expect(savedTpl.get("organization")).toBeTruthy(); // stamped
    expect(savedTpl.get("body").blocks.map((b: any) => b.type)).toEqual(
      campaignBlockTypes,
    );

    // Delete the org template.
    const del = (await Parse.Cloud.run(
      "deleteTemplate",
      { id: tplId },
      { sessionToken: session },
    )) as { ok: boolean };
    expect(del.ok).toBe(true);

    const final = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      org: unknown[];
    };
    expect(final.org.length).toBe(0);
  });

  it("rejects deleting a system template", async () => {
    const list = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: Array<{ id: string }>;
    };
    const sysId = list.system[0].id;
    await expect(
      Parse.Cloud.run("deleteTemplate", { id: sysId }, { sessionToken: session }),
    ).rejects.toMatchObject({});
    // Still present.
    const count = await new Parse.Query("Template")
      .equalTo("isSystem", true)
      .count({ useMasterKey: true });
    expect(count).toBe(systemCount);
  });

  it("isolates org templates across tenants and blocks cross-tenant useTemplate", async () => {
    const other = await signUp({
      username: "other-tenant@example.com",
      password: "hunter2hunter2",
      company: "OtherCo",
    });

    // Owner saves an org template.
    const list = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: session })) as {
      system: Array<{ id: string; seedKey: string | null }>;
    };
    const blank = list.system.find((t) => t.seedKey === "system/blank")!;
    const { campaignId } = (await Parse.Cloud.run(
      "useTemplate",
      { id: blank.id },
      { sessionToken: session },
    )) as { campaignId: string };
    const { id: tplId } = (await Parse.Cloud.run(
      "saveAsTemplate",
      { campaignId, name: "Private layout" },
      { sessionToken: session },
    )) as { id: string };

    // The other tenant does NOT see it in their org bucket.
    const otherList = (await Parse.Cloud.run("listTemplates", {}, { sessionToken: other.sessionToken })) as {
      system: unknown[];
      org: unknown[];
    };
    expect(otherList.org.length).toBe(0);
    // But still sees the shared system library.
    expect(otherList.system.length).toBe(systemCount);

    // The other tenant cannot fork the owner's private template.
    await expect(
      Parse.Cloud.run("useTemplate", { id: tplId }, { sessionToken: other.sessionToken }),
    ).rejects.toMatchObject({});

    // Cleanup so the owner's later assertions (if any) stay clean.
    await Parse.Cloud.run("deleteTemplate", { id: tplId }, { sessionToken: session });
  });
});
