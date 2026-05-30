<script setup>
// Default layout for marketing / top-level pages. Currently a passthrough —
// pages ship their own nav/footer inline (see pages/index.vue). app.vue wraps
// every route in <NuxtLayout>, which lazy-loads "default" for any page that
// doesn't opt into a named layout; without this file that lazy load resolves
// to a non-function and the index route 500s under `nuxt dev`. Marketing
// chrome can move here later (per CLAUDE.md).
</script>

<template>
  <slot />
</template>
