<script setup>
// A single KPI card used on the dashboard. Label on top, big tabular value,
// and a small directional delta pill beneath it. Color of the pill is driven
// by `deltaDirection` — "up" (positive intent), "down" (negative), or "neutral".
defineProps({
  label: { type: String, required: true },
  value: { type: String, required: true },
  delta: { type: String, default: "" },
  deltaDirection: {
    type: String,
    default: "neutral",
    validator: (v) => ["up", "down", "neutral"].includes(v),
  },
});
</script>

<template>
  <div class="kpi">
    <div class="kpi-label">{{ label }}</div>
    <div class="kpi-value">{{ value }}</div>
    <div v-if="delta" class="kpi-delta" :class="`is-${deltaDirection}`">
      <svg
        v-if="deltaDirection === 'up'"
        class="kpi-delta-glyph"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path d="M5 1.5 L9 6 H6.2 V8.5 H3.8 V6 H1 Z" fill="currentColor" />
      </svg>
      <svg
        v-else-if="deltaDirection === 'down'"
        class="kpi-delta-glyph"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path d="M5 8.5 L1 4 H3.8 V1.5 H6.2 V4 H9 Z" fill="currentColor" />
      </svg>
      <svg
        v-else
        class="kpi-delta-glyph"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <rect x="1.5" y="4.2" width="7" height="1.6" rx="0.6" fill="currentColor" />
      </svg>
      <span>{{ delta }}</span>
    </div>
  </div>
</template>

<style scoped>
.kpi {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.kpi:hover {
  border-color: var(--color-rule-strong);
}
.kpi-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.kpi-value {
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 700;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}
.kpi-delta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  align-self: flex-start;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.kpi-delta.is-up {
  color: var(--color-ok);
  background: color-mix(in srgb, var(--color-ok) 10%, var(--color-surface));
}
.kpi-delta.is-down {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 10%, var(--color-surface));
}
.kpi-delta.is-neutral {
  color: var(--color-ink-soft);
  background: var(--color-surface-sunk);
}
.kpi-delta-glyph {
  flex: none;
}
</style>
