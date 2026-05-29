<script setup>
// /app/templates — Templates gallery (F-13 / F-14).
//
// Authed surface; CSR via the /app/* group route rules. Wired to the real
// `Template` class via the `listTemplates` cloud function (useTemplates):
//   - System tab  → global starter templates (read-only; "Use this" forks
//                   them into a new Campaign draft and opens the editor).
//   - Saved tab   → the org's own templates ("Use this" + edit + delete).
//
// Thumbnails are hand-authored inline SVGs. System templates select their SVG
// by `seedKey` (stable across reseeds); org templates fall through to a neutral
// fallback layout. Colors strictly via tokens.
import { useTemplates } from "~/composables/app/useTemplates";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Templates" });

const { listTemplates, useTemplate: forkTemplate, deleteTemplate } = useTemplates();

const system = ref([]);
const org = ref([]);
const loading = ref(true);
const loadError = ref(null);
const busyId = ref(null); // id of a template currently being forked/deleted

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await listTemplates();
    system.value = res.system || [];
    org.value = res.org || [];
  } catch (e) {
    loadError.value = e?.message || "Could not load templates.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Filter tabs. "all" shows everything; "saved" = org templates; "standard" =
// system starters. Counts stay in sync with the live data.
const tabs = computed(() => [
  { value: "all", label: "All", count: system.value.length + org.value.length },
  { value: "saved", label: "Saved by me", count: org.value.length },
  { value: "standard", label: "Standard", count: system.value.length },
]);

const activeTab = ref("all");

// Normalize a raw cloud template into the card view-model. `kind` drives the
// card chrome + which actions show. `blocks` is the template's full block tree,
// rendered as a miniature email preview in the thumbnail (AppTemplatePreview).
function toCard(t, kind) {
  return {
    id: t.id,
    name: t.name,
    kind,
    blocks: t.body?.blocks || [],
    category: t.category || (kind === "standard" ? "Standard" : "Saved"),
  };
}

const visibleTemplates = computed(() => {
  const sys = system.value.map((t) => toCard(t, "standard"));
  const own = org.value.map((t) => toCard(t, "saved"));
  if (activeTab.value === "standard") return sys;
  if (activeTab.value === "saved") return own;
  return [...sys, ...own];
});

// "Use this" → fork into a new Campaign draft → open the editor.
async function onUse(id) {
  if (busyId.value) return;
  busyId.value = id;
  try {
    const { campaignId } = await forkTemplate(id);
    await navigateTo(`/app/campaigns/${campaignId}/edit`);
  } catch (e) {
    loadError.value = e?.message || "Could not start from this template.";
    busyId.value = null;
  }
}

// Edit an org template → opens the template editor route (lands later phase).
function onEdit(id) {
  return navigateTo(`/app/templates/${id}/edit`);
}

// Delete an org template (with confirm). System templates never expose this.
async function onDelete(id, name) {
  if (busyId.value) return;
  if (!window.confirm(`Delete the template "${name}"? This can't be undone.`)) return;
  busyId.value = id;
  try {
    await deleteTemplate(id);
    org.value = org.value.filter((t) => t.id !== id);
  } catch (e) {
    loadError.value = e?.message || "Could not delete the template.";
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="tpl-page">
    <!-- 1. Header -->
    <header class="tpl-header">
      <div class="tpl-header-text">
        <h1>Templates</h1>
        <p class="tpl-lede">Reusable email layouts. Save current designs or start from a curated set.</p>
      </div>
      <NuxtLink to="/app/templates/new" class="tpl-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New template</span>
      </NuxtLink>
    </header>

    <!-- 2. Filter tabs -->
    <div class="tpl-tabs" role="tablist" aria-label="Filter templates">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        role="tab"
        type="button"
        :aria-selected="activeTab === tab.value"
        :class="['tpl-tab', { 'is-active': activeTab === tab.value }]"
        @click="activeTab = tab.value"
      >
        <span>{{ tab.label }}</span>
        <span class="tpl-tab-count">({{ tab.count }})</span>
      </button>
    </div>

    <!-- 3. States -->
    <p v-if="loadError" class="tpl-error" role="alert">{{ loadError }}</p>
    <p v-if="loading" class="tpl-empty">Loading templates…</p>
    <p
      v-else-if="visibleTemplates.length === 0"
      class="tpl-empty"
    >
      {{ activeTab === "saved" ? "You haven't saved any templates yet. Use “Save as template” from the editor." : "No templates to show." }}
    </p>

    <!-- 4. Gallery -->
    <section v-else class="tpl-grid" aria-label="Template gallery">
      <!-- Cards are rendered inline (not via AppTemplateCard) because each card
           now carries interactive actions — "Use this" for all, plus edit/delete
           for org templates — which a single-link card can't host. The thumbnail
           design + chrome match the original card styling. -->
      <article v-for="tpl in visibleTemplates" :key="tpl.id" class="tpl-card">
        <div class="tpl-card-thumb">
          <!-- Full miniature email preview: renders the template's block tree as
               a realistic mini email scaled to fit, clipped to the top. Far more
               informative than a hero image — you can tell what the template is. -->
          <AppTemplatePreview :blocks="tpl.blocks" />
        </div>

        <!-- Body: name + tag chip -->
        <div class="tpl-card-body">
          <div class="tpl-card-head">
            <h3 class="tpl-card-name">{{ tpl.name }}</h3>
            <span class="tpl-card-tag">{{ tpl.category }}</span>
          </div>
          <p class="tpl-card-meta">
            {{ tpl.kind === "standard" ? "Starter template" : "Saved by your team" }}
          </p>

          <!-- Actions. "Use this" for every template; edit + delete only for
               org-owned ("saved") templates. System templates are read-only. -->
          <div class="tpl-card-actions">
            <button
              type="button"
              class="tpl-act tpl-act-primary"
              :disabled="busyId === tpl.id"
              @click="onUse(tpl.id)"
            >
              {{ busyId === tpl.id ? "Working…" : "Use this" }}
            </button>
            <template v-if="tpl.kind === 'saved'">
              <button type="button" class="tpl-act" :disabled="busyId === tpl.id" @click="onEdit(tpl.id)">
                Edit
              </button>
              <button type="button" class="tpl-act tpl-act-danger" :disabled="busyId === tpl.id" @click="onDelete(tpl.id, tpl.name)">
                Delete
              </button>
            </template>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.tpl-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* Header */
.tpl-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.tpl-header-text { min-width: 0; }
.tpl-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.tpl-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.tpl-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.tpl-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.tpl-cta:active {
  transform: translateY(1px);
}
.tpl-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* Filter tabs — segmented row. Idle tabs are quiet ink-soft on transparent;
   active tab uses the soft coral background + deep coral text for a
   strong, on-brand selection state. */
.tpl-tabs {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
  align-self: flex-start;
}
.tpl-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-2) var(--space-4);
  background: transparent;
  border: none;
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out);
}
.tpl-tab:hover {
  color: var(--color-ink);
}
.tpl-tab.is-active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
}
.tpl-tab.is-active .tpl-tab-count {
  color: var(--color-pop-deep);
}
.tpl-tab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.tpl-tab-count {
  font-variant-numeric: tabular-nums;
  font-weight: 500;
  color: var(--color-ink-dim);
}

