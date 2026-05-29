<script setup>
import { computed } from "vue";

// Reports engagement-breakdown widget. Shows the engagement funnel
// Delivered → Opened → Clicked as proportional horizontal bars (count + % of
// delivered), plus a secondary row for Bounced / Unsubscribed (count + % of
// delivered). Lives in the narrower column beside the trend chart.
//
// `data` is an EngagementFunnel = { delivered, opened, clicked, bounced,
// unsubscribed } of raw counts. `demo` flips on a "Sample" pill.
const props = defineProps({
  data: { type: Object, default: () => ({}) },
  demo: { type: Boolean, default: false },
});

// Coerce a possibly-missing field to a non-negative integer.
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const delivered = computed(() => num(props.data.delivered));
const opened = computed(() => num(props.data.opened));
const clicked = computed(() => num(props.data.clicked));
const bounced = computed(() => num(props.data.bounced));
const unsubscribed = computed(() => num(props.data.unsubscribed));

// "All zeros" → fresh org with no engagement yet. We treat the whole widget as
// empty when nothing has been delivered AND nothing bounced/unsubbed.
const isEmpty = computed(
  () =>
    delivered.value === 0 &&
    opened.value === 0 &&
    clicked.value === 0 &&
    bounced.value === 0 &&
    unsubscribed.value === 0
);

// Percentage of delivered, guarded against divide-by-zero. Returns a Number.
function pctOf(count, base) {
  if (!base) return 0;
  return (count / base) * 100;
}

// One decimal place, but drop a trailing ".0" so "100%" reads cleanly.
function fmtPct(p) {
  const r = Math.round(p * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + "%";
}

function fmtCount(n) {
  return n.toLocaleString("en-US");
}

// The three primary funnel stages. Bar width is the stage count as a fraction
// of `delivered` (the funnel's top). Opacity ramps down stage-to-stage so the
// funnel reads as a narrowing sequence even where two stages are close.
const funnel = computed(() => {
  const base = delivered.value;
  return [
    { key: "delivered", label: "Delivered", count: delivered.value },
    { key: "opened", label: "Opened", count: opened.value },
    { key: "clicked", label: "Clicked", count: clicked.value },
  ].map((s, i, arr) => {
    const pct = pctOf(s.count, base);
    return {
      ...s,
      pct,
      pctLabel: fmtPct(pct),
      // width relative to delivered; min sliver so a tiny non-zero stage shows.
      width: base ? Math.max((s.count / base) * 100, s.count > 0 ? 4 : 0) : 0,
      opacity: 1 - (0.4 / Math.max(arr.length - 1, 1)) * i,
    };
  });
});

// Secondary, lower-signal events — shown as compact stat chips, not bars.
const secondary = computed(() => {
  const base = delivered.value;
  return [
    {
      key: "bounced",
      label: "Bounced",
      count: bounced.value,
      pctLabel: fmtPct(pctOf(bounced.value, base)),
    },
    {
      key: "unsubscribed",
      label: "Unsubscribed",
      count: unsubscribed.value,
      pctLabel: fmtPct(pctOf(unsubscribed.value, base)),
    },
  ];
});
</script>

<template>
  <section class="re" aria-label="Engagement breakdown">
    <header class="re-head">
      <SectionEyebrow>
        Engagement
        <template v-if="demo" #trailing>
          <Pill tone="brand">Sample</Pill>
        </template>
      </SectionEyebrow>
    </header>

    <Card padding="md">
      <div class="re-body">
      <!-- Empty state: fresh org, nothing sent/engaged yet -->
      <EmptyState
        v-if="isEmpty"
        title="No engagement yet"
        subtitle="Opens and clicks will appear here once your first campaign goes out."
      >
        <template #icon>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M3 13h4l2 5 4-12 2 7h6"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </template>
      </EmptyState>

      <template v-else>
        <!-- Funnel: Delivered → Opened → Clicked -->
        <ul class="re-funnel">
          <li v-for="stage in funnel" :key="stage.key" class="re-stage">
            <div class="re-stage-top">
              <span class="re-stage-label">{{ stage.label }}</span>
              <span class="re-stage-pct">{{ stage.pctLabel }}</span>
            </div>
            <div class="re-bar-track">
              <div
                class="re-bar"
                :style="{ width: stage.width + '%', opacity: stage.opacity }"
              ></div>
            </div>
            <div class="re-stage-count">{{ fmtCount(stage.count) }}</div>
          </li>
        </ul>

        <!-- Secondary: Bounced / Unsubscribed -->
        <div class="re-secondary" aria-label="Bounced and unsubscribed">
          <div
            v-for="item in secondary"
            :key="item.key"
            class="re-sec-item"
          >
            <span class="re-sec-label">{{ item.label }}</span>
            <span class="re-sec-count">{{ fmtCount(item.count) }}</span>
            <span class="re-sec-pct">{{ item.pctLabel }}</span>
          </div>
        </div>
      </template>
      </div>
    </Card>
  </section>
</template>

<style scoped>
.re {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.re-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.re-body {
  min-height: 180px;
  display: flex;
  flex-direction: column;
}

/* Funnel */
.re-funnel {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.re-stage {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    "top   top"
    "track count";
  align-items: center;
  column-gap: var(--space-3);
  row-gap: var(--space-1-5);
  min-width: 0;
}
.re-stage-top {
  grid-area: top;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
}
.re-stage-label {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.re-stage-pct {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-pop-deep);
}
.re-bar-track {
  grid-area: track;
  height: 10px;
  background: var(--color-surface-sunk);
  border-radius: var(--radius-pill);
  overflow: hidden;
  min-width: 0;
}
.re-bar {
  height: 100%;
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  min-width: 2px;
  transition: width var(--dur-slow) var(--ease-out);
}
.re-stage-count {
  grid-area: count;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-soft);
  white-space: nowrap;
}

/* Secondary row */
.re-secondary {
  margin-top: var(--space-5);
  padding-top: var(--space-4);
  border-top: 1px dashed var(--color-rule);
  display: flex;
  gap: var(--space-5);
}
.re-sec-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.re-sec-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 500;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.re-sec-count {
  font-family: var(--font-mono);
  font-size: var(--text-lg);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
  line-height: 1.1;
}
.re-sec-pct {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-soft);
}

/* Empty state fills the body's min-height and centers via <EmptyState>. */
.re-body > .empty {
  flex: 1 1 auto;
  padding: var(--space-4) var(--space-3);
}
</style>
