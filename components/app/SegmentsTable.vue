<script setup>
// Segments list table. Each row navigates to /app/segments/{id}. Built on the
// shared <TableShell>; hover state is provided by TableShell. The Rule column
// renders in mono and truncates with a `title` attr exposing the full text.
// Audience cells render as a neutral <Pill>. Counts use tabular numerals; an
// em-dash placeholder for empty lastUsed cells uses --color-ink-dim.
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
  <TableShell>
    <template #head>
      <th class="seg-cell-name">Name</th>
      <th>Audience</th>
      <th>Rule</th>
      <th>Contacts</th>
      <th>Last used</th>
    </template>
    <template #body>
      <tr
        v-for="s in segments"
        :key="s.id"
        class="seg-body"
        @click="navigateTo(`/app/segments/${s.id}`)"
      >
        <td class="seg-cell-name" :title="s.name">{{ truncate(s.name, 30) }}</td>
        <td>
          <Pill tone="neutral">{{ s.audience }}</Pill>
        </td>
        <td class="seg-cell-rule" :title="s.rule">{{ truncate(s.rule, 50) }}</td>
        <td class="seg-cell-num tabular">{{ formatCount(s.count) }}</td>
        <td
          class="seg-cell-last tabular"
          :class="{ 'seg-cell-empty': s.lastUsed === '—' }"
        >{{ s.lastUsed }}</td>
      </tr>
    </template>
  </TableShell>
</template>

<style scoped>
.seg-body {
  cursor: pointer;
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
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
</style>
