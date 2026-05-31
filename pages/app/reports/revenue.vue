<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRevenue } from "~/composables/app/useRevenue";
import { useFormatters } from "~/composables/shared/useFormatters";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Revenue" });

// Revenue reporting surface (RevenueAttribution §5): revenue over time, AOV
// trend, top campaigns, attribution-model breakdown, attributed vs unattributed.
// Demo mode (sample data behind a badge) until real Conversions exist — same
// rationale as the engagement Reports page.
const { loading, usingSample, overview, load } = useRevenue();
const { formatCurrency, formatNumber, formatPercent } = useFormatters();

onMounted(() => load());

const currency = computed(() => overview.value?.currency || "USD");

// KPI strip.
const kpis = computed(() => {
  const o = overview.value;
  const total = (o?.attributed.revenue || 0) + (o?.unattributed.revenue || 0);
  const attPct = total > 0 ? (o!.attributed.revenue / total) : 0;
  return [
    { label: "Attributed revenue", value: formatCurrency(o?.totalRevenue ?? 0, currency.value), delta: usingSample.value ? "sample" : "in period", deltaDirection: "neutral" },
    { label: "Orders", value: formatNumber(o?.orderCount ?? 0), delta: usingSample.value ? "sample" : "in period", deltaDirection: "neutral" },
    { label: "Avg order value", value: formatCurrency(o?.aov ?? 0, currency.value), delta: "revenue ÷ orders", deltaDirection: "neutral" },
    { label: "Attributed share", value: formatPercent(attPct), delta: "of total revenue", deltaDirection: "neutral" },
  ];
});

