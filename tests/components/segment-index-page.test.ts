// @vitest-environment happy-dom
//
// Component tests for pages/app/segments/index.vue — the list view's pure
// rule-summary rendering plus the duplicate / delete action handlers.
// Covers the doc's LI-* cases (docs/testing/segments.md §3):
//   LI-01 (rule summary), LI-02 (empty/null → "all contacts"),
//   LI-03 (last_n_days special-case), LI-04 (kind pill tone),
//   LI-05 (delete confirms → deleteSegment + reload),
//   LI-06 (delete cancel → no cloud call),
//   LI-07 (duplicate → duplicateSegment + reload),
//   LI-08 (action error surfaces), LI-09 (empty state), LI-10 (load error).
//
// The page is a Nuxt SFC that leans on auto-imported Vue + Nuxt helpers
// (ref/computed/onMounted/useRouter/useHead/definePageMeta). plugin-vue
// compiles the SFC but does NOT inject those, so we shim them onto globalThis
// before importing the page. useSegments is mocked so listSegments /
// duplicateSegment / deleteSegment are spies; the real OPERATOR_LABELS export
// is preserved (the summary helper imports it).
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

// ── mock the segments composable ──────────────────────────────────────────────
// Keep the real OPERATOR_LABELS (summarizeRules imports it) but swap the
// data-fetching/mutating functions for spies.
const listSegments = vi.fn();
const duplicateSegment = vi.fn();
const deleteSegment = vi.fn();

vi.mock("~/composables/app/useSegments", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "~/composables/app/useSegments",
  );
  return {
    ...actual,
    useSegments: () => ({ listSegments, duplicateSegment, deleteSegment }),
  };
});

// useRouter is consumed at setup time; shim a spy-backed router.
const routerPush = vi.fn();
g.useRouter = () => ({ push: routerPush, replace: vi.fn() });

import IndexPage from "../../pages/app/segments/index.vue";

// ── child-component stubs ─────────────────────────────────────────────────────
const stub = (name: string, tag = "div") =>
  defineComponent({
    name,
    inheritAttrs: false,
    emits: ["click"],
    setup(_, { slots, emit }) {
      return () => h(tag, { onClick: () => emit("click") }, slots.default?.());
    },
  });

const STUBS = {
  // Button forwards click + renders slot so we can target action buttons by text.
  Button: defineComponent({
    name: "Button",
    inheritAttrs: false,
    props: { disabled: { type: Boolean, default: false } },
    emits: ["click"],
    setup(props, { slots, emit }) {
      return () =>
        h(
          "button",
          { disabled: props.disabled, onClick: () => !props.disabled && emit("click") },
          slots.default?.(),
        );
    },
  }),
  Pill: defineComponent({
    name: "Pill",
    props: { tone: { type: String, default: "neutral" } },
    setup(props, { slots }) {
      return () => h("span", { class: "pill", "data-tone": props.tone }, slots.default?.());
    },
  }),
  EmptyState: defineComponent({
    name: "EmptyState",
    props: { title: { type: String, default: "" }, subtitle: { type: String, default: "" } },
    setup(props) {
      return () => h("div", { class: "empty-state" }, props.title);
    },
  }),
  TableShell: defineComponent({
    name: "TableShell",
    setup(_, { slots }) {
      return () =>
        h("table", [h("thead", [h("tr", slots.head?.())]), h("tbody", slots.body?.())]);
    },
  }),
  NuxtLink: stub("NuxtLink", "a"),
  SectionEyebrow: stub("SectionEyebrow", "span"),
};

function mountIndex() {
  return mountWithPinia(IndexPage, { global: { stubs: STUBS } });
}

const seg = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "Gmail subs",
  list: null,
  listName: null,
  kind: "dynamic",
  rules: { op: "and", conditions: [{ field: "email", operator: "contains", value: "@gmail.com" }] },
  staticContacts: [],
  lastEvaluatedAt: null,
  lastCount: 3,
  ...over,
});

