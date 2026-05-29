// @vitest-environment happy-dom
// L3 component tests for the audiences index page (pages/app/audiences/index.vue)
// — the create-modal blank-name guard (P-01), success prepend (P-02), the
// client-side delete guard that blocks a non-empty audience with an alert
// (P-03), the empty-audience confirm→delete path (P-04), the KPI strip totals +
// engagement placeholder (P-05), and the empty state (P-09).
//
// The real SFC is mounted (@vitejs/plugin-vue). useAudiences is mocked; the
// AppKpiCard / AppAudienceCard auto-imported children are shallow-stubbed so we
// can read their props without pulling in chart deps. window.alert / confirm are
// spied per case.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import * as Vue from "vue";
import { mountWithPinia } from "../setup/vueTest";

for (const name of ["computed", "ref", "reactive", "watch", "onMounted", "nextTick"] as const) {
  vi.stubGlobal(name, (Vue as any)[name]);
}
vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

const listAudiences = vi.fn();
const createAudience = vi.fn();
const updateAudience = vi.fn();
const deleteAudience = vi.fn();
vi.mock("~/composables/app/useAudiences", () => ({
  useAudiences: () => ({ listAudiences, createAudience, updateAudience, deleteAudience }),
}));

import Page from "../../pages/app/audiences/index.vue";
import TextInput from "../../components/shared/TextInput.vue";
import FormField from "../../components/shared/FormField.vue";
import EmptyState from "../../components/shared/EmptyState.vue";

const ButtonStub = {
  inheritAttrs: false,
  props: ["disabled", "loading", "variant", "size", "type", "to", "title"],
  template:
    '<button class="btn" :disabled="disabled || loading" v-bind="$attrs"><slot name="leading" /><slot /></button>',
};
// Capture the props each card receives so KPI / card assertions can read them.
const KpiStub = {
  props: ["label", "value", "delta", "deltaDirection"],
  template: '<div class="kpi" :data-label="label" :data-value="value">{{ value }}</div>',
};
const AudienceCardStub = {
  props: ["id", "name", "count", "tag"],
  template: '<div class="aud-card" :data-name="name" :data-count="count">{{ name }}</div>',
};

const components = {
  Button: ButtonStub,
  TextInput,
  FormField,
  EmptyState,
  AppKpiCard: KpiStub,
  AppAudienceCard: AudienceCardStub,
};
const stubs = { NuxtLink: { template: "<a><slot /></a>" } };

function audience(over: Record<string, any> = {}) {
  return { id: "a1", name: "Newsletter", description: "", contactCount: 0, archived: false, createdAt: null, ...over };
}

async function mountPage(rows: any[] = []) {
  listAudiences.mockResolvedValue(rows);
  const w = mountWithPinia(Page, { global: { components, stubs } });
  await flushPromises();
  return w;
}

afterEach(() => vi.clearAllMocks());

describe("index.vue — create modal", () => {
  it("P-01: a blank name blocks submit and shows the error", async () => {
    const w = await mountPage([audience()]);
    // Open the create modal (the header "New audience" button).
    const newBtn = w.findAll("button").find((b) => b.text().includes("New audience"))!;
    await newBtn.trigger("click");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain("Name is required.");
    expect(createAudience).not.toHaveBeenCalled();
  });

  it("P-02: a successful create prepends the new card and closes the modal", async () => {
    const w = await mountPage([audience({ id: "old", name: "Old" })]);
    createAudience.mockResolvedValue(audience({ id: "new", name: "Fresh" }));
    const newBtn = w.findAll("button").find((b) => b.text().includes("New audience"))!;
    await newBtn.trigger("click");
    await w.find('input[placeholder="e.g. Newsletter subscribers"]').setValue("Fresh");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(createAudience).toHaveBeenCalledWith("Fresh", "");
    const cardNames = w.findAll(".aud-card").map((c) => c.attributes("data-name"));
    expect(cardNames[0]).toBe("Fresh"); // prepended
    expect(cardNames).toContain("Old");
    expect(w.find(".aud-modal").exists()).toBe(false); // modal closed
  });
});

