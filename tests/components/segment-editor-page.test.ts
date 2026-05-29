// @vitest-environment happy-dom
//
// Component tests for pages/app/segments/[id].vue — the create/edit editor's
// save guard and debounced live-preview logic. Covers the doc's ED-* cases
// (docs/testing/segments.md §3):
//   ED-01 (preview debounced ~400ms), ED-02 (preview error → "—"),
//   ED-03 (initial preview on mount), ED-04 (save disabled until name),
//   ED-05 (create navigates to saved id), ED-06 (edit prefills from getSegment,
//   null rules → empty group), ED-07 (debounce timer cleared on unmount).
//
// As with the index page, the SFC needs Vue + Nuxt helpers shimmed onto
// globalThis (plugin-vue compiles the SFC but does not auto-import them).
// useSegments + useCustomFields are mocked so the cloud functions are spies;
// useRoute/useRouter are shimmed per-test so the "new" vs "edit" branch is
// selectable.
import {
  ref,
  computed,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";

const g = globalThis as Record<string, unknown>;
Object.assign(g, {
  ref,
  computed,
  reactive,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
  definePageMeta: () => {},
  useHead: () => {},
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { mountWithPinia } from "../setup/vueTest";

// ── mocked composables ────────────────────────────────────────────────────────
const getSegment = vi.fn();
const createSegment = vi.fn();
const updateSegment = vi.fn();
const evaluateSegment = vi.fn();
const listCustomFields = vi.fn();

vi.mock("~/composables/app/useSegments", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "~/composables/app/useSegments",
  );
  return {
    ...actual,
    useSegments: () => ({ getSegment, createSegment, updateSegment, evaluateSegment }),
  };
});
vi.mock("~/composables/app/useCustomFields", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "~/composables/app/useCustomFields",
  );
  return { ...actual, useCustomFields: () => ({ listCustomFields }) };
});

// route/router shims — reassigned per-mount.
const routerReplace = vi.fn();
const routerPush = vi.fn();
let routeParamsId = "new";
g.useRoute = () => ({ params: { get id() { return routeParamsId; } } });
g.useRouter = () => ({ replace: routerReplace, push: routerPush });

import EditorPage from "../../pages/app/segments/[id].vue";

// ── child stubs ───────────────────────────────────────────────────────────────
const TextInputStub = defineComponent({
  name: "TextInput",
  inheritAttrs: false,
  props: { modelValue: { type: [String, Number], default: "" } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("input", {
        value: props.modelValue,
        onInput: (e: Event) => emit("update:modelValue", (e.target as HTMLInputElement).value),
      });
  },
});
const ButtonStub = defineComponent({
  name: "Button",
  inheritAttrs: false,
  props: { disabled: { type: Boolean, default: false }, loading: { type: Boolean, default: false } },
  emits: ["click"],
  setup(props, { slots, emit }) {
    return () =>
      h(
        "button",
        { disabled: props.disabled, onClick: () => !props.disabled && emit("click") },
        slots.default?.(),
      );
  },
});
const RuleBuilderStub = defineComponent({
  name: "AppSegmentRuleBuilder",
  props: { modelValue: { type: Object, default: () => ({}) }, customFields: { type: Array, default: () => [] } },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    // Expose a button that mutates the rule tree so we can drive the watcher.
    return () =>
      h("button", {
        class: "rb-mutate",
        onClick: () =>
          emit("update:modelValue", {
            op: "and",
            conditions: [{ field: "email", operator: "contains", value: Math.random().toString() }],
          }),
      });
  },
});

const STUBS = {
  TextInput: TextInputStub,
  Button: ButtonStub,
  AppSegmentRuleBuilder: RuleBuilderStub,
  NuxtLink: defineComponent({ name: "NuxtLink", setup: (_, { slots }) => () => h("a", slots.default?.()) }),
  SectionEyebrow: defineComponent({ name: "SectionEyebrow", setup: (_, { slots }) => () => h("span", slots.default?.()) }),
};

