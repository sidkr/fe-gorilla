<script setup>
// Audiences list — live data via the listAudiences cloud function. Each row is
// a `List`. The card grid + KPI strip + eyebrow chrome are preserved from the
// design; metrics we don't have a source for yet (engagement, last-sent, 30d
// growth) degrade gracefully to neutral placeholders until sends ship.
import { computed, onMounted, ref } from "vue";
import { useAudiences } from "~/composables/app/useAudiences";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Audiences" });

const { listAudiences, createAudience, updateAudience, deleteAudience } =
  useAudiences();

const audiences = ref([]);
const loading = ref(true);
const loadError = ref("");

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    audiences.value = await listAudiences();
  } catch (err) {
    loadError.value = err?.message || "Could not load audiences.";
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// KPI strip — derived from the loaded rows. Engagement is unknown until sends
// exist, so we show a neutral placeholder rather than a fabricated number.
const totalSubscribers = computed(() =>
  audiences.value.reduce((sum, a) => sum + (a.contactCount || 0), 0),
);
const kpis = computed(() => [
  {
    label: "Total subscribers",
    value: totalSubscribers.value.toLocaleString("en-US"),
    delta: `${audiences.value.length} audience${audiences.value.length === 1 ? "" : "s"}`,
    deltaDirection: "neutral",
  },
  {
    label: "Average engagement",
    value: "—",
    delta: "Available after your first send",
    deltaDirection: "neutral",
  },
  {
    label: "Audiences",
    value: String(audiences.value.length),
    delta: "Live",
    deltaDirection: "neutral",
  },
]);

// ── Create-audience modal ─────────────────────────────────────────────────────
const showCreate = ref(false);
const newName = ref("");
const newDescription = ref("");
const creating = ref(false);
const createError = ref("");

function openCreate() {
  newName.value = "";
  newDescription.value = "";
  createError.value = "";
  showCreate.value = true;
}
function closeCreate() {
  if (creating.value) return;
  showCreate.value = false;
}

async function submitCreate() {
  const name = newName.value.trim();
  if (!name) {
    createError.value = "Name is required.";
    return;
  }
  creating.value = true;
  createError.value = "";
  try {
    const created = await createAudience(name, newDescription.value.trim());
    audiences.value = [created, ...audiences.value];
    showCreate.value = false;
  } catch (err) {
    createError.value = err?.message || "Could not create audience.";
  } finally {
    creating.value = false;
  }
}

// ── Rename modal ───────────────────────────────────────────────────────────────
const showRename = ref(false);
const renameTarget = ref(null);
const renameName = ref("");
const renameDescription = ref("");
const renaming = ref(false);
const renameError = ref("");

function openRename(a) {
  renameTarget.value = a;
  renameName.value = a.name;
  renameDescription.value = a.description || "";
  renameError.value = "";
  showRename.value = true;
}
function closeRename() {
  if (renaming.value) return;
  showRename.value = false;
}
async function submitRename() {
  const name = renameName.value.trim();
  if (!name) {
    renameError.value = "Name is required.";
    return;
  }
  renaming.value = true;
  renameError.value = "";
  try {
    const updated = await updateAudience(renameTarget.value.id, {
      name,
      description: renameDescription.value.trim(),
    });
    audiences.value = audiences.value.map((x) =>
      x.id === updated.id ? { ...x, ...updated } : x,
    );
    showRename.value = false;
  } catch (err) {
    renameError.value = err?.message || "Could not rename audience.";
  } finally {
    renaming.value = false;
  }
}

// ── Delete (guarded: only when empty) ─────────────────────────────────────────
const deletingId = ref(null);
async function removeAudience(a) {
  if ((a.contactCount || 0) > 0) {
    window.alert(
      "This audience still has contacts. Remove them first, or it can only be archived.",
    );
    return;
  }
  if (!confirm(`Delete the "${a.name}" audience? This cannot be undone.`)) return;
  deletingId.value = a.id;
  try {
    await deleteAudience(a.id);
    audiences.value = audiences.value.filter((x) => x.id !== a.id);
  } catch (err) {
    loadError.value = err?.message || "Could not delete audience.";
  } finally {
    deletingId.value = null;
  }
}
</script>

<template>
  <div class="audiences">
    <!-- 1. Header -->
    <header class="aud-header">
      <div class="aud-header-text">
        <h1>Audiences</h1>
        <p class="aud-lede">Contact lists you can send campaigns to.</p>
      </div>
      <div class="aud-header-actions">
        <Button to="/app/audiences/fields" variant="ghost">
          <template #leading>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </template>
          Manage fields
        </Button>
        <Button variant="primary" @click="openCreate">
          <template #leading>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </template>
          New audience
        </Button>
      </div>
    </header>

    <!-- 2. Summary strip -->
    <section class="aud-kpis" aria-label="Audience summary">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- 3. Audience grid -->
    <section class="aud-section">
      <div class="aud-eyebrow">
        <span class="aud-eyebrow-dot" aria-hidden="true"></span>
        <span>Your audiences &middot; {{ audiences.length }}</span>
      </div>

      <!-- Loading -->
      <p v-if="loading" class="aud-state">Loading audiences…</p>

      <!-- Error -->
      <p v-else-if="loadError" class="aud-state aud-state--error">
        {{ loadError }}
        <button type="button" class="aud-retry" @click="load">Retry</button>
      </p>

      <!-- Empty -->
      <EmptyState
        v-else-if="audiences.length === 0"
        title="No audiences yet"
        subtitle="Create your first audience to start collecting contacts and sending campaigns."
      >
        <template #action>
          <Button variant="primary" @click="openCreate">
            <template #leading>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
              </svg>
            </template>
            New audience
          </Button>
        </template>
      </EmptyState>

      <!-- Grid -->
      <div v-else class="aud-grid">
        <div v-for="a in audiences" :key="a.id" class="aud-cell">
          <AppAudienceCard
            :id="a.id"
            :name="a.name"
            :count="a.contactCount"
            growth=""
            growth-dir="neutral"
            engagement=""
            last-sent="—"
            last-sent-relative="not sent yet"
            :tag="a.archived ? 'Archived' : null"
          />
          <div class="aud-cell-actions">
            <Button variant="subtle" size="sm" @click="openRename(a)">Rename</Button>
            <Button
              variant="danger"
              size="sm"
              :disabled="deletingId === a.id"
              :title="(a.contactCount || 0) > 0 ? 'Remove all contacts before deleting' : 'Delete this audience'"
              @click="removeAudience(a)"
            >
              {{ deletingId === a.id ? "Deleting…" : "Delete" }}
            </Button>
          </div>
        </div>
      </div>
    </section>

    <!-- Create modal -->
    <div v-if="showCreate" class="aud-modal-backdrop" @mousedown.self="closeCreate">
      <div class="aud-modal" role="dialog" aria-modal="true" aria-labelledby="aud-modal-title">
        <h2 id="aud-modal-title" class="aud-modal-title">New audience</h2>
        <form @submit.prevent="submitCreate">
          <FormField label="Name" class="aud-field">
            <TextInput
              v-model="newName"
              type="text"
              placeholder="e.g. Newsletter subscribers"
            />
          </FormField>
          <FormField label="Description" hint="(optional)" class="aud-field">
            <TextInput
              v-model="newDescription"
              type="text"
              placeholder="What is this list for?"
            />
          </FormField>
          <p v-if="createError" class="aud-modal-error">{{ createError }}</p>
          <div class="aud-modal-actions">
            <Button variant="ghost" :disabled="creating" @click="closeCreate">
              Cancel
            </Button>
            <Button type="submit" variant="primary" :loading="creating">
              {{ creating ? "Creating…" : "Create audience" }}
            </Button>
          </div>
        </form>
      </div>
    </div>

    <!-- Rename modal -->
    <div v-if="showRename" class="aud-modal-backdrop" @mousedown.self="closeRename">
      <div class="aud-modal" role="dialog" aria-modal="true" aria-labelledby="aud-rename-title">
        <h2 id="aud-rename-title" class="aud-modal-title">Rename audience</h2>
        <form @submit.prevent="submitRename">
          <FormField label="Name" class="aud-field">
            <TextInput v-model="renameName" type="text" />
          </FormField>
          <FormField label="Description" hint="(optional)" class="aud-field">
            <TextInput v-model="renameDescription" type="text" />
          </FormField>
          <p v-if="renameError" class="aud-modal-error">{{ renameError }}</p>
          <div class="aud-modal-actions">
            <Button variant="ghost" :disabled="renaming" @click="closeRename">Cancel</Button>
            <Button type="submit" variant="primary" :loading="renaming">
              {{ renaming ? "Saving…" : "Save changes" }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audiences {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.aud-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.aud-header-text { min-width: 0; }
.aud-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
}
.aud-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.aud-header-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* KPI strip — 3 cards */
.aud-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .aud-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .aud-kpis { grid-template-columns: 1fr; }
}

/* Eyebrow section */
.aud-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.aud-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.aud-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* State rows */
.aud-state {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.aud-state--error { color: var(--color-danger); }
.aud-retry {
  margin-left: var(--space-3);
  background: none;
  border: none;
  color: var(--link-color);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

/* Card grid — 3 cols ≥960px, 2 cols 720-960, 1 col below 720 */
.aud-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-5);
}
@media (max-width: 960px) {
  .aud-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .aud-grid { grid-template-columns: 1fr; }
}

/* Per-card action row (rename / delete) — sits under each card so the card
   itself stays a single clickable NuxtLink. */
.aud-cell { display: flex; flex-direction: column; gap: var(--space-2); }
.aud-cell-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-1);
  padding: 0 var(--space-2);
}

/* Modal */
.aud-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 1000);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: var(--color-scrim, rgba(0, 0, 0, 0.45));
}
.aud-modal {
  width: 100%;
  max-width: 440px;
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, var(--shadow-md));
}
.aud-modal-title {
  margin: 0 0 var(--space-5);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-ink);
}
.aud-field {
  margin-bottom: var(--space-4);
}
.aud-modal-error {
  margin: 0 0 var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-danger);
}
.aud-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-5);
}
</style>