describe("index.vue — rename modal", () => {
  it("rename validates a blank name and otherwise patches the row", async () => {
    const w = await mountPage([audience({ id: "a1", name: "Before" })]);
    const renameBtn = w.findAll(".aud-cell-actions .btn").find((b) => b.text() === "Rename")!;
    await renameBtn.trigger("click");
    // Blank → blocked.
    const nameInput = w.findAll(".aud-modal input")[0];
    await nameInput.setValue("   ");
    await w.find(".aud-modal form").trigger("submit.prevent");
    await flushPromises();
    expect(w.text()).toContain("Name is required.");
    expect(updateAudience).not.toHaveBeenCalled();

    // Valid → patches.
    updateAudience.mockResolvedValue(audience({ id: "a1", name: "After" }));
    await nameInput.setValue("After");
    await w.find(".aud-modal form").trigger("submit.prevent");
    await flushPromises();
    expect(updateAudience).toHaveBeenCalledWith("a1", { name: "After", description: "" });
    expect(w.find(".aud-card").attributes("data-name")).toBe("After");
  });
});

describe("index.vue — guarded delete", () => {
  it("P-03: delete is blocked client-side with an alert when contactCount > 0", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const w = await mountPage([audience({ id: "a1", name: "Big", contactCount: 5 })]);
    const delBtn = w.findAll(".aud-cell-actions .btn").find((b) => b.text() === "Delete")!;
    await delBtn.trigger("click");
    await flushPromises();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(deleteAudience).not.toHaveBeenCalled();
    alertSpy.mockRestore();
    confirmSpy.mockRestore();
  });

  it("P-04: an empty audience deletes after confirm and the row is removed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteAudience.mockResolvedValue({ ok: true });
    const w = await mountPage([
      audience({ id: "a1", name: "Empty", contactCount: 0 }),
      audience({ id: "a2", name: "Other", contactCount: 0 }),
    ]);
    const delBtn = w
      .findAll(".aud-cell")
      .find((cell) => cell.attributes("data-name") === undefined && cell.text().includes("Empty"))!
      .findAll(".btn")
      .find((b) => b.text() === "Delete")!;
    await delBtn.trigger("click");
    await flushPromises();
    expect(deleteAudience).toHaveBeenCalledWith("a1");
    const names = w.findAll(".aud-card").map((c) => c.attributes("data-name"));
    expect(names).not.toContain("Empty");
    expect(names).toContain("Other");
    confirmSpy.mockRestore();
  });

  it("P-04: cancelling the confirm leaves the audience in place", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const w = await mountPage([audience({ id: "a1", name: "Empty", contactCount: 0 })]);
    const delBtn = w.findAll(".aud-cell-actions .btn").find((b) => b.text() === "Delete")!;
    await delBtn.trigger("click");
    await flushPromises();
    expect(deleteAudience).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});

describe("index.vue — KPI strip + empty state", () => {
  it("P-05: total subscribers sums contactCount; engagement is the '—' placeholder", async () => {
    const w = await mountPage([
      audience({ id: "a1", contactCount: 10 }),
      audience({ id: "a2", contactCount: 32 }),
    ]);
    const kpis = w.findAll(".kpi");
    const byLabel = Object.fromEntries(
      kpis.map((k) => [k.attributes("data-label"), k.attributes("data-value")]),
    );
    expect(byLabel["Total subscribers"]).toBe("42");
    expect(byLabel["Average engagement"]).toBe("—"); // placeholder until sends ship
    expect(byLabel["Audiences"]).toBe("2");
  });

  it("P-09: an empty audience list renders the EmptyState with the New action", async () => {
    const w = await mountPage([]);
    expect(w.text()).toContain("No audiences yet");
    // The empty-state action button is present.
    expect(w.findAll("button").some((b) => b.text().includes("New audience"))).toBe(true);
  });
});
