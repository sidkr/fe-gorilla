import { ref } from "vue";
import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Revenue reporting — wraps the getRevenueOverview cloud function
// (RevenueAttribution §5). All money values are integer MINOR UNITS (cents);
// the UI formats with useFormatters().formatCurrency.
//
// Demo mode mirrors useReportsSample: a fresh org has no Conversions yet, so we
// fall back to a believable static sample so the revenue surface demonstrates
// what it will look like instead of rendering a page of zeros. Demo ends
// automatically once real attributed revenue exists.
// ─────────────────────────────────────────────────────────────────────────────

export interface RevenueTrendPoint {
  day: string; // YYYY-MM-DD
  revenue: number; // minor units
  orders: number;
}
export interface RevenueCampaign {
  campaignId: string;
  name: string;
  revenue: number; // minor units
  orders: number;
  aov: number; // minor units
}
export interface RevenueModel {
  model: string;
  revenue: number; // minor units
  orders: number;
}
export interface RevenueOverview {
  totalRevenue: number; // minor units
  orderCount: number;
  aov: number; // minor units
  currency: string;
  trend: RevenueTrendPoint[];
  topCampaigns: RevenueCampaign[];
  byModel: RevenueModel[];
  attributed: { revenue: number; orders: number };
  unattributed: { revenue: number; orders: number };
}

// Deterministic sample (no RNG) so the demo is stable across renders.
const SAMPLE: RevenueOverview = (() => {
  const trend: RevenueTrendPoint[] = [];
  const today = new Date();
  let totalRevenue = 0;
  let orderCount = 0;
  // 30-day series with a believable weekly cadence + a launch-day spike.
  const pattern = [8, 22, 31, 18, 12, 9, 6, 19, 27, 15, 10, 8, 6, 5, 14, 24, 17, 11, 8, 7, 5, 13, 21, 16, 10, 8, 6, 12, 18, 14];
  for (let i = 0; i < 30; i++) {
    const d = new Date(today.getTime() - (29 - i) * 86400000);
    const orders = pattern[i];
    const revenue = orders * 4820; // ~$48.20 AOV in cents
    totalRevenue += revenue;
    orderCount += orders;
    trend.push({ day: d.toISOString().slice(0, 10), revenue, orders });
  }
  const aov = orderCount > 0 ? Math.round(totalRevenue / orderCount) : 0;

  const topCampaigns: RevenueCampaign[] = [
    { campaignId: "sample-1", name: "Spring Launch", revenue: Math.round(totalRevenue * 0.42), orders: Math.round(orderCount * 0.4), aov: 5200 },
    { campaignId: "sample-2", name: "Weekly Digest #18", revenue: Math.round(totalRevenue * 0.27), orders: Math.round(orderCount * 0.3), aov: 4100 },
    { campaignId: "sample-3", name: "Re-engagement: We miss you", revenue: Math.round(totalRevenue * 0.16), orders: Math.round(orderCount * 0.18), aov: 3600 },
  ];
  const attributed = topCampaigns.reduce(
    (acc, c) => ({ revenue: acc.revenue + c.revenue, orders: acc.orders + c.orders }),
    { revenue: 0, orders: 0 },
  );
  const unattributed = {
    revenue: Math.max(0, totalRevenue - attributed.revenue),
    orders: Math.max(0, orderCount - attributed.orders),
  };
  const byModel: RevenueModel[] = [
    { model: "last_click", revenue: Math.round(totalRevenue * 0.62), orders: Math.round(orderCount * 0.62) },
    { model: "last_open", revenue: Math.round(totalRevenue * 0.18), orders: Math.round(orderCount * 0.18) },
    { model: "unattributed", revenue: unattributed.revenue, orders: unattributed.orders },
  ];

  return { totalRevenue, orderCount, aov, currency: "USD", trend, topCampaigns, byModel, attributed, unattributed };
})();

export function useRevenue() {
  const { runCloud } = useCloud();

  const loading = ref(false);
  const usingSample = ref(false);
  const error = ref<string | null>(null);
  const overview = ref<RevenueOverview | null>(null);

  async function load(params: { from?: string; to?: string } = {}) {
    loading.value = true;
    error.value = null;
    try {
      const res = await runCloud<RevenueOverview>("getRevenueOverview", params);
      // Demo mode: no real attributed revenue yet → show the sample.
      if (!res || !res.orderCount) {
        usingSample.value = true;
        overview.value = sample();
      } else {
        usingSample.value = false;
        overview.value = res;
      }
    } catch (err: unknown) {
      error.value = (err as Error)?.message || "Failed to load revenue.";
      usingSample.value = true;
      overview.value = sample();
    } finally {
      loading.value = false;
    }
    return overview.value;
  }

  // Fresh copy so callers can't mutate the shared sample.
  function sample(): RevenueOverview {
    return JSON.parse(JSON.stringify(SAMPLE));
  }

  return { loading, usingSample, error, overview, load, sample };
}

export { SAMPLE };
