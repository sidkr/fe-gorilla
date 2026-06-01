<script setup lang="ts">
// Shared marketing nav. Sticky top bar. Desktop shows inline links + CTAs;
// on mobile (<=760px) they collapse behind a hamburger that opens a full-width
// panel (the old version hid the links with no replacement AND overflowed the
// viewport with the brand + both CTA buttons).
import { ref, watch } from "vue";

const links = [
  { label: "Product", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Customers", to: "/customers" },
  { label: "Changelog", to: "/changelog" },
  { label: "Docs", to: "/docs" },
];

const route = useRoute();
const open = ref(false);
// Close the mobile menu whenever the route changes (a link was followed).
watch(() => route.fullPath, () => { open.value = false; });
</script>

<template>
  <nav class="nv" :class="{ 'is-open': open }">
    <div class="wrap nv-inner">
      <NuxtLink to="/" class="nv-brand" aria-label="Fe-Mail Gorilla home" @click="open = false">
        <BrandMark :size="32" />
        <BrandWordmark :height="32" />
      </NuxtLink>

      <ul class="nv-links">
        <li v-for="l in links" :key="l.to"><NuxtLink :to="l.to">{{ l.label }}</NuxtLink></li>
      </ul>

      <div class="nv-cta">
        <Button variant="subtle" size="sm" to="/login">Sign in</Button>
        <Button variant="primary" size="sm" to="/signup">Sign up free</Button>
      </div>

      <button
        type="button"
        class="nv-burger"
        :aria-expanded="open"
        aria-label="Toggle menu"
        @click="open = !open"
      >
        <span /><span /><span />
      </button>
    </div>

    <!-- Mobile dropdown panel -->
    <div v-show="open" class="nv-panel">
      <div class="wrap">
        <NuxtLink v-for="l in links" :key="l.to" :to="l.to" class="nv-panel-link">{{ l.label }}</NuxtLink>
        <div class="nv-panel-cta">
          <Button variant="subtle" size="md" block to="/login">Sign in</Button>
          <Button variant="primary" size="md" block to="/signup">Sign up free</Button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.nv {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255, 255, 255, 0.95);
  border-bottom: 1px solid var(--color-rule);
}
.nv-inner { display: flex; align-items: center; justify-content: space-between; height: 72px; gap: var(--space-4); }
.nv-brand { display: inline-flex; align-items: center; gap: var(--space-3); min-width: 0; flex-shrink: 0; }
.nv-links { display: flex; gap: var(--space-6); list-style: none; margin: 0; padding: 0; }
.nv-links a {
  font-size: var(--text-sm); font-weight: 500; color: var(--color-ink-soft);
  letter-spacing: var(--tracking-tight); transition: color var(--dur-fast) var(--ease-out);
}
.nv-links a:hover { color: var(--color-ink); }
.nv-cta { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }

/* Hamburger — hidden on desktop. */
.nv-burger {
  display: none; flex-direction: column; justify-content: center; gap: 4px;
  width: 40px; height: 40px; padding: 0 9px; border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm); background: var(--color-surface); cursor: pointer;
}
.nv-burger span { display: block; height: 2px; width: 100%; background: var(--color-ink); border-radius: 2px; transition: transform var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out); }
.nv.is-open .nv-burger span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.nv.is-open .nv-burger span:nth-child(2) { opacity: 0; }
.nv.is-open .nv-burger span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

/* Mobile panel. */
.nv-panel { border-top: 1px solid var(--color-rule); background: var(--color-surface); padding: var(--space-4) 0 var(--space-5); }
.nv-panel-link {
  display: block; padding: var(--space-3) 0; font-size: var(--text-md); font-weight: 600;
  color: var(--color-ink); border-bottom: 1px solid var(--color-rule);
}
.nv-panel-cta { display: grid; gap: var(--space-3); margin-top: var(--space-4); }

@media (max-width: 760px) {
  .nv-links, .nv-cta { display: none; }
  .nv-burger { display: flex; }
}
/* Very small phones: show just the logomark (hide the wordmark) so the brand +
   hamburger always fit. */
@media (max-width: 400px) {
  .nv-brand > :last-child { display: none; }
}
</style>
