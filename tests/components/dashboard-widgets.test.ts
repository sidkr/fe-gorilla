// @vitest-environment happy-dom
// Widget component tests (docs/testing/dashboard.md §3d, D-W01–W08) — mounting
// the real dashboard widget SFCs with props and asserting their rendered output:
// KpiCard delta tone/glyph, CampaignFunnel bar-height floor + stepRates,
// EngagementDonut dasharray/legend, AudienceGrowthChart flat-line / single-point
// NaN-safety. Each widget renders shared primitives (Card/Pill/SectionEyebrow);
// we register the real Pill where its classes are asserted and stub the rest.
import { describe, expect, it } from "vitest";
import { mountWithPinia } from "../setup/vueTest";
import KpiCard from "../../components/app/KpiCard.vue";
import CampaignFunnel from "../../components/app/CampaignFunnel.vue";
import EngagementDonut from "../../components/app/EngagementDonut.vue";
import AudienceGrowthChart from "../../components/app/AudienceGrowthChart.vue";
import Pill from "../../components/shared/Pill.vue";

// Minimal stubs for shared chrome the widgets render but we don't assert on.
const Card = { template: "<div class='card-stub'><slot /></div>" };
const SectionEyebrow = { template: "<div class='eyebrow-stub'><slot /></div>" };

describe("KpiCard.vue", () => {
  function mountKpi(props: Record<string, unknown>) {
    return mountWithPinia(KpiCard, {
      props,
      global: { components: { Pill }, stubs: { Card } },
    });
  }

  // D-W01 — label/value render; delta pill only when delta is non-empty.
  it("renders label and value, and shows the delta pill only when delta is set", () => {
    const withDelta = mountKpi({ label: "Subscribers", value: "30", delta: "40 contacts" });
    expect(withDelta.find(".kpi-label").text()).toBe("Subscribers");
    expect(withDelta.find(".kpi-value").text()).toBe("30");
    expect(withDelta.find(".kpi-delta").exists()).toBe(true);
    expect(withDelta.text()).toContain("40 contacts");

    const noDelta = mountKpi({ label: "Subscribers", value: "30", delta: "" });
    expect(noDelta.find(".kpi-delta").exists()).toBe(false);
  });

  // D-W02 — delta tone + glyph by direction.
  it("maps deltaDirection to the Pill tone and the correct glyph", () => {
    const up = mountKpi({ label: "L", value: "1", delta: "+5", deltaDirection: "up" });
    expect(up.find("span.pill").classes()).toContain("pill--success");

    const down = mountKpi({ label: "L", value: "1", delta: "-5", deltaDirection: "down" });
    expect(down.find("span.pill").classes()).toContain("pill--danger");

    const neutral = mountKpi({ label: "L", value: "1", delta: "—", deltaDirection: "neutral" });
    expect(neutral.find("span.pill").classes()).toContain("pill--neutral");

    // The glyph differs per direction: up/down render a <path>, neutral a <rect>.
    expect(up.find(".kpi-delta-glyph path").exists()).toBe(true);
    expect(down.find(".kpi-delta-glyph path").exists()).toBe(true);
    expect(neutral.find(".kpi-delta-glyph rect").exists()).toBe(true);
    expect(neutral.find(".kpi-delta-glyph path").exists()).toBe(false);
  });
});

describe("CampaignFunnel.vue", () => {
  function mountFunnel(stages: Array<{ name: string; count: number; pct: string }>) {
    return mountWithPinia(CampaignFunnel, { props: { stages } });
  }
  const heightPct = (style: string | undefined) => {
    const m = /height:\s*([0-9.]+)%/.exec(style || "");
    return m ? parseFloat(m[1]) : NaN;
  };

  // D-W03 — all-zero stages: every bar at the 15% floor, no error.
  it("floors every bar height at 15% when all stages are zero", () => {
    const w = mountFunnel([
      { name: "Sent", count: 0, pct: "0%" },
      { name: "Delivered", count: 0, pct: "0%" },
      { name: "Opened", count: 0, pct: "0%" },
      { name: "Clicked", count: 0, pct: "0%" },
    ]);
    const bars = w.findAll(".funnel-bar");
    expect(bars).toHaveLength(4);
    for (const bar of bars) {
      expect(heightPct(bar.attributes("style"))).toBe(15);
    }
  });

  // D-W04 — proportional heights, tallest = 100%, all >= 15%.
  it("scales bar heights proportionally with a 15% floor", () => {
    const w = mountFunnel([
      { name: "Sent", count: 1000, pct: "100.0%" },
      { name: "Delivered", count: 950, pct: "95.0%" },
      { name: "Opened", count: 380, pct: "38.0%" },
      { name: "Clicked", count: 95, pct: "9.5%" },
    ]);
    const hs = w.findAll(".funnel-bar").map((b) => heightPct(b.attributes("style")));
    expect(hs[0]).toBe(100); // tallest
    expect(hs[1]).toBeCloseTo(95, 1);
    expect(hs[2]).toBeCloseTo(38, 1);
    // 9.5% would fall below the floor → clamped to 15.
    expect(hs[3]).toBe(15);
    for (const h of hs) expect(h).toBeGreaterThanOrEqual(15);
  });

  // D-W05 — stepRates: "—" on a zero prev, "NN.N%" otherwise; length = n-1.
  it("computes step rates with an em-dash when the previous count is zero", () => {
    const w = mountFunnel([
      { name: "Sent", count: 0, pct: "0%" },        // prev=0 for Delivered → "—"
      { name: "Delivered", count: 100, pct: "0%" }, // prev=100 → 38.0% for Opened
      { name: "Opened", count: 38, pct: "0%" },     // prev=38 → 25.0% for Clicked...
      { name: "Clicked", count: 10, pct: "0%" },
    ]);
    const rates = w.findAll(".funnel-step-rate").map((r) => r.text());
    expect(rates).toHaveLength(3); // stages - 1
    expect(rates[0]).toBe("—"); // prev (Sent) is 0
    expect(rates[1]).toBe("38.0%"); // 38/100
    expect(rates[2]).toBe(`${((10 / 38) * 100).toFixed(1)}%`); // 26.3%
  });
});

