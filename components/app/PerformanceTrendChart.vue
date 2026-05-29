<script setup>
import { computed } from "vue";

// Two-line trend chart (open rate + click rate) over the last 30 days.
// Mock data — the Parse pipeline isn't live yet; when it is, this becomes
// a daily-rollup query against the Campaign/Event classes.
const props = defineProps({
  // 30 daily values, oldest -> newest, expressed in percent (e.g. 44.8 == 44.8%)
  openRateSeries: { type: Array, required: true },
  clickRateSeries: { type: Array, required: true },
});

// SVG internal coordinate system. The wrapper CSS scales it responsively.
const VB_W = 900;
const VB_H = 220;
const PAD_X = 36;        // room for left y-axis labels
const PAD_TOP = 16;
const PAD_BOTTOM = 26;   // room for x-axis labels

// Compute a shared y-range that comfortably contains both series. We pad
// the floor and ceiling so neither line glues itself to the chart edges.
const range = computed(() => {
  const all = [...props.openRateSeries, ...props.clickRateSeries];
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = Math.max(max - min, 1);
  return { min: Math.max(0, min - span * 0.12), max: max + span * 0.12 };
});

function x(i, n) {
  if (n <= 1) return PAD_X;
  return PAD_X + ((VB_W - PAD_X - 8) * i) / (n - 1);
}

function y(v) {
  const { min, max } = range.value;
  const t = (v - min) / (max - min);
  return PAD_TOP + (VB_H - PAD_TOP - PAD_BOTTOM) * (1 - t);
}

function makePath(series) {
  const n = series.length;
  return series
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i, n).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
}

const openPath = computed(() => makePath(props.openRateSeries));
const clickPath = computed(() => makePath(props.clickRateSeries));

// X-axis tick labels at D-30 / D-25 / ... / Today, anchored to data indices.
const ticks = computed(() => {
  const n = props.openRateSeries.length;
  const labels = ["D-30", "D-25", "D-20", "D-15", "D-10", "D-5", "Today"];
  const idxs = [0, 5, 10, 15, 20, 25, n - 1];
  return idxs.map((i, k) => ({ x: x(i, n), label: labels[k] }));
});

// Y-axis: three evenly-spaced ticks (min, mid, max), rounded for readability.
const yTicks = computed(() => {
  const { min, max } = range.value;
  const mid = (min + max) / 2;
  return [
    { v: max, label: `${max.toFixed(0)}%`, y: y(max) },
    { v: mid, label: `${mid.toFixed(0)}%`, y: y(mid) },
    { v: min, label: `${min.toFixed(0)}%`, y: y(min) },
  ];
});
</script>

<template>
  <div class="ptc">
    <div class="ptc-eyebrow">
      <span class="ptc-eyebrow-dot" aria-hidden="true"></span>
      <span>Performance trend &middot; last 30 days</span>
    </div>

    <div class="ptc-card">
      <div class="ptc-head">
        <div class="ptc-legend">
          <span class="ptc-legend-item">
            <span class="ptc-dot ptc-dot-open" aria-hidden="true"></span>
            <span>Open rate</span>
          </span>
          <span class="ptc-legend-item">
            <span class="ptc-dot ptc-dot-click" aria-hidden="true"></span>
            <span>Click rate</span>
          </span>
        </div>
      </div>

      <div class="ptc-chart-wrap">
        <svg
          class="ptc-svg"
          :viewBox="`0 0 ${VB_W} ${VB_H}`"
          preserveAspectRatio="none"
          role="img"
          aria-label="Open rate and click rate over the last 30 days"
        >
          <!-- y-axis gridlines + labels -->
          <g class="ptc-grid">
            <line
              v-for="t in yTicks"
              :key="`grid-${t.v}`"
              :x1="PAD_X"
              :x2="VB_W - 8"
              :y1="t.y"
              :y2="t.y"
              stroke="var(--color-rule)"
              stroke-width="1"
              stroke-dasharray="2 4"
              vector-effect="non-scaling-stroke"
            />
          </g>
          <g class="ptc-y-labels">
            <text
              v-for="t in yTicks"
              :key="`yl-${t.v}`"
              :x="PAD_X - 8"
              :y="t.y + 3"
              text-anchor="end"
              class="ptc-y-text"
            >{{ t.label }}</text>
          </g>

          <!-- click rate (deeper / lighter weight) -->
          <path
            :d="clickPath"
            fill="none"
            stroke="var(--color-pop-deep)"
            stroke-width="1.25"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />

          <!-- open rate (brand / prominent) -->
          <path
            :d="openPath"
            fill="none"
            stroke="var(--color-pop)"
            stroke-width="1.75"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />

          <!-- x-axis labels -->
          <g class="ptc-x-labels">
            <text
              v-for="t in ticks"
              :key="t.label"
              :x="t.x"
              :y="VB_H - 6"
              text-anchor="middle"
              class="ptc-tick-text"
            >{{ t.label }}</text>
          </g>
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ptc {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.ptc-eyebrow {
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
.ptc-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.ptc-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.ptc-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.ptc-legend {
  display: inline-flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.ptc-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  letter-spacing: var(--tracking-wide);
}
.ptc-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
}
.ptc-dot-open {
  background: var(--color-pop);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.ptc-dot-click {
  background: var(--color-pop-deep);
}
.ptc-chart-wrap {
  width: 100%;
  height: 180px;
}
.ptc-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.ptc-tick-text {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--color-ink-dim);
}
.ptc-y-text {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: var(--color-ink-dim);
}
</style>
