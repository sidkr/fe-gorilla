<script setup>
definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Segments" });

// All values below are mock data. The Parse-backed segment evaluator isn't
// live yet; when it lands we'll swap these for real queries.
const segments = [
  { id: "s_01", name: "Recent buyers (30d)",     audience: "All subscribers", rule: "purchased: in last 30d",                              count: 1247, lastUsed: "May 18, 2026" },
  { id: "s_02", name: "High-value (LTV > $500)", audience: "All subscribers", rule: "ltv > 500",                                            count: 412,  lastUsed: "May 14, 2026" },
  { id: "s_03", name: "Cart abandoners",         audience: "All subscribers", rule: "added_to_cart AND NOT purchased: in 24h",              count: 287,  lastUsed: "May 21, 2026" },
  { id: "s_04", name: "Active in last 7d",       audience: "All subscribers", rule: "opened OR clicked: in last 7d",                        count: 3845, lastUsed: "May 21, 2026" },
  { id: "s_05", name: "Unengaged (30d)",         audience: "All subscribers", rule: "no opens AND no clicks: in last 30d",                  count: 4613, lastUsed: "May 10, 2026" },
  { id: "s_06", name: "Birthday this month",     audience: "All subscribers", rule: "birthday: in May",                                     count: 178,  lastUsed: "May 1, 2026"  },
  { id: "s_07", name: "Lapsed VIPs",             audience: "VIP Members",     rule: "tier = vip AND no purchase: in last 90d",              count: 23,   lastUsed: "—"        },
  { id: "s_08", name: "New this week",           audience: "All subscribers", rule: "createdAt: in last 7d",                                count: 89,   lastUsed: "May 19, 2026" },
];
</script>

<template>
  <div class="segments">
    <!-- 1. Header -->
    <header class="seg-header">
      <div class="seg-header-text">
        <h1>Segments</h1>
        <p class="seg-lede">Saved slices of your audiences, sendable like a list.</p>
      </div>
      <NuxtLink to="/app/segments/new" class="seg-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New segment</span>
      </NuxtLink>
    </header>

    <!-- 2. Brief explainer card -->
    <section class="seg-section">
      <div class="seg-eyebrow">
        <span class="seg-eyebrow-dot" aria-hidden="true"></span>
        <span>What's a segment</span>
      </div>
      <div class="seg-explainer">
        <div class="seg-explainer-icon" aria-hidden="true">
          <!-- Venn-diagram glyph: two overlapping circles -->
          <svg width="28" height="28" viewBox="0 0 28 28">
            <circle cx="11" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" />
            <circle cx="17" cy="14" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8" />
          </svg>
        </div>
        <p class="seg-explainer-text">
          Segments are dynamic rules over your audiences. They re-evaluate before every send, so your recipient list stays fresh as people subscribe, engage, or drift away.
        </p>
      </div>
    </section>

    <!-- 3. Segments table -->
    <section class="seg-section">
      <div class="seg-eyebrow">
        <span class="seg-eyebrow-dot" aria-hidden="true"></span>
        <span>All segments &middot; {{ segments.length }}</span>
      </div>
      <div class="seg-card seg-card-flush">
        <AppSegmentsTable :segments="segments" />
      </div>
    </section>
  </div>
</template>

<style scoped>
.segments {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.seg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.seg-header-text { min-width: 0; }
.seg-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.seg-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.seg-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.seg-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.seg-cta:active {
  transform: translateY(1px);
}
.seg-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* Sections */
.seg-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.seg-eyebrow {
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
.seg-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Card surfaces */
.seg-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.seg-card-flush { padding: 0; }

/* Explainer card */
.seg-explainer {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
}
.seg-explainer-icon {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  color: var(--color-pop);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.seg-explainer-text {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
</style>
