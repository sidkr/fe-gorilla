<script setup>
import { computed } from "vue";

// Reports trend widget — opens vs clicks over time, two-series area+line.
// Inline SVG (no chart lib), matched to PerformanceTrendChart / AudienceGrowthChart.
// `data` is TrendPoint[] = { label, opens, clicks }. In real mode it may be [].
// `demo` flips a small "Sample" pill so sample data reads as illustrative.
const props = defineProps({
  data: { type: Array, default: () => [] },
  demo: { type: Boolean, default: false },
});

// SVG internal coordinate system. The wrapper CSS scales it responsively.
const VB_W = 900;
const VB_H = 200;
const PAD_X = 8; // left/right inset so the lines don't kiss the edges
const PAD_TOP = 16; // headroom
const PAD_BOTTOM = 22; // room for x-axis labels

const hasData = computed(() => props.data.length > 0);

// Shared y-range across both series, padded so lines never glue to the edges.
// Floor at 0 — opens/clicks are counts.
const range = computed(() => {
  const all = props.data.flatMap((p) => [p.opens, p.clicks]);
  const max = all.length ? Math.max(...all) : 1;
  return { min: 0, max: max + Math.max(max * 0.08, 1) };
});

function x(i) {
  const n = props.data.length;
  if (n <= 1) return PAD_X;
  return PAD_X + ((VB_W - PAD_X * 2) * i) / (n - 1);
}

function y(v) {
  const { min, max } = range.value;
  const t = (v - min) / (max - min || 1);
  return PAD_TOP + (VB_H - PAD_TOP - PAD_BOTTOM) * (1 - t);
}

function linePath(key) {
  return props.data
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(2)} ${y(p[key]).toFixed(2)}`)
    .join(" ");
}

function areaPath(key) {
  const base = VB_H - PAD_BOTTOM;
  const top = linePath(key);
  const lastX = x(props.data.length - 1).toFixed(2);
  const firstX = x(0).toFixed(2);
  return `${top} L ${lastX} ${base} L ${firstX} ${base} Z`;
}

const opensLine = computed(() => linePath("opens"));
const clicksLine = computed(() => linePath("clicks"));
const opensArea = computed(() => areaPath("opens"));

// Up to ~6 evenly-spaced x-axis labels, anchored to data indices.
const ticks = computed(() => {
  const n = props.data.length;
  if (!n) return [];
  const want = Math.min(6, n);
  const out = [];
  for (let k = 0; k < want; k++) {
    const i = want === 1 ? 0 : Math.round((k * (n - 1)) / (want - 1));
    out.push({ x: x(i), label: props.data[i].label });
  }
  return out;
});
</script>

<template>
  <div class="rt">
    <div class="rt-eyebrow">
      <span class="rt-eyebrow-dot" aria-hidden="true"></span>
      <span>Engagement over time</span>
      <span v-if="demo" class="rt-sample">Sample</span>
    </div>

    <div class="rt-card">
      <template v-if="hasData">
        <div class="rt-head">
          <div class="rt-legend">
            <span class="rt-legend-item">
              <span class="rt-dot rt-dot-opens" aria-hidden="true"></span>
              <span>Opens</span>
            </span>
            <span class="rt-legend-item">
              <span class="rt-dot rt-dot-clicks" aria-hidden="true"></span>
              <span>Clicks</span>
            </span>
          </div>
        </div>

        <div class="rt-chart-wrap">
          <svg
            class="rt-svg"
            :viewBox="`0 0 ${VB_W} ${VB_H}`"
            preserveAspectRatio="none"
            role="img"
            aria-label="Opens and clicks over time"
          >
            <defs>
              <linearGradient id="rtOpensFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-pop)" stop-opacity="0.18" />
                <stop offset="100%" stop-color="var(--color-pop)" stop-opacity="0" />
              </linearGradient>
            </defs>

            <!-- opens area fill (primary / coral) -->
            <path :d="opensArea" fill="url(#rtOpensFill)" />

            <!-- clicks line (secondary, deeper accent) -->
            <path
              :d="clicksLine"
              fill="none"
              stroke="var(--color-pop-deep)"
              stroke-width="1.5"
              stroke-linejoin="round"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />

            <!-- opens line (primary / coral) -->
            <path
              :d="opensLine"
              fill="none"
              stroke="var(--color-pop)"
              stroke-width="1.75"
              stroke-linejoin="round"
              stroke-linecap="round"
              vector-effect="non-scaling-stroke"
            />

            <!-- x-axis labels -->
            <g class="rt-ticks">
              <text
                v-for="t in ticks"
                :key="t.label"
                :x="t.x"
                :y="VB_H - 6"
                text-anchor="middle"
                class="rt-tick-text"
              >{{ t.label }}</text>
            </g>
          </svg>
        </div>
      </template>

      <div v-else class="rt-empty">
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" class="rt-empty-icon">
          <path
            d="M5 30 L15 20 L23 26 L35 12"
            fill="none"
            stroke="var(--color-pop)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="35" cy="12" r="2.5" fill="var(--color-pop)" />
        </svg>
        <p class="rt-empty-text">
          Your opens &amp; clicks will chart here as events roll in after your first send.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: 100%;
}
.rt-eyebrow {
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
.rt-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.rt-sample {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
.rt-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.rt-head {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}
.rt-legend {
  display: inline-flex;
  align-items: center;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.rt-legend-item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  letter-spacing: var(--tracking-wide);
}
.rt-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
}
.rt-dot-opens {
  background: var(--color-pop);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.rt-dot-clicks {
  background: var(--color-pop-deep);
}
.rt-chart-wrap {
  width: 100%;
  height: 180px;
}
.rt-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.rt-tick-text {
  font-family: var(--font-mono);
  font-size: 10px; /* coordinate-space units */
  fill: var(--color-ink-dim);
}
.rt-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-3);
  min-height: 160px;
  padding: var(--space-5) var(--space-4);
}
.rt-empty-icon {
  opacity: 0.7;
}
.rt-empty-text {
  margin: 0;
  max-width: 32ch;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-dim);
}
</style>
