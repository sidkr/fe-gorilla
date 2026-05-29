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
const { metrics, loading, error, load, showOnboarding, dismissOnboarding } =
  useDashboard();
onMounted(load);

// ── Onboarding checklist ──────────────────────────────────────────────────────
// Driven entirely by real org state (metrics.onboarding.steps). Each entry links
// the incomplete step to the route where the user completes it. The whole card
// hides when every step is done (showOnboarding from the composable) or the user
// dismisses it. We render all steps (done + not), so users see progress.
const ONBOARDING_STEPS = [
  {
    key: "senderIdentity",
    label: "Set a default from-email",
    desc: "Tell us which verified address your campaigns send from.",
    to: "/app/settings",
    cta: "Go to settings",
  },
  {
    key: "audience",
    label: "Create your first audience",
    desc: "An audience is a list of people you email.",
    to: "/app/audiences",
    cta: "Create audience",
  },
  {
    key: "contact",
    label: "Add some contacts",
    desc: "Import subscribers or add them by hand.",
    to: "/app/audiences",
    cta: "Add contacts",
  },
  {
    key: "campaign",
    label: "Build a campaign",
    desc: "Compose an email and pick who receives it.",
    to: "/app/campaigns/new",
    cta: "New campaign",
  },
  {
    key: "sent",
    label: "Send your first campaign",
    desc: "Hit send (or schedule) to reach your audience.",
    to: "/app/campaigns/new",
    cta: "Compose & send",
  },
];

const onboardingSteps = computed(() => {
  const steps = metrics.value?.onboarding?.steps || {};
  return ONBOARDING_STEPS.map((s) => ({ ...s, done: !!steps[s.key] }));
});
const onboardingDoneCount = computed(
  () => onboardingSteps.value.filter((s) => s.done).length,
);

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

// Quick actions — every `to` is a real, existing route. New campaign and Build a
// segment go straight to their create flows (/app/campaigns/new, the segment
// builder at /app/segments/new which the [id] page handles as id==="new").
// Create audience / Add contacts land on /app/audiences where the create + import
// affordances live; Browse templates → /app/templates.
const quickActions = [
  { to: "/app/campaigns/new", icon: "paper-plane", label: "New campaign",     desc: "Compose and send a fresh email" },
  { to: "/app/audiences",     icon: "upload",      label: "Create audience",  desc: "Start a new list of subscribers" },
  { to: "/app/audiences",     icon: "upload",      label: "Add contacts",     desc: "Import subscribers from a CSV" },
  { to: "/app/segments/new",  icon: "filter",      label: "Build a segment",  desc: "Slice your audience by rules" },
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
      <Button variant="primary" to="/app/campaigns/new">
        <template #leading><Icon name="plus" size="sm" /></template>
        New campaign
      </Button>
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

    <!-- Onboarding checklist — driven by real org state. Hidden once every step
         is complete or the user dismisses it. -->
    <section v-if="showOnboarding" class="onboard" aria-label="Setup checklist">
      <div class="onboard-head">
        <div class="onboard-head-text">
          <h2 class="onboard-title">Finish setting up Gorilla</h2>
          <p class="onboard-sub">
            {{ onboardingDoneCount }} of {{ onboardingSteps.length }} steps done — knock out the rest to start sending.
          </p>
        </div>
        <button type="button" class="onboard-dismiss" aria-label="Dismiss checklist" @click="dismissOnboarding">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3 3 L11 11 M11 3 L3 11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </div>

      <ul class="onboard-list">
        <li v-for="step in onboardingSteps" :key="step.key" class="onboard-item" :class="{ 'is-done': step.done }">
          <span class="onboard-check" :class="{ 'is-done': step.done }" aria-hidden="true">
            <svg v-if="step.done" width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 7.5 L6 10.5 L11 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <div class="onboard-item-text">
            <div class="onboard-item-label">{{ step.label }}</div>
            <div class="onboard-item-desc">{{ step.desc }}</div>
          </div>
          <span v-if="step.done" class="onboard-done-tag">Done</span>
          <NuxtLink v-else :to="step.to" class="onboard-item-cta">{{ step.cta }}</NuxtLink>
        </li>
      </ul>
    </section>

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
      <SectionEyebrow>Lifetime &middot; campaign performance</SectionEyebrow>
      <Card>
        <AppCampaignFunnel :stages="funnelStages" />
      </Card>
    </section>

    <!-- 5. Recent campaigns + activity feed -->
    <section class="dash-split dash-split-60-40">
      <div class="dash-section">
        <SectionEyebrow>Recent campaigns</SectionEyebrow>
        <AppRecentCampaignsTable v-if="recentCampaigns.length" :campaigns="recentCampaigns" />
        <Card v-else>
          <p class="dash-empty">No campaigns sent yet. Your sent campaigns will show up here.</p>
        </Card>
      </div>
      <AppActivityFeed v-if="activityEvents.length" :events="activityEvents" />
      <div v-else class="dash-section">
        <SectionEyebrow>Recent activity</SectionEyebrow>
        <Card>
          <p class="dash-empty">No recent activity. Subscriber and email events will appear here once you start sending.</p>
        </Card>
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

/* Onboarding checklist card */
.onboard {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.onboard-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
}
.onboard-title {
  margin: 0 0 var(--space-1);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.onboard-sub {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.onboard-dismiss {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-dim);
  cursor: pointer;
  transition: border-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out);
}
.onboard-dismiss:hover {
  border-color: var(--color-pop);
  color: var(--color-ink);
}
.onboard-dismiss:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.onboard-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.onboard-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
}
.onboard-item.is-done {
  border-color: transparent;
  background: var(--color-surface-sunk);
}
.onboard-check {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-rule);
  border-radius: var(--radius-pill);
  color: var(--btn-primary-fg);
}
.onboard-check.is-done {
  background: var(--color-pop);
  border-color: var(--color-pop);
}
.onboard-item-text {
  flex: 1 1 auto;
  min-width: 0;
}
.onboard-item-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-ink);
}
.onboard-item.is-done .onboard-item-label {
  color: var(--color-ink-soft);
}
.onboard-item-desc {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
  line-height: var(--leading-snug);
}
.onboard-item-cta {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: var(--space-2) var(--space-4);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  white-space: nowrap;
  transition: background-color var(--dur-base) var(--ease-out);
}
.onboard-item-cta:hover {
  background: var(--btn-primary-hover);
}
.onboard-item-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.onboard-done-tag {
  flex: none;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
@media (max-width: 520px) {
  .onboard-item {
    flex-wrap: wrap;
  }
  .onboard-item-cta,
  .onboard-done-tag {
    margin-left: calc(20px + var(--space-3));
  }
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
