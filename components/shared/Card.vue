<script setup lang="ts">
// Standard surface panel for the design system — replaces the 6+ hand-rolled
// card/panel chromes scattered across the app (.card, .tpc-card, .af-card,
// .rep-card, .ad-card, …). Polymorphic: renders a plain <div> by default, a
// <NuxtLink> when `to` is set, or an <a> when `href` is set. All visuals come
// from design tokens (var(--…)); nothing is hardcoded. Auto-imported
// unprefixed, so usable directly as <Card />.
//
// Slots: #header (optional, rule-separated above the body), default (body),
// #footer (optional, rule-separated below the body). When padding="none" the
// header/footer manage their own padding so callers can lay out edge-to-edge.

type Padding = "none" | "sm" | "md" | "lg";

const props = withDefaults(
  defineProps<{
    padding?: Padding;
    interactive?: boolean;
    flush?: boolean;
    to?: string;
    href?: string;
  }>(),
  {
    padding: "md",
    interactive: false,
    flush: false,
    to: undefined,
    href: undefined,
  },
);

// div by default; NuxtLink for in-app routes, <a> for external/hash hrefs.
const tag = computed(() => {
  if (props.to) return resolveComponent("NuxtLink");
  if (props.href) return "a";
  return "div";
});

const elementProps = computed(() => {
  if (props.to) return { to: props.to };
  if (props.href) return { href: props.href };
  return {};
});
</script>

<template>
  <component
    :is="tag"
    class="card"
    :class="[
      `card--pad-${padding}`,
      { 'card--interactive': interactive, 'card--flush': flush },
    ]"
    v-bind="elementProps"
  >
    <header v-if="$slots.header" class="card__header"><slot name="header" /></header>
    <div class="card__body"><slot /></div>
    <footer v-if="$slots.footer" class="card__footer"><slot name="footer" /></footer>
  </component>
</template>

<style scoped>
.card {
  display: block;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  color: inherit;
  text-decoration: none;
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-out);
}

/* No shadow — just the border outline. */
.card--flush {
  box-shadow: none;
}

/* --- Padding scale: applies to the body; header/footer get matching insets --- */
.card--pad-none > .card__body {
  padding: 0;
}
.card--pad-sm > .card__body {
  padding: var(--space-4);
}
.card--pad-md > .card__body {
  padding: var(--space-5);
}
.card--pad-lg > .card__body {
  padding: var(--space-6);
}

/* Header/footer share the horizontal+vertical inset of the chosen padding so
   the rule separators run flush with the body content. When padding="none",
   they collapse to 0 and the caller manages their own spacing. */
.card--pad-none > .card__header,
.card--pad-none > .card__footer {
  padding: 0;
}
.card--pad-sm > .card__header,
.card--pad-sm > .card__footer {
  padding: var(--space-4);
}
.card--pad-md > .card__header,
.card--pad-md > .card__footer {
  padding: var(--space-5);
}
.card--pad-lg > .card__header,
.card--pad-lg > .card__footer {
  padding: var(--space-6);
}

.card__header {
  border-bottom: 1px solid var(--color-rule);
}
.card__footer {
  border-top: 1px solid var(--color-rule);
}

/* --- Interactive (hover lift) --- */
.card--interactive {
  cursor: pointer;
}
.card--interactive:hover {
  border-color: var(--color-rule-strong);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card--interactive:hover {
    transform: none;
  }
}
</style>
