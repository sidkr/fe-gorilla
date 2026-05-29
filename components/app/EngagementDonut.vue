<script setup>
import { computed } from "vue";

// Audience engagement donut. Inline SVG, 3 slices via stroke-dasharray on a
// stroked circle. Hole is ~40% of the outer radius (so stroke width ~30% of
// the diameter). Mock data — when the Parse engagement-rollup lands, swap.
const props = defineProps({
  slices: {
    type: Array,
    required: true,
    // [{ label, count, pct, kind: 'pop' | 'soft' | 'new' }]
  },
  total: { type: String, default: "12,847" },
});

// Geometry. SVG viewBox is 120x120; donut centered. Outer radius 50, stroke
// width 20 → inner radius ≈ 40 → ~80% of outer (donut hole is ~32px wide,
// reading as "ring" not "wheel"). Circumference = 2π * 50.
const RADIUS = 50;
const CX = 60;
const CY = 60;
const CIRC = 2 * Math.PI * RADIUS;

// Build dasharray segments. SVG stroke-dasharray on a circle starts at 3 o'clock
// and goes clockwise — we rotate the <circle> -90° so the first slice starts
// at 12 o'clock (north), matching donut conventions.
const segments = computed(() => {
  let offset = 0;
  return props.slices.map((s) => {
    const len = (s.pct / 100) * CIRC;
    const seg = {
      ...s,
      dashArray: `${len.toFixed(2)} ${(CIRC - len).toFixed(2)}`,
      dashOffset: -offset,
    };
    offset += len;
    return seg;
  });
});

function strokeFor(kind) {
  if (kind === "pop") return "var(--color-pop)";
  if (kind === "soft") return "var(--color-ink-soft)";
  if (kind === "new") return "var(--color-pop-bg)";
  return "var(--color-ink-soft)";
}
</script>

<template>
  <div class="ed">
    <SectionEyebrow>Audience engagement</SectionEyebrow>

    <Card padding="md">
      <div class="ed-body">
      <div class="ed-donut-wrap">
        <svg
          class="ed-svg"
          viewBox="0 0 120 120"
          role="img"
          aria-label="Audience engagement breakdown"
        >
          <!-- track (faint background ring; lets the 'new' tinted slice read clearly) -->
          <circle
            :cx="CX"
            :cy="CY"
            :r="RADIUS"
            fill="none"
            stroke="var(--color-surface-sunk)"
            stroke-width="20"
          />

          <g :transform="`rotate(-90 ${CX} ${CY})`">
            <template v-for="(seg, i) in segments" :key="i">
              <!-- Filled (or tinted) slice -->
              <circle
                :cx="CX"
                :cy="CY"
                :r="RADIUS"
                fill="none"
                :stroke="strokeFor(seg.kind)"
                stroke-width="20"
                :stroke-dasharray="seg.dashArray"
                :stroke-dashoffset="seg.dashOffset"
                stroke-linecap="butt"
              />
              <!-- 'new' slice gets an additional outline so the tint reads as deliberate -->
              <circle
                v-if="seg.kind === 'new'"
                :cx="CX"
                :cy="CY"
                :r="RADIUS"
                fill="none"
                stroke="var(--color-pop)"
                stroke-width="1.5"
                :stroke-dasharray="seg.dashArray"
                :stroke-dashoffset="seg.dashOffset"
                stroke-linecap="butt"
                vector-effect="non-scaling-stroke"
              />
            </template>
          </g>

          <!-- Center text -->
          <text
            :x="CX"
            :y="CY - 2"
            text-anchor="middle"
            class="ed-center-total"
          >{{ total }}</text>
          <text
            :x="CX"
            :y="CY + 12"
            text-anchor="middle"
            class="ed-center-label"
          >TOTAL</text>
        </svg>
      </div>

      <ul class="ed-legend">
        <li v-for="seg in slices" :key="seg.label" class="ed-legend-row">
          <span
            class="ed-legend-dot"
            :class="`is-${seg.kind}`"
            aria-hidden="true"
          ></span>
          <span class="ed-legend-label">{{ seg.label }}</span>
          <span class="ed-legend-count">{{ seg.countLabel }}</span>
          <span class="ed-legend-pct">({{ seg.pct }}%)</span>
        </li>
      </ul>
      </div>
    </Card>
  </div>
</template>

<style scoped>
.ed {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-width: 0;
}
.ed-body {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  min-height: 180px;
}
.ed-donut-wrap {
  flex: none;
  width: 140px;
  height: 140px;
}
.ed-svg {
  width: 100%;
  height: 100%;
  display: block;
}
.ed-center-total {
  font-family: var(--font-mono);
  font-size: 13px;       /* SVG coordinate-space units */
  font-weight: 600;
  fill: var(--color-ink);
  font-variant-numeric: tabular-nums;
}
.ed-center-label {
  font-family: var(--font-body);
  font-size: 8px;        /* SVG coordinate-space units */
  font-weight: 600;
  fill: var(--color-ink-dim);
  letter-spacing: 1.4px;
}
.ed-legend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  flex: 1 1 auto;
  min-width: 0;
}
.ed-legend-row {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: baseline;
  column-gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  min-width: 0;
}
.ed-legend-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
  align-self: center;
}
.ed-legend-dot.is-pop {
  background: var(--color-pop);
}
.ed-legend-dot.is-soft {
  background: var(--color-ink-soft);
}
.ed-legend-dot.is-new {
  background: var(--color-pop-bg);
  border: 1.5px solid var(--color-pop);
}
.ed-legend-label {
  color: var(--color-ink);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ed-legend-count {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--color-ink);
  font-size: var(--text-sm);
}
.ed-legend-pct {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-dim);
  font-size: var(--text-xs);
}

@media (max-width: 480px) {
  .ed-body {
    flex-direction: column;
    align-items: stretch;
  }
  .ed-donut-wrap {
    align-self: center;
  }
}
</style>
