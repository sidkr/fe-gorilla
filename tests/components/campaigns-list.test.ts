// @vitest-environment happy-dom
// Component + composable coverage for the Campaigns surface, from
// docs/testing/campaigns-editor.md:
//   - useCampaigns wrappers (CM-01/02): each typed wrapper calls runCloud with
//     the right cloud-fn name + params and passes the result / error through.
//   - MergeTagPicker.vue (MT-24/25/26): grouped Standard/Custom dropdown, lazy
//     load on first open, emits insert(formatTag(token)), Escape dismissal.
//   - Campaigns index row-action gating (LS-02): the status×op matrix the kebab
//     menu enforces — sent has no Edit/Rename, sending has only Duplicate,
//     draft has every action.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── useCampaigns wrappers (CM-01/02) ──────────────────────────────────────
// Mirror tests/components/useSending.test.ts: mock the single useCloud seam.
const runCloud = vi.fn();
vi.mock("~/composables/app/useCloud", () => ({
  useCloud: () => ({ runCloud }),
}));

import { useCampaigns } from "../../composables/app/useCampaigns";

describe("useCampaigns wrappers (CM-01/02)", () => {
  afterEach(() => runCloud.mockReset());

  it("each wrapper calls the matching cloud fn with the expected params", async () => {
    runCloud.mockResolvedValue({ ok: true });
    const {
      listCampaigns,
      getCampaign,
      duplicateCampaign,
      archiveCampaign,
      renameCampaign,
      updateCampaign,
      deleteCampaign,
    } = useCampaigns();

    await listCampaigns();
    expect(runCloud).toHaveBeenLastCalledWith("listCampaigns");

    await getCampaign("c1");
    expect(runCloud).toHaveBeenLastCalledWith("getCampaign", { id: "c1" });

    await duplicateCampaign("c1");
    expect(runCloud).toHaveBeenLastCalledWith("duplicateCampaign", { id: "c1" });

    await archiveCampaign("c1");
    expect(runCloud).toHaveBeenLastCalledWith("archiveCampaign", { id: "c1" });

    await renameCampaign("c1", "New name");
    expect(runCloud).toHaveBeenLastCalledWith("renameCampaign", {
      id: "c1",
      name: "New name",
    });

    await updateCampaign("c1", { subject: "S" });
    expect(runCloud).toHaveBeenLastCalledWith("updateCampaign", {
      id: "c1",
      patch: { subject: "S" },
    });

    await deleteCampaign("c1");
    expect(runCloud).toHaveBeenLastCalledWith("deleteCampaign", { id: "c1" });
  });

  it("passes the cloud return value through to the caller", async () => {
    runCloud.mockResolvedValue({ id: "dupe1" });
    const { duplicateCampaign } = useCampaigns();
    await expect(duplicateCampaign("c1")).resolves.toEqual({ id: "dupe1" });
  });

  it("propagates errors from runCloud (CM-02)", async () => {
    runCloud.mockRejectedValue(new Error("boom"));
    const { archiveCampaign } = useCampaigns();
    await expect(archiveCampaign("c1")).rejects.toThrow("boom");
  });
});

// ── MergeTagPicker.vue (MT-24/25/26) ──────────────────────────────────────
// The picker lazy-loads custom fields via useMergeTags.loadTags(), which calls
// useCustomFields() as a Nuxt AUTO-IMPORT (a bare global, not a `~/...` import).
// So we install it on globalThis rather than vi.mock-ing the module.
const listCustomFields = vi.fn();
(globalThis as any).useCustomFields = () => ({ listCustomFields });

import { mountWithPinia } from "../setup/vueTest";
import MergeTagPicker from "../../components/app/editor/MergeTagPicker.vue";

