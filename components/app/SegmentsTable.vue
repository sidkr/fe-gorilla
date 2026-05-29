<script setup>
// Segments list table. Each row is a link to /app/segments/{id}. Hover state
// shades the row with --color-surface-2. The Rule column renders in mono and
// truncates with a `title` attr exposing the full text. Audience cells render
// as a chip. Counts use tabular numerals; an em-dash placeholder for empty
// lastUsed cells uses --color-ink-dim.
defineProps({
  segments: {
    type: Array,
    required: true,
    // { id, name, audience, rule, count, lastUsed }
  },
});

function truncate(value, max) {
  if (!value) return "";
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function formatCount(n) {
  return new Intl.NumberFormat("en-US").format(n);
}
</script>

<template>
  <div class="seg">
    <div class="seg-row seg-head" role="row">
      <div class="seg-cell seg-cell-name">Name</div>
      <div class="seg-cell seg-cell-audience">Audience</div>
      <div class="seg-cell seg-cell-rule">Rule</div>
      <div class="seg-cell seg-cell-num">Contacts</div>
      <div class="seg-cell seg-cell-last">Last used</div>
    </div>

    <NuxtLink
      v-for="s in segments"
      :key="s.id"
      :to="`/app/segments/${s.id}`"
      class="seg-row seg-body"
      role="row"
    >
      <div class="seg-cell seg-cell-name" :title="s.name">{{ truncate(s.name, 30) }}</div>
      <div class="seg-cell seg-cell-audience">
        <span class="seg-chip">{{ s.audience }}</span>
      </div>
      <div class="seg-cell seg-cell-rule" :title="s.rule">{{ truncate(s.rule, 50) }}</div>
      <div class="seg-cell seg-cell-num tabular">{{ formatCount(s.count) }}</div>
      <div
        class="seg-cell seg-cell-last tabular"
        :class="{ 'seg-cell-empty': s.lastUsed === '—' }"
      >{{ s.lastUsed }}</div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.seg {
  display: flex;
  flex-direction: column;
}
.seg-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.4fr)
    minmax(140px, 0.9fr)
    minmax(0, 1.6fr)
    minmax(90px, 0.6fr)
    minmax(110px, 0.7fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  text-decoration: none;
  color: var(--color-ink);
}
.seg-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.seg-head .seg-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.seg-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
  cursor: pointer;
}
.seg-body:last-child {
  border-bottom: none;
}
.seg-body:hover {
  background: var(--color-surface-2);
}
.seg-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.seg-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.seg-cell-rule {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.seg-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
}
.seg-cell-last {
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
}
.seg-cell-empty {
  color: var(--color-ink-dim);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.seg-chip {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: var(--space-1) var(--space-3);
  background: var(--color-surface-2);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  border-radius: var(--radius-pill);
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
