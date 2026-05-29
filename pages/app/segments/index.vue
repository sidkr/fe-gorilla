<script setup lang="ts">
import {
  useSegments,
  type Segment,
  type SegmentRules,
  OPERATOR_LABELS,
} from "~/composables/app/useSegments";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Segments" });

const router = useRouter();
const { listSegments, duplicateSegment, deleteSegment } = useSegments();

const loading = ref(true);
const loadError = ref("");
const rawSegments = ref<Segment[]>([]);
const actionError = ref("");
const busyId = ref<string | null>(null);

// Render a rule tree into the compact mono string the table column shows.
// e.g. { op:"and", conditions:[{field:"email",operator:"contains",value:"@gmail.com"}] }
//      → "email contains \"@gmail.com\""
// Operator labels come from the shared map in useSegments (single source).
const OP_LABELS = OPERATOR_LABELS;

function summarizeCondition(c: { field: string; operator: string; value?: unknown }): string {
  const op = OP_LABELS[c.operator] || c.operator;
  if (c.operator === "is_empty" || c.operator === "is_not_empty") {
    return `${c.field} ${op}`;
  }
  if (c.operator === "last_n_days") {
    return `${c.field} in last ${c.value} days`;
  }
  const v =
    typeof c.value === "string" ? `"${c.value}"` : JSON.stringify(c.value);
  return `${c.field} ${op} ${v}`;
}

function summarizeRules(rules: SegmentRules | null): string {
  if (!rules || !Array.isArray(rules.conditions) || rules.conditions.length === 0) {
    return "all contacts";
  }
  const joiner = rules.op === "or" ? " OR " : " AND ";
  return rules.conditions
    .map((c) =>
      "op" in c && (c.op === "and" || c.op === "or")
        ? `(${summarizeRules(c as SegmentRules)})`
        : summarizeCondition(c as { field: string; operator: string; value?: unknown }),
    )
    .join(joiner);
}

function formatDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// Map the cloud-fn shape → the row shape the table renders.
const segments = computed(() =>
  rawSegments.value.map((s) => ({
    id: s.id,
    name: s.name,
    audience: s.list ? s.listName || "List" : "All subscribers",
    rule: summarizeRules(s.rules),
    count: s.lastCount ?? 0,
    kind: s.kind,
    lastUsed: formatDate(s.lastEvaluatedAt),
    raw: s,
  })),
);

function truncate(value: string, max: number): string {
  if (!value) return "";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}
const fmtCount = (n: number) => new Intl.NumberFormat("en-US").format(n);

async function reload() {
  rawSegments.value = await listSegments();
}

function edit(id: string) {
  router.push(`/app/segments/${id}`);
}

async function duplicate(seg: Segment) {
  actionError.value = "";
  busyId.value = seg.id;
  try {
    await duplicateSegment(seg);
    await reload();
  } catch (err) {
    actionError.value = (err as Error)?.message || "Could not duplicate.";
  } finally {
    busyId.value = null;
  }
}

async function remove(seg: Segment) {
  if (!confirm(`Delete segment "${seg.name}"? This cannot be undone.`)) return;
  actionError.value = "";
  busyId.value = seg.id;
  try {
    await deleteSegment(seg.id);
    await reload();
  } catch (err) {
    actionError.value = (err as Error)?.message || "Could not delete.";
  } finally {
    busyId.value = null;
  }
}

