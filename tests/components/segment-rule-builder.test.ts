// @vitest-environment happy-dom
//
// Component tests for components/app/SegmentRuleBuilder.vue — the highest-logic
// untested unit in the Segments feature. This is the emit-contract test that
// guarantees what the builder produces is exactly what the server compiler
// (server/cloud/segments.js) accepts: grouped field picker, operator options
// filtered by field type, value-input type switching, field-change resets,
// unary-operator value clearing, AND/ANY toggle, add/remove condition.
//
// Covers the doc's P0/P1 RB-* cases (docs/testing/segments.md §3):
//   RB-01..RB-14, RB-16, RB-17.
//
// The builder relies on Nuxt's auto-import of `computed` from "vue"; in the
// isolated vitest+plugin-vue runtime there is no unimport, so we shim it onto
// globalThis before importing the SFC. The shared field primitives
// (SelectInput / TextInput) are registered as REAL SFCs so the native
// select/input wiring (and its update:modelValue emit) is exercised; Button and
// Icon are stubbed to thin shells.
import { computed } from "vue";
// @ts-expect-error — the SFC reads `computed` as a free (auto-imported) ref.
globalThis.computed = computed;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import SegmentRuleBuilder from "../../components/app/SegmentRuleBuilder.vue";
import SelectInput from "../../components/shared/SelectInput.vue";
import TextInput from "../../components/shared/TextInput.vue";
import { mountWithPinia } from "../setup/vueTest";
import {
  OPERATORS_BY_TYPE,
  type SegmentRules,
} from "../../composables/app/useSegments";
import type { CustomField } from "../../composables/app/useCustomFields";

// Thin stubs for the non-field shared components used by the builder.
const ButtonStub = defineComponent({
  name: "Button",
  emits: ["click"],
  setup(_, { slots, emit }) {
    return () =>
      h("button", { type: "button", onClick: () => emit("click") }, slots.default?.());
  },
});
const IconStub = defineComponent({
  name: "Icon",
  props: { name: { type: String, default: "" } },
  setup() {
    return () => h("i");
  },
});

const CUSTOM_FIELDS: CustomField[] = [
  { id: "cf-score", key: "score", label: "Score", type: "number", enumValues: [], required: false, order: 0 },
  { id: "cf-vip", key: "vip", label: "VIP", type: "boolean", enumValues: [], required: false, order: 1 },
  { id: "cf-tier", key: "tier", label: "Tier", type: "enum", enumValues: ["gold", "silver", "bronze"], required: false, order: 2 },
  { id: "cf-renews", key: "renews_at", label: "Renews At", type: "date", enumValues: [], required: false, order: 3 },
];

function mountBuilder(modelValue: SegmentRules, customFields: CustomField[] = CUSTOM_FIELDS) {
  return mountWithPinia(SegmentRuleBuilder, {
    props: { modelValue, customFields },
    global: {
      components: { SelectInput, TextInput, Button: ButtonStub, Icon: IconStub },
    },
  });
}

// Convenience: the last payload the builder emitted via update:modelValue.
function lastEmit(wrapper: ReturnType<typeof mountBuilder>): SegmentRules {
  const events = wrapper.emitted("update:modelValue");
  expect(events, "expected an update:modelValue emit").toBeTruthy();
  return (events as unknown[][])[events!.length - 1][0] as SegmentRules;
}

const oneText = (): SegmentRules => ({
  op: "and",
  conditions: [{ field: "email", operator: "contains", value: "" }],
});

beforeEach(() => {
  // @ts-expect-error — re-assert the shim per-test (cheap, defensive).
  globalThis.computed = computed;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("SegmentRuleBuilder — match toggle (RB-01)", () => {
  it("clicking ANY emits op:'or'", async () => {
    const wrapper = mountBuilder({ op: "and", conditions: [] });
    const anyBtn = wrapper.findAll(".rb-seg-btn").find((b) => b.text() === "ANY");
    await anyBtn!.trigger("click");
    expect(lastEmit(wrapper).op).toBe("or");
  });

  it("clicking ALL emits op:'and'", async () => {
    const wrapper = mountBuilder({ op: "or", conditions: [] });
    const allBtn = wrapper.findAll(".rb-seg-btn").find((b) => b.text() === "ALL");
    await allBtn!.trigger("click");
    expect(lastEmit(wrapper).op).toBe("and");
  });
});

describe("SegmentRuleBuilder — add / remove (RB-02, RB-03)", () => {
  it("Add condition emits a fresh default leaf (email/contains/'')", async () => {
    const wrapper = mountBuilder({ op: "and", conditions: [] });
    // The add-condition button lives in .rb-add-row.
    await wrapper.find(".rb-add-row button").trigger("click");
    const emitted = lastEmit(wrapper);
    expect(emitted.conditions).toHaveLength(1);
    expect(emitted.conditions[0]).toEqual({ field: "email", operator: "contains", value: "" });
  });

  it("remove splices the targeted index, keeping the rest", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [
        { field: "email", operator: "contains", value: "a" },
        { field: "status", operator: "eq", value: "subscribed" },
      ],
    });
    // The trash button is the .rb-remove inside each row; remove idx 0.
    const removeButtons = wrapper.findAll(".rb-remove");
    expect(removeButtons.length).toBe(2);
    await removeButtons[0].trigger("click");
    const emitted = lastEmit(wrapper);
    expect(emitted.conditions).toHaveLength(1);
    expect(emitted.conditions[0]).toMatchObject({ field: "status", operator: "eq" });
  });
});

