// @vitest-environment happy-dom
// Page-level + composable tests for Reports demo mode.
//
// Two layers here:
//   1. useReportsSample — the deterministic SAMPLE fixture + dismiss persistence
//      backed by localStorage (real, via happy-dom).
//   2. pages/app/reports/index.vue — the demo-vs-real orchestration: the `demo`
//      computed, the real-mode slice math (agg / realKpis / realEngagement /
//      realCampaigns), the no-flash-while-loading rule, dismiss, and the
//      demo→real auto-flip. We mock ~/composables/app/useReports so we drive
//      `reports` / `loading` directly, and stub the auto-imported Nuxt globals
//      (definePageMeta, useHead) + the App* widget children so we can inspect
//      the props the page feeds each widget without rendering them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { SAMPLE, useReportsSample } from "../../composables/app/useReportsSample";
import { mountWithPinia } from "../setup/vueTest";

// ── Mock seam: useReports. Refs are module-scoped so each test resets them. ──
const reports = ref<any[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const loadSentCampaignReports = vi.fn(async () => {});

vi.mock("~/composables/app/useReports", () => ({
  useReports: () => ({ reports, loading, error, loadSentCampaignReports }),
}));

// Nuxt auto-imports the page relies on at module scope / setup.
vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

// Stub the App* widgets + shared primitives the page renders. Each widget stub
// records its received props so the test can assert the slice the page fed it.
function widgetStub(name: string) {
  return {
    name,
    props: ["data", "demo", "loading"],
    template: `<div class="${name}" />`,
  };
}
const pageGlobal = {
  stubs: {
    AppReportsOnboarding: {
      name: "AppReportsOnboarding",
      emits: ["dismiss"],
      template: "<div class=\"onboarding\" @click=\"$emit('dismiss')\" />",
    },
    AppReportsKpiStrip: widgetStub("kpi"),
    AppReportsTrend: widgetStub("trend"),
    AppReportsEngagement: widgetStub("engagement"),
    AppReportsTable: widgetStub("table"),
    Button: { template: "<button><slot /></button>" },
    Icon: { template: "<i />" },
  },
};

async function mountPage() {
  const { default: ReportsPage } = await import("../../pages/app/reports/index.vue");
  return mountWithPinia(ReportsPage, { global: pageGlobal });
}

function findWidget(w: any, name: string) {
  return w.findComponent({ name });
}

beforeEach(() => {
  localStorage.clear();
  reports.value = [];
  loading.value = false;
  error.value = null;
  loadSentCampaignReports.mockClear();
});

afterEach(() => {
  localStorage.clear();
});

// ─────────────────────────────────────────────────────────────────────────────
// useReportsSample
// ─────────────────────────────────────────────────────────────────────────────
describe("useReportsSample", () => {
  it("RPT-D01: isDismissed() is false on a fresh localStorage", () => {
    const { isDismissed } = useReportsSample();
    expect(isDismissed()).toBe(false);
  });

  it("RPT-D02: dismiss() persists '1' and isDismissed() flips true", () => {
    const { dismiss, isDismissed } = useReportsSample();
    dismiss();
    expect(localStorage.getItem("reports_demo_dismissed")).toBe("1");
    expect(isDismissed()).toBe(true);
  });

  it("RPT-D03: resetDismiss() clears the key", () => {
    const { dismiss, resetDismiss, isDismissed } = useReportsSample();
    dismiss();
    resetDismiss();
    expect(localStorage.getItem("reports_demo_dismissed")).toBeNull();
    expect(isDismissed()).toBe(false);
  });

  it("RPT-D04: no localStorage → isDismissed() false, dismiss() a no-op", () => {
    const real = globalThis.localStorage;
    // @ts-expect-error — simulate the SSR/node guard path.
    delete globalThis.localStorage;
    try {
      const { isDismissed, dismiss } = useReportsSample();
      expect(isDismissed()).toBe(false);
      expect(() => dismiss()).not.toThrow();
    } finally {
      globalThis.localStorage = real;
    }
  });

  it("RPT-D05: SAMPLE is deterministic with the documented rate math", () => {
    const a = useReportsSample().sample;
    const b = useReportsSample().sample;
    expect(a).toBe(b); // same reference, no RNG
    expect(a.kpis.deliveredRate).toBe(12106 / 12480);
    expect(a.kpis.openRate).toBe(5447 / 12106);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// pages/app/reports/index.vue — demo orchestration + slice math
// ─────────────────────────────────────────────────────────────────────────────
describe("Reports page demo/real orchestration", () => {
  it("RPT-D06: fresh org → demo on; onboarding + sample slices fed to widgets", async () => {
    reports.value = [];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();

    expect(loadSentCampaignReports).toHaveBeenCalledTimes(1);
    expect(w.find(".onboarding").exists()).toBe(true);
    expect(findWidget(w, "kpi").props("demo")).toBe(true);
    expect(findWidget(w, "kpi").props("data")).toEqual(SAMPLE.kpis);
    expect(findWidget(w, "trend").props("data")).toEqual(SAMPLE.trend);
    expect(findWidget(w, "engagement").props("data")).toEqual(SAMPLE.engagement);
    expect(findWidget(w, "table").props("data")).toEqual(SAMPLE.campaigns);
  });

  it("RPT-D07: no demo flash while loading, then flips on once settled", async () => {
    loading.value = true;
    reports.value = [];
    const w = await mountPage();
    await w.vm.$nextTick();
    // While loading: demo held OFF → no onboarding.
    expect(w.find(".onboarding").exists()).toBe(false);
    expect(findWidget(w, "kpi").props("demo")).toBe(false);

    loading.value = false; // load settles, still no real data.
    await w.vm.$nextTick();
    expect(w.find(".onboarding").exists()).toBe(true);
    expect(findWidget(w, "kpi").props("demo")).toBe(true);
  });

  it("RPT-D08: dismiss hides sample → demo off, real (empty) slices", async () => {
    reports.value = [];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();
    expect(w.find(".onboarding").exists()).toBe(true);

    await w.find(".onboarding").trigger("click"); // emits dismiss
    await w.vm.$nextTick();

    expect(localStorage.getItem("reports_demo_dismissed")).toBe("1");
    expect(w.find(".onboarding").exists()).toBe(false);
    expect(findWidget(w, "kpi").props("demo")).toBe(false);
    // Real empty slices: trend [], table [].
    expect(findWidget(w, "trend").props("data")).toEqual([]);
    expect(findWidget(w, "table").props("data")).toEqual([]);
  });

  it("RPT-D09: dismiss persists across reload → no onboarding on first paint", async () => {
    localStorage.setItem("reports_demo_dismissed", "1");
    reports.value = [];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();
    expect(w.find(".onboarding").exists()).toBe(false);
    expect(findWidget(w, "kpi").props("demo")).toBe(false);
  });

  it("RPT-F01: first send flips out of demo without dismissing", async () => {
    reports.value = [makeReport({})];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();
    expect(w.find(".onboarding").exists()).toBe(false); // RPT-O04 too
    expect(findWidget(w, "kpi").props("demo")).toBe(false);
  });

  it("RPT-F02: real numbers replace the sample numbers", async () => {
    reports.value = [
      makeReport({
        counts: { sent: 1000, delivered: 950, opens: 380, clicks: 95, bounces: 50, unsubscribes: 19 },
      }),
    ];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();

    const kpi = findWidget(w, "kpi").props("data");
    expect(kpi.sent).toBe(1000);
    expect(kpi.openRate).toBeCloseTo(380 / 950, 5);
    expect(kpi.clickRate).toBeCloseTo(95 / 950, 5);
    expect(kpi.bounceRate).toBeCloseTo(50 / 1000, 5);
    expect(kpi.sent).not.toBe(12480);
  });

  it("RPT-F03: agg sums multiple campaigns; rows preserve input order", async () => {
    reports.value = [
      makeReport({ id: "c1", name: "One", counts: { sent: 600, delivered: 550, opens: 200, clicks: 50, bounces: 50, unsubscribes: 10 } }),
      makeReport({ id: "c2", name: "Two", counts: { sent: 400, delivered: 400, opens: 180, clicks: 45, bounces: 0, unsubscribes: 9 } }),
    ];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();

    const kpi = findWidget(w, "kpi").props("data");
    expect(kpi.sent).toBe(1000); // 600 + 400
    expect(kpi.delivered).toBe(950); // 550 + 400
    expect(kpi.openRate).toBeCloseTo(380 / 950, 5); // (200+180)/950

    const rows = findWidget(w, "table").props("data");
    expect(rows.map((r: any) => r.id)).toEqual(["c1", "c2"]);
  });

  it("RPT-F04: an empty campaign name renders as (untitled)", async () => {
    reports.value = [makeReport({ id: "c1", name: "" })];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();
    const rows = findWidget(w, "table").props("data");
    expect(rows[0].name).toBe("(untitled)");
  });

  it("RPT-O04: onboarding absent in real mode", async () => {
    reports.value = [makeReport({})];
    loading.value = false;
    const w = await mountPage();
    await w.vm.$nextTick();
    expect(w.find(".onboarding").exists()).toBe(false);
  });
});

// Build a CampaignReport matching useReports.ts's shape.
function makeReport(overrides: Record<string, any>) {
  return {
    id: "camp",
    name: "Campaign",
    status: "sent",
    sentAt: "2026-05-12T16:00:00.000Z",
    counts: { sent: 100, delivered: 95, opens: 40, clicks: 10, bounces: 5, unsubscribes: 1 },
    rates: { open: 40 / 95, click: 10 / 95, bounce: 5 / 100, unsubscribe: 1 / 95 },
    ...overrides,
  };
}
