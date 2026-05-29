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

// Normalize a raw cloud template into the card view-model. `kind` drives the
// card chrome + which actions show. `blocks` is the template's full block tree,
// rendered as a miniature email preview in the thumbnail (AppTemplatePreview).
// The org's own templates surface under a "Saved" category facet.
function toCard(t, kind) {
  return {
    id: t.id,
    name: t.name,
    kind,
    blocks: t.body?.blocks || [],
    category: t.category || (kind === "standard" ? "Basics" : "Saved"),
  };
}

// Every template as a card (system starters + the org's saved templates).
const allCards = computed(() => [
  ...system.value.map((t) => toCard(t, "standard")),
  ...org.value.map((t) => toCard(t, "saved")),
]);

// Category filter — a clean chip row built from the LIVE data, so new
// categories appear automatically. Ordered to match the server's gallery
// order; unknown categories sort after; the user's "Saved" facet sits last.
const CAT_ORDER = [
  "Basics", "Newsletters", "Announcements", "Product launches",
  "Welcome & onboarding", "Promotions & sales", "Events & webinars",
  "E-commerce", "Re-engagement & surveys", "Seasonal & holiday",
  "Transactional & notifications", "Nonprofit & community",
];
const activeCategory = ref("All");

const categories = computed(() => {
  const counts = {};
  for (const c of allCards.value) counts[c.category] = (counts[c.category] || 0) + 1;
  const known = CAT_ORDER.filter((c) => counts[c]);
  const extra = Object.keys(counts)
    .filter((c) => !CAT_ORDER.includes(c) && c !== "Saved")
    .sort();
  const ordered = [...known, ...extra];
  if (counts["Saved"]) ordered.push("Saved");
  return [
    { value: "All", label: "All", count: allCards.value.length },
    ...ordered.map((c) => ({ value: c, label: c, count: counts[c] })),
  ];
});

// If the active facet disappears (e.g. last saved template deleted), fall back to All.
watch(categories, (cats) => {
  if (!cats.some((c) => c.value === activeCategory.value)) activeCategory.value = "All";
});

const visibleTemplates = computed(() =>
  activeCategory.value === "All"
    ? allCards.value
    : allCards.value.filter((c) => c.category === activeCategory.value),
);

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
      <Button variant="primary" to="/app/templates/new">
        <template #leading><Icon name="plus" size="sm" /></template>
        New template
      </Button>
    </header>

    <!-- 2. Category filter -->
    <div v-if="!loading && !loadError" class="tpl-filter" role="tablist" aria-label="Filter templates by category">
      <button
        v-for="c in categories"
        :key="c.value"
        type="button"
        role="tab"
        :aria-selected="activeCategory === c.value"
        class="tpl-chip"
        :class="{ 'is-active': activeCategory === c.value }"
        @click="activeCategory = c.value"
      >
        {{ c.label }}<span class="tpl-chip-count">{{ c.count }}</span>
      </button>
    </div>

    <!-- 3. States -->
    <p v-if="loadError" class="tpl-error" role="alert">{{ loadError }}</p>
    <p v-if="loading" class="tpl-empty">Loading templates…</p>
    <EmptyState
      v-else-if="visibleTemplates.length === 0"
      :title="activeCategory === 'Saved' ? 'No saved templates yet' : 'No templates to show'"
      :subtitle="activeCategory === 'Saved' ? 'Use “Save as template” from the editor to add one here.' : undefined"
    />

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
            <Button
              variant="primary"
              size="sm"
              :disabled="busyId === tpl.id"
              @click="onUse(tpl.id)"
            >
              {{ busyId === tpl.id ? "Working…" : "Use this" }}
            </Button>
            <template v-if="tpl.kind === 'saved'">
              <Button variant="ghost" size="sm" :disabled="busyId === tpl.id" @click="onEdit(tpl.id)">
                Edit
              </Button>
              <Button variant="danger" size="sm" class="tpl-act-delete" :disabled="busyId === tpl.id" @click="onDelete(tpl.id, tpl.name)">
                Delete
              </Button>
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
/* Filter tabs — segmented row aligned to the start of the column. */
/* Category filter — wrapping row of pill chips. */
.tpl-filter {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
.tpl-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1-5) var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              border-color var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.tpl-chip:hover {
  border-color: var(--color-rule-strong);
  color: var(--color-ink);
}
.tpl-chip.is-active {
  background: var(--color-pop);
  border-color: var(--color-pop);
  color: var(--color-ink-on-pop);
}
.tpl-chip:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.tpl-chip-count {
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xs);
  opacity: 0.7;
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
/* Push Delete to the right edge of the action row, as before. */
.tpl-act-delete {
  margin-left: auto;
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
