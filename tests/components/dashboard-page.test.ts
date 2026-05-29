// @vitest-environment happy-dom
// Page view-model tests (docs/testing/dashboard.md §3b, D-V01–V14) — exercising
// the REAL computed logic in pages/app/dashboard.vue (kpis, funnelStages,
// engagementSlices, audienceGrowthPoints, onboardingSteps/onboardingDoneCount,
// fmtNum/fmtPct) by mounting the actual SFC.
//
// We mount the real page and stub its child widgets with tiny components that
// expose the props they receive (data-prop attributes / rendered text), so we
// assert on the data the page computed — not on the widgets' own rendering
// (those are covered in dashboard-widgets.test.ts). useDashboard is mocked to
// feed a controllable `metrics` ref; the Nuxt macros (definePageMeta/useHead)
// and auth store are stubbed.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Controllable metrics ref shared with the mocked composable.
const metrics = ref<any>(null);
const showOnboarding = ref(false);
vi.mock("~/composables/app/useDashboard", () => ({
  useDashboard: () => ({
    metrics,
    loading: ref(false),
    error: ref<string | null>(null),
    load: vi.fn(),
    showOnboarding,
    dismissOnboarding: vi.fn(),
  }),
}));
vi.mock("~/stores/auth", () => ({
  useAuthStore: () => ({ name: "Sid", username: "sid" }),
}));
vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

import { mountWithPinia } from "../setup/vueTest";
import Dashboard from "../../pages/app/dashboard.vue";

// Stub widgets that render the props the page passes them, so we can read back
// the page's computed view-models from the DOM.
const KpiCard = {
  props: ["label", "value", "delta", "deltaDirection"],
  template:
    '<div class="t-kpi" :data-label="label" :data-value="value" :data-delta="delta"></div>',
};
const CampaignFunnel = {
  props: ["stages"],
  template:
    '<div class="t-funnel" :data-json="JSON.stringify(stages)"></div>',
};
const EngagementDonut = {
  props: ["slices", "total"],
  template:
    '<div class="t-donut" :data-total="total" :data-json="JSON.stringify(slices)"></div>',
};
const AudienceGrowthChart = {
  props: ["points", "total", "deltaAbs", "deltaPct"],
  template:
    '<div class="t-growth" :data-total="total" :data-json="JSON.stringify(points)"></div>',
};
const QuickActions = {
  props: ["actions"],
  template:
    '<div class="t-qa" :data-json="JSON.stringify(actions)"></div>',
};
// NuxtLink stub that renders its `to` so onboarding CTA targets are assertable.
const NuxtLink = {
  props: ["to"],
  template: '<a class="t-link" :href="to"><slot /></a>',
};

function mountDash() {
  return mountWithPinia(Dashboard, {
    global: {
      stubs: {
        Button: { template: "<button><slot /></button>" },
        Icon: true,
        Card: { template: "<div><slot /></div>" },
        SectionEyebrow: { template: "<div><slot /></div>" },
        AppKpiCard: KpiCard,
        AppCampaignFunnel: CampaignFunnel,
        AppEngagementDonut: EngagementDonut,
        AppAudienceGrowthChart: AudienceGrowthChart,
        AppQuickActions: QuickActions,
        AppRecentCampaignsTable: true,
        AppActivityFeed: true,
        AppTopPerformingCampaigns: true,
        NuxtLink,
      },
    },
  });
}

function kpiByLabel(w: ReturnType<typeof mountDash>, label: string) {
  return w.findAll(".t-kpi").find((el) => el.attributes("data-label") === label);
}

beforeEach(() => {
  metrics.value = null;
  showOnboarding.value = false;
});