describe("MergeTagPicker.vue (MT-24/25/26)", () => {
  beforeEach(() => {
    listCustomFields.mockReset();
  });

  function field(over: Record<string, unknown> = {}) {
    return {
      id: "cf1",
      key: "plan",
      label: "Plan",
      type: "text",
      enumValues: [],
      required: false,
      order: 0,
      ...over,
    };
  }

  it("lazy-loads tags on first open and renders the Standard group", async () => {
    listCustomFields.mockResolvedValue([]);
    const wrapper = mountWithPinia(MergeTagPicker);

    expect(listCustomFields).not.toHaveBeenCalled();
    await wrapper.find(".mtp-trigger").trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(listCustomFields).toHaveBeenCalledTimes(1);
    expect(wrapper.find(".mtp-menu").exists()).toBe(true);
    // Standard group present with the first-name token.
    expect(wrapper.text()).toContain("Standard");
    expect(wrapper.text()).toContain("{{firstName}}");
    // No custom fields → empty-state copy, no Custom group.
    expect(wrapper.text()).toContain("No custom fields yet");
  });

  it("renders a Custom group when custom fields exist", async () => {
    listCustomFields.mockResolvedValue([field({ key: "tier", label: "Tier" })]);
    const wrapper = mountWithPinia(MergeTagPicker);
    await wrapper.find(".mtp-trigger").trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Custom");
    expect(wrapper.text()).toContain("{{custom.tier}}");
  });

  it("does not re-load tags on a second open (loaded gate)", async () => {
    listCustomFields.mockResolvedValue([]);
    const wrapper = mountWithPinia(MergeTagPicker);
    await wrapper.find(".mtp-trigger").trigger("click"); // open
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    await wrapper.find(".mtp-trigger").trigger("click"); // close
    await wrapper.find(".mtp-trigger").trigger("click"); // open again
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    expect(listCustomFields).toHaveBeenCalledTimes(1);
  });

  it("MT-25: emits insert(formatTag(token)) on tag click and closes the menu", async () => {
    listCustomFields.mockResolvedValue([]);
    const wrapper = mountWithPinia(MergeTagPicker);
    await wrapper.find(".mtp-trigger").trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();

    const firstItem = wrapper.findAll(".mtp-item")[0];
    await firstItem.trigger("click");

    const emitted = wrapper.emitted("insert");
    expect(emitted).toBeTruthy();
    // First standard tag is firstName → "{{firstName}}".
    expect(emitted![0][0]).toBe("{{firstName}}");
    // Menu closed after choosing.
    expect(wrapper.find(".mtp-menu").exists()).toBe(false);
  });

  it("MT-26: Escape closes the open menu", async () => {
    listCustomFields.mockResolvedValue([]);
    const wrapper = mountWithPinia(MergeTagPicker);
    await wrapper.find(".mtp-trigger").trigger("click");
    await Promise.resolve();
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".mtp-menu").exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find(".mtp-menu").exists()).toBe(false);
  });
});

// ── Campaigns index row-action gating (LS-02) ─────────────────────────────
// We mount the real page. Nuxt macros / auto-imports are provided as globals
// or stubbed components so setup() runs. listCampaigns is supplied via the
// useCampaigns mock below.
const pageRunCloud = runCloud; // reuse the same mocked seam
(globalThis as any).definePageMeta = () => {};
(globalThis as any).useHead = () => {};
(globalThis as any).navigateTo = vi.fn();

// Stub the shared/app auto-imported components the page template references so
// it renders without the Nuxt component resolver. The kebab menu (plain
// buttons) is what we assert on, so those need to render as real DOM.
const trueStubs = {
  Button: { template: "<button><slot /></button>" },
  Modal: { template: "<div><slot /><slot name=\"footer\" /></div>" },
  TextInput: { template: "<input />" },
  AppKpiCard: { template: "<div />" },
  AppStatusPill: { template: "<span />" },
  NuxtLink: { template: "<a><slot /></a>" },
};

async function mountCampaignsPage(rows: any[]) {
  pageRunCloud.mockResolvedValue({
    campaigns: rows,
    kpis: { total: rows.length, drafts: 0, sent: 0, scheduled: 0, avgOpenRate: null },
  });
  const { mount } = await import("@vue/test-utils");
  const { createPinia, setActivePinia } = await import("pinia");
  const page = (await import("../../pages/app/campaigns/index.vue")).default;
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(page, {
    global: { plugins: [pinia], stubs: trueStubs },
  });
  // Let onMounted load() resolve.
  await Promise.resolve();
  await Promise.resolve();
  await wrapper.vm.$nextTick();
  return wrapper;
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: `c_${over.status ?? "draft"}`,
    name: `Campaign ${over.status ?? "draft"}`,
    status: "draft",
    audienceId: null,
    audience: null,
    date: "Created Jan 1, 2026",
    relative: "today",
    openRate: null,
    clickRate: null,
    updatedAt: null,
    ...over,
  };
}

// Open a row's kebab and return the visible menu-item labels.
async function menuItemsFor(wrapper: any, status: string): Promise<string[]> {
  const kebab = wrapper.find(`[aria-label="Actions for Campaign ${status}"]`);
  await kebab.trigger("click");
  const menu = wrapper.find(".ct-menu");
  if (!menu.exists()) return [];
  return menu.findAll(".ct-menu-item").map((b: any) => b.text().trim());
}

describe("Campaigns index row-action gating (LS-02)", () => {
  afterEach(() => {
    runCloud.mockReset();
  });

  it("draft offers every action (Edit, Rename, Duplicate, Archive, Delete)", async () => {
    const wrapper = await mountCampaignsPage([row({ status: "draft" })]);
    const items = await menuItemsFor(wrapper, "draft");
    expect(items).toEqual(
      expect.arrayContaining(["Edit", "Rename", "Duplicate", "Archive", "Delete"]),
    );
  });

  it("sent hides Edit/Rename but keeps Duplicate, Archive, and Delete (soft)", async () => {
    const wrapper = await mountCampaignsPage([row({ status: "sent" })]);
    const items = await menuItemsFor(wrapper, "sent");
    expect(items).not.toContain("Edit");
    expect(items).not.toContain("Rename");
    expect(items).toEqual(
      expect.arrayContaining(["Duplicate", "Archive", "Delete"]),
    );
  });

  it("sending offers only Duplicate (no Edit/Rename/Archive/Delete)", async () => {
    const wrapper = await mountCampaignsPage([row({ status: "sending" })]);
    const items = await menuItemsFor(wrapper, "sending");
    expect(items).toEqual(["Duplicate"]);
  });
});
