<script setup>
// Reports KPI strip — the headline numbers for the Reports page. Renders a
// responsive 6-card grid from a `ReportsKpis` slice (see useReportsSample.ts):
// Emails sent, Delivered, Open rate, Click rate, Bounce rate, Unsubscribe rate.
//
// Each card reuses the dashboard <AppKpiCard> look (label / big value / pill).
// Counts are formatted with toLocaleString; rates render as one-decimal %.
// Rate cards carry a tasteful tone hint (good = green, watch = amber/red) and a
// supporting subtext line. Everything degrades gracefully to zeros when `data`
// is empty. `demo` flips a small "Sample" pill in the section header so users
// know the numbers are illustrative, not their own.
import { computed } from "vue";

const props = defineProps({
  data: { type: Object, default: () => ({}) },
  demo: { type: Boolean, default: false },
});

// ── Formatters ───────────────────────────────────────────────────────────────
function num(v) {
  return Number(v || 0).toLocaleString();
}
function pct(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`;
}

// Map a rate to a tone — "good" (green), "neutral", or "warn" (red). Thresholds
// are intentionally gentle; they nudge attention, they don't grade harshly.
function aboveTone(rate, good, ok) {
  const r = Number(rate || 0);
  if (r >= good) return "good";
  if (r >= ok) return "neutral";
  return "warn";
}
function belowTone(rate, warn) {
  // For rates where lower is better (bounce, unsub).
  return Number(rate || 0) >= warn ? "warn" : "good";
}

// ── Card model ───────────────────────────────────────────────────────────────
const cards = computed(() => {
  const d = props.data || {};
  return [
    {
      key: "sent",
      label: "Emails sent",
      value: num(d.sent),
      sub: "Total recipients",
      tone: "neutral",
    },
    {
      key: "delivered",
      label: "Delivered",
      value: num(d.delivered),
      sub: `${pct(d.deliveredRate)} delivery rate`,
      tone: aboveTone(d.deliveredRate, 0.97, 0.9),
    },
    {
      key: "openRate",
      label: "Open rate",
      value: pct(d.openRate),
      sub: `${num(d.opens)} opens`,
      tone: aboveTone(d.openRate, 0.3, 0.18),
    },
    {
      key: "clickRate",
      label: "Click rate",
      value: pct(d.clickRate),
      sub: `${num(d.clicks)} clicks`,
      tone: aboveTone(d.clickRate, 0.05, 0.02),
    },
    {
      key: "bounceRate",
      label: "Bounce rate",
      value: pct(d.bounceRate),
      sub: `${num(d.bounces)} bounced`,
      tone: belowTone(d.bounceRate, 0.04),
    },
    {
      key: "unsubRate",
      label: "Unsubscribe rate",
      value: pct(d.unsubRate),
      sub: `${num(d.unsubs)} unsubscribed`,
      tone: belowTone(d.unsubRate, 0.005),
    },
  ];
});
</script>

<template>
  <section class="rep-kpis" aria-label="Campaign KPI summary">
    <header class="rep-kpis-head">
      <h2 class="rep-kpis-title">Overview</h2>
      <span v-if="demo" class="rep-kpis-sample" title="Illustrative sample data">Sample</span>
    </header>

    <div class="rep-kpis-grid">
      <div v-for="c in cards" :key="c.key" class="rep-kpi">
        <div class="rep-kpi-label">{{ c.label }}</div>
        <div class="rep-kpi-value">{{ c.value }}</div>
        <div class="rep-kpi-sub" :class="`is-${c.tone}`">
          <span class="rep-kpi-dot" aria-hidden="true" />
          <span>{{ c.sub }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rep-kpis {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rep-kpis-head {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.rep-kpis-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.rep-kpis-sample {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-pop-deep);
  background: var(--color-pop-bg);
}

/* Auto-fit grid: 6 across on wide, gracefully collapsing to 3 / 2 / 1. */
.rep-kpis-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 1200px) {
  .rep-kpis-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .rep-kpis-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 440px) {
  .rep-kpis-grid { grid-template-columns: 1fr; }
}

.rep-kpi {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.rep-kpi:hover {
  border-color: var(--color-rule-strong);
}
.rep-kpi-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.rep-kpi-value {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 700;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}
.rep-kpi-sub {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-soft);
}
.rep-kpi-dot {
  flex: none;
  width: var(--space-2);
  height: var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-ink-dim);
}
.rep-kpi-sub.is-good .rep-kpi-dot { background: var(--color-ok); }
.rep-kpi-sub.is-warn .rep-kpi-dot { background: var(--color-danger); }
.rep-kpi-sub.is-neutral .rep-kpi-dot { background: var(--color-ink-dim); }
</style>
