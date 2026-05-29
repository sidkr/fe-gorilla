<script setup>
// AudienceCard — a single audience surface on /app/audiences.
// Renders name, optional tag chip, contact count, growth + engagement
// inline stats (with a tiny horizontal bar for engagement), and a footer
// row with "last sent" + a "View →" link. The whole card is wrapped in a
// NuxtLink so the entire surface is clickable; we treat the inner "View →"
// as decorative-only (it's already inside the link).
import { computed } from "vue";

const props = defineProps({
  id:                { type: String, required: true },
  name:              { type: String, required: true },
  count:             { type: Number, required: true },
  growth:            { type: String, default: "" },
  growthDir:         { type: String, default: "up" },   // "up" | "down" | "neutral"
  engagement:        { type: String, default: "" },     // "64%"
  lastSent:          { type: String, default: "" },
  lastSentRelative:  { type: String, default: "" },
  tag:               { type: String, default: null },
});

const to = computed(() => `/app/audiences/${props.id}`);

// Format count with thousands separators, keeping the original number
// in case downstream consumers want it.
const countLabel = computed(() => props.count.toLocaleString("en-US"));

// Engagement bar width — parse the "64%" string. Defensive: fall back to 0
// if the format ever drifts.
const engagementPct = computed(() => {
  const m = props.engagement.match(/(\d+(?:\.\d+)?)/);
  return m ? Math.min(100, Math.max(0, parseFloat(m[1]))) : 0;
});
</script>

<template>
  <NuxtLink :to="to" class="aud-card">
    <!-- Top row: name + optional tag -->
    <div class="aud-card-top">
      <h3 class="aud-card-name">{{ name }}</h3>
      <span v-if="tag" class="aud-card-tag">{{ tag }}</span>
    </div>

    <!-- Big tabular contact count + label -->
    <div class="aud-card-count">{{ countLabel }}</div>
    <div class="aud-card-count-label">subscribers</div>

    <!-- Inline stats: growth + engagement (with bar) -->
    <div class="aud-card-stats">
      <div class="aud-card-stat">
        <span :class="['aud-card-growth', `is-${growthDir}`]">
          <svg
            v-if="growthDir === 'up'"
            class="aud-card-growth-glyph"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
          >
            <path d="M5 1.5 L9 6 H6.2 V8.5 H3.8 V6 H1 Z" fill="currentColor" />
          </svg>
          <svg
            v-else-if="growthDir === 'down'"
            class="aud-card-growth-glyph"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            aria-hidden="true"
          >
            <path d="M5 8.5 L1 4 H3.8 V1.5 H6.2 V4 H9 Z" fill="currentColor" />
          </svg>
          <span>{{ growth }} last 30d</span>
        </span>
      </div>
      <div class="aud-card-stat">
        <div class="aud-card-engagement">
          <span class="aud-card-engagement-text">{{ engagement }} engaged</span>
          <div class="aud-card-bar" aria-hidden="true">
            <div class="aud-card-bar-fill" :style="{ width: `${engagementPct}%` }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer: last-sent + view link -->
    <div class="aud-card-foot">
      <span class="aud-card-lastsent">
        Last sent: {{ lastSent }} &middot; {{ lastSentRelative }}
      </span>
      <span class="aud-card-view" aria-hidden="true">
        View
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 6 H9 M6.5 3 L9.5 6 L6.5 9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.aud-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.aud-card:hover {
  border-color: var(--color-pop);
  box-shadow: var(--shadow-md);
}
.aud-card:focus-visible {
  outline: none;
  border-color: var(--color-pop);
  box-shadow: var(--shadow-pop-glow);
}

/* Top row */
.aud-card-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 28px;
}
.aud-card-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
  min-width: 0;
  /* Allow long names to wrap, don't push the tag off-card */
  overflow-wrap: anywhere;
}
.aud-card-tag {
  flex: none;
  padding: var(--space-1) var(--space-3);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  line-height: 1.2;
  white-space: nowrap;
}

/* Big count + label */
.aud-card-count {
  margin-top: var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-4xl);
  font-weight: 800;
  line-height: var(--leading-tight);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
  font-variant-numeric: tabular-nums;
}
.aud-card-count-label {
  margin-top: calc(-1 * var(--space-1));
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}

/* Stats row */
.aud-card-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
  margin-top: var(--space-2);
}
.aud-card-stat {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
}
.aud-card-growth {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.aud-card-growth.is-up {
  color: var(--color-ok);
}
.aud-card-growth.is-down {
  color: var(--color-danger);
}
.aud-card-growth.is-neutral {
  color: var(--color-ink-soft);
}
.aud-card-growth-glyph {
  flex: none;
}
.aud-card-engagement {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
  min-width: 0;
}
.aud-card-engagement-text {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink-soft);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.aud-card-bar {
  width: 100%;
  height: 4px;
  background: var(--color-rule);
  border-radius: var(--radius-pill);
  overflow: hidden;
}
.aud-card-bar-fill {
  height: 100%;
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  transition: width var(--dur-slow) var(--ease-out);
}

/* Footer */
.aud-card-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-rule);
}
.aud-card-lastsent {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aud-card-view {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  flex: none;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--link-color);
}
.aud-card:hover .aud-card-view {
  color: var(--link-color-hover);
}
</style>
