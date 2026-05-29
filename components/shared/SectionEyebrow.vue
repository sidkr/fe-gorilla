<script setup>
// The ubiquitous uppercase section eyebrow — a small colored dot plus a short
// mono, wide-tracked, uppercase label. Single primitive replacing the 6+ local
// copies (.tpc-eyebrow / .re-eyebrow / .af-eyebrow, ...). `dotColor` tints the
// leading dot; default slot is the label; `#trailing` slot sits after it (e.g.
// a sample Pill).
defineProps({
  dotColor: { type: String, default: "var(--color-pop)" },
});
</script>

<template>
  <span class="eyebrow">
    <span
      class="eyebrow__dot"
      :style="{ background: dotColor }"
      aria-hidden="true"
    />
    <span class="eyebrow__label"><slot /></span>
    <slot name="trailing" />
  </span>
</template>

<style scoped>
.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}

.eyebrow__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--radius-pill);
}

.eyebrow__label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
</style>
