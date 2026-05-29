<script setup>
import { ref } from "vue";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Reports" });

// All values below are mock data. The Parse send pipeline isn't live yet;
// when it lands we'll swap these for real queries / cloud functions.

const timeRanges = [
  { id: "7d",   label: "Last 7 days" },
  { id: "30d",  label: "Last 30 days" },
  { id: "90d",  label: "Last 90 days" },
  { id: "year", label: "This year" },
];
// Visual filter only — the underlying mock data is static.
const activeRange = ref("30d");

const kpis = [
  { label: "Campaigns sent",  value: "28",    delta: "+4 vs prev 30d",     deltaDirection: "up" },
  { label: "Avg open rate",   value: "44.8%", delta: "+2.1pp vs prev 30d", deltaDirection: "up" },
  { label: "Avg click rate",  value: "7.9%",  delta: "−0.3pp vs prev 30d", deltaDirection: "down" },
  { label: "Total clicks",    value: "3,247", delta: "+412 vs prev 30d",   deltaDirection: "up" },
];

const openRateSeries = [
  42.1, 43.5, 41.8, 44.2, 45.0, 43.7, 42.9, 45.6, 46.1, 44.4,
  43.2, 45.8, 47.0, 46.3, 44.9, 43.5, 45.1, 46.7, 45.3, 44.8,
  46.0, 45.5, 44.7, 45.9, 46.8, 45.4, 44.2, 45.0, 46.5, 47.2,
];
const clickRateSeries = [
  7.2, 7.5, 7.0, 7.8, 8.1, 7.6, 7.4, 8.3, 8.5, 8.0,
  7.3, 8.1, 8.7, 8.4, 7.9, 7.5, 7.8, 8.2, 8.0, 7.9,
  8.1, 8.0, 7.6, 7.9, 8.3, 8.0, 7.7, 7.9, 8.2, 8.4,
];

const reports = [
  { id: "c_01", name: "Spring Sale 2026 — Early Access", sent: "May 18, 2026", recipients: 12612, openRate: "46.4%", clickRate: "8.9%",  bounceRate: "1.8%", unsubRate: "0.14%" },
  { id: "c_04", name: "April Refresh",                   sent: "Apr 22, 2026", recipients: 12504, openRate: "41.2%", clickRate: "7.6%",  bounceRate: "2.1%", unsubRate: "0.18%" },
  { id: "c_05", name: "Member-only Drop",                sent: "Mar 30, 2026", recipients: 8123,  openRate: "52.1%", clickRate: "11.4%", bounceRate: "1.4%", unsubRate: "0.09%" },
  { id: "c_06", name: "Loyalty Program Update",          sent: "Mar 15, 2026", recipients: 401,   openRate: "38.7%", clickRate: "5.2%",  bounceRate: "0.7%", unsubRate: "0.25%" },
  { id: "c_07", name: "February Newsletter",             sent: "Feb 14, 2026", recipients: 12388, openRate: "44.3%", clickRate: "8.1%",  bounceRate: "1.9%", unsubRate: "0.16%" },
  { id: "c_09", name: "New Year Sale",                   sent: "Jan 3, 2026",  recipients: 12211, openRate: "49.6%", clickRate: "10.2%", bounceRate: "2.0%", unsubRate: "0.21%" },
  { id: "c_10", name: "Holiday Gift Guide",              sent: "Dec 12, 2025", recipients: 8009,  openRate: "47.8%", clickRate: "9.4%",  bounceRate: "1.6%", unsubRate: "0.12%" },
];