describe("EngagementDonut.vue", () => {
  function mountDonut(slices: any[], total = "4") {
    return mountWithPinia(EngagementDonut, {
      props: { slices, total },
      global: { stubs: { Card, SectionEyebrow } },
    });
  }

  // D-W06 — dasharray segments accumulate, legend rows render counts/pcts.
  it("renders a legend row per slice and accumulating dash offsets", () => {
    const w = mountDonut([
      { label: "Subscribed", count: 3, countLabel: "3", pct: 75, kind: "pop" },
      { label: "Other", count: 1, countLabel: "1", pct: 25, kind: "soft" },
    ]);
    const rows = w.findAll(".ed-legend-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].find(".ed-legend-label").text()).toBe("Subscribed");
    expect(rows[0].find(".ed-legend-count").text()).toBe("3");
    expect(rows[0].find(".ed-legend-pct").text()).toBe("(75%)");

    // Two drawn slice circles (besides the track). Offsets: first 0, second
    // negative (accumulated length of the first slice).
    const sliceCircles = w.findAll("g circle");
    expect(sliceCircles.length).toBeGreaterThanOrEqual(2);
    const off0 = sliceCircles[0].attributes("stroke-dashoffset");
    const off1 = sliceCircles[1].attributes("stroke-dashoffset");
    expect(Number(off0)).toBe(0);
    expect(Number(off1)).toBeLessThan(0);
    // Center total text rendered.
    expect(w.find(".ed-center-total").text()).toBe("4");
  });

  // Zero-total slices (0% each) must still render two legend rows, no NaN dash.
  it("renders cleanly with 0% slices (no NaN dasharray)", () => {
    const w = mountDonut(
      [
        { label: "Subscribed", count: 0, countLabel: "0", pct: 0, kind: "pop" },
        { label: "Other", count: 0, countLabel: "0", pct: 0, kind: "soft" },
      ],
      "0",
    );
    expect(w.findAll(".ed-legend-row")).toHaveLength(2);
    for (const c of w.findAll("g circle")) {
      expect(c.attributes("stroke-dasharray")).not.toMatch(/NaN/);
    }
  });
});

describe("AudienceGrowthChart.vue", () => {
  function mountGrowth(points: number[], total = "30") {
    return mountWithPinia(AudienceGrowthChart, {
      props: { points, total, deltaAbs: "—", deltaPct: "no history yet" },
      global: { components: { Pill }, stubs: { Card, SectionEyebrow } },
    });
  }

  // D-W07 — flat line at a constant series: linePath defined, no NaN, 7 ticks.
  it("renders a flat constant series without NaN and with 7 tick labels", () => {
    const w = mountGrowth(Array(30).fill(30));
    const linePath = w.find("path[stroke]").attributes("d") || "";
    expect(linePath.length).toBeGreaterThan(0);
    expect(linePath).not.toMatch(/NaN/);
    // 7 x-axis tick labels.
    expect(w.findAll(".agc-tick-text")).toHaveLength(7);
    expect(w.find(".agc-number").text()).toBe("30");
  });

  // D-W08 — single-point series: x(0) === PAD_X (8), no crash / NaN.
  it("handles a single-point series safely", () => {
    const w = mountGrowth([5], "5");
    const linePath = w.find("path[stroke]").attributes("d") || "";
    expect(linePath).not.toMatch(/NaN/);
    // First (and only) move command anchors at PAD_X = 8.
    expect(linePath.startsWith("M 8.00")).toBe(true);
  });
});
