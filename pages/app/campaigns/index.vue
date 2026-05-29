<script setup>
import { ref, computed } from "vue";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Campaigns" });

// All values below are mock data. The Parse query pipeline isn't wired yet;
// when it lands we'll swap these for `new Parse.Query("Campaign")` results
// and a client-side filter against `status`.
const campaigns = [
  { id: "c_01", name: "Spring Sale 2026 — Early Access", status: "sent",       audience: "Engaged subscribers", date: "May 18, 2026",         relative: "3 days ago",    openRate: "46.4%", clickRate: "8.9%"  },
  { id: "c_02", name: "May 2026 Newsletter",             status: "draft",      audience: null,                   date: "Created May 21, 2026", relative: "today",         openRate: null,    clickRate: null    },
  { id: "c_03", name: "Membership Renewal Reminder",     status: "scheduled",  audience: "VIP Members",         date: "Sends May 25, 2026",   relative: "in 4 days",     openRate: null,    clickRate: null    },
  { id: "c_04", name: "April Refresh",                    status: "sent",       audience: "All subscribers",     date: "Apr 22, 2026",         relative: "1 month ago",   openRate: "41.2%", clickRate: "7.6%"  },
  { id: "c_05", name: "Member-only Drop",                 status: "sent",       audience: "Engaged subscribers", date: "Mar 30, 2026",         relative: "2 months ago",  openRate: "52.1%", clickRate: "11.4%" },
  { id: "c_06", name: "Loyalty Program Update",           status: "sent",       audience: "VIP Members",         date: "Mar 15, 2026",         relative: "2 months ago",  openRate: "38.7%", clickRate: "5.2%"  },
  { id: "c_07", name: "February Newsletter",              status: "sent",       audience: "All subscribers",     date: "Feb 14, 2026",         relative: "3 months ago",  openRate: "44.3%", clickRate: "8.1%"  },
  { id: "c_08", name: "Welcome Series — Email 1",         status: "draft",      audience: null,                   date: "Created Feb 8, 2026",  relative: "3 months ago",  openRate: null,    clickRate: null    },
  { id: "c_09", name: "New Year Sale",                    status: "sent",       audience: "All subscribers",     date: "Jan 3, 2026",          relative: "5 months ago",  openRate: "49.6%", clickRate: "10.2%" },
  { id: "c_10", name: "Holiday Gift Guide",               status: "sent",       audience: "Engaged subscribers", date: "Dec 12, 2025",         relative: "5 months ago",  openRate: "47.8%", clickRate: "9.4%"  },
];

// Summary KPI strip — values are derived from the mock data above so the
// counts stay consistent if the mock gets edited.
const kpis = [
  { label: "Total campaigns",    value: "10",    delta: "+2 this month",         deltaDirection: "up" },
  { label: "Avg open rate",      value: "45.2%", delta: "+1.8pp vs last quarter", deltaDirection: "up" },
  { label: "Drafts",             value: "2",     delta: "Ready to ship",         deltaDirection: "neutral" },
];

// Tab definitions. "sending" intentionally omitted — 0 in mock and surfacing
// an empty tab is just visual noise. Counts are derived from `campaigns`.
const tabs = computed(() => [
  { id: "all",       label: "All",       count: campaigns.length },
  { id: "draft",     label: "Drafts",    count: campaigns.filter((c) => c.status === "draft").length },
  { id: "scheduled", label: "Scheduled", count: campaigns.filter((c) => c.status === "scheduled").length },
  { id: "sent",      label: "Sent",      count: campaigns.filter((c) => c.status === "sent").length },
]);

const activeTab = ref("all");

const filtered = computed(() =>
  activeTab.value === "all"
    ? campaigns
    : campaigns.filter((c) => c.status === activeTab.value),
);
</script>

<template>
  <div class="campaigns">
    <!-- 1. Header -->
    <header class="cmp-header">
      <div class="cmp-header-text">
        <h1>Campaigns</h1>
        <p class="cmp-lede">All your campaign activity, drafts to deliveries.</p>
      </div>
      <NuxtLink to="/app/campaigns/new" class="cmp-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New campaign</span>
      </NuxtLink>
    </header>

    <!-- 2. KPI strip -->
    <section class="cmp-kpis" aria-label="Campaign summary">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- 3. Filter tabs + 4. Table, grouped under one eyebrow -->
    <section class="cmp-section">
      <div class="cmp-eyebrow">
        <span class="cmp-eyebrow-dot" aria-hidden="true"></span>
        <span>All campaigns</span>
      </div>

      <div class="cmp-tabs" role="tablist" aria-label="Filter campaigns by status">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === t.id"
          :class="['cmp-tab', { 'cmp-tab--active': activeTab === t.id }]"
          @click="activeTab = t.id"
        >
          <span class="cmp-tab-label">{{ t.label }}</span>
          <span class="cmp-tab-count tabular">{{ t.count }}</span>
        </button>
      </div>

      <div class="cmp-card cmp-card-flush">
        <AppCampaignsTable :campaigns="filtered" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.campaigns {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.cmp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.cmp-header-text { min-width: 0; }
.cmp-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.cmp-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.cmp-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.cmp-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.cmp-cta:active {
  transform: translateY(1px);
}
.cmp-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* KPI strip — three cards across, stack on narrow viewports. */
.cmp-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .cmp-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .cmp-kpis { grid-template-columns: 1fr; }
}

/* Section wrapper */
.cmp-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cmp-eyebrow {
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
.cmp-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Segmented filter tabs — same visual language as EditorTopBar's
   Desktop/Mobile toggle. Counts ride along on the right of each label. */
.cmp-tabs {
  display: inline-flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
  align-self: flex-start;
  flex-wrap: wrap;
}
.cmp-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-rule);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.cmp-tab:last-child { border-right: 0; }
.cmp-tab:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.cmp-tab--active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
}
.cmp-tab--active:hover {
  background: var(--color-pop-bg);
}
.cmp-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  padding: 0 var(--space-1-5);
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1;
}
.cmp-tab--active .cmp-tab-count {
  background: var(--color-surface);
  color: var(--color-ink);
}
.cmp-tab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
  position: relative;
  z-index: 1;
}

/* Card wrapper for the table */
.cmp-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.cmp-card-flush { padding: 0; }
</style>
