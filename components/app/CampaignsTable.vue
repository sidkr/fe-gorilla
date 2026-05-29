<script setup>
// CampaignsTable — full campaigns listing for /app/campaigns. Differs from
// the dashboard's RecentCampaignsTable: it has an Audience column, a
// "Sent / created" column that carries both an absolute date and a relative
// time secondary line, and routes Drafts to /edit while Sent/Scheduled go to
// the read-only campaign detail route. Each row is the click target.
// Built on the shared <TableShell>.
import { computed } from "vue";

const props = defineProps({
  campaigns: {
    type: Array,
    required: true,
    // { id, name, status, audience, date, relative, openRate, clickRate }
  },
});

const NAME_MAX = 36;

function truncate(s) {
  if (!s) return "";
  return s.length > NAME_MAX ? s.slice(0, NAME_MAX - 1) + "…" : s;
}

function rowHref(c) {
  // Drafts open in the editor; Sent/Scheduled go to the read-only detail
  // route. Those detail routes don't exist yet — the 404 is intentional
  // until the Parse phase lands.
  return c.status === "draft"
    ? `/app/campaigns/${c.id}/edit`
    : `/app/campaigns/${c.id}`;
}

const rows = computed(() => props.campaigns);
</script>

<template>
  <TableShell v-if="rows.length">
    <template #head>
      <th class="ct-cell-name">Name</th>
      <th>Status</th>
      <th>Audience</th>
      <th>Sent / created</th>
      <th class="ct-cell-num">Open rate</th>
      <th class="ct-cell-num">Click rate</th>
    </template>
    <template #body>
      <tr
        v-for="c in rows"
        :key="c.id"
        class="ct-body"
        @click="navigateTo(rowHref(c))"
      >
        <td class="ct-cell-name" :title="c.name">{{ truncate(c.name) }}</td>
        <td>
          <AppStatusPill :status="c.status" />
        </td>
        <td class="ct-cell-audience">{{ c.audience || "—" }}</td>
        <td class="ct-cell-date">
          <span class="ct-date-primary tabular">{{ c.date }}</span>
          <span class="ct-date-secondary">{{ c.relative }}</span>
        </td>
        <td class="ct-cell-num tabular">{{ c.openRate || "—" }}</td>
        <td class="ct-cell-num tabular">{{ c.clickRate || "—" }}</td>
      </tr>
    </template>
  </TableShell>
  <EmptyState v-else title="No campaigns" subtitle="No campaigns match this filter." />
</template>

<style scoped>
.ct-body {
  cursor: pointer;
}
.ct-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.ct-cell-audience {
  color: var(--color-ink-soft);
}
.ct-cell-date {
  min-width: 0;
}
.ct-date-primary {
  display: block;
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}
.ct-date-secondary {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-ink-dim);
  font-family: var(--font-body);
  font-size: var(--text-xs);
}
.ct-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
:deep(thead th.ct-cell-num) {
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
</style>
