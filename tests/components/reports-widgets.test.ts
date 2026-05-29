// @vitest-environment happy-dom
// Component tests for four of the five Reports widgets — KPI strip, trend,
// engagement funnel, and onboarding overlay. (The per-campaign table is covered
// in reports-table.test.ts; the page-level demo/dismiss logic + useReportsSample
// in reports-page.test.ts.)
//
// Each widget is pure-props (`data`, `demo`, `loading`), so we mount it directly
// with mountWithPinia. We register the REAL shared SFCs the widgets depend on
// (Pill, EmptyState, SectionEyebrow) so the "Sample" pill + empty states render
// for real, and provide a thin Card stub (it only wraps a slot). We assert the
// "Sample" badge via the brand-toned Pill (`span.pill.pill--brand`), which only
// appears in demo mode.
import { describe, expect, it } from "vitest";
import ReportsEngagement from "../../components/app/ReportsEngagement.vue";
import ReportsKpiStrip from "../../components/app/ReportsKpiStrip.vue";
import ReportsOnboarding from "../../components/app/ReportsOnboarding.vue";
import ReportsTrend from "../../components/app/ReportsTrend.vue";
import EmptyState from "../../components/shared/EmptyState.vue";
import Pill from "../../components/shared/Pill.vue";
import SectionEyebrow from "../../components/shared/SectionEyebrow.vue";
import { SAMPLE } from "../../composables/app/useReportsSample";
import { mountWithPinia } from "../setup/vueTest";

// Card is a structural wrapper; a slot-forwarding stub is enough.
const Card = { template: "<div class=\"card\"><slot /></div>" };
const NuxtLink = {
  props: ["to"],
  template: "<a :href=\"to\"><slot /></a>",
};

const sharedGlobal = {
  components: { Pill, EmptyState, SectionEyebrow, Card, NuxtLink },
};

function sampleHasPill(wrapper: ReturnType<typeof mountWithPinia>) {
  // The "Sample" badge is the only brand-toned Pill these widgets render.
  return wrapper
    .findAll("span.pill.pill--brand")
    .some((p) => p.text().trim() === "Sample");
}

describe("ReportsKpiStrip.vue", () => {
  function mountKpi(data: unknown, demo: boolean) {
    return mountWithPinia(ReportsKpiStrip, { props: { data, demo }, global: sharedGlobal });
  }

  it("RPT-K01: renders the sample slice with formatting + Sample pill", () => {
    const w = mountKpi(SAMPLE.kpis, true);
    const cards = w.findAll(".rep-kpi");
    expect(cards).toHaveLength(6);
    const text = w.text();
    expect(text).toContain("12,480"); // sent, toLocaleString
    expect(text).toContain("45.0%"); // open rate 5447/12106 ≈ 0.45, one decimal
    expect(sampleHasPill(w)).toBe(true);
  });

  it("RPT-K02: renders a real slice with NO Sample pill", () => {
    const realKpis = {
      sent: 1000,
      delivered: 950,
      deliveredRate: 950 / 1000,
      opens: 380,
      openRate: 380 / 950,
      clicks: 95,
      clickRate: 95 / 950,
      bounces: 50,
      bounceRate: 50 / 1000,
      unsubs: 19,
      unsubRate: 19 / 950,
    };
    const w = mountKpi(realKpis, false);
    const text = w.text();
    expect(text).toContain("1,000");
    expect(text).toContain("40.0%"); // open rate 380/950
    expect(text).not.toContain("12,480");
    expect(sampleHasPill(w)).toBe(false);
  });

  it("RPT-K03: degrades empty data to zeros without NaN/throw", () => {
    const w = mountKpi({}, false);
    expect(w.findAll(".rep-kpi")).toHaveLength(6);
    const text = w.text();
    expect(text).toContain("0.0%");
    expect(text).not.toContain("NaN");
  });

  it("RPT-K04: rate tone thresholds drive is-good/is-neutral/is-warn", () => {
    // openRate 0.31 → good (≥0.3); bounceRate 0.05 → warn (≥0.04).
    const good = mountKpi({ openRate: 0.31, bounceRate: 0.05 }, false);
    const subs = good.findAll(".rep-kpi-sub");
    // Card order: sent, delivered, openRate, clickRate, bounceRate, unsubRate.
    expect(subs[2].classes()).toContain("is-good"); // open rate 0.31
    expect(subs[4].classes()).toContain("is-warn"); // bounce 0.05

    const neutral = mountKpi({ openRate: 0.2, bounceRate: 0.01 }, false);
    const nsubs = neutral.findAll(".rep-kpi-sub");
    expect(nsubs[2].classes()).toContain("is-neutral"); // open 0.2 (≥0.18, <0.3)
    expect(nsubs[4].classes()).toContain("is-good"); // bounce 0.01 (<0.04)

    const warn = mountKpi({ openRate: 0.1 }, false);
    expect(warn.findAll(".rep-kpi-sub")[2].classes()).toContain("is-warn"); // open 0.1 (<0.18)
  });

  it("RPT-K05: sub-lines carry derived content", () => {
    const w = mountKpi(SAMPLE.kpis, true);
    const text = w.text();
    expect(text).toContain("97.0% delivery rate"); // 12106/12480 ≈ 0.97
    expect(text).toContain("5,447 opens");
  });
});

