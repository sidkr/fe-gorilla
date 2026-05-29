// @vitest-environment happy-dom
// Tests for the merge-tag insertion mechanism (insertAtCursor) plus the
// list/grouping/formatting logic that drives MergeTagPicker.vue.
//
// NOTE: the project's vitest config does not register @vitejs/plugin-vue, so
// real .vue SFCs can't be compiled in tests (see tests/components/_example
// which deliberately mounts an inline component for the same reason). The
// picker SFC is thin glue over these pure/DOM pieces — insertAtCursor is the
// real insertion path, and buildMergeTags/formatTag/group-filtering are the
// data the picker renders — so we exercise those directly here.
import { describe, expect, it } from "vitest";
import {
  buildMergeTags,
  formatTag,
  insertAtCursor,
  STANDARD_MERGE_TAGS,
} from "../../composables/app/useMergeTags";
import type { CustomField } from "../../composables/app/useCustomFields";

describe("insertAtCursor", () => {
  it("splices text at the caret in an input and keeps the caret after it", () => {
    const input = document.createElement("input");
    input.value = "Hi !";
    document.body.appendChild(input);
    input.setSelectionRange(3, 3); // caret between "Hi " and "!"
    const out = insertAtCursor(input, "{{firstName}}");
    expect(out).toBe("Hi {{firstName}}!");
    expect(input.value).toBe("Hi {{firstName}}!");
    expect(input.selectionStart).toBe(3 + "{{firstName}}".length);
    input.remove();
  });

  it("replaces the current selection", () => {
    const input = document.createElement("input");
    input.value = "Hi NAME!";
    document.body.appendChild(input);
    input.setSelectionRange(3, 7); // selects "NAME"
    const out = insertAtCursor(input, "{{firstName}}");
    expect(out).toBe("Hi {{firstName}}!");
    input.remove();
  });

  it("appends at the end of a textarea at the caret", () => {
    const ta = document.createElement("textarea");
    ta.value = "Hello";
    document.body.appendChild(ta);
    ta.setSelectionRange(5, 5);
    insertAtCursor(ta, " {{lastName}}");
    expect(ta.value).toBe("Hello {{lastName}}");
    ta.remove();
  });

  it("fires a native input event so v-model listeners update", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);
    let fired = "";
    input.addEventListener("input", (e) => {
      fired = (e.target as HTMLInputElement).value;
    });
    insertAtCursor(input, "{{email}}");
    expect(fired).toBe("{{email}}");
    input.remove();
  });

  it("returns empty string for a null element", () => {
    expect(insertAtCursor(null, "{{x}}")).toBe("");
  });
});

describe("picker tag list (what MergeTagPicker renders)", () => {
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

  it("standard group contains the expected tokens", () => {
    const tokens = STANDARD_MERGE_TAGS.map((t) => formatTag(t.token));
    expect(tokens).toContain("{{firstName}}");
    expect(tokens).toContain("{{email}}");
    expect(tokens).toContain("{{company}}");
    expect(tokens).toContain("{{country}}");
  });

  it("custom fields become a custom group with custom.<key> tokens", () => {
    const tags = buildMergeTags([customField({ key: "tier", label: "Tier" })]);
    const custom = tags.filter((t) => t.group === "custom");
    expect(custom).toHaveLength(1);
    expect(formatTag(custom[0].token)).toBe("{{custom.tier}}");
    expect(custom[0].label).toBe("Tier");
  });

  it("standard group is unchanged when there are no custom fields", () => {
    expect(buildMergeTags([]).filter((t) => t.group === "custom")).toHaveLength(0);
  });
});
