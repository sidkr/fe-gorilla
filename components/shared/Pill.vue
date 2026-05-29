<script setup>
// Generic badge/chip/status pill — the single primitive that replaces the
// scattered .tag / .chip / status-pill variants across the app. Tone drives a
// soft tinted background + readable foreground (all from tokens); `dot` adds a
// leading colored marker in the foreground color; `size` toggles padding/type.
defineProps({
  tone: {
    type: String,
    default: "neutral",
    validator: (v) =>
      ["neutral", "brand", "success", "warn", "danger", "info"].includes(v),
  },
  size: {
    type: String,
    default: "sm",
    validator: (v) => ["sm", "md"].includes(v),
  },
  dot: { type: Boolean, default: false },
});
</script>

<template>
  <span class="pill" :class="[`pill--${tone}`, `pill--${size}`]">
    <span v-if="dot" class="pill__dot" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
}

/* Sizes */
.pill--sm {
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
}
.pill--md {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
}

/* Leading dot — inherits the tone foreground color */
.pill__dot {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: var(--radius-pill);
  background: currentColor;
}

/* Tones — soft tinted bg + readable fg */
.pill--neutral {
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
}
.pill--brand {
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
}
.pill--success {
  background: var(--color-ok-bg);
  color: var(--color-ok);
}
.pill--warn {
  background: var(--color-warn-bg);
  color: var(--color-warn);
}
.pill--danger {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
.pill--info {
  background: var(--color-surface-2);
  color: var(--color-ink-soft);
}
</style>
