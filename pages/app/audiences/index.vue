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

const { listAudiences, createAudience } = useAudiences();

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
</script>

<template>
  <div class="audiences">
    <!-- 1. Header -->
    <header class="aud-header">
      <div class="aud-header-text">
        <h1>Audiences</h1>
        <p class="aud-lede">Contact lists you can send campaigns to.</p>
      </div>
      <button type="button" class="aud-cta" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New audience</span>
      </button>
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
      <div v-else-if="audiences.length === 0" class="aud-empty">
        <h2 class="aud-empty-title">No audiences yet</h2>
        <p class="aud-empty-lede">
          Create your first audience to start collecting contacts and sending
          campaigns.
        </p>
        <button type="button" class="aud-cta" @click="openCreate">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
          <span>New audience</span>
        </button>
      </div>

      <!-- Grid -->
      <div v-else class="aud-grid">
        <AppAudienceCard
          v-for="a in audiences"
          :key="a.id"
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
      </div>
    </section>

    <!-- Create modal -->
    <div v-if="showCreate" class="aud-modal-backdrop" @mousedown.self="closeCreate">
      <div class="aud-modal" role="dialog" aria-modal="true" aria-labelledby="aud-modal-title">
        <h2 id="aud-modal-title" class="aud-modal-title">New audience</h2>
        <form @submit.prevent="submitCreate">
          <label class="aud-field">
            <span class="aud-field-label">Name</span>
            <input
              v-model="newName"
              class="aud-input"
              type="text"
              maxlength="80"
              placeholder="e.g. Newsletter subscribers"
              autofocus
            />
          </label>
          <label class="aud-field">
            <span class="aud-field-label">Description <span class="aud-field-opt">(optional)</span></span>
            <input
              v-model="newDescription"
              class="aud-input"
              type="text"
              placeholder="What is this list for?"
            />
          </label>
          <p v-if="createError" class="aud-modal-error">{{ createError }}</p>
          <div class="aud-modal-actions">
            <button type="button" class="aud-btn aud-btn--ghost" :disabled="creating" @click="closeCreate">
              Cancel
            </button>
            <button type="submit" class="aud-btn aud-btn--primary" :disabled="creating">
              {{ creating ? "Creating…" : "Create audience" }}
            </button>
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
.aud-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.aud-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.aud-cta:active {
  transform: translateY(1px);
}
.aud-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
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

/* Empty state */
.aud-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface);
  border: 1px dashed var(--color-rule-strong);
  border-radius: var(--radius-lg);
}
.aud-empty-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-ink);
}
.aud-empty-lede {
  margin: 0 0 var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  max-width: 46ch;
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
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.aud-field-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.aud-field-opt {
  font-weight: 400;
  color: var(--color-ink-dim);
}
.aud-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  min-height: var(--field-height);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  outline: none;
  transition: border-color var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}
.aud-input:focus-visible {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
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
.aud-btn {
  padding: var(--space-2) var(--space-5);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out);
}
.aud-btn:disabled { opacity: 0.6; cursor: default; }
.aud-btn--primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
}
.aud-btn--primary:not(:disabled):hover { background: var(--btn-primary-hover); }
.aud-btn--ghost {
  background: transparent;
  color: var(--color-ink-soft);
  border-color: var(--color-rule);
}
.aud-btn--ghost:not(:disabled):hover { background: var(--color-surface-sunk); }
</style>
