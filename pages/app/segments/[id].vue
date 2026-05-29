<script setup lang="ts">
// Segment editor / builder. Handles BOTH create (id === "new") and edit
// (id === a Segment objectId). Builds a rule tree via AppSegmentRuleBuilder,
// shows a debounced live preview count + sample, and saves create/update.
import { useSegments, type SegmentRules, type SegmentSampleRow } from "~/composables/app/useSegments";
import { useCustomFields, type CustomField } from "~/composables/app/useCustomFields";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

const route = useRoute();
const router = useRouter();
const id = computed(() => String(route.params.id || "new"));
const isNew = computed(() => id.value === "new");

const { getSegment, createSegment, updateSegment, evaluateSegment } = useSegments();
const { listCustomFields } = useCustomFields();

useHead({ title: () => (isNew.value ? "New segment" : "Edit segment") });

// ── form state ────────────────────────────────────────────────────────────────
const name = ref("");
const kind = ref<"dynamic" | "static">("dynamic");
const rules = ref<SegmentRules>({ op: "and", conditions: [] });
const customFields = ref<CustomField[]>([]);

const loading = ref(true);
const loadError = ref("");
const saving = ref(false);
const saveError = ref("");

// ── preview ──────────────────────────────────────────────────────────────────
const previewCount = ref<number | null>(null);
const previewSample = ref<SegmentSampleRow[]>([]);
const previewing = ref(false);
const previewError = ref("");

let previewTimer: ReturnType<typeof setTimeout> | null = null;

async function runPreview() {
  previewError.value = "";
  previewing.value = true;
  try {
    const res = await evaluateSegment({ rules: rules.value, preview: true });
    previewCount.value = res.count;
    previewSample.value = res.sample;
  } catch (err) {
    previewError.value = (err as Error)?.message || "Could not preview this rule.";
    previewCount.value = null;
    previewSample.value = [];
  } finally {
    previewing.value = false;
  }
}

function schedulePreview() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(runPreview, 400);
}

// Re-run the preview whenever the rule tree changes (debounced).
watch(rules, schedulePreview, { deep: true });

// ── load ──────────────────────────────────────────────────────────────────────
onMounted(async () => {
  try {
    // Registry always loads (the builder needs it to offer custom fields).
    customFields.value = await listCustomFields();

    if (!isNew.value) {
      const seg = await getSegment(id.value);
      name.value = seg.name;
      kind.value = seg.kind;
      rules.value = seg.rules && Array.isArray(seg.rules.conditions)
        ? seg.rules
        : { op: "and", conditions: [] };
    }
  } catch (err) {
    loadError.value = (err as Error)?.message || "Failed to load.";
  } finally {
    loading.value = false;
  }
  // Kick off an initial preview.
  runPreview();
});

onBeforeUnmount(() => {
  if (previewTimer) clearTimeout(previewTimer);
});

// ── save ────────────────────────────────────────────────────────────────────--
const canSave = computed(() => name.value.trim().length > 0 && !saving.value);

async function save() {
  if (!canSave.value) {
    saveError.value = "Give your segment a name first.";
    return;
  }
  saveError.value = "";
  saving.value = true;
  try {
    if (isNew.value) {
      const created = await createSegment({
        name: name.value.trim(),
        kind: kind.value,
        rules: rules.value,
      });
      // Navigate to the saved segment's editor so the URL reflects its id.
      await router.replace(`/app/segments/${created.id}`);
    } else {
      await updateSegment({
        id: id.value,
        name: name.value.trim(),
        kind: kind.value,
        rules: rules.value,
      });
      await router.push("/app/segments");
    }
  } catch (err) {
    saveError.value = (err as Error)?.message || "Could not save the segment.";
  } finally {
    saving.value = false;
  }
}

function cancel() {
  router.push("/app/segments");
}

function contactName(row: { firstName: string | null; lastName: string | null }) {
  const n = [row.firstName, row.lastName].filter(Boolean).join(" ");
  return n || "";
}

const fmtCount = (n: number) => new Intl.NumberFormat("en-US").format(n);
</script>

