<script setup>
import { computed, onMounted } from "vue";
import { useAuthStore } from "~/stores/auth";
import { useDashboard } from "~/composables/app/useDashboard";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Dashboard" });

const auth = useAuthStore();

// Real org-scoped metrics from the `getDashboardMetrics` cloud function.
// Audiences / contacts / campaigns-by-status are real from day one; engagement
// totals (sent/opens/clicks) are 0 until the send pipeline lands — the widgets
// below render graceful empty states in that case.
const { metrics, loading, error, load } = useDashboard();
onMounted(load);

// ── Formatters ────────────────────────────────────────────────────────────--
function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-US");
}
function fmtPct(fraction) {
  return `${((fraction || 0) * 100).toFixed(1)}%`;
}

// ── KPI strip ─────────────────────────────────────────────────────────────--
// Active campaigns = sending + scheduled. Subscribers = subscribed contacts.
// Open/click rates are lifetime, computed by the cloud fn; show "—" delta since
// we have no prior-period comparison until the pipeline records history.
const kpis = computed(() => {
  const m = metrics.value;
  const byStatus = m?.campaigns?.byStatus || {};
  const active = (byStatus.sending || 0) + (byStatus.scheduled || 0);
  return [
    { label: "Active campaigns",     value: fmtNum(active),                          delta: `${fmtNum(m?.campaigns?.total || 0)} total`, deltaDirection: "neutral" },
    { label: "Subscribers",          value: fmtNum(m?.contacts?.subscribed || 0),    delta: `${fmtNum(m?.contacts?.total || 0)} contacts`, deltaDirection: "neutral" },
    { label: "Avg open rate",        value: fmtPct(m?.rates?.open),                  delta: "lifetime", deltaDirection: "neutral" },
    { label: "Avg click rate",       value: fmtPct(m?.rates?.click),                 delta: "lifetime", deltaDirection: "neutral" },
  ];
});

// ── Funnel ───────────────────────────────────────────────────────────────--
// Built from lifetime totals. The component derives step rates + bar heights;
// at all-zero it renders the empty bars cleanly (MIN_BAR_HEIGHT_PCT floor).
const funnelStages = computed(() => {
  const t = metrics.value?.totals || { sent: 0, delivered: 0, opens: 0, clicks: 0 };
  const pctOfSent = (n) => (t.sent ? `${((n / t.sent) * 100).toFixed(1)}%` : "0%");
  return [
    { name: "Sent",      count: t.sent,      pct: pctOfSent(t.sent) },
    { name: "Delivered", count: t.delivered, pct: pctOfSent(t.delivered) },
    { name: "Opened",    count: t.opens,     pct: pctOfSent(t.opens) },
    { name: "Clicked",   count: t.clicks,    pct: pctOfSent(t.clicks) },
  ];
});

// ── Audience growth ─────────────────────────────────────────────────────────
// Per-day subscriber history needs an events rollup that doesn't exist yet, so
// we render a flat line at the current subscriber count (honest: no synthetic
// trend). When the rollup lands this becomes a real series. deltaAbs is blank
// because we have no prior point to diff against.
const subscriberCount = computed(() => metrics.value?.contacts?.subscribed || 0);
const audienceGrowthPoints = computed(() => Array(30).fill(subscriberCount.value));

// ── Engagement donut ─────────────────────────────────────────────────────────
// Real split of subscribed vs everyone else. Engaged/unengaged segmentation
// needs per-contact engagement scoring (pipeline), so for now we show
// Subscribed vs Other (unsubscribed/bounced/etc.) — both real counts.
const engagementSlices = computed(() => {
  const total = metrics.value?.contacts?.total || 0;
  const subscribed = metrics.value?.contacts?.subscribed || 0;
  const other = Math.max(total - subscribed, 0);
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  return [
    { label: "Subscribed", count: subscribed, countLabel: fmtNum(subscribed), pct: pct(subscribed), kind: "pop" },
    { label: "Other",      count: other,      countLabel: fmtNum(other),      pct: pct(other),      kind: "soft" },
  ];
});
const engagementTotal = computed(() => fmtNum(metrics.value?.contacts?.total || 0));

// Recent campaigns + activity feed + top performers need per-campaign report
// rows and an event stream — all empty until sends happen. Show empty arrays so
// the components render their empty states rather than fabricated rows.
const recentCampaigns = [];
const activityEvents = [];
const topCampaigns = [];

