<script setup>
// Per-campaign performance table card. Renders `data` (SampleCampaignRow[]) as a
// "Recent campaign reports" table. In REAL mode each row is a NuxtLink to the
// campaign report; in DEMO mode rows are sample data — non-clickable, with a
// "Sample" pill in the header. `loading` shows a skeleton; the empty state only
// appears for a real, loaded, empty dataset.
//
// Styling mirrors the historical `.rcr` table from pages/app/reports/index.vue.
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
//   >= 50% -> "good" green tint
//   40–50% -> neutral
//   < 40%  -> warn tint
function openRateTone(fraction) {
  const pct = (fraction || 0) * 100;
  if (pct >= 50) return "good";
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
      <span v-if="demo" class="rep-sample-pill">Sample</span>
    </div>

    <!-- Loading: skeleton card -->
    <div v-if="loading" class="rep-card" aria-busy="true">
      <div class="rcr">
        <div class="rcr-row rcr-head" role="row">
          <div class="rcr-cell rcr-cell-name">Campaign</div>
          <div class="rcr-cell rcr-cell-sent">Sent date</div>
          <div class="rcr-cell rcr-cell-num">Recipients</div>
          <div class="rcr-cell rcr-cell-num">Open rate</div>
          <div class="rcr-cell rcr-cell-num">Click rate</div>
          <div class="rcr-cell rcr-cell-num">Bounce rate</div>
          <div class="rcr-cell rcr-cell-num">Unsub rate</div>
        </div>
        <div v-for="n in skeletonRows" :key="n" class="rcr-row rcr-body" role="row" aria-hidden="true">
          <div class="rcr-cell rcr-cell-name"><span class="sk sk-wide"></span></div>
          <div class="rcr-cell rcr-cell-sent"><span class="sk"></span></div>
          <div class="rcr-cell rcr-cell-num"><span class="sk sk-num"></span></div>
          <div class="rcr-cell rcr-cell-num"><span class="sk sk-num"></span></div>
          <div class="rcr-cell rcr-cell-num"><span class="sk sk-num"></span></div>
          <div class="rcr-cell rcr-cell-num"><span class="sk sk-num"></span></div>
          <div class="rcr-cell rcr-cell-num"><span class="sk sk-num"></span></div>
        </div>
      </div>
    </div>

    <!-- Empty: real (non-demo) dataset that loaded with no rows -->
    <div v-else-if="!demo && !data.length" class="rep-card">
      <p class="rep-empty">No campaign reports yet. Once you send a campaign, its performance will appear here.</p>
    </div>

    <!-- Populated table -->
    <div v-else class="rep-card">
      <div class="rcr">
        <div class="rcr-row rcr-head" role="row">
          <div class="rcr-cell rcr-cell-name">Campaign</div>
          <div class="rcr-cell rcr-cell-sent">Sent date</div>
          <div class="rcr-cell rcr-cell-num">Recipients</div>
          <div class="rcr-cell rcr-cell-num">Open rate</div>
          <div class="rcr-cell rcr-cell-num">Click rate</div>
          <div class="rcr-cell rcr-cell-num">Bounce rate</div>
          <div class="rcr-cell rcr-cell-num">Unsub rate</div>
        </div>

        <!-- REAL mode: each row links to its campaign report -->
        <template v-if="!demo">
          <NuxtLink
            v-for="r in data"
            :key="r.id"
            :to="`/app/campaigns/${r.id}`"
            class="rcr-row rcr-body is-link"
            role="row"
          >
            <div class="rcr-cell rcr-cell-name" :title="r.name">{{ truncate(r.name) }}</div>
            <div class="rcr-cell rcr-cell-sent tabular">{{ fmtDate(r.sentAt) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtNum(r.recipients) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">
              <span class="rcr-rate" :class="`is-${openRateTone(r.openRate)}`">{{ fmtPct(r.openRate) }}</span>
            </div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.clickRate) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.bounceRate) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.unsubRate) }}</div>
          </NuxtLink>
        </template>

        <!-- DEMO mode: sample rows are non-clickable plain rows -->
        <template v-else>
          <div
            v-for="r in data"
            :key="r.id"
            class="rcr-row rcr-body"
            role="row"
          >
            <div class="rcr-cell rcr-cell-name" :title="r.name">{{ truncate(r.name) }}</div>
            <div class="rcr-cell rcr-cell-sent tabular">{{ fmtDate(r.sentAt) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtNum(r.recipients) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">
              <span class="rcr-rate" :class="`is-${openRateTone(r.openRate)}`">{{ fmtPct(r.openRate) }}</span>
            </div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.clickRate) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.bounceRate) }}</div>
            <div class="rcr-cell rcr-cell-num tabular">{{ fmtPct(r.unsubRate) }}</div>
          </div>
        </template>
      </div>
    </div>
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
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  margin-left: var(--space-1);
  border-radius: var(--radius-pill);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  text-transform: none;
  line-height: 1;
}

.rep-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.rep-empty {
  margin: 0;
  padding: var(--space-6) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  text-align: center;
}

/* Recent campaign reports table */
.rcr {
  display: flex;
  flex-direction: column;
}
.rcr-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.7fr)
    minmax(110px, 0.8fr)
    minmax(90px, 0.7fr)
    minmax(90px, 0.7fr)
    minmax(90px, 0.7fr)
    minmax(100px, 0.7fr)
    minmax(90px, 0.7fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  text-decoration: none;
  color: var(--color-ink);
}
.rcr-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.rcr-head .rcr-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.rcr-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
}
.rcr-body:last-child { border-bottom: none; }
.rcr-body.is-link { cursor: pointer; }
.rcr-body.is-link:hover { background: var(--color-surface-2); }
.rcr-body.is-link:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

.rcr-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.rcr-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.rcr-cell-sent {
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
}
.rcr-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}

/* Inline tinted rate pill — open rate uses this for tone-coding. */
.rcr-rate {
  display: inline-block;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-pill);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.rcr-rate.is-good {
  color: var(--color-ok);
  background: var(--color-ok-bg);
}
.rcr-rate.is-warn {
  color: var(--color-warn);
  background: var(--color-warn-bg);
}
.rcr-rate.is-neutral {
  color: var(--color-ink);
  background: transparent;
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

/* Horizontal scroll fallback below ~960px — preserves all 7 columns
   without forcing each cell into an unreadable squish. */
@media (max-width: 960px) {
  .rep-card { overflow-x: auto; }
  .rcr { min-width: 760px; }
}
</style>
