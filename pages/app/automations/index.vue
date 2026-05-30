<script setup>
import { ref, computed, onMounted } from "vue";
import { useAutomations } from "~/composables/app/useAutomations";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Automations" });

const {
  listAutomations,
  activateAutomation,
  pauseAutomation,
  deleteAutomation,
  installRecipe,
  listRecipes,
  createAutomation,
} = useAutomations();

const automations = ref([]);
const summary = ref(null);
const recipes = ref([]);
const loading = ref(true);
const loadError = ref(null);
const actionError = ref(null);
const busyId = ref(null);
const installing = ref(null);
const creating = ref(false);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await listAutomations();
    automations.value = res.automations ?? [];
    summary.value = res.kpis ?? null;
  } catch (e) {
    loadError.value = e?.message || "Could not load automations.";
    automations.value = [];
    summary.value = null;
  } finally {
    loading.value = false;
  }
}

async function loadRecipes() {
  try {
    const res = await listRecipes();
    recipes.value = res.recipes ?? [];
  } catch {
    recipes.value = [];
  }
}

onMounted(() => {
  load();
  loadRecipes();
});

const kpis = computed(() => {
  const s = summary.value;
  return [
    {
      label: "Automations",
      value: String(s?.total ?? 0),
      delta: `${s?.active ?? 0} active`,
      deltaDirection: "neutral",
    },
    {
      label: "Contacts enrolled",
      value: String(s?.enrolled ?? 0),
      delta: (s?.enrolled ?? 0) > 0 ? "All time" : "No enrollments yet",
      deltaDirection: (s?.enrolled ?? 0) > 0 ? "up" : "neutral",
    },
    {
      label: "Drafts",
      value: String(s?.drafts ?? 0),
      delta: (s?.drafts ?? 0) > 0 ? "Not yet live" : "All live",
      deltaDirection: "neutral",
    },
  ];
});

async function onToggle(a) {
  if (busyId.value) return;
  busyId.value = a.id;
  actionError.value = null;
  try {
    if (a.status === "active") {
      await pauseAutomation(a.id);
      a.status = "paused";
    } else {
      await activateAutomation(a.id);
      a.status = "active";
    }
  } catch (e) {
    actionError.value = e?.message || "Could not change status.";
  } finally {
    busyId.value = null;
  }
}

async function onDelete(a) {
  if (busyId.value) return;
  if (!confirm(`Delete "${a.name}"? This removes its steps and enrollments.`)) return;
  busyId.value = a.id;
  actionError.value = null;
  try {
    await deleteAutomation(a.id);
    automations.value = automations.value.filter((x) => x.id !== a.id);
  } catch (e) {
    actionError.value = e?.message || "Could not delete automation.";
  } finally {
    busyId.value = null;
  }
}

async function onInstall(recipeKey) {
  if (installing.value) return;
  installing.value = recipeKey;
  actionError.value = null;
  try {
    const res = await installRecipe(recipeKey);
    await load();
    if (res?.id) await navigateTo(`/app/automations/${res.id}`);
  } catch (e) {
    actionError.value = e?.message || "Could not install recipe.";
  } finally {
    installing.value = null;
  }
}

async function onCreate() {
  if (creating.value) return;
  creating.value = true;
  actionError.value = null;
  try {
    const a = await createAutomation({ name: "Untitled automation", triggerType: "manual" });
    if (a?.id) await navigateTo(`/app/automations/${a.id}`);
  } catch (e) {
    actionError.value = e?.message || "Could not create automation.";
  } finally {
    creating.value = false;
  }
}

const NAME_MAX = 40;
function truncate(s) {
  if (!s) return "";
  return s.length > NAME_MAX ? s.slice(0, NAME_MAX - 1) + "…" : s;
}

const TRIGGER_LABELS = {
  manual: "Manual",
  contact_added_to_list: "Added to list",
  form_submission: "Form submission",
  date_field: "Date field",
};
function triggerLabel(t) {
  return TRIGGER_LABELS[t?.type] || "Manual";
}
</script>