describe("SegmentRuleBuilder — field change resets operator + value (RB-04, RB-05)", () => {
  it("changing field to a number resets operator to first number op + value null", async () => {
    const wrapper = mountBuilder(oneText());
    const fieldSelect = wrapper.find("select.rb-field");
    await fieldSelect.setValue("customFields.score");
    const cond = lastEmit(wrapper).conditions[0] as { field: string; operator: string; value: unknown };
    expect(cond.field).toBe("customFields.score");
    expect(cond.operator).toBe(OPERATORS_BY_TYPE.number[0]); // "eq"
    expect(cond.value).toBeNull();
  });

  it("changing field to a boolean defaults value true + operator eq", async () => {
    const wrapper = mountBuilder(oneText());
    await wrapper.find("select.rb-field").setValue("customFields.vip");
    const cond = lastEmit(wrapper).conditions[0] as { operator: string; value: unknown };
    expect(cond.operator).toBe("eq");
    expect(cond.value).toBe(true);
  });
});

describe("SegmentRuleBuilder — operator change coerces value shape (RB-06, RB-07, RB-08)", () => {
  it("switching to a unary op clears value to undefined + renders the no-value placeholder", async () => {
    const wrapper = mountBuilder(oneText());
    await wrapper.find("select.rb-operator").setValue("is_empty");
    const cond = lastEmit(wrapper).conditions[0] as { operator: string; value: unknown };
    expect(cond.operator).toBe("is_empty");
    expect(cond.value).toBeUndefined();

    // Re-mount with the unary value applied to assert the UI renders the dash.
    const w2 = mountBuilder({
      op: "and",
      conditions: [{ field: "email", operator: "is_empty" }],
    });
    expect(w2.find(".rb-novalue").exists()).toBe(true);
    expect(w2.find(".rb-novalue").text()).toBe("—");
  });

  it("switching a date field to 'between' sets a two-element value + renders two date inputs", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "subscribedAt", operator: "before", value: "" }],
    });
    await wrapper.find("select.rb-operator").setValue("between");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(Array.isArray(cond.value)).toBe(true);
    expect(cond.value).toEqual(["", ""]);

    // Render the between state and assert two date inputs.
    const w2 = mountBuilder({
      op: "and",
      conditions: [{ field: "subscribedAt", operator: "between", value: ["", ""] }],
    });
    const dateInputs = w2.findAll("input[type='date']");
    expect(dateInputs.length).toBe(2);
  });

  it("switching a text field to a list op ('in') sets value [] + renders the comma textbox", async () => {
    const wrapper = mountBuilder(oneText());
    await wrapper.find("select.rb-operator").setValue("in");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(cond.value).toEqual([]);

    const w2 = mountBuilder({
      op: "and",
      conditions: [{ field: "email", operator: "in", value: [] }],
    });
    const box = w2.find("input.rb-value[type='text']");
    expect(box.exists()).toBe(true);
    expect((box.element as HTMLInputElement).placeholder).toContain("value");
  });
});

describe("SegmentRuleBuilder — comma list parsing (RB-09, RB-10)", () => {
  it("text 'in' parses 'a, b ,c' → ['a','b','c'] (trimmed, blanks dropped)", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "email", operator: "in", value: [] }],
    });
    const box = wrapper.find("input.rb-value[type='text']");
    await box.setValue("a, b ,c, ");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(cond.value).toEqual(["a", "b", "c"]);
  });

  it("number 'in' parses '10, 50' → [10, 50] (Number-coerced)", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "customFields.score", operator: "in", value: [] }],
    });
    const box = wrapper.find("input.rb-value[type='text']");
    await box.setValue("10, 50");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(cond.value).toEqual([10, 50]);
    expect((cond.value as number[]).every((n) => typeof n === "number")).toBe(true);
  });
});

