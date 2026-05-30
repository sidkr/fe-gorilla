// @vitest-environment happy-dom
// L3 component tests for the custom-field registry page
// (pages/app/audiences/fields.vue) — the type Select locked on edit (P-06), the
// enum "Choices" field showing only for enum (P-07), the enum-with-no-choices
// submit block (P-08), the blank-label guard, and the empty state (P-09). Plus
// the create payload shape (type + required + parsed enumValues).
//
// The real SFC is mounted (@vitejs/plugin-vue); useCustomFields is mocked.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as Vue from "vue";
import { mountWithPinia } from "../setup/vueTest";

for (const name of ["computed", "ref", "reactive", "watch", "onMounted", "nextTick"] as const) {
  vi.stubGlobal(name, (Vue as any)[name]);
}
vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

const listCustomFields = vi.fn();
const createCustomField = vi.fn();
const updateCustomField = vi.fn();
const deleteCustomField = vi.fn();
// The page imports useCustomFields AND the FIELD_TYPES / type exports from the
// same module, so the mock must re-export FIELD_TYPES too.
vi.mock("~/composables/app/useCustomFields", () => ({
  FIELD_TYPES: ["text", "number", "date", "boolean", "enum"],
  useCustomFields: () => ({ listCustomFields, createCustomField, updateCustomField, deleteCustomField }),
}));

import Page from "../../pages/app/audiences/fields.vue";
import TextInput from "../../components/shared/TextInput.vue";
import TextArea from "../../components/shared/TextArea.vue";
import SelectInput from "../../components/shared/SelectInput.vue";
import Checkbox from "../../components/shared/Checkbox.vue";
import FormField from "../../components/shared/FormField.vue";
import TableShell from "../../components/shared/TableShell.vue";

const ButtonStub = {
  inheritAttrs: false,
  props: ["disabled", "loading", "variant", "size", "type", "to"],
  template:
    '<button class="btn" :disabled="disabled || loading" v-bind="$attrs"><slot name="leading" /><slot /></button>',
};
const components = {
  Button: ButtonStub,
  TextInput,
  TextArea,
  SelectInput,
  Checkbox,
  FormField,
  TableShell,
};
const stubs = { NuxtLink: { template: "<a><slot /></a>" } };

function field(over: Record<string, any> = {}) {
  return { id: "f1", key: "plan_tier", label: "Plan Tier", type: "text", enumValues: [], required: false, order: 0, ...over };
}

async function mountPage(rows: any[] = []) {
  listCustomFields.mockResolvedValue(rows);
  const w = mountWithPinia(Page, { global: { components, stubs } });
  await flushPromises();
  return w;
}

afterEach(() => vi.clearAllMocks());

describe("fields.vue — create / type behavior", () => {
  it("P-08: an enum field with no choices blocks submit client-side", async () => {
    const w = await mountPage([field()]);
    await w.findAll("button").find((b) => b.text().includes("New field"))!.trigger("click");
    await flushPromises();
    // A label is required first (validated before the enum-choices check), so
    // give one — we're isolating the empty-choices guard.
    await w.find('.cf-modal input[type="text"]').setValue("Stage");
    // Switch the type Select to enum.
    const typeSelect = w.find(".cf-modal select");
    await typeSelect.setValue("enum");
    await flushPromises();
    // Submit with empty choices.
    await w.find(".cf-modal form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain("A choice field needs at least one value.");
    expect(createCustomField).not.toHaveBeenCalled();
  });

  it("P-07: the 'Choices' field only renders when the type is enum", async () => {
    const w = await mountPage([field()]);
    await w.findAll("button").find((b) => b.text().includes("New field"))!.trigger("click");
    await flushPromises();
    // Default type is text → no Choices textarea.
    expect(w.find(".cf-modal textarea").exists()).toBe(false);
    await w.find(".cf-modal select").setValue("enum");
    await flushPromises();
    expect(w.find(".cf-modal textarea").exists()).toBe(true);
  });

  it("a blank label blocks submit", async () => {
    const w = await mountPage([field()]);
    await w.findAll("button").find((b) => b.text().includes("New field"))!.trigger("click");
    await flushPromises();
    await w.find(".cf-modal form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain("A label is required.");
    expect(createCustomField).not.toHaveBeenCalled();
  });

  it("creates an enum field with parsed choices + required + type in the payload", async () => {
    createCustomField.mockResolvedValue(field({ type: "enum" }));
    const w = await mountPage([]);
    await w.findAll("button").find((b) => b.text().includes("New field"))!.trigger("click");
    await flushPromises();
    await w.find('.cf-modal input[type="text"]').setValue("Stage");
    await w.find(".cf-modal select").setValue("enum");
    await flushPromises();
    await w.find(".cf-modal textarea").setValue("lead\nwon\n, ");
    // Required checkbox.
    await w.find('.cf-modal input[type="checkbox"]').setValue(true);
    await w.find(".cf-modal form").trigger("submit.prevent");
    await flushPromises();

    expect(createCustomField).toHaveBeenCalledTimes(1);
    const arg = createCustomField.mock.calls[0][0];
    expect(arg.label).toBe("Stage");
    expect(arg.type).toBe("enum");
    expect(arg.required).toBe(true);
    expect(arg.enumValues).toEqual(["lead", "won"]); // parsed + trimmed + empties dropped
  });
});

describe("fields.vue — edit locks the type", () => {
  it("P-06: opening edit disables the type Select and shows the lock hint", async () => {
    const w = await mountPage([field({ id: "f1", label: "Plan Tier", type: "number" })]);
    const editBtn = w.findAll(".cf-link").find((b) => b.text() === "Edit")!;
    await editBtn.trigger("click");
    await flushPromises();
    const typeSelect = w.find(".cf-modal select");
    expect(typeSelect.attributes("disabled")).toBeDefined();
    expect(w.text()).toContain("can't change after creation");
  });

  it("editing patches label + required (not key/type) via updateCustomField", async () => {
    updateCustomField.mockResolvedValue(field({ label: "Renamed" }));
    const w = await mountPage([field({ id: "f1", label: "Plan Tier", type: "text" })]);
    await w.findAll(".cf-link").find((b) => b.text() === "Edit")!.trigger("click");
    await flushPromises();
    await w.find('.cf-modal input[type="text"]').setValue("Renamed");
    await w.find('.cf-modal input[type="checkbox"]').setValue(true);
    await w.find(".cf-modal form").trigger("submit.prevent");
    await flushPromises();
    expect(updateCustomField).toHaveBeenCalledTimes(1);
    const [id, patch] = updateCustomField.mock.calls[0];
    expect(id).toBe("f1");
    expect(patch.label).toBe("Renamed");
    expect(patch.required).toBe(true);
    expect(patch).not.toHaveProperty("key");
    expect(patch).not.toHaveProperty("type");
  });
});

describe("fields.vue — empty state", () => {
  it("P-09: an empty registry renders the empty block + a New field action", async () => {
    const w = await mountPage([]);
    expect(w.text()).toContain("No custom fields yet");
    expect(w.findAll("button").some((b) => b.text().includes("New field"))).toBe(true);
  });
});
