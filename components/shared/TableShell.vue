<script setup lang="ts">
// Shared table chrome — the Card-like wrapper + header/body row styling reused
// across CampaignsTable / ReportsTable / SegmentsTable and the inline
// senders/fields/contacts tables. It does NOT define columns: consumers fill
// the `#head` (thead row) and `#body` (tbody rows) slots, and this component
// styles the slotted th/td via :deep(). Pass `dense` for tighter padding.
defineProps({
  dense: { type: Boolean, default: false },
});
</script>

<template>
  <div class="table-shell">
    <table :class="{ dense }">
      <thead>
        <tr>
          <slot name="head" />
        </tr>
      </thead>
      <tbody>
        <slot name="body" />
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-shell {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  /* Scroll wide tables horizontally on narrow viewports instead of clipping
     columns; the radius still clips the corners. */
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

:deep(thead th) {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-ink-dim);
  font-weight: 600;
  text-align: left;
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-rule);
}

:deep(tbody td) {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-rule);
  font-size: var(--text-sm);
  color: var(--color-ink);
  vertical-align: middle;
}

:deep(tbody tr:hover) {
  background: var(--color-surface-2);
}

:deep(tbody tr:last-child td) {
  border-bottom: none;
}

/* Tighter padding when dense */
table.dense :deep(thead th),
table.dense :deep(tbody td) {
  padding: var(--space-2) var(--space-3);
}
</style>
