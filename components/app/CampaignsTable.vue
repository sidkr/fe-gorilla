<script setup>
// CampaignsTable — full campaigns listing for /app/campaigns. Differs from
// the dashboard's RecentCampaignsTable: it has an Audience column, a
// "Sent / created" column that carries both an absolute date and a relative
// time secondary line, and routes Drafts to /edit while Sent/Scheduled go to
// the read-only campaign detail route. Each row is a NuxtLink so the whole
// row is the click target.
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
  <div class="ct">
    <div class="ct-row ct-head" role="row">
      <div class="ct-cell ct-cell-name">Name</div>
      <div class="ct-cell ct-cell-status">Status</div>
      <div class="ct-cell ct-cell-audience">Audience</div>
      <div class="ct-cell ct-cell-date">Sent / created</div>
      <div class="ct-cell ct-cell-num">Open rate</div>
      <div class="ct-cell ct-cell-num">Click rate</div>
    </div>

    <template v-if="rows.length">
      <NuxtLink
        v-for="c in rows"
        :key="c.id"
        :to="rowHref(c)"
        class="ct-row ct-body"
        role="row"
      >
        <div class="ct-cell ct-cell-name" :title="c.name">{{ truncate(c.name) }}</div>
        <div class="ct-cell ct-cell-status">
          <AppStatusPill :status="c.status" />
        </div>
        <div class="ct-cell ct-cell-audience">
          {{ c.audience || "—" }}
        </div>
        <div class="ct-cell ct-cell-date">
          <span class="ct-date-primary tabular">{{ c.date }}</span>
          <span class="ct-date-secondary">{{ c.relative }}</span>
        </div>
        <div class="ct-cell ct-cell-num tabular">{{ c.openRate || "—" }}</div>
        <div class="ct-cell ct-cell-num tabular">{{ c.clickRate || "—" }}</div>
      </NuxtLink>
    </template>
    <div v-else class="ct-empty">
      No campaigns match this filter.
    </div>
  </div>
</template>

<style scoped>
.ct {
  display: flex;
  flex-direction: column;
}
.ct-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.8fr)
    minmax(96px, 0.6fr)
    minmax(0, 1fr)
    minmax(160px, 1fr)
    minmax(96px, 0.6fr)
    minmax(96px, 0.6fr);
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  text-decoration: none;
  color: var(--color-ink);
}
.ct-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.ct-head .ct-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.ct-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out);
  cursor: pointer;
}
.ct-body:last-child {
  border-bottom: none;
}
.ct-body:hover {
  background: var(--color-surface-2);
}
.ct-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
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
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.ct-date-primary {
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
}
.ct-date-secondary {
  color: var(--color-ink-dim);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
}
.ct-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.ct-empty {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}

@media (max-width: 960px) {
  .ct-row {
    grid-template-columns:
      minmax(0, 1.6fr)
      minmax(80px, 0.6fr)
      minmax(140px, 1fr)
      minmax(80px, 0.6fr);
    gap: var(--space-3);
  }
  .ct-cell-audience,
  .ct-cell-num:last-child {
    display: none;
  }
}
</style>
