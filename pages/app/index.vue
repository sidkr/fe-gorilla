<script setup>
// /app → /app/dashboard. Saves the user from a bare empty /app surface.
// The auth-required middleware still gates this redirect via dashboard.
definePageMeta({
  layout: false,
  middleware: "auth-required",
});

await navigateTo("/app/dashboard", { replace: true });
</script>

<template>
  <div></div>
</template>