// Truncate long campaign names so the row doesn't blow up on small screens.
function truncate(s, max = 36) {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Open-rate color tinting policy:
//   >= 50% -> "good" green tint
//   40–50% -> neutral
//   < 40%  -> warn tint
function openRateTone(rate) {
  const n = parseFloat(rate);
  if (Number.isNaN(n)) return "neutral";
  if (n >= 50) return "good";
  if (n < 40) return "warn";
  return "neutral";
}

function formatRecipients(n) {
  return n.toLocaleString("en-US");
}

function onExport() {
  // Stub — CSV export route doesn't exist yet.
}
</script>

<template>
  <div class="reports">
    <!-- 1. Header -->
    <header class="rep-header">
      <div class="rep-header-text">
        <h1>Reports</h1>
        <p class="rep-lede">Campaign performance, audience health, and deliverability at a glance.</p>
      </div>
      <button type="button" class="rep-export" @click="onExport">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M7 1.8 V8.8 M3.6 5.4 L7 8.8 L10.4 5.4 M2.2 11.2 H11.8"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
        <span>Export CSV</span>
      </button>
    </header>

    <!-- 2. Time-range chip row -->
    <div class="rep-chips" role="tablist" aria-label="Time range">
      <button
        v-for="r in timeRanges"
        :key="r.id"
        type="button"
        role="tab"
        :aria-selected="activeRange === r.id"
        class="rep-chip"
        :class="{ 'is-active': activeRange === r.id }"
        @click="activeRange = r.id"
      >{{ r.label }}</button>
    </div>

    <!-- 3. KPI strip -->
    <section class="rep-kpis" aria-label="Key performance indicators">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- 4. Performance trend -->
    <AppPerformanceTrendChart
      :open-rate-series="openRateSeries"
      :click-rate-series="clickRateSeries"
    />

    <!-- 5. Recent campaign reports table -->
    <section class="rep-section">
      <div class="rep-eyebrow">
        <span class="rep-eyebrow-dot" aria-hidden="true"></span>
        <span>Recent campaign reports</span>
      </div>

      <div class="rep-card">
        <div class="rcr">
          <div class="rcr-row rcr-head" role="row">
            <div class="rcr-cell rcr-cell-name">Campaign</div>
            <div class="rcr-cell rcr-cell-sent">Sent date</div>
            <div class="rcr-cell rcr-cell-num">Recipients</div>
            <div class="rcr-cell rcr-cell-num">Open rate</div>
            <div class="rcr-cell rcr-cell-num">Click rate</div>
            <div class="rcr-cell rcr-cell-num">Bounce rate</div>
            <div class="rcr-cell rcr-cell-num">Unsub rate</div>
          </div>

          <NuxtLink
            v-for="r in reports"
            :key="r.id"
            :to="`/app/campaigns/${r.id}`"
            class="rcr-row rcr-body"
            role="row"
          >
            <div class="rcr-cell rcr-cell-name" :title="r.name">{{ truncate(r.name) }}</div>
            <div class="rcr-cell rcr-cell-sent tabular">{{ r.sent }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ formatRecipients(r.recipients) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">
              <span class="rcr-rate" :class="`is-${openRateTone(r.openRate)}`">{{ r.openRate }}</span>
            </div>
            <div class="rcr-cell rcr-cell-num tabular">{{ r.clickRate }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ r.bounceRate }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ r.unsubRate }}</div>
          </NuxtLink>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* 1. Header */
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

/* Ghost-style export button */
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
  transition: background-color var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.rep-export:hover {
  background: var(--btn-ghost-hover-bg);
  border-color: var(--color-rule-strong);
}
.rep-export:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* 2. Time-range chip row */
.rep-chips {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  background: var(--color-surface-sunk);
  border-radius: var(--radius-pill);
  align-self: flex-start;
}
.rep-chip {
  appearance: none;
  background: transparent;
  border: none;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.rep-chip:hover:not(.is-active) {
  color: var(--color-ink);
}
.rep-chip.is-active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
}
.rep-chip:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* 3. KPI strip */
.rep-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .rep-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .rep-kpis { grid-template-columns: 1fr; }
}

/* 5. Section + card wrappers (mirrors the dashboard pattern) */
.rep-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-eyebrow {
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
.rep-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.rep-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

/* Recent campaign reports table */
.rcr {
  display: flex;
  flex-direction: column;
}
.rcr-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.7fr)
    minmax(110px, 0.8fr)
    minmax(90px, 0.7fr)
    minmax(90px, 0.7fr)
    minmax(90px, 0.7fr)
    minmax(100px, 0.7fr)
    minmax(90px, 0.7fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  text-decoration: none;
  color: var(--color-ink);
}
.rcr-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.rcr-head .rcr-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.rcr-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
  cursor: pointer;
}
.rcr-body:last-child { border-bottom: none; }
.rcr-body:hover { background: var(--color-surface-2); }

.rcr-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.rcr-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.rcr-cell-sent {
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
}
.rcr-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
.rcr-head .rcr-cell-num {
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}

/* Inline tinted rate pill — open rate uses this for tone-coding. */
.rcr-rate {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.rcr-rate.is-good {
  color: var(--color-ok);
  background: var(--color-ok-bg);
}
.rcr-rate.is-warn {
  color: var(--color-warn);
  background: var(--color-warn-bg);
}
.rcr-rate.is-neutral {
  color: var(--color-ink);
  background: transparent;
}

/* Horizontal scroll fallback below ~960px — preserves all 7 columns
   without forcing each cell into an unreadable squish. */
@media (max-width: 960px) {
  .rep-card { overflow-x: auto; }
  .rcr { min-width: 760px; }
}
</style>