onMounted(async () => {
  try {
    await reload();
  } catch (err) {
    loadError.value = (err as Error)?.message || "Failed to load segments.";
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="segments">
    <!-- 1. Header -->
    <header class="seg-header">
      <div class="seg-header-text">
        <h1>Segments</h1>
        <p class="seg-lede">Saved slices of your audiences, sendable like a list.</p>
      </div>
      <NuxtLink to="/app/segments/new" class="seg-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New segment</span>
      </NuxtLink>
    </header>

    <!-- 2. Brief explainer card -->
    <section class="seg-section">
      <div class="seg-eyebrow">
        <span class="seg-eyebrow-dot" aria-hidden="true"></span>
        <span>What's a segment</span>
      </div>
      <div class="seg-explainer">
        <div class="seg-explainer-icon" aria-hidden="true">
          <!-- Venn-diagram glyph: two overlapping circles -->
          <svg width="28" height="28" viewBox="0 0 28 28">
            <circle cx="11" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="17" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </div>
        <p class="seg-explainer-text">
          Segments are dynamic rules over your audiences. They re-evaluate before every send, so your recipient list stays fresh as people subscribe, engage, or drift away.
        </p>
      </div>
    </section>

    <!-- 3. Segments table -->
    <section class="seg-section">
      <div class="seg-eyebrow">
        <span class="seg-eyebrow-dot" aria-hidden="true"></span>
        <span>All segments &middot; {{ segments.length }}</span>
      </div>
      <p v-if="actionError" class="seg-state seg-state-error">{{ actionError }}</p>
      <div class="seg-card seg-card-flush">
        <p v-if="loading" class="seg-state">Loading segments…</p>
        <p v-else-if="loadError" class="seg-state seg-state-error">{{ loadError }}</p>
        <p v-else-if="segments.length === 0" class="seg-state">
          No segments yet. Create your first to slice your audience.
        </p>
        <div v-else class="tbl">
          <div class="tbl-row tbl-head" role="row">
            <div class="tbl-cell tbl-name">Name</div>
            <div class="tbl-cell tbl-type">Type</div>
            <div class="tbl-cell tbl-rule">Rule</div>
            <div class="tbl-cell tbl-num">Contacts</div>
            <div class="tbl-cell tbl-last">Last used</div>
            <div class="tbl-cell tbl-actions" aria-hidden="true"></div>
          </div>
          <div v-for="s in segments" :key="s.id" class="tbl-row tbl-body" role="row">
            <NuxtLink :to="`/app/segments/${s.id}`" class="tbl-cell tbl-name tbl-link" :title="s.name">
              {{ truncate(s.name, 30) }}
            </NuxtLink>
            <div class="tbl-cell tbl-type">
              <span class="tbl-chip" :class="`tbl-chip-${s.kind}`">{{ s.kind }}</span>
            </div>
            <div class="tbl-cell tbl-rule" :title="s.rule">{{ truncate(s.rule, 50) }}</div>
            <div class="tbl-cell tbl-num tabular">{{ fmtCount(s.count) }}</div>
            <div class="tbl-cell tbl-last tabular" :class="{ 'tbl-empty': s.lastUsed === '—' }">{{ s.lastUsed }}</div>
            <div class="tbl-cell tbl-actions">
              <button type="button" class="tbl-act" :disabled="busyId === s.id" title="Edit" @click="edit(s.id)">Edit</button>
              <button type="button" class="tbl-act" :disabled="busyId === s.id" title="Duplicate" @click="duplicate(s.raw)">Duplicate</button>
              <button type="button" class="tbl-act tbl-act-danger" :disabled="busyId === s.id" title="Delete" @click="remove(s.raw)">Delete</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.segments {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.seg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.seg-header-text { min-width: 0; }
.seg-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.seg-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.seg-cta {
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
.seg-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.seg-cta:active {
  transform: translateY(1px);
}
.seg-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* Sections */
.seg-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.seg-eyebrow {
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
.seg-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Card surfaces */
.seg-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.seg-card-flush { padding: 0; }

/* Loading / empty / error states inside the table card */
.seg-state {
  margin: 0;
  padding: var(--space-6) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  text-align: center;
}
.seg-state-error {
  color: var(--color-danger, var(--color-ink));
}

/* Table (mirrors AppSegmentsTable, plus a Type chip + Actions column) */
.tbl { display: flex; flex-direction: column; }
.tbl-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.3fr)
    minmax(80px, 0.5fr)
    minmax(0, 1.5fr)
    minmax(80px, 0.5fr)
    minmax(100px, 0.6fr)
    minmax(200px, 0.9fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  color: var(--color-ink);
}
.tbl-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.tbl-head .tbl-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.tbl-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
}
.tbl-body:last-child { border-bottom: none; }
.tbl-body:hover { background: var(--color-surface-2); }
.tbl-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.tbl-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.tbl-link { text-decoration: none; }
.tbl-link:hover { color: var(--color-pop); }
.tbl-rule {
  font-family: var(--font-mono);
  color: var(--color-ink-soft);
}
.tbl-num, .tbl-last { font-family: var(--font-mono); }
.tbl-num { color: var(--color-ink); }
.tbl-last { color: var(--color-ink-soft); }
.tbl-empty { color: var(--color-ink-dim); }
.tabular { font-variant-numeric: tabular-nums; }
.tbl-chip {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  border-radius: var(--radius-pill);
  text-transform: capitalize;
}
.tbl-chip-dynamic { background: var(--color-pop-glow); color: var(--color-pop); }
.tbl-chip-static { background: var(--color-surface-2); color: var(--color-ink-soft); }
.tbl-actions {
  display: inline-flex;
  gap: var(--space-2);
  justify-content: flex-end;
  overflow: visible;
}
.tbl-act {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  background: transparent;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.tbl-act:hover:not(:disabled) { background: var(--color-surface); border-color: var(--color-ink-dim); color: var(--color-ink); }
.tbl-act:disabled { opacity: 0.5; cursor: not-allowed; }
.tbl-act-danger:hover:not(:disabled) {
  background: var(--color-danger-bg);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* Explainer card */
.seg-explainer {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
}
.seg-explainer-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  color: var(--color-pop);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.seg-explainer-text {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
</style>
