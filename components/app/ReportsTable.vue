<script setup>
// Per-campaign performance table card. Renders `data` (SampleCampaignRow[]) as a
// "Recent campaign reports" table built on the shared <TableShell>. In REAL mode
// each row navigates to the campaign report; in DEMO mode rows are sample data —
// non-clickable, with a "Sample" pill in the header. `loading` shows a skeleton;
// the empty state only appears for a real, loaded, empty dataset.
const props = defineProps({
  data: { type: Array, default: () => [] },
  demo: { type: Boolean, default: false },
  loading: { type: Boolean, default: false },
});

// ── Formatters ──────────────────────────────────────────────────────────────
function fmtNum(n) {
  return Number(n || 0).toLocaleString("en-US");
}
function fmtPct(fraction) {
  return `${((fraction || 0) * 100).toFixed(1)}%`;
}
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Truncate long campaign names so the row doesn't blow up on small screens.
function truncate(s, max = 36) {
  const str = String(s || "");
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// Open-rate color tinting policy (operates on the raw 0..1 fraction):
//   >= 50% -> "success" green tint
//   40–50% -> neutral (plain text, no pill chrome)
//   < 40%  -> "warn" tint
function openRateTone(fraction) {
  const pct = (fraction || 0) * 100;
  if (pct >= 50) return "success";
  if (pct < 40) return "warn";
  return "neutral";
}

// Skeleton placeholder rows while loading.
const skeletonRows = 5;
</script>

<template>
  <section class="rep-section" aria-label="Recent campaign reports">
    <div class="rep-eyebrow">
      <span class="rep-eyebrow-dot" aria-hidden="true"></span>
      <span>Recent campaign reports</span>
      <Pill v-if="demo" tone="brand" class="rep-sample-pill">Sample</Pill>
    </div>

    <!-- Loading: skeleton table -->
    <TableShell v-if="loading" aria-busy="true">
      <template #head>
        <th class="rep-cell-name">Campaign</th>
        <th>Sent date</th>
        <th class="rep-cell-num">Recipients</th>
        <th class="rep-cell-num">Open rate</th>
        <th class="rep-cell-num">Click rate</th>
        <th class="rep-cell-num">Bounce rate</th>
        <th class="rep-cell-num">Unsub rate</th>
      </template>
      <template #body>
        <tr v-for="n in skeletonRows" :key="n" aria-hidden="true">
          <td class="rep-cell-name"><span class="sk sk-wide"></span></td>
          <td><span class="sk"></span></td>
          <td class="rep-cell-num"><span class="sk sk-num"></span></td>
          <td class="rep-cell-num"><span class="sk sk-num"></span></td>
          <td class="rep-cell-num"><span class="sk sk-num"></span></td>
          <td class="rep-cell-num"><span class="sk sk-num"></span></td>
          <td class="rep-cell-num"><span class="sk sk-num"></span></td>
        </tr>
      </template>
    </TableShell>

    <!-- Empty: real (non-demo) dataset that loaded with no rows -->
    <div v-else-if="!demo && !data.length" class="rep-card">
      <EmptyState
        title="No campaign reports yet"
        subtitle="Once you send a campaign, its performance will appear here."
      />
    </div>

    <!-- Populated table — REAL rows navigate; DEMO rows are non-clickable -->
    <TableShell v-else>
      <template #head>
        <th class="rep-cell-name">Campaign</th>
        <th>Sent date</th>
        <th class="rep-cell-num">Recipients</th>
        <th class="rep-cell-num">Open rate</th>
        <th class="rep-cell-num">Click rate</th>
        <th class="rep-cell-num">Bounce rate</th>
        <th class="rep-cell-num">Unsub rate</th>
      </template>
      <template #body>
        <tr
          v-for="r in data"
          :key="r.id"
          :class="{ 'is-link': !demo }"
          @click="!demo && navigateTo(`/app/campaigns/${r.id}`)"
        >
          <td class="rep-cell-name" :title="r.name">{{ truncate(r.name) }}</td>
          <td class="rep-cell-sent tabular">{{ fmtDate(r.sentAt) }}</td>
          <td class="rep-cell-num tabular">{{ fmtNum(r.recipients) }}</td>
          <td class="rep-cell-num tabular">
            <Pill
              v-if="openRateTone(r.openRate) !== 'neutral'"
              :tone="openRateTone(r.openRate)"
            >{{ fmtPct(r.openRate) }}</Pill>
            <span v-else>{{ fmtPct(r.openRate) }}</span>
          </td>
          <td class="rep-cell-num tabular">{{ fmtPct(r.clickRate) }}</td>
          <td class="rep-cell-num tabular">{{ fmtPct(r.bounceRate) }}</td>
          <td class="rep-cell-num tabular">{{ fmtPct(r.unsubRate) }}</td>
        </tr>
      </template>
    </TableShell>
  </section>
</template>

<style scoped>
.rep-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rep-eyebrow {
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
.rep-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.rep-sample-pill {
  margin-left: var(--space-1);
  text-transform: none;
}

/* Card wrapper kept only for the empty state (TableShell brings its own). */
.rep-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.rep-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.rep-cell-sent {
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
}
.rep-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
:deep(thead th.rep-cell-num) {
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}

/* Clickable rows in REAL mode. */
.is-link {
  cursor: pointer;
}

/* Skeleton shimmer blocks while loading. */
.sk {
  display: inline-block;
  width: 70%;
  height: 0.9em;
  border-radius: var(--radius-sm);
  background: linear-gradient(
    90deg,
    var(--color-surface-2) 0%,
    var(--color-rule) 50%,
    var(--color-surface-2) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.2s ease-in-out infinite;
}
.sk-wide { width: 85%; }
.sk-num { width: 50%; }
@keyframes sk-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
@media (prefers-reduced-motion: reduce) {
  .sk { animation: none; }
}
</style>