describe("SegmentRuleBuilder — typed value coercion (RB-11, RB-12)", () => {
  it("number value input emits a number, not a string", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "customFields.score", operator: "gte", value: null }],
    });
    const numInput = wrapper.find("input.rb-value-num");
    expect(numInput.exists()).toBe(true);
    await numInput.setValue("80");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(cond.value).toBe(80);
    expect(typeof cond.value).toBe("number");
  });

  it("last_n_days renders a number input and coerces the days to a number", async () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "subscribedAt", operator: "last_n_days", value: null }],
    });
    const numInput = wrapper.find("input.rb-value-num");
    expect(numInput.exists()).toBe(true);
    await numInput.setValue("7");
    const cond = lastEmit(wrapper).conditions[0] as { value: unknown };
    expect(cond.value).toBe(7);
    expect(typeof cond.value).toBe("number");
  });
});

describe("SegmentRuleBuilder — operator options adapt to field type (RB-13)", () => {
  // Map each representative field to its rule type so we can assert the option set.
  const cases: Array<{ field: string; type: keyof typeof OPERATORS_BY_TYPE }> = [
    { field: "email", type: "text" },
    { field: "customFields.score", type: "number" },
    { field: "subscribedAt", type: "date" },
    { field: "customFields.vip", type: "boolean" },
    { field: "customFields.tier", type: "enum" },
    { field: "tags", type: "tags" },
  ];

  for (const { field, type } of cases) {
    it(`field '${field}' offers exactly OPERATORS_BY_TYPE.${type}`, () => {
      const wrapper = mountBuilder({
        op: "and",
        conditions: [{ field, operator: OPERATORS_BY_TYPE[type][0], value: undefined }],
      });
      const optionValues = wrapper
        .find("select.rb-operator")
        .findAll("option")
        .map((o) => (o.element as HTMLOptionElement).value);
      expect(optionValues).toEqual(OPERATORS_BY_TYPE[type]);
    });
  }
});

describe("SegmentRuleBuilder — enum select + custom group visibility (RB-14, RB-15)", () => {
  it("enum field renders a select of the registry enumValues", () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [{ field: "customFields.tier", operator: "eq", value: "" }],
    });
    const valueSelect = wrapper.find(".rb-value");
    const opts = valueSelect
      .findAll("option")
      .map((o) => (o.element as HTMLOptionElement).value)
      .filter((v) => v !== ""); // drop the "Choose…" placeholder
    expect(opts).toEqual(["gold", "silver", "bronze"]);
  });

  it("the Custom fields optgroup only renders when customFields is non-empty", () => {
    const withCF = mountBuilder(oneText(), CUSTOM_FIELDS);
    expect(withCF.findAll("optgroup").some((g) => g.attributes("label") === "Custom fields")).toBe(true);

    const noCF = mountBuilder(oneText(), []);
    expect(noCF.findAll("optgroup").some((g) => g.attributes("label") === "Custom fields")).toBe(false);
  });
});

describe("SegmentRuleBuilder — match-all hint + joiners (RB-16, RB-17)", () => {
  it("empty conditions shows the match-all hint and no WHERE joiner", () => {
    const wrapper = mountBuilder({ op: "and", conditions: [] });
    expect(wrapper.find(".rb-empty").exists()).toBe(true);
    expect(wrapper.find(".rb-empty").text()).toContain("matches every contact");
    expect(wrapper.find(".rb-joiner").exists()).toBe(false);
  });

  it("joiner reflects op: first row WHERE, subsequent rows OR when op='or'", () => {
    const wrapper = mountBuilder({
      op: "or",
      conditions: [
        { field: "email", operator: "contains", value: "a" },
        { field: "status", operator: "eq", value: "subscribed" },
      ],
    });
    const joiners = wrapper.findAll(".rb-joiner");
    expect(joiners[0].text()).toBe("WHERE");
    expect(joiners[1].text()).toBe("OR");
  });

  it("joiner shows AND for subsequent rows when op='and'", () => {
    const wrapper = mountBuilder({
      op: "and",
      conditions: [
        { field: "email", operator: "contains", value: "a" },
        { field: "status", operator: "eq", value: "subscribed" },
      ],
    });
    const joiners = wrapper.findAll(".rb-joiner");
    expect(joiners[0].text()).toBe("WHERE");
    expect(joiners[1].text()).toBe("AND");
  });
});
