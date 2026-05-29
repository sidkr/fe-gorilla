// @vitest-environment happy-dom
// L3 component tests for the audience-detail page (pages/app/audiences/[id].vue)
// — the registry-driven dynamic contact form (D-01..D-08), required-field +
// email client guards, the dup-email "Open contact" affordance, select-all /
// per-row selection + bulk-bar visibility (B-08..B-11), debounced search +
// page-reset-on-filter (F-09/F-10), and the pager bounds (F-12).
//
// We mount the REAL SFC (vitest.config registers @vitejs/plugin-vue) and stub
// the three domain composables so no server is needed. Nuxt auto-imports that
// the SFC relies on (definePageMeta / useHead) are stubbed as globals; the
// shared form primitives (TextInput/SelectInput/Checkbox/FormField/…) are
// registered as real components so the rendered controls are genuinely
// exercised. NuxtLink + the two App* card components are shallow-stubbed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as Vue from "vue";
import { mountWithPinia } from "../setup/vueTest";

// ── Nuxt macro/auto-import stubs (must be defined before importing the SFC) ────
// Nuxt auto-imports Vue reactivity APIs (computed/ref/watch/…) AND resolveComponent
// into SFCs; some shared SFCs (e.g. Button.vue) rely on that and don't import
// them. Expose the real Vue functions as globals so those SFCs compile in tests.
for (const name of [
  "computed",
  "ref",
  "reactive",
  "watch",
  "watchEffect",
  "onMounted",
  "onBeforeMount",
  "onUnmounted",
  "nextTick",
] as const) {
  vi.stubGlobal(name, (Vue as any)[name]);
}
vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

// vue-router: the SFC imports useRoute from "vue-router" directly.
const routeParams = { id: "list-1" };
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: routeParams }),
}));

// ── Domain composable mocks. Each test sets behavior via the spies below. ──────
const getAudience = vi.fn();
const listContacts = vi.fn();
const addContact = vi.fn();
const updateContact = vi.fn();
const deleteContactCloud = vi.fn();
const bulkDeleteContacts = vi.fn();
const bulkTagContacts = vi.fn();
const listCustomFields = vi.fn();

vi.mock("~/composables/app/useAudiences", () => ({
  useAudiences: () => ({ getAudience }),
}));
vi.mock("~/composables/app/useContacts", () => ({
  useContacts: () => ({
    listContacts,
    addContact,
    updateContact,
    deleteContact: deleteContactCloud,
    bulkDeleteContacts,
    bulkTagContacts,
  }),
}));
vi.mock("~/composables/app/useCustomFields", () => ({
  useCustomFields: () => ({ listCustomFields }),
}));

import Page from "../../pages/app/audiences/[id].vue";
import TextInput from "../../components/shared/TextInput.vue";
import SelectInput from "../../components/shared/SelectInput.vue";
import Checkbox from "../../components/shared/Checkbox.vue";
import FormField from "../../components/shared/FormField.vue";
import TableShell from "../../components/shared/TableShell.vue";
import EmptyState from "../../components/shared/EmptyState.vue";

const REGISTRY = [
  { id: "f-plan", key: "plan_tier", label: "Plan Tier", type: "enum", enumValues: ["free", "pro", "enterprise"], required: false, order: 0 },
  { id: "f-seats", key: "seats", label: "Seats", type: "number", enumValues: [], required: false, order: 1 },
  { id: "f-vip", key: "vip", label: "VIP", type: "boolean", enumValues: [], required: false, order: 2 },
  { id: "f-joined", key: "joined", label: "Joined", type: "date", enumValues: [], required: false, order: 3 },
  { id: "f-nick", key: "nickname", label: "Nickname", type: "text", enumValues: [], required: true, order: 4 },
];

function contact(over: Record<string, any> = {}) {
  return {
    id: "c1",
    email: "person@example.com",
    firstName: "Pat",
    lastName: "",
    status: "subscribed",
    company: "",
    phone: "",
    city: "",
    country: "",
    timezone: "",
    tags: [],
    consent: null,
    customFields: {},
    lists: ["list-1"],
    deleted: false,
    createdAt: "2026-05-01T00:00:00.000Z",
    ...over,
  };
}

// Button is stubbed (not the real SFC): the real Button calls
// resolveComponent("NuxtLink") which recurses under VTU's stub registry. The
// stub renders a real <button> carrying `.btn` + the disabled state + slot text,
// which is all our assertions (selectors, text, disabled bounds) depend on.
const ButtonStub = {
  inheritAttrs: false,
  props: ["disabled", "loading", "variant", "size", "type", "to"],
  template:
    '<button class="btn" :disabled="disabled || loading" v-bind="$attrs"><slot name="leading" /><slot /></button>',
};
const stubs = {
  NuxtLink: { template: "<a><slot /></a>" },
};
const components = {
  Button: ButtonStub,
  TextInput,
  SelectInput,
  Checkbox,
  FormField,
  TableShell,
  EmptyState,
};

