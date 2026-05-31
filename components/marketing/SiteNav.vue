<script setup lang="ts">
// Shared marketing nav. Sticky top bar used by layouts/marketing.vue.
const links = [
  { label: "Product", to: "/features" },
  { label: "Pricing", to: "/pricing" },
  { label: "Customers", to: "/customers" },
  { label: "Changelog", to: "/changelog" },
  { label: "Docs", to: "/docs" },
];
</script>

<template>
  <nav class="nv">
    <div class="wrap nv-inner">
      <NuxtLink to="/" class="nv-brand" aria-label="Fe-Mail Gorilla home">
        <BrandMark :size="34" />
        <BrandWordmark :height="34" />
      </NuxtLink>
      <ul class="nv-links">
        <li v-for="l in links" :key="l.to"><NuxtLink :to="l.to">{{ l.label }}</NuxtLink></li>
      </ul>
      <div class="nv-cta">
        <Button variant="subtle" size="sm" to="/login">Sign in</Button>
        <Button variant="primary" size="sm" to="/signup">Sign up free</Button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.nv {
  position: sticky; top: 0; z-index: 50;
  background: rgba(255, 255, 255, 0.92);
  border-bottom: 1px solid var(--color-rule);
}
.nv-inner { display: flex; align-items: center; justify-content: space-between; height: 72px; }
.nv-brand { display: inline-flex; align-items: center; gap: var(--space-3); }
.nv-links { display: flex; gap: var(--space-6); list-style: none; margin: 0; padding: 0; }
.nv-links a {
  font-size: var(--text-sm); font-weight: 500; color: var(--color-ink-soft);
  letter-spacing: var(--tracking-tight); transition: color var(--dur-fast) var(--ease-out);
}
.nv-links a:hover { color: var(--color-ink); }
.nv-cta { display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0; }
@media (max-width: 760px) { .nv-links { display: none; } }
</style>