describe("dashboard KPI strip view-model", () => {
  // D-V01
  it("active campaigns = sending + scheduled", () => {
    metrics.value = {
      campaigns: { total: 14, byStatus: { sending: 2, scheduled: 3, draft: 9 } },
    };
    const w = mountDash();
    expect(kpiByLabel(w, "Active campaigns")!.attributes("data-value")).toBe("5");
  });

  // D-V02
  it("subscribers value + 'N contacts' delta", () => {
    metrics.value = { contacts: { total: 40, subscribed: 30 } };
    const w = mountDash();
    const kpi = kpiByLabel(w, "Subscribers")!;
    expect(kpi.attributes("data-value")).toBe("30");
    expect(kpi.attributes("data-delta")).toBe("40 contacts");
  });

  // D-V03
  it("open/click rates formatted via fmtPct", () => {
    metrics.value = { rates: { open: 0.4, click: 0.1234 } };
    const w = mountDash();
    expect(kpiByLabel(w, "Avg open rate")!.attributes("data-value")).toBe("40.0%");
    expect(kpiByLabel(w, "Avg click rate")!.attributes("data-value")).toBe("12.3%");
  });

  // D-V04 — graceful zeros when metrics is null (no throw).
  it("renders graceful zeros when metrics is null", () => {
    metrics.value = null;
    const w = mountDash();
    expect(kpiByLabel(w, "Active campaigns")!.attributes("data-value")).toBe("0");
    expect(kpiByLabel(w, "Subscribers")!.attributes("data-value")).toBe("0");
    expect(kpiByLabel(w, "Avg open rate")!.attributes("data-value")).toBe("0.0%");
    expect(kpiByLabel(w, "Avg click rate")!.attributes("data-value")).toBe("0.0%");
  });

  // D-V05 — fmtNum thousands separators (via the Active KPI delta "N total").
  it("formats large totals with thousands separators", () => {
    metrics.value = { campaigns: { total: 12847, byStatus: {} } };
    const w = mountDash();
    expect(kpiByLabel(w, "Active campaigns")!.attributes("data-delta")).toBe(
      "12,847 total",
    );
  });
});

describe("dashboard funnel view-model", () => {
  function funnelStages(w: ReturnType<typeof mountDash>) {
    return JSON.parse(w.find(".t-funnel").attributes("data-json") || "[]");
  }

  // D-V06 — every stage "0%" at zero sent, no divide-by-zero.
  it("renders 0% / zero counts at all-zero totals", () => {
    metrics.value = { totals: { sent: 0, delivered: 0, opens: 0, clicks: 0 } };
    const stages = funnelStages(mountDash());
    expect(stages).toHaveLength(4);
    for (const s of stages) {
      expect(s.pct).toBe("0%");
      expect(s.count).toBe(0);
    }
  });

  // D-V07 — pct of real totals.
  it("computes pctOfSent against real totals", () => {
    metrics.value = { totals: { sent: 1000, delivered: 950, opens: 380, clicks: 95 } };
    const stages = funnelStages(mountDash());
    const byName = Object.fromEntries(stages.map((s: any) => [s.name, s]));
    expect(byName.Delivered.pct).toBe("95.0%");
    expect(byName.Opened.pct).toBe("38.0%");
    expect(byName.Clicked.pct).toBe("9.5%");
  });
});

describe("dashboard engagement view-model", () => {
  function slices(w: ReturnType<typeof mountDash>) {
    return JSON.parse(w.find(".t-donut").attributes("data-json") || "[]");
  }

  // D-V08 — split + rounding.
  it("splits subscribed vs other with rounded pct", () => {
    metrics.value = { contacts: { total: 4, subscribed: 3 } };
    const s = slices(mountDash());
    expect(s[0]).toMatchObject({ label: "Subscribed", count: 3, pct: 75 });
    expect(s[1]).toMatchObject({ label: "Other", count: 1, pct: 25 });
  });

  // D-V09 — other never negative (defensive).
  it("clamps 'other' to 0 when subscribed exceeds total", () => {
    metrics.value = { contacts: { total: 2, subscribed: 5 } };
    const s = slices(mountDash());
    expect(s[1].count).toBe(0);
  });

  // D-V10 — zero total → 0% slices + "0" total label, no NaN.
  it("renders 0% slices and a '0' total at zero contacts", () => {
    metrics.value = { contacts: { total: 0, subscribed: 0 } };
    const w = mountDash();
    const s = slices(w);
    expect(s[0].pct).toBe(0);
    expect(s[1].pct).toBe(0);
    expect(w.find(".t-donut").attributes("data-total")).toBe("0");
  });
});

