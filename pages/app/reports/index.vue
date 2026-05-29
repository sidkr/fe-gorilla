<script setup>
import { computed, onMounted, ref } from "vue";
import { useReports } from "~/composables/app/useReports";
import { useReportsSample } from "~/composables/app/useReportsSample";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Reports" });

// Real per-campaign reports for the org's sent campaigns. Empty for a fresh org
// (no sends yet) → the page drops into DEMO mode: realistic sample data behind a
// tutorial overlay, so the user sees what Reports will look like. Demo auto-ends
// after the first real send (campaignReports becomes non-empty) or on dismiss.
const { reports: campaignReports, loading, error, loadSentCampaignReports } = useReports();
const { sample, isDismissed, dismiss } = useReportsSample();

const dismissed = ref(isDismissed());
onMounted(() => loadSentCampaignReports());

const hasRealData = computed(() => campaignReports.value.length > 0);
// Demo = no real data yet AND not dismissed. While the first load is in flight
// we hold demo off to avoid a flash, then resolve once loading settles.
const demo = computed(() => !loading.value && !hasRealData.value && !dismissed.value);

// ── Real-mode slices (same shapes as useReportsSample so widgets are agnostic) ──
const agg = computed(() => {
  const a = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0 };
  for (const r of campaignReports.value) {
    a.sent += r.counts.sent;
    a.delivered += r.counts.delivered;
    a.opens += r.counts.opens;
    a.clicks += r.counts.clicks;
    a.bounces += r.counts.bounces;
    a.unsubs += r.counts.unsubscribes;
  }
  return a;
});
const realKpis = computed(() => {
  const a = agg.value;
  return {
    sent: a.sent,
    delivered: a.delivered,
    deliveredRate: a.sent ? a.delivered / a.sent : 0,
    opens: a.opens,
    openRate: a.delivered ? a.opens / a.delivered : 0,
    clicks: a.clicks,
    clickRate: a.delivered ? a.clicks / a.delivered : 0,
    bounces: a.bounces,
    bounceRate: a.sent ? a.bounces / a.sent : 0,
    unsubs: a.unsubs,
    unsubRate: a.delivered ? a.unsubs / a.delivered : 0,
  };
});
const realEngagement = computed(() => ({
  delivered: agg.value.delivered,
  opened: agg.value.opens,
  clicked: agg.value.clicks,
  bounced: agg.value.bounces,
  unsubscribed: agg.value.unsubs,
}));
const realCampaigns = computed(() =>
  campaignReports.value.map((r) => ({
    id: r.id,
    name: r.name || "(untitled)",
    sentAt: r.sentAt,
    recipients: r.counts.sent,
    openRate: r.rates.open,
    clickRate: r.rates.click,
    bounceRate: r.rates.bounce,
    unsubRate: r.rates.unsubscribe,
  })),
);

// ── What the widgets receive (sample when demo, real otherwise) ───────────────
const kpiData = computed(() => (demo.value ? sample.kpis : realKpis.value));
const trendData = computed(() => (demo.value ? sample.trend : [])); // real time-series builds as events arrive
const engagementData = computed(() => (demo.value ? sample.engagement : realEngagement.value));
const tableData = computed(() => (demo.value ? sample.campaigns : realCampaigns.value));

function onDismiss() {
  dismiss();
  dismissed.value = true;
}
function onExport() {
  /* CSV export route not wired yet */
}
</script>

<template>
  <div class="reports">
    <header class="rep-header">
      <div class="rep-header-text">
        <h1>Reports</h1>
        <p class="rep-lede">Campaign performance, audience health, and deliverability at a glance.</p>
      </div>
      <button type="button" class="rep-export" @click="onExport">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 1.8 V8.8 M3.6 5.4 L7 8.8 L10.4 5.4 M2.2 11.2 H11.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        <span>Export CSV</span>
      </button>
    </header>

    <p v-if="error" class="rep-error">{{ error }}</p>

    <!-- Tutorial / onboarding overlay — only in demo mode. Explains the page,
         offers a dismiss CTA, and notes it vanishes after the first real send. -->
    <AppReportsOnboarding v-if="demo" @dismiss="onDismiss" />

    <!-- Widgets — one component (and one agent) per widget. Each takes its data
         slice + a `demo` flag so it can badge sample data. -->
    <AppReportsKpiStrip :data="kpiData" :demo="demo" />

    <div class="rep-two-col">
      <AppReportsTrend :data="trendData" :demo="demo" />
      <AppReportsEngagement :data="engagementData" :demo="demo" />
    </div>

    <AppReportsTable :data="tableData" :demo="demo" :loading="loading" />
  </div>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
.rep-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.rep-header-text { min-width: 0; }
.rep-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.rep-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.rep-export {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: transparent;
  color: var(--btn-ghost-fg);
  border: 1px solid var(--btn-ghost-border);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}
.rep-export:hover { background: var(--btn-ghost-hover-bg); border-color: var(--color-rule-strong); }
.rep-export:focus-visible { outline: none; box-shadow: var(--shadow-pop-glow); }
.rep-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-radius: var(--radius-md);
}
/* Trend + engagement side by side on wide screens, stacked on narrow. */
.rep-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--space-5);
}
@media (max-width: 960px) {
  .rep-two-col { grid-template-columns: 1fr; }
}
</style>
