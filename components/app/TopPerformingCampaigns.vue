<script setup>
import { computed } from "vue";

// Ranked list of campaigns by open rate. Bar widths are proportional to the
// highest open rate in the list (so the leader always fills the track).
const props = defineProps({
  campaigns: {
    type: Array,
    required: true,
    // [{ rank, name, openRate (number, e.g. 52.1) }]
  },
});

const maxRate = computed(() =>
  props.campaigns.reduce((m, c) => (c.openRate > m ? c.openRate : m), 0)
);

function barWidth(rate) {
  if (!maxRate.value) return 0;
  return (rate / maxRate.value) * 100;
}

// Opacity ramp so rank 1 is solid and rank N is muted.
function barOpacity(idx) {
  const total = props.campaigns.length;
  if (total <= 1) return 1;
  const step = (1 - 0.55) / (total - 1);
  return 1 - step * idx;
}

function rankLabel(rank) {
  return String(rank).padStart(2, "0");
}
</script>

<template>
  <div class="tpc">
    <div class="tpc-eyebrow">
      <span class="tpc-eyebrow-dot" aria-hidden="true"></span>
      <span>Top performing campaigns &middot; last 90 days</span>
    </div>

    <div class="tpc-card">
      <ol class="tpc-list">
        <li
          v-for="(c, i) in campaigns"
          :key="c.rank"
          class="tpc-row"
        >
          <span class="tpc-rank">{{ rankLabel(c.rank) }}</span>
          <div class="tpc-content">
            <div class="tpc-name">{{ c.name }}</div>
            <div class="tpc-bar-row">
              <div class="tpc-bar-track">
                <div
                  class="tpc-bar"
                  :style="{ width: `${barWidth(c.openRate)}%`, opacity: barOpacity(i) }"
                ></div>
              </div>
              <span class="tpc-pct">{{ c.openRate.toFixed(1) }}%</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.tpc {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.tpc-eyebrow {
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
.tpc-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.tpc-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-3) var(--space-5);
}
.tpc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.tpc-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--color-rule);
}
.tpc-row:last-child {
  border-bottom: none;
}
.tpc-rank {
  font-family: var(--font-mono);
  font-size: var(--text-2xl);
  font-weight: 500;
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  align-self: center;
}
.tpc-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.tpc-name {
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpc-bar-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.tpc-bar-track {
  flex: 1 1 auto;
  height: 8px;
  background: var(--color-surface-sunk);
  border-radius: var(--radius-pill);
  overflow: hidden;
  min-width: 0;
}
.tpc-bar {
  height: 100%;
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  transition: width var(--dur-slow) var(--ease-out);
}
.tpc-pct {
  flex: none;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
  min-width: 56px;
  text-align: right;
}
</style>