// Mount + wait for the onMounted load chain (loadAudience/loadCustomFields,
// then loadContacts) to settle.
async function mountPage(opts: {
  rows?: any[];
  total?: number;
  fields?: any[];
  audience?: any;
} = {}) {
  getAudience.mockResolvedValue(
    opts.audience ?? { id: "list-1", name: "Newsletter", description: "", contactCount: opts.total ?? (opts.rows?.length ?? 0), archived: false },
  );
  listCustomFields.mockResolvedValue(opts.fields ?? []);
  listContacts.mockResolvedValue({
    rows: opts.rows ?? [],
    total: opts.total ?? (opts.rows?.length ?? 0),
    page: 0,
    perPage: 25,
  });
  const wrapper = mountWithPinia(Page, { global: { stubs, components } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  vi.useRealTimers();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("[id].vue — dynamic custom-field form (registry-driven)", () => {
  it("D-01: the custom-field section is hidden when the registry is empty", async () => {
    const w = await mountPage({ rows: [], fields: [] });
    await w.find("header .btn").trigger("click"); // open Add
    expect(w.text()).not.toContain("Custom fields");
  });

  it("D-01/D-02: renders one control per field with the correct type per field", async () => {
    const w = await mountPage({ rows: [], fields: REGISTRY });
    await w.find("header .btn").trigger("click");

    expect(w.text()).toContain("Custom fields");

    // enum → a <select> with a leading "—" placeholder + each enumValue.
    const selects = w.findAll("select");
    // statusFilter + form.status + enum field = 3 selects total in add modal.
    const enumSelect = selects.find((s) =>
      s.findAll("option").some((o) => o.text() === "enterprise"),
    )!;
    expect(enumSelect).toBeTruthy();
    const optTexts = enumSelect.findAll("option").map((o) => o.text());
    expect(optTexts[0]).toBe("—");
    expect(optTexts).toContain("free");
    expect(optTexts).toContain("pro");

    // number → input[type=number]; date → input[type=date]; boolean → checkbox.
    expect(w.find('input[type="number"]').exists()).toBe(true);
    expect(w.find('input[type="date"]').exists()).toBe(true);
    // The boolean field renders the shared Checkbox (a real type=checkbox input
    // beyond the table's select-all). The modal has its own checkbox for VIP.
    expect(w.findAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(1);
  });

  it("D-06: submitting with an empty email blocks the call and shows the error", async () => {
    const w = await mountPage({ rows: [], fields: REGISTRY });
    await w.find("header .btn").trigger("click");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain("Email is required.");
    expect(addContact).not.toHaveBeenCalled();
  });

  it("D-05: a required custom field left empty blocks submit client-side", async () => {
    const w = await mountPage({ rows: [], fields: REGISTRY });
    await w.find("header .btn").trigger("click");
    // Fill a valid email, leave the required `nickname` (text) blank.
    await w.find('input[type="email"]').setValue("new@example.com");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain('"Nickname" is required.');
    expect(addContact).not.toHaveBeenCalled();
  });

  it("D-04/D-07: collectCustomFields omits blanks, keeps booleans; tags parsed from CSV", async () => {
    addContact.mockResolvedValue(contact());
    // Registry without a required field so submit goes through.
    const fields = REGISTRY.filter((f) => !f.required);
    const w = await mountPage({ rows: [], fields });
    await w.find("header .btn").trigger("click");

    await w.find('input[type="email"]').setValue("payload@example.com");
    // Tags input is the field labelled "Tags" — find the input following that
    // FormField. Easiest: set the only input[placeholder*="vip"].
    await w.find('input[placeholder="vip, beta, newsletter"]').setValue("vip, beta, ");
    // Fill the enum (plan_tier) but leave seats/date blank; toggle VIP on.
    const enumSelect = w
      .findAll("select")
      .find((s) => s.findAll("option").some((o) => o.text() === "enterprise"))!;
    await enumSelect.setValue("pro");
    // The boolean field's checkbox is the last type=checkbox in the modal.
    const boxes = w.findAll('input[type="checkbox"]');
    await boxes[boxes.length - 1].setValue(true);

    await w.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(addContact).toHaveBeenCalledTimes(1);
    const [audienceId, payload] = addContact.mock.calls[0];
    expect(audienceId).toBe("list-1");
    expect(payload.tags).toEqual(["vip", "beta"]);
    // Booleans always present; plan_tier set; blanks (seats/joined) omitted.
    expect(payload.customFields.vip).toBe(true);
    expect(payload.customFields.plan_tier).toBe("pro");
    expect(payload.customFields.seats).toBeUndefined();
    expect(payload.customFields.joined).toBeUndefined();
  });

  it("D-03: seedCustomForm hydrates the edit form from stored values per type", async () => {
    const row = contact({
      id: "c-edit",
      customFields: {
        plan_tier: "pro",
        seats: 12,
        vip: true,
        joined: "2026-05-29T12:00:00.000Z",
        nickname: "Ace",
      },
    });
    const w = await mountPage({ rows: [row], total: 1, fields: REGISTRY });
    // Click the row's Edit link (in the actions cell).
    const editLink = w.findAll("button").find((b) => b.text() === "Edit")!;
    await editLink.trigger("click");
    await flushPromises();

    // date sliced to YYYY-MM-DD.
    expect((w.find('input[type="date"]').element as HTMLInputElement).value).toBe(
      "2026-05-29",
    );
    // number stringified.
    expect((w.find('input[type="number"]').element as HTMLInputElement).value).toBe(
      "12",
    );
    // boolean coerced to checked.
    const boxes = w.findAll('input[type="checkbox"]');
    expect((boxes[boxes.length - 1].element as HTMLInputElement).checked).toBe(true);
    // enum hydrated.
    const enumSelect = w
      .findAll("select")
      .find((s) => s.findAll("option").some((o) => o.text() === "enterprise"))!;
    expect((enumSelect.element as HTMLSelectElement).value).toBe("pro");
  });

  it("D-08: a duplicate (137) surfaces the 'Open contact' affordance + opens the drawer", async () => {
    const existing = contact({ id: "c-dup", email: "dup@example.com" });
    const dupErr: any = new Error("This email is already on the list.");
    dupErr.code = 137;
    dupErr.contactId = "c-dup";
    addContact.mockRejectedValue(dupErr);

    // The dup row must be loaded so openDrawerById can find it.
    const w = await mountPage({ rows: [existing], total: 1, fields: [] });
    await w.find("header .btn").trigger("click");
    await w.find('input[type="email"]').setValue("dup@example.com");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(w.text()).toContain("already on the list");
    const openLink = w.findAll("button").find((b) => b.text() === "Open contact");
    expect(openLink).toBeTruthy();
    await openLink!.trigger("click");
    await flushPromises();
    // Drawer opened for the dup contact (its email is the drawer title).
    expect(w.find('[role="dialog"].ad-drawer').exists()).toBe(true);
  });

  it("D-09: the first two custom fields appear as extra table columns", async () => {
    const w = await mountPage({
      rows: [contact({ customFields: { plan_tier: "pro", seats: 5 } })],
      total: 1,
      fields: REGISTRY,
    });
    const headers = w.findAll("th").map((th) => th.text());
    // columnFields = first two registry entries.
    expect(headers).toContain("Plan Tier");
    expect(headers).toContain("Seats");
    // Third field is NOT a column.
    expect(headers).not.toContain("VIP");
  });
});

describe("[id].vue — selection + bulk bar (B-08..B-11)", () => {
  const rows = [contact({ id: "r1", email: "r1@x.com" }), contact({ id: "r2", email: "r2@x.com" })];

  it("B-10: the bulk bar is hidden until a row is selected", async () => {
    const w = await mountPage({ rows, total: 2, fields: [] });
    expect(w.find(".ad-bulkbar").exists()).toBe(false);
    // Select-all header checkbox is the first type=checkbox.
    await w.find('input[aria-label="Select all on this page"]').setValue(true);
    expect(w.find(".ad-bulkbar").exists()).toBe(true);
    expect(w.find(".ad-bulkbar-count").text()).toContain("2 selected");
  });

  it("B-08: select-all toggles every visible row, then clears", async () => {
    const w = await mountPage({ rows, total: 2, fields: [] });
    const selectAll = w.find('input[aria-label="Select all on this page"]');
    await selectAll.setValue(true);
    expect(w.find(".ad-bulkbar-count").text()).toContain("2 selected");
    await selectAll.setValue(false);
    expect(w.find(".ad-bulkbar").exists()).toBe(false);
  });

  it("B-09: per-row toggle is additive and Clear resets", async () => {
    const w = await mountPage({ rows, total: 2, fields: [] });
    await w.find('input[aria-label="Select r1@x.com"]').setValue(true);
    expect(w.find(".ad-bulkbar-count").text()).toContain("1 selected");
    await w.find('input[aria-label="Select r2@x.com"]').setValue(true);
    expect(w.find(".ad-bulkbar-count").text()).toContain("2 selected");
    const clear = w.findAll(".ad-bulkbar .btn").find((b) => b.text() === "Clear")!;
    await clear.trigger("click");
    expect(w.find(".ad-bulkbar").exists()).toBe(false);
  });

  it("B-11: cancelling the bulk-tag prompt is a no-op (bulkTagContacts not called)", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    const w = await mountPage({ rows, total: 2, fields: [] });
    await w.find('input[aria-label="Select all on this page"]').setValue(true);
    const addTag = w.findAll(".ad-bulkbar .btn").find((b) => b.text() === "Add tag")!;
    await addTag.trigger("click");
    await flushPromises();
    expect(bulkTagContacts).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });

  it("bulk tag uses the prompt value and calls bulkTagContacts with the selected ids", async () => {
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("  promo  ");
    bulkTagContacts.mockResolvedValue({ ok: true, updated: 2 });
    const w = await mountPage({ rows, total: 2, fields: [] });
    await w.find('input[aria-label="Select all on this page"]').setValue(true);
    const addTag = w.findAll(".ad-bulkbar .btn").find((b) => b.text() === "Add tag")!;
    await addTag.trigger("click");
    await flushPromises();
    expect(bulkTagContacts).toHaveBeenCalledWith(["r1", "r2"], "promo", "add");
    promptSpy.mockRestore();
  });
});

describe("[id].vue — search debounce + filter reset (F-09/F-10) + pager (F-12)", () => {
  it("F-09: search is debounced (one extra load after 350ms) and resets to page 0", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => contact({ id: `p${i}`, email: `p${i}@x.com` }));
    const w = await mountPage({ rows, total: 5, fields: [] });
    expect(listContacts).toHaveBeenCalledTimes(1); // initial onMounted load

    vi.useFakeTimers();
    await w.find('input[type="search"]').setValue("alp");
    await w.find('input[type="search"]').setValue("alph"); // rapid second keystroke
    // Before the debounce window, no new query.
    expect(listContacts).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(350);
    vi.useRealTimers();
    await flushPromises();

    expect(listContacts).toHaveBeenCalledTimes(2); // exactly one debounced load
    const lastArgs = listContacts.mock.calls[listContacts.mock.calls.length - 1][0];
    expect(lastArgs.page).toBe(0);
    expect(lastArgs.search).toBe("alph");
  });

  it("F-10: changing the status filter re-queries immediately and resets page", async () => {
    const w = await mountPage({ rows: [contact()], total: 1, fields: [] });
    expect(listContacts).toHaveBeenCalledTimes(1);
    const statusSelect = w.find('select[aria-label="Filter by status"]');
    await statusSelect.setValue("pending");
    await flushPromises();
    expect(listContacts).toHaveBeenCalledTimes(2);
    const lastArgs = listContacts.mock.calls[listContacts.mock.calls.length - 1][0];
    expect(lastArgs.status).toBe("pending");
    expect(lastArgs.page).toBe(0);
  });

  it("F-11: the tag filter dropdown only renders when loaded rows carry tags", async () => {
    const w1 = await mountPage({ rows: [contact({ tags: [] })], total: 1, fields: [] });
    expect(w1.find('select[aria-label="Filter by tag"]').exists()).toBe(false);

    const w2 = await mountPage({ rows: [contact({ tags: ["vip"] })], total: 1, fields: [] });
    expect(w2.find('select[aria-label="Filter by tag"]').exists()).toBe(true);
  });

  it("F-12: pager Prev disabled on page 0; Next disabled on the last page", async () => {
    // One page worth of rows: both bounds collapse → Prev + Next disabled.
    const w = await mountPage({ rows: [contact()], total: 1, fields: [] });
    const prev = w.findAll(".ad-pager .btn").find((b) => b.text() === "Previous")!;
    const next = w.findAll(".ad-pager .btn").find((b) => b.text() === "Next")!;
    expect(prev.attributes("disabled")).toBeDefined();
    expect(next.attributes("disabled")).toBeDefined();
  });

  it("F-12: with two pages, Next is enabled on page 0 and advances the query", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => contact({ id: `n${i}`, email: `n${i}@x.com` }));
    const w = await mountPage({ rows, total: 50, fields: [] }); // perPage 25 → 2 pages
    const next = w.findAll(".ad-pager .btn").find((b) => b.text() === "Next")!;
    expect(next.attributes("disabled")).toBeUndefined();
    await next.trigger("click");
    await flushPromises();
    const lastArgs = listContacts.mock.calls[listContacts.mock.calls.length - 1][0];
    expect(lastArgs.page).toBe(1);
  });
});
