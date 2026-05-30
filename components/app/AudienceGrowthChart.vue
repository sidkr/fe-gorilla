<script setup>
import { computed } from "vue";

// Full-width audience growth chart. Inline SVG area+line, ~140px tall.
// Mock data — the Parse send pipeline isn't live yet. When subscriber
// events land, this will read from a daily-rollup Cloud Function.
const props = defineProps({
  // 30 daily subscriber counts, oldest → newest
  points: {
    type: Array,
    required: true,
  },
  total: { type: String, default: "12,847" },
  deltaAbs: { type: String, default: "+342" },
  deltaPct: { type: String, default: "+2.7%" },
});

// SVG internal coordinate system. The container CSS scales it responsively.
const VB_W = 900;
const VB_H = 140;
const PAD_X = 8;          // left/right inset so the line doesn't kiss the edges
const PAD_TOP = 16;       // headroom so the end-of-line pill doesn't clip
const PAD_BOTTOM = 18;    // room for axis labels

const range = computed(() => {
  const min = Math.min(...props.points);
  const max = Math.max(...props.points);
  // Pad the range a bit so the line never sits flush against top/bottom.
  const span = Math.max(max - min, 1);
  return { min: min - span * 0.15, max: max + span * 0.05 };
});

// Map a data index → svg X coordinate.
function x(i) {
  const n = props.points.length;
  if (n <= 1) return PAD_X;
  return PAD_X + ((VB_W - PAD_X * 2) * i) / (n - 1);
}

// Map a data value → svg Y coordinate (inverted because SVG Y grows down).
function y(v) {
  const { min, max } = range.value;
  const t = (v - min) / (max - min);
  return PAD_TOP + (VB_H - PAD_TOP - PAD_BOTTOM) * (1 - t);
}

// Line path — straight segments between points. Subtle, honest, no smoothing.
const linePath = computed(() => {
  return props.points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
});

// Area fill path — same line, closed to the baseline.
const areaPath = computed(() => {
  const base = VB_H - PAD_BOTTOM;
  const top = props.points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" ");
  const lastX = x(props.points.length - 1).toFixed(2);
  const firstX = x(0).toFixed(2);
  return `${top} L ${lastX} ${base} L ${firstX} ${base} Z`;
});

// Last-point coordinates, used to anchor the +342 annotation pill.
const lastX = computed(() => x(props.points.length - 1));
const lastY = computed(() => y(props.points[props.points.length - 1]));

// Tick labels every 5 days. Position in SVG units so they ride the same
// viewBox; we render them as <text> for full SVG-native scaling.
const ticks = computed(() => {
  const n = props.points.length;
  const labels = ["D-30", "D-25", "D-20", "D-15", "D-10", "D-5", "Today"];
  const idxs = [0, 5, 10, 15, 20, 25, n - 1];
  return idxs.map((i, k) => ({ x: x(i), label: labels[k] }));
});
</script>

<template>
  <div class="agc">
    <SectionEyebrow>Audience growth &middot; last 30 days</SectionEyebrow>

    <Card padding="md" class="agc-card">
      <div class="agc-head">
        <div class="agc-number">{{ total }}</div>
        <Pill tone="success" class="agc-delta">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M5 1.5 L9 6 H6.2 V8.5 H3.8 V6 H1 Z" fill="currentColor" />
          </svg>
          <span>{{ deltaAbs }} &middot; {{ deltaPct }}</span>
        </Pill>
      </div>

      <div class="agc-chart-wrap">
        <svg
          class="agc-svg"
          :viewBox="`0 0 ${VB_W} ${VB_H}`"
          preserveAspectRatio="none"
          role="img"
          aria-label="Subscriber count over the last 30 days, trending upward"
        >
          <defs>
            <linearGradient id="agcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--color-pop)" stop-opacity="0.18" />
              <stop offset="100%" stop-color="var(--color-pop)" stop-opacity="0" />
            </linearGradient>
          </defs>

          <path :d="areaPath" fill="url(#agcFill)" />
          <path
            :d="linePath"
            fill="none"
            stroke="var(--color-pop)"
            stroke-width="1.5"
            stroke-linejoin="round"
            stroke-linecap="round"
            vector-effect="non-scaling-stroke"
          />

          <!-- last-point dot -->
          <circle
            :cx="lastX"
            :cy="lastY"
            r="3.5"
            fill="var(--color-pop)"
            stroke="var(--color-surface)"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />

          <!-- end-of-line annotation pill: +342 -->
          <g :transform="`translate(${lastX - 44}, ${lastY - 28})`">
            <rect
              x="0"
              y="0"
              width="40"
              height="18"
              rx="9"
              ry="9"
              fill="var(--color-ok-bg)"
            />
            <text
              x="20"
              y="12.5"
              text-anchor="middle"
              class="agc-pill-text"
            >{{ deltaAbs }}</text>
          </g>

          <!-- x-axis labels -->
          <g class="agc-ticks">
            <text
              v-for="t in ticks"
              :key="t.label"
              :x="t.x"
              :y="VB_H - 4"
              text-anchor="middle"
              class="agc-tick-text"
            >{{ t.label }}</text>
          </g>
        </svg>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.agc {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.agc-card :deep(.card__body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.agc-head {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.agc-number {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 700;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}
.agc-delta {
  font-variant-numeric: tabular-nums;
}
.agc-chart-wrap {
  width: 100%;
  /* The viewBox is non-uniform; we let it stretch to fill width and lock height. */
  height: 140px;
}
.agc-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.agc-pill-text {
  font-family: var(--font-mono);
  font-size: 11px;       /* coordinate-space units; not a CSS-design value */
  font-weight: 600;
  fill: var(--color-ok);
  font-variant-numeric: tabular-nums;
}
.agc-tick-text {
  font-family: var(--font-mono);
  font-size: 10px;       /* coordinate-space units */
  fill: var(--color-ink-dim);
}
</style>