describe("dashboard audience-growth view-model", () => {
  // D-V11 — flat 30-length series at the subscriber count.
  it("builds a flat 30-point series equal to the subscriber count", () => {
    metrics.value = { contacts: { total: 30, subscribed: 30 } };
    const w = mountDash();
    const points = JSON.parse(w.find(".t-growth").attributes("data-json") || "[]");
    expect(points).toHaveLength(30);
    expect(points.every((p: number) => p === 30)).toBe(true);
    expect(w.find(".t-growth").attributes("data-total")).toBe("30");
  });
});

describe("dashboard onboarding view-model", () => {
  function onboardItems(w: ReturnType<typeof mountDash>) {
    return w.findAll(".onboard-item");
  }

  // D-V12 + D-V13 + D-W10 — step mapping in fixed order, done flags, CTAs.
  it("maps step booleans onto the 5 static steps in order, with CTAs for not-done", () => {
    showOnboarding.value = true;
    metrics.value = {
      onboarding: {
        steps: {
          senderIdentity: true,
          audience: true,
          contact: false,
          campaign: false,
          sent: false,
        },
      },
    };
    const w = mountDash();
    const items = onboardItems(w);
    expect(items).toHaveLength(5);

    const labels = items.map((i) => i.find(".onboard-item-label").text());
    expect(labels).toEqual([
      "Set a default from-email",
      "Create your first audience",
      "Add some contacts",
      "Build a campaign",
      "Send your first campaign",
    ]);

    // done rows (first two): "Done" tag, no CTA link.
    expect(items[0].classes()).toContain("is-done");
    expect(items[1].classes()).toContain("is-done");
    expect(items[0].find(".onboard-done-tag").exists()).toBe(true);
    expect(items[0].find(".t-link").exists()).toBe(false);

    // not-done rows: CTA NuxtLink pointing at the step's `to`.
    expect(items[2].classes()).not.toContain("is-done");
    const cta = items[2].find(".t-link");
    expect(cta.exists()).toBe(true);
    expect(cta.attributes("href")).toBe("/app/audiences"); // contact → /app/audiences
    expect(cta.text()).toBe("Add contacts");

    // D-V13 / D-W11 — progress copy "2 of 5".
    expect(w.find(".onboard-sub").text()).toContain("2 of 5 steps done");
  });

  // D-V14 — tolerate missing steps (undefined onboarding).
  it("treats every step as not-done when onboarding/steps is missing", () => {
    showOnboarding.value = true;
    metrics.value = { onboarding: undefined };
    const w = mountDash();
    const items = onboardItems(w);
    expect(items).toHaveLength(5);
    for (const i of items) expect(i.classes()).not.toContain("is-done");
    expect(w.find(".onboard-sub").text()).toContain("0 of 5 steps done");
  });

  it("hides the checklist entirely when showOnboarding is false", () => {
    showOnboarding.value = false;
    metrics.value = { onboarding: { steps: {} } };
    const w = mountDash();
    expect(w.find(".onboard").exists()).toBe(false);
  });
});

describe("dashboard quick actions + empty states", () => {
  // D-W09 — five quick actions with the documented `to` targets and labels.
  it("renders the 5 quick actions with correct to targets", () => {
    metrics.value = null;
    const w = mountDash();
    const actions = JSON.parse(w.find(".t-qa").attributes("data-json") || "[]");
    expect(actions.map((a: any) => a.to)).toEqual([
      "/app/campaigns/new",
      "/app/audiences",
      "/app/audiences",
      "/app/segments/new",
      "/app/templates",
    ]);
    expect(actions.map((a: any) => a.label)).toEqual([
      "New campaign",
      "Create audience",
      "Add contacts",
      "Build a segment",
      "Browse templates",
    ]);
  });

  // D-W12 — empty-state copy for recent campaigns + activity (no send data).
  it("shows empty-state copy for recent campaigns and activity", () => {
    metrics.value = null;
    const w = mountDash();
    const text = w.text();
    expect(text).toContain("No campaigns sent yet");
    expect(text).toContain("No recent activity");
  });

  // Error banner is non-fatal — but our mock sets error to null; assert that
  // when error is present the banner renders while widgets still mount.
  it("does not render an error banner when there is no error", () => {
    metrics.value = null;
    const w = mountDash();
    expect(w.find(".dash-error").exists()).toBe(false);
    // KPI strip still rendered.
    expect(w.findAll(".t-kpi")).toHaveLength(4);
  });
});
