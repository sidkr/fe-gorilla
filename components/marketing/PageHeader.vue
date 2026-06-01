<script setup lang="ts">
// Reusable marketing page header — eyebrow + h1 + lede. Keeps every footer-link
// page visually consistent. Use inside a `.wrap` container.
defineProps<{ eyebrow?: string; title: string; lede?: string }>();
</script>

<template>
  <header class="ph">
    <SectionEyebrow v-if="eyebrow">{{ eyebrow }}</SectionEyebrow>
    <h1 class="ph-title">{{ title }}</h1>
    <p v-if="lede" class="ph-lede">{{ lede }}</p>
    <div v-if="$slots.default" class="ph-actions"><slot /></div>
  </header>
</template>

<style scoped>
.ph { max-width: 760px; padding: var(--space-9) 0 var(--space-7); }
.ph .eyebrow { margin-bottom: var(--space-4); }
.ph-title {
  margin: 0; font-family: var(--font-display); font-weight: 800;
  font-size: var(--text-6xl); line-height: 1.02; letter-spacing: var(--tracking-tighter); color: var(--color-ink);
}
.ph-lede {
  margin: var(--space-5) 0 0; font-family: var(--font-body); font-size: var(--text-lg);
  line-height: var(--leading-normal); color: var(--color-ink-soft);
}
.ph-actions { margin-top: var(--space-6); display: flex; gap: var(--space-3); flex-wrap: wrap; }
@media (max-width: 720px) { .ph-title { font-size: var(--text-4xl); } .ph { padding-top: var(--space-7); } }
</style>
