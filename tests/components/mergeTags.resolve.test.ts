// Unit tests for the pure merge-tag resolver + helpers. No DOM, no Nuxt —
// these are plain functions, the testable core of the sample-data preview.
// (Import via relative path: vitest does not resolve the "~" alias.)
import { describe, expect, it } from "vitest";
import {
  STANDARD_MERGE_TAGS,
  SAMPLE_CONTACT,
  buildMergeTags,
  formatTag,
  resolveMergeTags,
  sampleValueForField,
  type SampleContact,
} from "../../composables/app/useMergeTags";
import type { CustomField } from "../../composables/app/useCustomFields";

const customField = (over: Partial<CustomField> = {}): CustomField => ({
  id: "cf1",
  key: "plan",
  label: "Plan",
  type: "text",
  enumValues: [],
  required: false,
  order: 0,
  ...over,
});

describe("resolveMergeTags — standard fields", () => {
  it("substitutes a known field value", () => {
    expect(resolveMergeTags("Hi {{firstName}}!", { firstName: "Sam" })).toBe("Hi Sam!");
  });

  it("substitutes multiple tags in one string", () => {
    const c: SampleContact = { firstName: "Sam", company: "Acme" };
    expect(resolveMergeTags("{{firstName}} @ {{company}}", c)).toBe("Sam @ Acme");
  });

  it("tolerates whitespace inside the braces", () => {
    expect(resolveMergeTags("Hi {{  firstName  }}", { firstName: "Sam" })).toBe("Hi Sam");
  });

  it("defaults to the sample contact when none is passed", () => {
    expect(resolveMergeTags("Hi {{firstName}}")).toBe(`Hi ${SAMPLE_CONTACT.firstName}`);
  });
});

describe("resolveMergeTags — defaults + missing", () => {
  it("uses the inline default when the value is missing", () => {
    expect(resolveMergeTags("Hi {{firstName|there}}", {})).toBe("Hi there");
  });

  it("prefers the contact value over the inline default", () => {
    expect(resolveMergeTags("Hi {{firstName|there}}", { firstName: "Sam" })).toBe("Hi Sam");
  });

  it("falls back to a [token] placeholder when missing and no default", () => {
    expect(resolveMergeTags("Hi {{firstName}}", {})).toBe("Hi [firstName]");
  });

  it("renders empty string when missing strategy is 'empty'", () => {
    expect(resolveMergeTags("Hi {{firstName}}", {}, { missing: "empty" })).toBe("Hi ");
  });

  it("treats empty-string values as missing", () => {
    expect(resolveMergeTags("Hi {{firstName|x}}", { firstName: "" })).toBe("Hi x");
  });

  it("handles a default containing spaces", () => {
    expect(resolveMergeTags("{{firstName|Valued Customer}}", {})).toBe("Valued Customer");
  });
});

describe("resolveMergeTags — custom fields", () => {
  it("resolves {{custom.<key>}} from the contact's customFields", () => {
    const c: SampleContact = { customFields: { plan: "Pro" } };
    expect(resolveMergeTags("Plan: {{custom.plan}}", c)).toBe("Plan: Pro");
  });

  it("derives a typed sample value when the contact lacks the custom value", () => {
    const fields = [customField({ key: "plan", type: "enum", enumValues: ["Free", "Pro"] })];
    const out = resolveMergeTags("Plan: {{custom.plan}}", {}, { customFields: fields });
    expect(out).toBe("Plan: Free");
  });

  it("placeholders an unknown custom key with no field def", () => {
    expect(resolveMergeTags("X: {{custom.unknown}}", {})).toBe("X: [custom.unknown]");
  });

  it("honors the inline default for a custom tag", () => {
    expect(resolveMergeTags("Plan: {{custom.plan|Free}}", {})).toBe("Plan: Free");
  });
});

describe("resolveMergeTags — robustness", () => {
  it("leaves text without tags untouched", () => {
    expect(resolveMergeTags("plain text", {})).toBe("plain text");
  });

  it("leaves footer link placeholders untouched (single braces / known tokens)", () => {
    // {{unsubscribeUrl}} is not in the contact, has no field def -> placeholder,
    // proving the resolver does not special-case footer tokens (the server owns them).
    // We assert it becomes a visible placeholder rather than being resolved.
    expect(resolveMergeTags("{{unsubscribeUrl}}", {})).toBe("[unsubscribeUrl]");
  });

  it("does not touch stray single braces", () => {
    expect(resolveMergeTags("a { b } c", {})).toBe("a { b } c");
  });

  it("returns empty string for empty input", () => {
    expect(resolveMergeTags("", {})).toBe("");
  });
});

describe("buildMergeTags / formatTag / sampleValueForField", () => {
  it("returns the standard tags when there are no custom fields", () => {
    expect(buildMergeTags([])).toEqual(STANDARD_MERGE_TAGS);
  });

  it("appends one custom tag per field with the custom.<key> token", () => {
    const tags = buildMergeTags([customField({ key: "plan", label: "Plan" })]);
    const custom = tags.filter((t) => t.group === "custom");
    expect(custom).toHaveLength(1);
    expect(custom[0]).toMatchObject({ token: "custom.plan", label: "Plan", group: "custom" });
  });

  it("formatTag wraps a bare token in braces", () => {
    expect(formatTag("firstName")).toBe("{{firstName}}");
    expect(formatTag("custom.plan")).toBe("{{custom.plan}}");
  });

  it("sampleValueForField returns type-appropriate samples", () => {
    expect(sampleValueForField(customField({ type: "number" }))).toBe("42");
    expect(sampleValueForField(customField({ type: "boolean" }))).toBe("Yes");
    expect(sampleValueForField(customField({ type: "enum", enumValues: ["A", "B"] }))).toBe("A");
    expect(sampleValueForField(customField({ type: "date" }))).toMatch(/2026/);
  });
});
