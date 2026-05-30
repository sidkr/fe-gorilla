<script setup>
// Recent member events, used in the right column next to recent campaigns.
// Avatar tone rotates by event kind (subscribed / opened / clicked / bounced
// / unsubscribed) so the feed is scannable at a glance.
defineProps({
  events: {
    type: Array,
    required: true,
    // [{
    //   initials, kind ('subscribed'|'opened'|'clicked'|'bounced'|'unsubscribed'),
    //   actor, action, detail, time
    // }]
  },
});

// Map an event kind → Avatar tone.
const KIND_TONE = {
  subscribed: "success",
  opened: "brand",
  clicked: "info",
  bounced: "warn",
  unsubscribed: "danger",
};
function toneFor(kind) {
  return KIND_TONE[kind] || "neutral";
}
</script>

<template>
  <div class="af">
    <SectionEyebrow>Recent activity</SectionEyebrow>

    <Card padding="none">
      <ul class="af-list">
        <li
          v-for="(e, i) in events"
          :key="i"
          class="af-row"
        >
          <Avatar :tone="toneFor(e.kind)" size="md">{{ e.initials }}</Avatar>

          <div class="af-text">
            <div class="af-line-1">
              <span class="af-actor">{{ e.actor }}</span>
              <span class="af-action">{{ e.action }}</span>
            </div>
            <div class="af-line-2">{{ e.detail }}</div>
          </div>

          <span class="af-time">{{ e.time }}</span>
        </li>
      </ul>

      <template #footer>
        <NuxtLink to="/app/audiences" class="af-view-all">
          <span>View all activity</span>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 6 H9 M6.5 2.5 L10 6 L6.5 9.5"
              stroke="currentColor"
              stroke-width="1.5"
              fill="none"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </NuxtLink>
      </template>
    </Card>
  </div>
</template>

<style scoped>
.af {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.af-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.af-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-rule);
}
.af-row:last-child {
  border-bottom: none;
}
.af-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.af-line-1 {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.af-actor {
  font-weight: 700;
  color: var(--color-ink);
}
.af-action {
  font-weight: 400;
  color: var(--color-ink);
  margin-left: var(--space-1);
}
.af-line-2 {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.af-time {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  align-self: center;
}
.af-view-all {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--link-color);
  text-decoration: none;
  transition: color var(--dur-fast) var(--ease-out);
}
.af-view-all:hover {
  color: var(--link-color-hover);
}
</style>
