<script setup>
// /app/campaigns/:id/edit — the editor route. Loads the Campaign by id
// from Parse, then mounts the EditorShell. The Shell owns all editing
// state and Parse save calls; this page is just the loader and a
// graceful failure surface for missing/unauthorized campaigns.
import Parse from "parse";
import EditorShell from "~/components/app/editor/EditorShell.vue";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
  // Drop the 1200px container so the 3-pane editor can use every pixel
  // between sidebar and screen edge — gives the canvas card real room to
  // center on big displays.
  appWidth: "full",
});

const route = useRoute();
const id = String(route.params.id);

const campaign = ref(null);
const loadError = ref(null);

try {
  const q = new Parse.Query("Campaign");
  campaign.value = await q.get(id);
  useHead({ title: campaign.value.get("name") || "Untitled campaign" });
} catch (e) {
  console.error("[campaigns/:id/edit] could not load", e);
  loadError.value = e?.message || "Could not load this campaign.";
}
</script>

<template>
  <div class="edit-page">
    <EditorShell v-if="campaign" :campaign="campaign" />

    <div v-else-if="loadError" class="edit-error">
      <h1>Campaign not found</h1>
      <p>{{ loadError }}</p>
      <NuxtLink to="/app/campaigns" class="edit-link">Back to campaigns</NuxtLink>
    </div>

    <div v-else class="edit-loading">
      <span class="edit-spinner" aria-hidden="true"></span>
      <p>Loading campaign…</p>
    </div>
  </div>
</template>

<style scoped>
.edit-page {
  /* The EditorShell positions itself fixed and fills below the app
     top nav. This wrapper exists so the page has SOMETHING in the
     layout flow before the Shell mounts — otherwise the layout
     <main> collapses to zero height between the loader showing and
     the Shell mounting. */
  min-height: 60vh;
}
.edit-loading,
.edit-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 50vh;
  color: var(--color-ink-soft);
  text-align: center;
}
.edit-error h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--color-ink);
}
.edit-error p,
.edit-loading p {
  margin: 0;
  font-size: var(--text-sm);
}
.edit-link {
  color: var(--link-color);
  font-size: var(--text-sm);
}
.edit-spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--color-rule);
  border-top-color: var(--color-pop);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
