<script setup lang="ts">
// Single button/CTA primitive for the design system — replaces the ~11 duplicate
// `.btn` definitions scattered across the app. Polymorphic: renders a native
// <button> by default, a <NuxtLink> when `to` is set, or an <a> when `href` is
// set. All visuals come from design tokens (var(--…)); nothing is hardcoded.
// Auto-imported unprefixed, so usable directly as <Button />.

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const props = withDefaults(
  defineProps<{
    variant?: Variant;
    size?: Size;
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
    type?: "button" | "submit" | "reset";
    to?: string;
    href?: string;
  }>(),
  {
    variant: "primary",
    size: "md",
    block: false,
    disabled: false,
    loading: false,
    type: "button",
    to: undefined,
    href: undefined,
  },
);

// Disabled covers the loading case too — a loading button must not be actionable.
const isDisabled = computed(() => props.disabled || props.loading);

// Pick the element: NuxtLink for in-app routes, <a> for external/hash hrefs,
// otherwise a real <button>.
const tag = computed(() => {
  if (props.to) return resolveComponent("NuxtLink");
  if (props.href) return "a";
  return "button";
});

// Only forward attrs that make sense for the resolved element, and make sure a
// disabled link is inert (no navigation, removed from tab order, announced).
const elementProps = computed(() => {
  if (props.to) {
    return isDisabled.value
      ? { "aria-disabled": "true", tabindex: -1, role: "link" }
      : { to: props.to };
  }
  if (props.href) {
    return isDisabled.value
      ? { "aria-disabled": "true", tabindex: -1, role: "link" }
      : { href: props.href };
  }
  return { type: props.type, disabled: isDisabled.value };
});

function onClick(e: MouseEvent) {
  // Native <button> honors [disabled]; links don't, so block them here.
  if (isDisabled.value) {
    e.preventDefault();
    e.stopPropagation();
  }
}
</script>

<template>
  <component
    :is="tag"
    class="btn"
    :class="[`btn--${variant}`, `btn--${size}`, { 'btn--block': block, 'btn--disabled': isDisabled, 'btn--loading': loading }]"
    v-bind="elementProps"
    @click="onClick"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <span v-else-if="$slots.leading" class="btn__icon"><slot name="leading" /></span>
    <slot />
    <span v-if="$slots.trailing && !loading" class="btn__icon"><slot name="trailing" /></span>
  </component>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  white-space: nowrap;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-weight: 600;
  letter-spacing: var(--tracking-tight);
  /* 1px transparent border so variants with/without a visible border align. */
  border: 1px solid transparent;
  text-decoration: none;
  cursor: pointer;
  user-select: none;
  transition:
    background var(--dur-base) var(--ease-out),
    color var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

.btn:active {
  transform: translateY(1px);
}

.btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* --- Sizes --- */
.btn--sm {
  height: var(--btn-height-sm);
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
}
.btn--md {
  height: var(--btn-height-md);
  padding: 0 var(--space-5);
  font-size: var(--text-base);
}
.btn--lg {
  height: var(--btn-height-lg);
  padding: 0 var(--space-6);
  font-size: var(--text-md);
}

/* --- Variants --- */
.btn--primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
}
.btn--primary:not(.btn--disabled):hover {
  background: var(--btn-primary-hover);
}

.btn--ghost {
  background: transparent;
  color: var(--btn-ghost-fg);
  border-color: var(--btn-ghost-border);
}
.btn--ghost:not(.btn--disabled):hover {
  background: var(--btn-ghost-hover-bg);
}

.btn--danger {
  background: var(--btn-danger-bg);
  color: var(--btn-danger-fg);
}
.btn--danger:not(.btn--disabled):hover {
  background: var(--btn-danger-hover);
}

.btn--subtle {
  background: transparent;
  color: var(--color-ink-soft);
}
.btn--subtle:not(.btn--disabled):hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}

/* --- States --- */
.btn--block {
  width: 100%;
}

.btn--disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* --- Spinner (pure CSS, no external assets) --- */
.btn__spinner {
  width: 1em;
  height: 1em;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: var(--radius-pill);
  animation: btn-spin 0.6s linear infinite;
}

.btn__icon {
  display: inline-flex;
  align-items: center;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .btn {
    transition: none;
  }
  .btn__spinner {
    animation-duration: 1.5s;
  }
}
</style>