function mountEditor() {
  return mountWithPinia(EditorPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  routeParamsId = "new";
  getSegment.mockReset();
  createSegment.mockReset();
  updateSegment.mockReset();
  evaluateSegment.mockReset();
  listCustomFields.mockReset();
  routerReplace.mockReset();
  routerPush.mockReset();
  listCustomFields.mockResolvedValue([]);
  evaluateSegment.mockResolvedValue({ count: 0, sample: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// Find the primary action button (Create / Save) by its label text.
function primaryButton(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAll("button").find((b) => /Create segment|Save changes|Saving/.test(b.text()));
}

describe("[id].vue — initial preview on mount (ED-03)", () => {
  it("runs one preview({ rules, preview:true }) after mount", async () => {
    const wrapper = mountEditor();
    await flushPromises();
    expect(evaluateSegment).toHaveBeenCalledTimes(1);
    expect(evaluateSegment).toHaveBeenCalledWith({
      rules: { op: "and", conditions: [] },
      preview: true,
    });
    wrapper.unmount();
  });
});

describe("[id].vue — debounced preview (ED-01, ED-07)", () => {
  it("rapid rule mutations collapse into a single debounced preview call", async () => {
    vi.useFakeTimers();
    const wrapper = mountEditor();
    // Let onMounted's async load + initial preview settle.
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    evaluateSegment.mockClear();

    // Three rapid mutations via the rule-builder stub.
    const mutate = wrapper.find(".rb-mutate");
    await mutate.trigger("click");
    await mutate.trigger("click");
    await mutate.trigger("click");

    // Before the debounce window elapses, no new preview.
    expect(evaluateSegment).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(evaluateSegment).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("a pending debounce timer is cleared on unmount (no post-unmount preview)", async () => {
    vi.useFakeTimers();
    const wrapper = mountEditor();
    await vi.runOnlyPendingTimersAsync();
    await flushPromises();
    evaluateSegment.mockClear();

    await wrapper.find(".rb-mutate").trigger("click"); // schedules a 400ms preview
    wrapper.unmount(); // onBeforeUnmount clears the timer
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(evaluateSegment).not.toHaveBeenCalled();
  });
});

describe("[id].vue — preview error (ED-02)", () => {
  it("a rejected preview surfaces previewError and renders the '—' count", async () => {
    evaluateSegment.mockRejectedValue(new Error("bad rule"));
    const wrapper = mountEditor();
    await flushPromises();
    expect(wrapper.find(".se-preview-err").text()).toBe("bad rule");
    expect(wrapper.find(".se-count-num").text()).toBe("—");
    wrapper.unmount();
  });
});

describe("[id].vue — save guard (ED-04)", () => {
  it("Create is disabled while the name is blank and enabled once typed", async () => {
    const wrapper = mountEditor();
    await flushPromises();

    const btn = primaryButton(wrapper)!;
    expect(btn.attributes("disabled")).toBeDefined();

    // Type a name into the name field (the first TextInput stub).
    await wrapper.find("input").setValue("Engaged");
    await nextTick();
    expect(primaryButton(wrapper)!.attributes("disabled")).toBeUndefined();
    expect(createSegment).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe("[id].vue — create flow (ED-05)", () => {
  it("create navigates to the saved segment's editor", async () => {
    createSegment.mockResolvedValue({ id: "abc" });
    const wrapper = mountEditor();
    await flushPromises();

    await wrapper.find("input").setValue("My segment");
    await nextTick();
    await primaryButton(wrapper)!.trigger("click");
    await flushPromises();

    expect(createSegment).toHaveBeenCalledTimes(1);
    expect(createSegment.mock.calls[0][0]).toMatchObject({ name: "My segment", kind: "dynamic" });
    expect(routerReplace).toHaveBeenCalledWith("/app/segments/abc");
    wrapper.unmount();
  });
});

describe("[id].vue — edit prefill (ED-06)", () => {
  it("prefills name/kind/rules from getSegment", async () => {
    routeParamsId = "seg-7";
    getSegment.mockResolvedValue({
      id: "seg-7",
      name: "Saved one",
      kind: "static",
      rules: { op: "or", conditions: [{ field: "status", operator: "eq", value: "subscribed" }] },
    });
    const wrapper = mountEditor();
    await flushPromises();

    // Name input reflects the loaded value.
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("Saved one");
    // The static radio is selected.
    const staticRadio = wrapper.find("input[type='radio'][value='static']");
    expect((staticRadio.element as HTMLInputElement).checked).toBe(true);
    wrapper.unmount();
  });

  it("a saved segment with null rules falls back to an empty AND group", async () => {
    routeParamsId = "seg-8";
    getSegment.mockResolvedValue({ id: "seg-8", name: "No rules", kind: "dynamic", rules: null });
    const wrapper = mountEditor();
    await flushPromises();

    // The initial preview should evaluate the fallback empty group.
    expect(evaluateSegment).toHaveBeenCalledWith({
      rules: { op: "and", conditions: [] },
      preview: true,
    });
    wrapper.unmount();
  });
});
