<script setup>
import { computed } from "vue";

// Horizontal funnel widget showing aggregate campaign performance for the
// last 30 days. Five stages, left → right. Bar heights are proportional to
// the count, with a floor so the smallest stages remain legible.
const props = defineProps({
  stages: {
    type: Array,
    required: true,
    // Each stage: { name: string, count: number, pct: string }
  },
});

// Minimum visual height (in %) so a stage like "Converted" at 2% of Sent
// doesn't collapse to a sliver. The bar chart area is 200px tall; 15% floor
// gives ~30px minimum height.
const MIN_BAR_HEIGHT_PCT = 15;

const maxCount = computed(() =>
  props.stages.reduce((m, s) => (s.count > m ? s.count : m), 0)
);

// Exposed for `v-bind()` in scoped CSS to drive the grid column count.
const stageCount = computed(() => props.stages.length);

function barHeight(count) {
  if (!maxCount.value) return MIN_BAR_HEIGHT_PCT;
  const raw = (count / maxCount.value) * 100;
  return Math.max(raw, MIN_BAR_HEIGHT_PCT);
}

// Opacity ramp — first stage is full opacity, last stage is 50%.
function barOpacity(idx) {
  const total = props.stages.length;
  if (total <= 1) return 1;
  const step = (1 - 0.5) / (total - 1);
  return 1 - step * idx;
}

// Format an integer with thousands separators for the in-bar count label.
function fmt(n) {
  return n.toLocaleString("en-US");
}

// Step-to-step conversion rate. E.g. between Sent (12,847) and Delivered
// (12,612), shows "98.2%". One value per gap; length = stages.length - 1.
const stepRates = computed(() =>
  props.stages.slice(1).map((stage, i) => {
    const prev = props.stages[i].count;
    if (!prev) return "—";
    const pct = (stage.count / prev) * 100;
    return `${pct.toFixed(1)}%`;
  })
);
</script>

<template>
  <div class="funnel">
    <div class="funnel-chart">
      <div
        v-for="(stage, idx) in stages"
        :key="stage.name"
        class="funnel-col"
      >
        <div class="funnel-stage-name">{{ stage.name }}</div>
        <div class="funnel-bar-track">
          <div
            class="funnel-bar"
            :style="{ height: barHeight(stage.count) + '%', opacity: barOpacity(idx) }"
          >
            <span class="funnel-bar-count">{{ fmt(stage.count) }}</span>
          </div>
        </div>
        <div class="funnel-pct">{{ stage.pct }} of Sent</div>
      </div>
    </div>

    <div class="funnel-steps" aria-label="Step-to-step conversion rate">
      <div
        v-for="(rate, i) in stepRates"
        :key="i"
        class="funnel-step"
        :style="{ left: `${((i + 1) / stages.length) * 100}%` }"
      >
        <svg
          class="funnel-step-arrow"
          width="14"
          height="10"
          viewBox="0 0 14 10"
          aria-hidden="true"
        >
          <path
            d="M0 5 H10 M7 1.5 L10.5 5 L7 8.5"
            stroke="currentColor"
            stroke-width="1.4"
            fill="none"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="funnel-step-rate">{{ rate }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.funnel {
  position: relative;
  padding: var(--space-5) var(--space-5) var(--space-6);
}
.funnel-chart {
  display: grid;
  grid-template-columns: repeat(v-bind(stageCount), 1fr);
  gap: var(--space-4);
  align-items: end;
}
.funnel-col {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
  min-width: 0;
}
.funnel-stage-name {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.funnel-bar-track {
  width: 100%;
  height: 200px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.funnel-bar {
  width: 100%;
  max-width: 120px;
  background: var(--color-pop);
  border-radius: var(--radius-sm);
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: var(--space-2);
  transition: transform var(--dur-base) var(--ease-out);
}
.funnel-bar:hover {
  transform: translateY(-2px);
}
.funnel-bar-count {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  color: var(--color-ink-on-pop);
  white-space: nowrap;
}
.funnel-pct {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--color-ink-soft);
  font-variant-numeric: tabular-nums;
}

.funnel-steps {
  position: relative;
  height: var(--space-5);
  margin-top: var(--space-4);
  border-top: 1px dashed var(--color-rule);
  padding-top: var(--space-3);
}
.funnel-step {
  position: absolute;
  top: var(--space-3);
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  color: var(--color-ink-dim);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.funnel-step-arrow {
  color: var(--color-ink-dim);
}
.funnel-step-rate {
  letter-spacing: var(--tracking-normal);
}
</style>
