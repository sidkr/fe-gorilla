<script setup>
import { useAuthStore } from "~/stores/auth";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Dashboard" });

const auth = useAuthStore();

// All values below are mock data. The Parse send pipeline isn't live yet;
// when it lands we'll swap these for real queries / cloud functions.
const kpis = [
  { label: "Active campaigns",    value: "3",      delta: "+1 vs last week",      deltaDirection: "up" },
  { label: "Subscribers",         value: "12,847", delta: "+342 in last 30d",     deltaDirection: "up" },
  { label: "Avg open rate (30d)", value: "46.4%",  delta: "+2.1pp vs prev 30d",   deltaDirection: "up" },
  { label: "Avg click rate (30d)",value: "8.9%",   delta: "−0.3pp vs prev 30d", deltaDirection: "down" },
];

const funnelStages = [
  { name: "Sent",      count: 12847, pct: "100%" },
  { name: "Delivered", count: 12612, pct: "98.2%" },
  { name: "Opened",    count: 5847,  pct: "45.5%" },
  { name: "Clicked",   count: 1124,  pct: "8.7%" },
  { name: "Converted", count: 287,   pct: "2.2%" },
];

const recentCampaigns = [
  { id: "c_1", name: "Spring Sale 2026 — Early Access", status: "Sent", sent: "May 18, 2026", openRate: "46.4%", clickRate: "8.9%" },
  { id: "c_2", name: "April Refresh",                          status: "Sent", sent: "Apr 22, 2026", openRate: "41.2%", clickRate: "7.6%" },
  { id: "c_3", name: "Member-only Drop",                       status: "Sent", sent: "Mar 30, 2026", openRate: "52.1%", clickRate: "11.4%" },
  { id: "c_4", name: "Loyalty Program Update",                 status: "Sent", sent: "Mar 15, 2026", openRate: "38.7%", clickRate: "5.2%" },
  { id: "c_5", name: "February Newsletter",                    status: "Sent", sent: "Feb 14, 2026", openRate: "44.3%", clickRate: "8.1%" },
];

// 30 daily subscriber counts, oldest → newest. Mostly upward trend with
// small day-to-day jitter so the chart reads as organic, not synthetic.
const audienceGrowthPoints = [
  12505, 12511, 12518, 12522, 12530, 12537, 12541, 12548, 12554, 12559,
  12568, 12575, 12579, 12586, 12591, 12597, 12606, 12612, 12618, 12626,
  12633, 12641, 12649, 12658, 12664, 12671, 12679, 12695, 12731, 12847,
];

const engagementSlices = [
  { label: "Engaged",          count: 8234, countLabel: "8,234", pct: 64, kind: "pop" },
  { label: "Unengaged",        count: 3201, countLabel: "3,201", pct: 25, kind: "soft" },
  { label: "New (last 30d)",   count: 1412, countLabel: "1,412", pct: 11, kind: "new" },
];

const activityEvents = [
  { initials: "MR", kind: "subscribed",   actor: "Maria Rodriguez", action: "subscribed",   detail: "via /pricing",                time: "12m ago" },
  { initials: "AC", kind: "clicked",      actor: "Alex Chen",       action: "clicked",      detail: "Spring Sale → /featured",     time: "18m ago" },
  { initials: "JW", kind: "bounced",      actor: "James Wright",    action: "bounced",      detail: "hard bounce · gmail.com",     time: "21m ago" },
  { initials: "SK", kind: "opened",       actor: "Sienna Khan",     action: "opened",       detail: "\"February Newsletter\"",     time: "34m ago" },
  { initials: "PD", kind: "unsubscribed", actor: "Priya Desai",     action: "unsubscribed", detail: "from \"Spring Sale\"",        time: "47m ago" },
  { initials: "RT", kind: "clicked",      actor: "Ryan Tran",       action: "clicked",      detail: "\"/sale/under-50\"",          time: "51m ago" },
  { initials: "ML", kind: "opened",       actor: "Maria Lopez",     action: "opened",       detail: "\"April Refresh\"",           time: "1h ago" },
  { initials: "DT", kind: "subscribed",   actor: "David Tran",      action: "subscribed",   detail: "via /signup",                 time: "1h ago" },
];

const topCampaigns = [
  { rank: 1, name: "Member-only Drop",                    openRate: 52.1 },
  { rank: 2, name: "Spring Sale 2026 — Early Access",     openRate: 46.4 },
  { rank: 3, name: "February Newsletter",                 openRate: 44.3 },
];

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

    <!-- 3. Audience growth + engagement donut -->
    <section class="dash-split dash-split-66-34">
      <AppAudienceGrowthChart :points="audienceGrowthPoints" />
      <AppEngagementDonut :slices="engagementSlices" total="12,847" />
    </section>

    <!-- 4. Funnel -->
    <section class="dash-section">
      <div class="dash-eyebrow">
        <span class="dash-eyebrow-dot" aria-hidden="true"></span>
        <span>Last 30 days &middot; campaign performance</span>
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
          <AppRecentCampaignsTable :campaigns="recentCampaigns" />
        </div>
      </div>
      <AppActivityFeed :events="activityEvents" />
    </section>

    <!-- 6. Top performing campaigns -->
    <AppTopPerformingCampaigns :campaigns="topCampaigns" />

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
