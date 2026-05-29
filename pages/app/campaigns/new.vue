<script setup>
// /app/campaigns/new — create a fresh draft Campaign, then redirect to
// the editor page. This route does no rendering of its own; it's a
// thin bootstrapper so the editor URL is always /app/campaigns/:id/edit.
//
// `replace: true` on the redirect so the user can press Back from the
// editor to wherever they came from (campaigns list, dashboard), not
// back to /new which would re-create another draft.
import Parse from "parse";
import { makeDefaultBody } from "~/components/app/editor/blocks/registry";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
  appWidth: "full",
});

useHead({ title: "New campaign" });

const error = ref(null);

try {
  // The default body includes a Footer block — every new campaign starts
  // CAN-SPAM-compliant out of the box (Editor-phase1.md §6).
  const campaign = new Parse.Object("Campaign");
  campaign.set("name", "Untitled campaign");
  campaign.set("body", makeDefaultBody());
  campaign.set("status", "draft");
  // Phase 1 setup fields. All optional in storage; pre-flight enforces
  // send-readiness (Editor-phase1.md §"Data model changes").
  campaign.set("subject", null);
  campaign.set("preheader", null);
  campaign.set("fromName", null);
  campaign.set("fromEmail", null);
  campaign.set("replyTo", null);
  campaign.set("audienceId", null);
  // Workspace background behind the email card. Null = use the default
  // (--color-surface-2) — the canvas resolves the fallback locally.
  campaign.set("bodyBg", null);
  const user = Parse.User.current();
  if (user) campaign.set("createdBy", user);
  await campaign.save();
  await navigateTo(`/app/campaigns/${campaign.id}/edit`, { replace: true });
} catch (e) {
  console.error("[campaigns/new] failed to create draft", e);
  error.value = e?.message || "Could not create a new campaign.";
}
</script>

<template>
  <div class="new-bootstrap">
    <template v-if="!error">
      <span class="new-spinner" aria-hidden="true"></span>
      <p>Starting a new campaign…</p>
    </template>
    <template v-else>
      <h1>Something went wrong</h1>
      <p>{{ error }}</p>
      <NuxtLink to="/app/dashboard" class="new-link">Back to dashboard</NuxtLink>
    </template>
  </div>
</template>

<style scoped>
.new-bootstrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: 40vh;
  color: var(--color-ink-soft);
  text-align: center;
}
.new-bootstrap h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  color: var(--color-ink);
}
.new-bootstrap p {
  margin: 0;
  font-size: var(--text-sm);
}
.new-spinner {
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
.new-link {
  color: var(--link-color);
  font-size: var(--text-sm);
}
</style>
