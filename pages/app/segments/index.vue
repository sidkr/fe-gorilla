<script setup lang="ts">
import { useSegments, type Segment, type SegmentRules } from "~/composables/app/useSegments";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Segments" });

const { listSegments } = useSegments();

const loading = ref(true);
const loadError = ref("");
const rawSegments = ref<Segment[]>([]);

// Render a rule tree into the compact mono string the table column shows.
// e.g. { op:"and", conditions:[{field:"email",operator:"contains",value:"@gmail.com"}] }
//      → "email contains \"@gmail.com\""
const OP_LABELS: Record<string, string> = {
  eq: "=",
  neq: "≠",
  contains: "contains",
  starts_with: "starts with",
  ends_with: "ends with",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  in: "in",
  not_in: "not in",
  before: "before",
  after: "after",
  between: "between",
  last_n_days: "in last N days",
};

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

// Map the cloud-fn shape → the row shape AppSegmentsTable expects:
// { id, name, audience, rule, count, lastUsed }.
const segments = computed(() =>
  rawSegments.value.map((s) => ({
    id: s.id,
    name: s.name,
    audience: s.list ? s.listName || "List" : "All subscribers",
    rule: summarizeRules(s.rules),
    count: s.lastCount ?? 0,
    lastUsed: formatDate(s.lastEvaluatedAt),
  })),
);

onMounted(async () => {
  try {
    rawSegments.value = await listSegments();
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
      <div class="seg-card seg-card-flush">
        <p v-if="loading" class="seg-state">Loading segments…</p>
        <p v-else-if="loadError" class="seg-state seg-state-error">{{ loadError }}</p>
        <p v-else-if="segments.length === 0" class="seg-state">
          No segments yet. Create your first to slice your audience.
        </p>
        <AppSegmentsTable v-else :segments="segments" />
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
