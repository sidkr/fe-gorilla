<script setup lang="ts">
// Shared marketing footer — the single source of truth for the footer link map.
// Every link resolves to a real prerendered page (see nuxt.config prerender
// routes). Used by layouts/marketing.vue, so it appears on every marketing page.
const columns = [
  {
    title: "Product",
    links: [
      { label: "Editor", to: "/features/editor" },
      { label: "Segments", to: "/features/segments" },
      { label: "Reports", to: "/features/reports" },
      { label: "Automations", to: "/features/automations" },
      { label: "Pricing", to: "/pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", to: "/docs" },
      { label: "API reference", to: "/docs/api" },
      { label: "Templates", to: "/templates" },
      { label: "Deliverability guide", to: "/deliverability" },
      { label: "Changelog", to: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", to: "/about" },
      { label: "Customers", to: "/customers" },
      { label: "Careers", to: "/careers" },
      { label: "Press kit", to: "/press" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", to: "/legal/terms" },
      { label: "Privacy", to: "/legal/privacy" },
      { label: "GDPR", to: "/legal/gdpr" },
      { label: "DPA", to: "/legal/dpa" },
      { label: "Security", to: "/security" },
    ],
  },
];
</script>

<template>
  <footer class="ft">
    <div class="wrap">
      <div class="ft-grid">
        <div class="ft-brand">
          <NuxtLink to="/" class="ft-logo" aria-label="Fe-Mail Gorilla home">
            <BrandMark :size="28" />
            <BrandWordmark :height="28" />
          </NuxtLink>
          <p class="ft-blurb">Fe-Mail Gorilla — iron-forged email marketing for teams that want their campaigns to actually arrive.</p>
        </div>
        <div v-for="col in columns" :key="col.title" class="ft-col">
          <h4>{{ col.title }}</h4>
          <ul>
            <li v-for="l in col.links" :key="l.to"><NuxtLink :to="l.to">{{ l.label }}</NuxtLink></li>
          </ul>
        </div>
      </div>
      <div class="ft-bottom">
        <span class="ft-meta">© 2026 Fe-Mail Gorilla · Forged for email</span>
        <span class="fe26" aria-label="Iron, element 26">
          <span class="num">26</span><span class="sym">Fe</span><span class="name">Iron</span>
        </span>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.ft { padding: var(--space-8) 0 var(--space-6); border-top: 1px solid var(--color-rule); background: var(--color-surface); }
.ft-grid {
  display: grid; grid-template-columns: 1.4fr repeat(4, 1fr); gap: var(--space-7);
  padding-bottom: var(--space-7); border-bottom: 1px solid var(--color-rule);
}
.ft-logo { display: inline-flex; align-items: center; gap: var(--space-3); }
.ft-blurb { margin-top: var(--space-4); font-size: var(--text-sm); color: var(--color-ink-soft); line-height: var(--leading-normal); max-width: 28ch; }
.ft-col h4 {
  font-family: var(--font-mono); font-size: var(--text-xs); letter-spacing: var(--tracking-wider);
  color: var(--color-ink-dim); text-transform: uppercase; font-weight: 500; margin-bottom: var(--space-4);
}
.ft-col ul { list-style: none; padding: 0; margin: 0; }
.ft-col ul li { margin-bottom: var(--space-3); }
.ft-col a { font-size: var(--text-sm); color: var(--color-ink-soft); transition: color var(--dur-fast) var(--ease-out); }
.ft-col a:hover { color: var(--color-ink); }
.ft-bottom { padding-top: var(--space-5); display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; }
.ft-meta { font-size: var(--text-sm); color: var(--color-ink-dim); }

.fe26 {
  display: inline-flex; align-items: stretch; font-family: var(--font-mono); font-size: 10px; line-height: 1;
  border: 1px solid var(--color-rule-strong); border-radius: var(--radius-xs); overflow: hidden;
  background: var(--color-surface); color: var(--color-ink); letter-spacing: var(--tracking-wide);
}
.fe26 .num { padding: 4px 5px; background: var(--color-surface-sunk); color: var(--color-ink-soft); border-right: 1px solid var(--color-rule); font-weight: 500; }
.fe26 .sym { padding: 4px 6px; font-weight: 600; }
.fe26 .name { padding: 4px 6px; background: var(--color-ink); color: var(--color-ink-on-pop); letter-spacing: var(--tracking-wider); }

@media (max-width: 960px) { .ft-grid { grid-template-columns: 1fr 1fr; gap: var(--space-6) var(--space-5); } }
/* On small phones the 2-col grid + large gap overflows; go single column. */
@media (max-width: 420px) { .ft-grid { grid-template-columns: 1fr; gap: var(--space-6); } }
</style>
