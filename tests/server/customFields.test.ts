// Cloud-function tests for the custom-field registry (CustomField class):
// create (slugified key, type validation, enum requires values, duplicate key),
// list ordering, update (label ok; key/type rejected), delete, and cross-org
// isolation. Plus a unit test of validateCustomFields from lib/customFields.js.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";
// Pure helper — no server needed; import the CJS lib directly.
import {
  validateCustomFields,
  slugifyKey,
  coerceValue,
} from "../../server/cloud/lib/customFields";

describe("customFields cloud functions", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  let counter = 0;
  async function signUp(company: string) {
    counter += 1;
    return Parse.Cloud.run("signUpWithOrg", {
      username: `cf-${counter}@example.com`,
      password: "hunter2hunter2",
      company,
    }) as Promise<{ sessionToken: string; orgId: string }>;
  }
  function as(token: string) {
    return { sessionToken: token };
  }

  interface CF {
    id: string;
    key: string;
    label: string;
    type: string;
    enumValues: string[];
    required: boolean;
    order: number;
  }

  it("createCustomField slugifies the key from the label and defaults order", async () => {
    const a = await signUp("SlugCo");
    const f = (await Parse.Cloud.run(
      "createCustomField",
      { label: "Plan Tier", type: "text" },
      as(a.sessionToken),
    )) as CF;
    expect(f.key).toBe("plan_tier");
    expect(f.label).toBe("Plan Tier");
    expect(f.type).toBe("text");
    expect(f.required).toBe(false);
    expect(f.order).toBe(0);
  });

  it("createCustomField rejects an invalid type", async () => {
    const a = await signUp("TypeCo");
    await expect(
      Parse.Cloud.run(
        "createCustomField",
        { label: "Bad", type: "json" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("createCustomField requires enumValues for an enum field", async () => {
    const a = await signUp("EnumCo");
    await expect(
      Parse.Cloud.run(
        "createCustomField",
        { label: "Status", type: "enum" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});

    // With values it succeeds.
    const f = (await Parse.Cloud.run(
      "createCustomField",
      { label: "Status", type: "enum", enumValues: ["active", "churned"] },
      as(a.sessionToken),
    )) as CF;
    expect(f.type).toBe("enum");
    expect(f.enumValues).toEqual(["active", "churned"]);
  });

  it("createCustomField rejects a duplicate key in the same org", async () => {
    const a = await signUp("DupeCo");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Region", type: "text" },
      as(a.sessionToken),
    );
    await expect(
      Parse.Cloud.run(
        "createCustomField",
        { label: "Region", type: "number" },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({ code: Parse.Error.DUPLICATE_VALUE });
  });

  it("listCustomFields returns the org registry ordered by order then label", async () => {
    const a = await signUp("ListCo");
    // Create three; order should follow creation (0,1,2).
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Alpha", type: "text" },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Beta", type: "number" },
      as(a.sessionToken),
    );
    await Parse.Cloud.run(
      "createCustomField",
      { label: "Gamma", type: "boolean" },
      as(a.sessionToken),
    );

    const rows = (await Parse.Cloud.run(
      "listCustomFields",
      {},
      as(a.sessionToken),
    )) as CF[];
    expect(rows.map((r) => r.label)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it("updateCustomField changes the label but rejects key/type changes", async () => {
    const a = await signUp("UpdateCo");
    const f = (await Parse.Cloud.run(
      "createCustomField",
      { label: "Lifetime", type: "number" },
      as(a.sessionToken),
    )) as CF;

    // Label change is allowed.
    const updated = (await Parse.Cloud.run(
      "updateCustomField",
      { id: f.id, patch: { label: "Lifetime Value", required: true } },
      as(a.sessionToken),
    )) as CF;
    expect(updated.label).toBe("Lifetime Value");
    expect(updated.required).toBe(true);
    expect(updated.key).toBe(f.key); // unchanged

    // Key change rejected.
    await expect(
      Parse.Cloud.run(
        "updateCustomField",
        { id: f.id, patch: { key: "ltv" } },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});

    // Type change rejected.
    await expect(
      Parse.Cloud.run(
        "updateCustomField",
        { id: f.id, patch: { type: "text" } },
        as(a.sessionToken),
      ),
    ).rejects.toMatchObject({});
  });

  it("deleteCustomField removes the definition", async () => {
    const a = await signUp("DeleteCo");
    const f = (await Parse.Cloud.run(
      "createCustomField",
      { label: "Temp", type: "text" },
      as(a.sessionToken),
    )) as CF;
    const res = (await Parse.Cloud.run(
      "deleteCustomField",
      { id: f.id },
      as(a.sessionToken),
    )) as { ok: boolean };
    expect(res.ok).toBe(true);

    const rows = (await Parse.Cloud.run(
      "listCustomFields",
      {},
      as(a.sessionToken),
    )) as CF[];
    expect(rows.find((r) => r.id === f.id)).toBeUndefined();
  });

  it("isolates the registry across orgs", async () => {
    const a = await signUp("OrgA");
    const b = await signUp("OrgB");
    await Parse.Cloud.run(
      "createCustomField",
      { label: "OnlyForA", type: "text" },
      as(a.sessionToken),
    );

    const seenByA = (await Parse.Cloud.run(
      "listCustomFields",
      {},
      as(a.sessionToken),
    )) as CF[];
    expect(seenByA.some((r) => r.label === "OnlyForA")).toBe(true);

    const seenByB = (await Parse.Cloud.run(
      "listCustomFields",
      {},
      as(b.sessionToken),
    )) as CF[];
    expect(seenByB.some((r) => r.label === "OnlyForA")).toBe(false);

    // Org B may even reuse the same key — uniqueness is per-org.
    const f = (await Parse.Cloud.run(
      "createCustomField",
      { label: "OnlyForA", type: "text" },
      as(b.sessionToken),
    )) as CF;
    expect(f.key).toBe("onlyfora");
  });
});

describe("lib/customFields validateCustomFields (unit)", () => {
  const registry = [
    { key: "plan_tier", label: "Plan Tier", type: "enum", enumValues: ["free", "pro"] },
    { key: "ltv", label: "Lifetime Value", type: "number" },
    { key: "vip", label: "VIP", type: "boolean" },
    { key: "joined", label: "Joined", type: "date" },
    { key: "nickname", label: "Nickname", type: "text" },
  ];

  it("slugifyKey lowercases and underscores non-alphanumerics", () => {
    expect(slugifyKey("Plan Tier")).toBe("plan_tier");
    expect(slugifyKey("  Customer-ID #2 ")).toBe("customer_id_2");
    expect(slugifyKey("$$$")).toBe("");
  });

  it("coerces known types and drops unknown keys into errors", () => {
    const { cleaned, errors } = validateCustomFields(
      {
        plan_tier: "pro",
        ltv: "1234",
        vip: "yes",
        nickname: "Ace",
        not_a_field: "whatever",
      },
      registry,
    );

    expect(cleaned.plan_tier).toBe("pro");
    expect(cleaned.ltv).toBe(1234); // coerced to Number
    expect(cleaned.vip).toBe(true); // coerced to Boolean
    expect(cleaned.nickname).toBe("Ace");
    // Unknown key dropped, reported in errors, not thrown.
    expect(cleaned.not_a_field).toBeUndefined();
    expect(errors.not_a_field).toBeTruthy();
  });

  it("reports a coercion error for a bad-typed known value", () => {
    const { cleaned, errors } = validateCustomFields(
      { ltv: "not-a-number", plan_tier: "enterprise" },
      registry,
    );
    expect(cleaned.ltv).toBeUndefined();
    expect(errors.ltv).toBeTruthy();
    // Enum value not in the allowed set → error.
    expect(errors.plan_tier).toBeTruthy();
  });

  it("coerceValue dates round-trip to ISO strings; empty passes as null", () => {
    const d = coerceValue("date", "2026-05-29");
    expect(d.ok).toBe(true);
    expect(typeof d.value).toBe("string");
    expect((d.value as string).startsWith("2026-05-29")).toBe(true);

    const empty = coerceValue("text", "");
    expect(empty.ok).toBe(true);
    expect(empty.value).toBeNull();
  });
});