const quickActions = [
  { to: "/app/campaigns/new", icon: "paper-plane", label: "New campaign",     desc: "Compose and send a fresh email" },
  { to: "/app/audiences",     icon: "upload",      label: "Import contacts",  desc: "Bring in subscribers from a CSV" },
  { to: "/app/segments",      icon: "filter",      label: "New segment",      desc: "Slice your audience by rules" },
  { to: "/app/templates",     icon: "document",    label: "Browse templates", desc: "Start from a saved layout" },
];
</script>

<template>
  <div class="dashboard">
    <!-- 1. Welcome header -->
    <header class="dash-header">
      <div class="dash-header-text">
        <h1>Welcome, {{ auth.name || auth.username }}.</h1>
        <p class="dash-lede">Here's what's happening across your campaigns.</p>
      </div>
      <NuxtLink to="/app/campaigns/new" class="dash-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New campaign</span>
      </NuxtLink>
    </header>

    <!-- 2. KPI strip -->
    <section class="dash-kpis" aria-label="Key performance indicators">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- Error banner (non-fatal; widgets still render their zero states) -->
    <p v-if="error" class="dash-error">{{ error }}</p>

    <!-- 3. Audience growth + engagement donut -->
    <section class="dash-split dash-split-66-34">
      <AppAudienceGrowthChart
        :points="audienceGrowthPoints"
        :total="fmtNum(subscriberCount)"
        delta-abs="—"
        delta-pct="no history yet"
      />
      <AppEngagementDonut :slices="engagementSlices" :total="engagementTotal" />
    </section>

    <!-- 4. Funnel -->
    <section class="dash-section">
      <div class="dash-eyebrow">
        <span class="dash-eyebrow-dot" aria-hidden="true"></span>
        <span>Lifetime &middot; campaign performance</span>
      </div>
      <div class="dash-card">
        <AppCampaignFunnel :stages="funnelStages" />
      </div>
    </section>

    <!-- 5. Recent campaigns + activity feed -->
    <section class="dash-split dash-split-60-40">
      <div class="dash-section">
        <div class="dash-eyebrow">
          <span class="dash-eyebrow-dot" aria-hidden="true"></span>
          <span>Recent campaigns</span>
        </div>
        <div class="dash-card dash-card-flush">
          <AppRecentCampaignsTable v-if="recentCampaigns.length" :campaigns="recentCampaigns" />
          <p v-else class="dash-empty">No campaigns sent yet. Your sent campaigns will show up here.</p>
        </div>
      </div>
      <AppActivityFeed v-if="activityEvents.length" :events="activityEvents" />
      <div v-else class="dash-section">
        <div class="dash-eyebrow">
          <span class="dash-eyebrow-dot" aria-hidden="true"></span>
          <span>Recent activity</span>
        </div>
        <div class="dash-card">
          <p class="dash-empty">No recent activity. Subscriber and email events will appear here once you start sending.</p>
        </div>
      </div>
    </section>

    <!-- 6. Top performing campaigns -->
    <AppTopPerformingCampaigns v-if="topCampaigns.length" :campaigns="topCampaigns" />

    <!-- 7. Quick actions -->
    <AppQuickActions :actions="quickActions" />
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Welcome header */
.dash-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.dash-header-text { min-width: 0; }
.dash-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.dash-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.dash-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.dash-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.dash-cta:active {
  transform: translateY(1px);
}
.dash-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* KPI strip */
.dash-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .dash-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .dash-kpis { grid-template-columns: 1fr; }
}

/* Sections (funnel + table) */
.dash-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.dash-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.dash-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.dash-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.dash-card-flush { padding: 0; }

/* Empty-state copy inside a card (no data yet — pre-send-pipeline). */
.dash-empty {
  margin: 0;
  padding: var(--space-6) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  text-align: center;
}
.dash-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-radius: var(--radius-md);
}

/* Two-column rows. Stack below 960px to match the KPI breakpoint. */
.dash-split {
  display: grid;
  gap: var(--space-5);
  align-items: start;
}
.dash-split-66-34 {
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
}
.dash-split-60-40 {
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
}
@media (max-width: 960px) {
  .dash-split-66-34,
  .dash-split-60-40 {
    grid-template-columns: 1fr;
  }
}
</style>
