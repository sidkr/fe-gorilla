<script setup>
// Recent campaigns list. Each row is a link to /app/campaigns/{id}. Hover
// state shades the row with --color-surface-2. Numerals use tabular-nums so
// the rate columns visually align.
defineProps({
  campaigns: {
    type: Array,
    required: true,
    // { id, name, status, sent, openRate, clickRate }
  },
});
</script>

<template>
  <div class="rct">
    <div class="rct-row rct-head" role="row">
      <div class="rct-cell rct-cell-name">Name</div>
      <div class="rct-cell rct-cell-status">Status</div>
      <div class="rct-cell rct-cell-sent">Sent</div>
      <div class="rct-cell rct-cell-num">Open rate</div>
      <div class="rct-cell rct-cell-num">Click rate</div>
    </div>

    <NuxtLink
      v-for="c in campaigns"
      :key="c.id"
      :to="`/app/campaigns/${c.id}`"
      class="rct-row rct-body"
      role="row"
    >
      <div class="rct-cell rct-cell-name">{{ c.name }}</div>
      <div class="rct-cell rct-cell-status">
        <span class="rct-pill">{{ c.status }}</span>
      </div>
      <div class="rct-cell rct-cell-sent tabular">{{ c.sent }}</div>
      <div class="rct-cell rct-cell-num tabular">{{ c.openRate }}</div>
      <div class="rct-cell rct-cell-num tabular">{{ c.clickRate }}</div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.rct {
  display: flex;
  flex-direction: column;
}
.rct-row {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(80px, 0.6fr) minmax(120px, 0.7fr) minmax(90px, 0.6fr) minmax(90px, 0.6fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  text-decoration: none;
  color: var(--color-ink);
}
.rct-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.rct-head .rct-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.rct-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
  cursor: pointer;
}
.rct-body:last-child {
  border-bottom: none;
}
.rct-body:hover {
  background: var(--color-surface-2);
}
.rct-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.rct-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.rct-cell-sent {
  color: var(--color-ink-soft);
  font-family: var(--font-mono);
}
.rct-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.rct-pill {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  border-radius: var(--radius-pill);
  line-height: 1.2;
}
</style>