<template>
  <div class="autos">
    <header class="au-header">
      <div class="au-header-text">
        <h1>Automations</h1>
        <p class="au-lede">
          Set up journeys that send the right email at the right time — automatically.
        </p>
      </div>
      <Button variant="primary" :loading="creating" @click="onCreate">
        <template #leading>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </template>
        New automation
      </Button>
    </header>

    <section class="au-kpis" aria-label="Automation summary">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <div v-if="actionError" class="au-banner au-banner--error" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="au-banner-x" aria-label="Dismiss" @click="actionError = null">×</button>
    </div>

    <!-- Recipes -->
    <section class="au-section">
      <div class="au-eyebrow">
        <span class="au-eyebrow-dot" aria-hidden="true"></span>
        <span>Start from a recipe</span>
      </div>
      <div class="au-recipes">
        <div v-for="r in recipes" :key="r.key" class="au-recipe">
          <div class="au-recipe-body">
            <h3 class="au-recipe-name">{{ r.name }}</h3>
            <p class="au-recipe-desc">{{ r.description }}</p>
            <span class="au-recipe-meta">{{ r.stepCount }} steps</span>
          </div>
          <Button
            variant="secondary"
            :loading="installing === r.key"
            @click="onInstall(r.key)"
          >
            Install
          </Button>
        </div>
        <div v-if="!recipes.length" class="au-recipe au-recipe--empty">
          No recipes available.
        </div>
      </div>
    </section>

    <!-- List -->
    <section class="au-section">
      <div class="au-eyebrow">
        <span class="au-eyebrow-dot" aria-hidden="true"></span>
        <span>Your automations</span>
      </div>

      <div class="au-card">
        <div v-if="loading" class="au-state">Loading automations…</div>
        <div v-else-if="loadError" class="au-state au-state--error">{{ loadError }}</div>
        <div v-else-if="!automations.length" class="au-state">
          No automations yet. Install a recipe above or create one from scratch.
        </div>
        <div v-else class="at">
          <div class="at-row at-head" role="row">
            <div class="at-cell at-cell-name">Name</div>
            <div class="at-cell">Status</div>
            <div class="at-cell">Trigger</div>
            <div class="at-cell at-cell-num">Steps</div>
            <div class="at-cell at-cell-num">Enrolled</div>
            <div class="at-cell at-cell-actions"><span class="sr-only">Actions</span></div>
          </div>

          <div
            v-for="a in automations"
            :key="a.id"
            class="at-row at-body"
            :class="{ 'at-body--busy': busyId === a.id }"
            role="row"
          >
            <NuxtLink :to="`/app/automations/${a.id}`" class="at-cell at-cell-name at-namelink" :title="a.name">
              {{ truncate(a.name) }}
            </NuxtLink>
            <div class="at-cell">
              <AppStatusPill :status="a.status" />
            </div>
            <div class="at-cell at-cell-trigger">{{ triggerLabel(a.trigger) }}</div>
            <div class="at-cell at-cell-num tabular">{{ a.stepCount ?? 0 }}</div>
            <div class="at-cell at-cell-num tabular">{{ a.stats?.enrolled ?? 0 }}</div>
            <div class="at-cell at-cell-actions" @click.stop>
              <Button
                size="sm"
                :variant="a.status === 'active' ? 'ghost' : 'secondary'"
                :disabled="busyId === a.id"
                @click="onToggle(a)"
              >
                {{ a.status === "active" ? "Pause" : "Activate" }}
              </Button>
              <button
                type="button"
                class="at-del"
                :disabled="busyId === a.id"
                :aria-label="`Delete ${a.name}`"
                @click="onDelete(a)"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 4h10M6 4V3h4v1M5 4l.5 9h5L11 4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.autos {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
.au-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.au-header-text { min-width: 0; }
.au-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.au-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.au-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) { .au-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .au-kpis { grid-template-columns: 1fr; } }

.au-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.au-banner--error {
  background: var(--color-danger-bg, var(--color-surface-2));
  color: var(--color-danger, var(--color-ink));
  border: 1px solid var(--color-danger, var(--color-rule));
}
.au-banner-x {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--space-1);
}

.au-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.au-eyebrow {
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
.au-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Recipes grid */
.au-recipes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-4);
}
.au-recipe {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}
.au-recipe--empty {
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
  align-items: center;
  text-align: center;
}
.au-recipe-name {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
}
.au-recipe-desc {
  margin: 0 0 var(--space-3);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  line-height: var(--leading-normal);
}
.au-recipe-meta {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}

/* List card + table */
.au-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: visible;
}
.au-state {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}
.au-state--error { color: var(--color-danger, var(--color-ink-soft)); }

.at { display: flex; flex-direction: column; }
.at-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.8fr)
    minmax(96px, 0.6fr)
    minmax(0, 1fr)
    minmax(72px, 0.5fr)
    minmax(80px, 0.5fr)
    160px;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  color: var(--color-ink);
}
.at-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.at-head .at-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.at-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
.at-body:last-child { border-bottom: none; }
.at-body:hover { background: var(--color-surface-2); }
.at-body--busy { opacity: 0.5; pointer-events: none; }
.at-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.at-cell-name {
  font-weight: 600;
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.at-namelink { text-decoration: none; color: var(--color-ink); display: block; }
.at-namelink:hover { color: var(--color-pop); }
.at-cell-trigger { color: var(--color-ink-soft); }
.at-cell-num { font-family: var(--font-mono); text-align: right; }
.at-cell-actions {
  overflow: visible;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
}
.tabular { font-variant-numeric: tabular-nums; }
.at-del {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.at-del:hover { background: var(--color-danger-bg, var(--color-surface-sunk)); color: var(--color-danger, var(--color-ink)); }
.at-del:disabled { opacity: 0.5; cursor: default; }

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}

@media (max-width: 960px) {
  .at-row {
    grid-template-columns: minmax(0, 1.6fr) minmax(88px, 0.6fr) minmax(64px, 0.5fr) 140px;
    gap: var(--space-3);
  }
  .at-cell-trigger,
  .at-cell-num:last-of-type { display: none; }
}
</style>
