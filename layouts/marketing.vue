<script setup lang="ts">
// Marketing chrome: sticky nav + page content + footer. Applied to every
// top-level marketing page via definePageMeta({ layout: "marketing" }).
</script>

<template>
  <div class="mk-shell">
    <MarketingSiteNav />
    <main class="mk-main"><slot /></main>
    <MarketingSiteFooter />
  </div>
</template>

<style scoped>
.mk-shell { display: flex; flex-direction: column; min-height: 100vh; background: var(--color-bg); }
.mk-main { flex: 1; }
</style>