// Build an SVG polyline (0..100 viewBox) from a numeric series.
function polyline(values: number[]): string {
  const max = Math.max(1, ...values);
  const n = values.length;
  return values
    .map((v, i) => {
      const x = (i / Math.max(1, n - 1)) * 100;
      const y = 100 - (v / max) * 100;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

const revenueTrend = computed(() => polyline((overview.value?.trend || []).map((d) => d.revenue)));
const aovTrend = computed(() =>
  polyline((overview.value?.trend || []).map((d) => (d.orders > 0 ? d.revenue / d.orders : 0))),
);

const attributedPct = computed(() => {
  const o = overview.value;
  if (!o) return 0;
  const total = o.attributed.revenue + o.unattributed.revenue;
  return total > 0 ? o.attributed.revenue / total : 0;
});
</script>

<template>
  <div class="rev">
    <header class="rev-header">
      <div class="rev-header-text">
        <NuxtLink to="/app/reports" class="rev-back">← Reports</NuxtLink>
        <h1>Revenue</h1>
        <p class="rev-lede">Attributed revenue, average order value, and which campaigns drove sales.</p>
      </div>
      <span v-if="usingSample" class="rev-demo-badge">Sample data</span>
    </header>

    <!-- KPI strip -->
    <section class="rev-kpis" aria-label="Revenue KPIs">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <p v-if="loading" class="rev-state">Loading revenue…</p>

    <template v-else>
      <!-- Trends -->
      <div class="rev-two-col">
        <section class="rev-card">
          <SectionEyebrow>Revenue over time</SectionEyebrow>
          <svg class="rev-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline :points="revenueTrend" fill="none" stroke="var(--color-pop)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          </svg>
        </section>
        <section class="rev-card">
          <SectionEyebrow>Average order value over time</SectionEyebrow>
          <svg class="rev-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline :points="aovTrend" fill="none" stroke="var(--color-pop)" stroke-width="1.5" vector-effect="non-scaling-stroke" />
          </svg>
        </section>
      </div>

      <!-- Top campaigns + attribution model -->
      <div class="rev-two-col">
        <section class="rev-card">
          <SectionEyebrow>Top campaigns by revenue</SectionEyebrow>
          <table class="rev-tbl">
            <thead>
              <tr><th>Campaign</th><th class="num">Revenue</th><th class="num">Orders</th><th class="num">AOV</th></tr>
            </thead>
            <tbody>
              <tr v-for="c in overview?.topCampaigns || []" :key="c.campaignId">
                <td>{{ c.name }}</td>
                <td class="num">{{ formatCurrency(c.revenue, currency) }}</td>
                <td class="num">{{ formatNumber(c.orders) }}</td>
                <td class="num">{{ formatCurrency(c.aov, currency) }}</td>
              </tr>
              <tr v-if="!(overview?.topCampaigns || []).length">
                <td colspan="4" class="rev-empty">No campaign-attributed revenue yet.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="rev-card">
          <SectionEyebrow>Attribution model</SectionEyebrow>
          <table class="rev-tbl">
            <thead>
              <tr><th>Model</th><th class="num">Revenue</th><th class="num">Orders</th></tr>
            </thead>
            <tbody>
              <tr v-for="m in overview?.byModel || []" :key="m.model">
                <td>{{ m.model }}</td>
                <td class="num">{{ formatCurrency(m.revenue, currency) }}</td>
                <td class="num">{{ formatNumber(m.orders) }}</td>
              </tr>
              <tr v-if="!(overview?.byModel || []).length">
                <td colspan="3" class="rev-empty">No data yet.</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <!-- Attributed vs unattributed -->
      <section class="rev-card">
        <SectionEyebrow>Attributed vs unattributed</SectionEyebrow>
        <div class="rev-split-bar">
          <div class="rev-split-fill" :style="{ width: (attributedPct * 100) + '%' }"></div>
        </div>
        <ul class="rev-legend">
          <li>
            <span class="rev-dot rev-dot--att"></span>
            Attributed: {{ formatCurrency(overview?.attributed.revenue ?? 0, currency) }}
            ({{ formatNumber(overview?.attributed.orders ?? 0) }} orders)
          </li>
          <li>
            <span class="rev-dot rev-dot--unatt"></span>
            Unattributed: {{ formatCurrency(overview?.unattributed.revenue ?? 0, currency) }}
            ({{ formatNumber(overview?.unattributed.orders ?? 0) }} orders)
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.rev { display: flex; flex-direction: column; gap: var(--space-7); }
.rev-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; }
.rev-header-text { min-width: 0; }
.rev-back { font-family: var(--font-body); font-size: var(--text-sm); color: var(--link-color); text-decoration: none; }
.rev-back:hover { text-decoration: underline; }
.rev-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: var(--space-2) 0 var(--space-2);
  color: var(--color-ink);
}
.rev-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-md); color: var(--color-ink-soft); }
.rev-demo-badge {
  font-family: var(--font-body); font-size: var(--text-xs); font-weight: 600;
  letter-spacing: var(--tracking-wider); text-transform: uppercase;
  color: var(--color-ink-dim);
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--color-rule); border-radius: var(--radius-pill);
}
.rev-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); }
@media (max-width: 960px) { .rev-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .rev-kpis { grid-template-columns: 1fr; } }

.rev-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-5); align-items: start; }
@media (max-width: 960px) { .rev-two-col { grid-template-columns: 1fr; } }

.rev-card {
  display: flex; flex-direction: column; gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.rev-chart { width: 100%; height: 160px; }
.rev-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.rev-tbl { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--text-sm); }
.rev-tbl th, .rev-tbl td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--color-rule); }
.rev-tbl th { color: var(--color-ink-dim); font-weight: 600; }
.rev-tbl .num { text-align: right; font-variant-numeric: tabular-nums; }
.rev-empty { color: var(--color-ink-soft); text-align: center; }

.rev-split-bar { width: 100%; height: 14px; background: var(--color-surface-sunk); border-radius: var(--radius-pill); overflow: hidden; }
.rev-split-fill { height: 100%; background: var(--color-pop); }
.rev-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.rev-dot { display: inline-block; width: 10px; height: 10px; border-radius: var(--radius-pill); margin-right: var(--space-2); }
.rev-dot--att { background: var(--color-pop); }
.rev-dot--unatt { background: var(--color-rule); }
</style>
