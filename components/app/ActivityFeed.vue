<script setup>
// Recent member events, used in the right column next to recent campaigns.
// Avatar color rotates by event kind (subscribed / opened / clicked / bounced
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
</script>

<template>
  <div class="af">
    <div class="af-eyebrow">
      <span class="af-eyebrow-dot" aria-hidden="true"></span>
      <span>Recent activity</span>
    </div>

    <div class="af-card">
      <ul class="af-list">
        <li
          v-for="(e, i) in events"
          :key="i"
          class="af-row"
        >
          <span
            class="af-avatar"
            :class="`is-${e.kind}`"
            aria-hidden="true"
          >{{ e.initials }}</span>

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
    </div>
  </div>
</template>

<style scoped>
.af {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.af-eyebrow {
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
.af-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.af-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
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
.af-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  flex: none;
}
.af-avatar.is-subscribed {
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
}
.af-avatar.is-opened {
  background: var(--color-ink-soft);
  color: var(--color-ink-on-pop);
}
.af-avatar.is-clicked {
  background: var(--color-pop-deep);
  color: var(--color-ink-on-pop);
}
.af-avatar.is-bounced {
  background: var(--color-warn-bg);
  color: var(--color-warn);
}
.af-avatar.is-unsubscribed {
  background: var(--color-danger-bg);
  color: var(--color-danger);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--link-color);
  text-decoration: none;
  border-top: 1px solid var(--color-rule);
  transition: color var(--dur-fast) var(--ease-out),
              background-color var(--dur-fast) var(--ease-out);
}
.af-view-all:hover {
  color: var(--link-color-hover);
  background: var(--color-surface-2);
}
</style>
