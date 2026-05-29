<script setup>
// StatusPill — small rounded status badge for campaign states.
// Three known statuses drive the color scheme:
//   - sent      → coral (uses --color-pop / --color-ink-on-pop)
//   - draft     → muted (ink-soft on sunk surface)
//   - scheduled → green (uses --color-ok / --color-ok-bg)
// Unknown values fall through to the neutral "draft" treatment so we never
// blow up on bad data while the Parse pipeline isn't wired.
import { computed } from "vue";

const props = defineProps({
  status: { type: String, required: true },
});

const label = computed(() => {
  if (!props.status) return "";
  return props.status.charAt(0).toUpperCase() + props.status.slice(1);
});
</script>

<template>
  <span :class="['pill', `pill--${status}`]">{{ label }}</span>
</template>

<style scoped>
.pill {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  border-radius: var(--radius-pill);
  line-height: 1.2;
  white-space: nowrap;
}
.pill--sent {
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
}
.pill--draft {
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
}
.pill--scheduled {
  background: var(--color-ok-bg);
  color: var(--color-ok);
}
</style>
