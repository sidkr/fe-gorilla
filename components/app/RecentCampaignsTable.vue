<script setup>
// Recent campaigns list. Each row navigates to /app/campaigns/{id}. Built on the
// shared <TableShell>; numerals use tabular-nums so the rate columns visually
// align.
defineProps({
  campaigns: {
    type: Array,
    required: true,
    // { id, name, status, sent, openRate, clickRate }
  },
});
</script>

<template>
  <TableShell>
    <template #head>
      <th class="rct-cell-name">Name</th>
      <th>Status</th>
      <th>Sent</th>
      <th class="rct-cell-num">Open rate</th>
      <th class="rct-cell-num">Click rate</th>
    </template>
    <template #body>
      <tr
        v-for="c in campaigns"
        :key="c.id"
        class="rct-body"
        @click="navigateTo(`/app/campaigns/${c.id}`)"
      >
        <td class="rct-cell-name">{{ c.name }}</td>
        <td>
          <Pill tone="brand">{{ c.status }}</Pill>
        </td>
        <td class="rct-cell-sent tabular">{{ c.sent }}</td>
        <td class="rct-cell-num tabular">{{ c.openRate }}</td>
        <td class="rct-cell-num tabular">{{ c.clickRate }}</td>
      </tr>
    </template>
  </TableShell>
</template>

<style scoped>
.rct-body {
  cursor: pointer;
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
  text-align: right;
}
:deep(thead th.rct-cell-num) {
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
