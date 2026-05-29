<script setup lang="ts">
// Empty / zero-state block for the design system — replaces the per-feature
// empty chromes (.re-empty, .rep-empty, .ct-empty, …). Centered column with an
// optional leading icon/illustration, a title, a subtitle, optional inline
// content (default slot), and an optional action (e.g. a <Button />). All
// visuals come from design tokens (var(--…)); nothing is hardcoded.
// Auto-imported unprefixed, so usable directly as <EmptyState />.

withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
  }>(),
  {
    title: undefined,
    subtitle: undefined,
  },
);
</script>

<template>
  <div class="empty">
    <div v-if="$slots.icon" class="empty__icon" aria-hidden="true">
      <slot name="icon" />
    </div>

    <p v-if="title" class="empty__title">{{ title }}</p>
    <p v-if="subtitle" class="empty__subtitle">{{ subtitle }}</p>

    <div v-if="$slots.default" class="empty__content"><slot /></div>

    <div v-if="$slots.action" class="empty__action"><slot name="action" /></div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-7);
}

.empty__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-ink-dim);
}

.empty__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  line-height: var(--leading-normal);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}

.empty__subtitle {
  margin: 0;
  max-width: 40ch;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-dim);
}

/* Small top nudge so an action button reads as a distinct step below the copy. */
.empty__action {
  margin-top: var(--space-2);
}
</style>