<template>
  <div class="se">
    <!-- header -->
    <header class="se-header">
      <div class="se-header-text">
        <NuxtLink to="/app/segments" class="se-back">← Segments</NuxtLink>
        <h1>{{ isNew ? "New segment" : "Edit segment" }}</h1>
      </div>
      <div class="se-header-actions">
        <Button variant="ghost" @click="cancel">Cancel</Button>
        <Button variant="primary" :disabled="!canSave" :loading="saving" @click="save">
          {{ saving ? "Saving…" : (isNew ? "Create segment" : "Save changes") }}
        </Button>
      </div>
    </header>

    <p v-if="loadError" class="se-state se-state-error">{{ loadError }}</p>

    <template v-else-if="!loading">
      <div class="se-grid">
        <!-- left: builder -->
        <div class="se-main">
          <!-- name + type -->
          <section class="se-card">
            <label class="se-label" for="seg-name">Segment name</label>
            <input
              id="seg-name"
              v-model="name"
              class="se-name-input"
              type="text"
              placeholder="e.g. Engaged gmail subscribers"
            />

            <div class="se-kind">
              <span class="se-label">Type</span>
              <label class="se-radio">
                <input type="radio" value="dynamic" v-model="kind" />
                <span>
                  <strong>Dynamic</strong>
                  <em>Re-evaluates on every send — stays fresh.</em>
                </span>
              </label>
              <label class="se-radio">
                <input type="radio" value="static" v-model="kind" />
                <span>
                  <strong>Static</strong>
                  <em>Snapshots matching contacts now; never changes.</em>
                </span>
              </label>
            </div>
          </section>

          <!-- rule builder -->
          <section class="se-card">
            <div class="se-eyebrow">
              <span class="se-eyebrow-dot" aria-hidden="true"></span>
              <span>Conditions</span>
            </div>
            <AppSegmentRuleBuilder v-model="rules" :custom-fields="customFields" />
          </section>

          <p v-if="saveError" class="se-state se-state-error">{{ saveError }}</p>
        </div>

        <!-- right: live preview -->
        <aside class="se-preview">
          <div class="se-eyebrow">
            <span class="se-eyebrow-dot" aria-hidden="true"></span>
            <span>Live preview</span>
          </div>
          <div class="se-card se-preview-card">
            <div class="se-count">
              <span v-if="previewing" class="se-count-num se-count-dim">…</span>
              <span v-else-if="previewError" class="se-count-num se-count-dim">—</span>
              <span v-else class="se-count-num">{{ previewCount == null ? "—" : fmtCount(previewCount) }}</span>
              <span class="se-count-label">matching contacts</span>
            </div>

            <p v-if="previewError" class="se-preview-err">{{ previewError }}</p>

            <div v-else-if="previewSample.length" class="se-sample">
              <div class="se-sample-head">Sample</div>
              <ul class="se-sample-list">
                <li v-for="row in previewSample" :key="row.id" class="se-sample-row">
                  <span class="se-sample-email">{{ row.email }}</span>
                  <span v-if="contactName(row)" class="se-sample-name">{{ contactName(row) }}</span>
                  <span class="se-sample-status">{{ row.status || "—" }}</span>
                </li>
              </ul>
            </div>
            <p v-else-if="!previewing" class="se-sample-empty">No contacts match yet.</p>
          </div>
        </aside>
      </div>
    </template>

    <p v-else class="se-state">Loading…</p>
  </div>
</template>

<style scoped>
.se {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* header */
.se-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.se-back {
  display: inline-block;
  margin-bottom: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  text-decoration: none;
}
.se-back:hover { color: var(--color-pop); }
.se-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0;
  color: var(--color-ink);
}
.se-header-actions {
  display: inline-flex;
  gap: var(--space-3);
}

.se-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-md);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
.se-btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  box-shadow: var(--shadow-sm);
}
.se-btn-primary:hover:not(:disabled) { background: var(--btn-primary-hover); box-shadow: var(--shadow-md); }
.se-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.se-btn-ghost {
  background: var(--color-surface);
  color: var(--color-ink-soft);
  border-color: var(--color-rule);
}
.se-btn-ghost:hover { background: var(--color-surface-2); }

/* layout */
.se-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--space-6);
  align-items: start;
}
@media (max-width: 900px) {
  .se-grid { grid-template-columns: 1fr; }
}
.se-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.se-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.se-label {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.se-name-input {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--color-ink);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
}
.se-name-input:focus-visible {
  outline: none;
  border-color: var(--color-pop);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

.se-kind {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.se-radio {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  cursor: pointer;
}
.se-radio input { margin-top: 3px; accent-color: var(--color-pop); }
.se-radio span { display: flex; flex-direction: column; }
.se-radio strong {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.se-radio em {
  font-style: normal;
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
}

.se-eyebrow {
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
.se-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* preview */
.se-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  position: sticky;
  top: var(--space-5);
}
.se-preview-card { gap: var(--space-4); }
.se-count {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.se-count-num {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  color: var(--color-pop);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.se-count-dim { color: var(--color-ink-dim); }
.se-count-label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.se-preview-err {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-danger);
}
.se-sample {
  border-top: 1px solid var(--color-rule);
  padding-top: var(--space-4);
}
.se-sample-head {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
  margin-bottom: var(--space-3);
}
.se-sample-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.se-sample-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-family: var(--font-body);
  font-size: var(--text-sm);
}
.se-sample-email { color: var(--color-ink); font-weight: 500; }
.se-sample-name { color: var(--color-ink-soft); font-size: var(--text-xs); }
.se-sample-status {
  color: var(--color-ink-dim);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
}
.se-sample-empty {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-dim);
}

.se-state {
  margin: 0;
  padding: var(--space-6) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.se-state-error { color: var(--color-danger); }
</style>