beforeEach(() => {
  listSegments.mockReset();
  duplicateSegment.mockReset();
  deleteSegment.mockReset();
  routerPush.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("index.vue — rule summary column (LI-01, LI-02, LI-03)", () => {
  it("renders a compact 'field op \"value\"' summary, nested groups parenthesized", async () => {
    listSegments.mockResolvedValue([
      seg({ id: "a", name: "Simple", rules: { op: "and", conditions: [{ field: "email", operator: "contains", value: "@gmail.com" }] } }),
      seg({
        id: "b",
        name: "Nested",
        rules: {
          op: "and",
          conditions: [
            { field: "status", operator: "eq", value: "subscribed" },
            { op: "or", conditions: [{ field: "country", operator: "eq", value: "US" }] },
          ],
        },
      }),
    ]);
    const wrapper = mountIndex();
    await flushPromises();

    const ruleCells = wrapper.findAll(".tbl-rule").map((c) => c.attributes("title"));
    expect(ruleCells[0]).toBe('email contains "@gmail.com"');
    // Nested group is wrapped in parens and joined with the parent's AND.
    expect(ruleCells[1]).toBe('status is "subscribed" AND (country is "US")');
  });

  it("null / empty rules summarize to 'all contacts'", async () => {
    listSegments.mockResolvedValue([
      seg({ id: "a", rules: null }),
      seg({ id: "b", rules: { op: "and", conditions: [] } }),
    ]);
    const wrapper = mountIndex();
    await flushPromises();
    const ruleCells = wrapper.findAll(".tbl-rule").map((c) => c.attributes("title"));
    expect(ruleCells[0]).toBe("all contacts");
    expect(ruleCells[1]).toBe("all contacts");
  });

  it("last_n_days is special-cased to 'field in last N days'", async () => {
    listSegments.mockResolvedValue([
      seg({ rules: { op: "and", conditions: [{ field: "subscribedAt", operator: "last_n_days", value: 7 }] } }),
    ]);
    const wrapper = mountIndex();
    await flushPromises();
    expect(wrapper.find(".tbl-rule").attributes("title")).toBe("subscribedAt in last 7 days");
  });

  it("unary operators omit the value in the summary", async () => {
    listSegments.mockResolvedValue([
      seg({ rules: { op: "and", conditions: [{ field: "firstName", operator: "is_empty" }] } }),
    ]);
    const wrapper = mountIndex();
    await flushPromises();
    expect(wrapper.find(".tbl-rule").attributes("title")).toBe("firstName is empty");
  });
});

describe("index.vue — kind pill tone (LI-04)", () => {
  it("dynamic → brand tone, static → neutral tone", async () => {
    listSegments.mockResolvedValue([
      seg({ id: "dyn", kind: "dynamic" }),
      seg({ id: "stat", kind: "static" }),
    ]);
    const wrapper = mountIndex();
    await flushPromises();
    const pills = wrapper.findAll(".pill");
    expect(pills[0].attributes("data-tone")).toBe("brand");
    expect(pills[1].attributes("data-tone")).toBe("neutral");
  });
});

describe("index.vue — delete handler (LI-05, LI-06)", () => {
  it("confirmed delete calls deleteSegment then reloads the list", async () => {
    listSegments.mockResolvedValue([seg()]);
    deleteSegment.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const wrapper = mountIndex();
    await flushPromises();
    listSegments.mockClear(); // ignore the initial load; assert the reload

    const delBtn = wrapper.findAll("button").find((b) => b.text() === "Delete");
    await delBtn!.trigger("click");
    await flushPromises();

    expect(deleteSegment).toHaveBeenCalledWith("s1");
    expect(listSegments).toHaveBeenCalledTimes(1); // the reload
  });

  it("cancelled delete makes no cloud call", async () => {
    listSegments.mockResolvedValue([seg()]);
    vi.spyOn(window, "confirm").mockReturnValue(false);

    const wrapper = mountIndex();
    await flushPromises();
    listSegments.mockClear();

    const delBtn = wrapper.findAll("button").find((b) => b.text() === "Delete");
    await delBtn!.trigger("click");
    await flushPromises();

    expect(deleteSegment).not.toHaveBeenCalled();
    expect(listSegments).not.toHaveBeenCalled();
  });
});

describe("index.vue — duplicate handler (LI-07, LI-08)", () => {
  it("duplicate calls duplicateSegment with the raw row then reloads", async () => {
    const row = seg();
    listSegments.mockResolvedValue([row]);
    duplicateSegment.mockResolvedValue(seg({ id: "s2", name: "Gmail subs (copy)" }));

    const wrapper = mountIndex();
    await flushPromises();
    listSegments.mockClear();

    const dupBtn = wrapper.findAll("button").find((b) => b.text() === "Duplicate");
    await dupBtn!.trigger("click");
    await flushPromises();

    expect(duplicateSegment).toHaveBeenCalledTimes(1);
    expect(duplicateSegment.mock.calls[0][0]).toMatchObject({ id: "s1", name: "Gmail subs" });
    expect(listSegments).toHaveBeenCalledTimes(1);
  });

  it("a failed action surfaces actionError and does not crash", async () => {
    listSegments.mockResolvedValue([seg()]);
    duplicateSegment.mockRejectedValue(new Error("nope"));

    const wrapper = mountIndex();
    await flushPromises();

    const dupBtn = wrapper.findAll("button").find((b) => b.text() === "Duplicate");
    await dupBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.find(".seg-state-error").text()).toBe("nope");
  });
});

describe("index.vue — list states (LI-09, LI-10)", () => {
  it("renders the EmptyState when there are no segments", async () => {
    listSegments.mockResolvedValue([]);
    const wrapper = mountIndex();
    await flushPromises();
    expect(wrapper.find(".empty-state").exists()).toBe(true);
    expect(wrapper.find("table").exists()).toBe(false);
  });

  it("renders a load-error message instead of the table when listSegments rejects", async () => {
    listSegments.mockRejectedValue(new Error("boom"));
    const wrapper = mountIndex();
    await flushPromises();
    expect(wrapper.find(".seg-state-error").text()).toBe("boom");
    expect(wrapper.find("table").exists()).toBe(false);
  });
});
