// @vitest-environment happy-dom
// Component tests for the per-campaign ReportsTable widget. Covers the four
// render modes (sample / real / loading / real-empty), Sample-pill gating, row
// clickability (real only, via the global navigateTo), open-rate tinting, and
// date/number formatting.
//
// We register the REAL TableShell, Pill, and EmptyState SFCs so the table
// chrome, the brand "Sample" pill, and the empty state all render for real.
// navigateTo (used by the row @click) is stubbed on globalThis.
import { afterEach, describe, expect, it, vi } from "vitest";
import ReportsTable from "../../components/app/ReportsTable.vue";
import EmptyState from "../../components/shared/EmptyState.vue";
import Pill from "../../components/shared/Pill.vue";
import TableShell from "../../components/shared/TableShell.vue";
import { SAMPLE } from "../../composables/app/useReportsSample";
import { mountWithPinia } from "../setup/vueTest";

// navigateTo is a Nuxt auto-import; the compiled SFC references it through the
// component render context (`_ctx.navigateTo`), so we inject it via global.mocks
// rather than vi.stubGlobal.
const navigateTo = vi.fn();

const global = {
  components: { TableShell, Pill, EmptyState },
  mocks: { navigateTo },
};

function mountTable(props: Record<string, unknown>) {
  return mountWithPinia(ReportsTable, { props, global });
}

function hasSamplePill(w: ReturnType<typeof mountTable>) {
  return w.findAll("span.pill.pill--brand").some((p) => p.text().trim() === "Sample");
}

afterEach(() => {
  navigateTo.mockReset();
});

describe("ReportsTable.vue", () => {
  it("RPT-C01: sample rows render, non-clickable, with Sample pill", () => {
    const w = mountTable({ data: SAMPLE.campaigns, demo: true, loading: false });
    const rows = w.findAll("tbody tr");
    expect(rows).toHaveLength(6);
    // Demo rows are NOT clickable.
    expect(rows.every((r) => !r.classes().includes("is-link"))).toBe(true);
    expect(hasSamplePill(w)).toBe(true);
  });

  it("RPT-C01b: campaign names longer than 36 chars are truncated with an ellipsis", () => {
    const longName = "An extremely long campaign name that should be truncated here";
    const data = [
      { id: "a", name: longName, sentAt: "2026-05-12T16:00:00Z", recipients: 1, openRate: 0.45, clickRate: 0, bounceRate: 0, unsubRate: 0 },
    ];
    const w = mountTable({ data, demo: true, loading: false });
    const cell = w.find("td.rep-cell-name");
    expect(cell.text()).toContain("…");
    expect(cell.text().length).toBeLessThan(longName.length);
    // Full name preserved in the title attribute.
    expect(cell.attributes("title")).toBe(longName);
  });

  it("RPT-C02: real rows are clickable and navigate; no Sample pill", async () => {
    const real = [
      { id: "camp-1", name: "Real One", sentAt: "2026-05-12T16:00:00Z", recipients: 1000, openRate: 0.45, clickRate: 0.1, bounceRate: 0.02, unsubRate: 0.004 },
    ];
    const w = mountTable({ data: real, demo: false, loading: false });
    const rows = w.findAll("tbody tr");
    expect(rows).toHaveLength(1);
    expect(rows[0].classes()).toContain("is-link");
    expect(hasSamplePill(w)).toBe(false);

    await rows[0].trigger("click");
    expect(navigateTo).toHaveBeenCalledWith("/app/campaigns/camp-1");
  });

  it("RPT-C03: loading shows the skeleton (aria-busy, 5 rows), no data/empty", () => {
    const w = mountTable({ data: [], demo: false, loading: true });
    const shell = w.find("[aria-busy=\"true\"]");
    expect(shell.exists()).toBe(true);
    expect(w.findAll("tbody tr")).toHaveLength(5);
    expect(w.find(".empty").exists()).toBe(false);
  });

  it("RPT-C04: real loaded-empty shows the empty state", () => {
    const w = mountTable({ data: [], demo: false, loading: false });
    expect(w.find(".empty").exists()).toBe(true);
    expect(w.text()).toContain("No campaign reports yet");
  });

  it("RPT-C05: demo + empty data suppresses the empty state", () => {
    const w = mountTable({ data: [], demo: true, loading: false });
    // Empty state only when !demo && !data.length → here it must NOT appear.
    expect(w.find(".empty").exists()).toBe(false);
    expect(w.text()).not.toContain("No campaign reports yet");
  });

  it("RPT-C06: open-rate tinting — success pill / plain / warn pill", () => {
    const data = [
      { id: "a", name: "High", sentAt: "2026-05-12T16:00:00Z", recipients: 1, openRate: 0.55, clickRate: 0, bounceRate: 0, unsubRate: 0 },
      { id: "b", name: "Mid", sentAt: "2026-05-12T16:00:00Z", recipients: 1, openRate: 0.45, clickRate: 0, bounceRate: 0, unsubRate: 0 },
      { id: "c", name: "Low", sentAt: "2026-05-12T16:00:00Z", recipients: 1, openRate: 0.3, clickRate: 0, bounceRate: 0, unsubRate: 0 },
    ];
    const w = mountTable({ data, demo: false, loading: false });
    const rows = w.findAll("tbody tr");
    // Row a (0.55) → success pill.
    expect(rows[0].find("span.pill.pill--success").exists()).toBe(true);
    // Row b (0.45) → neutral → plain text, no pill in the open-rate cell.
    expect(rows[1].find("span.pill").exists()).toBe(false);
    expect(rows[1].text()).toContain("45.0%");
    // Row c (0.3) → warn pill.
    expect(rows[2].find("span.pill.pill--warn").exists()).toBe(true);
  });

  it("RPT-C07: date + number formatting (ISO date, null → em dash, locale nums)", () => {
    const data = [
      { id: "a", name: "Dated", sentAt: "2026-05-12T16:00:00Z", recipients: 4200, openRate: 0.45, clickRate: 0, bounceRate: 0, unsubRate: 0 },
      { id: "b", name: "NoDate", sentAt: null, recipients: 0, openRate: 0.45, clickRate: 0, bounceRate: 0, unsubRate: 0 },
    ];
    const w = mountTable({ data, demo: false, loading: false });
    const rows = w.findAll("tbody tr");
    expect(rows[0].text()).toContain("May 12, 2026");
    expect(rows[0].text()).toContain("4,200");
    expect(rows[1].text()).toContain("—"); // null sentAt
  });
});