describe("ReportsTrend.vue", () => {
  function mountTrend(data: unknown, demo: boolean) {
    return mountWithPinia(ReportsTrend, { props: { data, demo }, global: sharedGlobal });
  }

  it("RPT-TR01: renders the sample series — SVG, legend, ticks, Sample pill", () => {
    const w = mountTrend(SAMPLE.trend, true);
    expect(w.find("svg.rt-svg").exists()).toBe(true);
    const text = w.text();
    expect(text).toContain("Opens");
    expect(text).toContain("Clicks");
    expect(w.find(".empty").exists()).toBe(false);
    expect(w.findAll(".rt-tick-text").length).toBeLessThanOrEqual(6);
    expect(w.findAll(".rt-tick-text").length).toBeGreaterThan(0);
    expect(sampleHasPill(w)).toBe(true);
  });

  it("RPT-TR02: empty state when data is [] — no SVG, no Sample pill", () => {
    const w = mountTrend([], false);
    expect(w.find("svg.rt-svg").exists()).toBe(false);
    expect(w.find(".empty").exists()).toBe(true);
    expect(w.text()).toContain("chart here");
    expect(sampleHasPill(w)).toBe(false);
  });

  it("RPT-TR03: single point renders without divide-by-zero", () => {
    const w = mountTrend([{ label: "May 1", opens: 60, clicks: 12 }], false);
    expect(w.find("svg.rt-svg").exists()).toBe(true);
    expect(w.findAll(".rt-tick-text")).toHaveLength(1);
    // First x() with n<=1 anchors at PAD_X (8); path begins "M 8.00 ...".
    const opensLine = w.findAll("path").map((p) => p.attributes("d"));
    expect(opensLine.some((d) => d && d.startsWith("M 8.00"))).toBe(true);
  });

  it("RPT-TR05: real-mode passes [] → empty placeholder (no time-series yet)", () => {
    const w = mountTrend([], false);
    expect(w.find(".empty").exists()).toBe(true);
  });
});

describe("ReportsEngagement.vue", () => {
  function mountEng(data: unknown, demo: boolean) {
    return mountWithPinia(ReportsEngagement, { props: { data, demo }, global: sharedGlobal });
  }

  it("RPT-E01: renders the sample funnel — 3 bars, secondary chips, Sample pill", () => {
    const w = mountEng(SAMPLE.engagement, true);
    expect(w.findAll(".re-stage")).toHaveLength(3);
    const text = w.text();
    expect(text).toContain("Delivered");
    expect(text).toContain("Opened");
    expect(text).toContain("Clicked");
    expect(text).toContain("Bounced");
    expect(text).toContain("Unsubscribed");
    expect(w.find(".empty").exists()).toBe(false);
    expect(sampleHasPill(w)).toBe(true);
  });

  it("RPT-E02: all-zero data shows the empty state, no bars", () => {
    const w = mountEng(
      { delivered: 0, opened: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
      false,
    );
    expect(w.find(".empty").exists()).toBe(true);
    expect(w.text()).toContain("No engagement yet");
    expect(w.findAll(".re-stage")).toHaveLength(0);
  });

  it("RPT-E03: real slice sizes bars by count/delivered", () => {
    const w = mountEng(
      { delivered: 1000, opened: 500, clicked: 100, bounced: 20, unsubscribed: 5 },
      false,
    );
    const stages = w.findAll(".re-stage");
    expect(stages).toHaveLength(3);
    const bars = w.findAll(".re-bar");
    // Delivered bar = 100%, Opened = 50%, Clicked = 10%.
    expect(bars[0].attributes("style")).toContain("width: 100%");
    expect(bars[1].attributes("style")).toContain("width: 50%");
    expect(bars[2].attributes("style")).toContain("width: 10%");
    expect(sampleHasPill(w)).toBe(false);
  });

  it("RPT-E04: pct guard — delivered 0 but bounced 5 → not empty, 0% no NaN", () => {
    const w = mountEng(
      { delivered: 0, opened: 0, clicked: 0, bounced: 5, unsubscribed: 0 },
      false,
    );
    expect(w.find(".empty").exists()).toBe(false);
    const text = w.text();
    expect(text).not.toContain("NaN");
    // Bounced count shows; its pct is "0%".
    expect(text).toContain("0%");
  });

  it("RPT-E06: fmtPct drops trailing .0", () => {
    // delivered=opened=100 → 100%, clicked=48.1% (481/1000 with delivered 1000)
    const w = mountEng(
      { delivered: 1000, opened: 1000, clicked: 481, bounced: 0, unsubscribed: 0 },
      false,
    );
    const text = w.text();
    expect(text).toContain("100%");
    expect(text).not.toContain("100.0%");
    expect(text).toContain("48.1%");
  });
});

describe("ReportsOnboarding.vue", () => {
  function mountOnboarding() {
    return mountWithPinia(ReportsOnboarding, { global: sharedGlobal });
  }

  it("RPT-O01: renders the badge, title, 4 steps + auto-dismiss note", () => {
    const w = mountOnboarding();
    const text = w.text();
    expect(text).toContain("Preview");
    expect(text).toContain("sample data");
    expect(w.findAll(".ro-step")).toHaveLength(4);
    expect(text).toContain("disappears automatically");
  });

  it("RPT-O02: clicking Dismiss emits dismiss once", async () => {
    const w = mountOnboarding();
    await w.find(".ro-btn-primary").trigger("click");
    expect(w.emitted("dismiss")).toBeTruthy();
    expect(w.emitted("dismiss")).toHaveLength(1);
  });

  it("RPT-O03: create-campaign CTA links to /app/campaigns/new", () => {
    const w = mountOnboarding();
    const link = w.find("a.ro-btn-ghost");
    expect(link.exists()).toBe(true);
    expect(link.attributes("href")).toBe("/app/campaigns/new");
  });
});