/* States */
.tpl-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  font-size: var(--text-sm);
}
.tpl-empty {
  margin: 0;
  color: var(--color-ink-soft);
  font-size: var(--text-sm);
}

/* Card — surface, hover border, thumbnail (3:4), body, actions. Mirrors the
   original AppTemplateCard chrome (now inlined so the card can host buttons). */
.tpl-card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
}
.tpl-card:hover {
  border-color: var(--color-pop);
  box-shadow: var(--shadow-md);
}
.tpl-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-rule);
  overflow: hidden;
}
.tpl-card-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.tpl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}
.tpl-card-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
  min-width: 0;
  overflow-wrap: anywhere;
}
.tpl-card-tag {
  flex: none;
  padding: var(--space-1) var(--space-3);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  line-height: 1.2;
  white-space: nowrap;
}
.tpl-card-meta {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.tpl-card-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  flex-wrap: wrap;
}
.tpl-act {
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-rule);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out),
              border-color var(--dur-base) var(--ease-out),
              color var(--dur-base) var(--ease-out);
}
.tpl-act:hover:not(:disabled) {
  border-color: var(--color-pop);
}
.tpl-act:disabled {
  opacity: 0.6;
  cursor: default;
}
.tpl-act:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.tpl-act-primary {
  background: var(--btn-primary-bg);
  border-color: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
}
.tpl-act-primary:hover:not(:disabled) {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}
.tpl-act-danger {
  margin-left: auto;
  color: var(--color-ink-soft);
}
.tpl-act-danger:hover:not(:disabled) {
  border-color: var(--color-pop);
  color: var(--color-pop-deep);
}

/* Gallery grid — 3 cols ≥1100, 2 cols 720-1100, 1 col below. */
.tpl-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 1100px) {
  .tpl-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .tpl-grid { grid-template-columns: 1fr; }
}
</style>
