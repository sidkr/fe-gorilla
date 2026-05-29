<script setup>
// Audiences list. Mock data for now — Parse integration lands in a later
// phase, at which point `audiences` becomes a Parse.Query result and the
// KPI strip is computed from that result + a Cloud function for the 30d
// growth delta. Until then we keep the surface real enough to design
// against (real card layout, real eyebrow + CTA chrome).
definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Audiences" });

const kpis = [
  { label: "Total subscribers",   value: "26,541", delta: "+826 in last 30d",  deltaDirection: "up" },
  { label: "Average engagement",  value: "67%",    delta: "+3pp vs prev 30d",  deltaDirection: "up" },
  { label: "Audiences",           value: "5",      delta: "1 archived",        deltaDirection: "neutral" },
];

const audiences = [
  { id: "a_all",         name: "All subscribers",      count: 12847, growth: "+342", growthDir: "up", engagement: "64%",  lastSent: "May 18, 2026", lastSentRelative: "3 days ago",  tag: null },
  { id: "a_engaged",     name: "Engaged subscribers",  count: 8234,  growth: "+178", growthDir: "up", engagement: "100%", lastSent: "May 18, 2026", lastSentRelative: "3 days ago",  tag: "Auto-segment" },
  { id: "a_newsletter",  name: "Newsletter list",      count: 3201,  growth: "+89",  growthDir: "up", engagement: "58%",  lastSent: "Apr 22, 2026", lastSentRelative: "1 month ago", tag: null },
  { id: "a_vip",         name: "VIP Members",          count: 412,   growth: "+14",  growthDir: "up", engagement: "92%",  lastSent: "Mar 15, 2026", lastSentRelative: "2 months ago", tag: "Curated" },
  { id: "a_prospects",   name: "Prospects (lead gen)", count: 1847,  growth: "+203", growthDir: "up", engagement: "41%",  lastSent: "Feb 14, 2026", lastSentRelative: "3 months ago", tag: "Lead gen" },
];
</script>

<template>
  <div class="audiences">
    <!-- 1. Header -->
    <header class="aud-header">
      <div class="aud-header-text">
        <h1>Audiences</h1>
        <p class="aud-lede">Contact lists you can send campaigns to.</p>
      </div>
      <NuxtLink to="/app/audiences/new" class="aud-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New audience</span>
      </NuxtLink>
    </header>

    <!-- 2. Summary strip -->
    <section class="aud-kpis" aria-label="Audience summary">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- 3. Audience grid -->
    <section class="aud-section">
      <div class="aud-eyebrow">
        <span class="aud-eyebrow-dot" aria-hidden="true"></span>
        <span>Your audiences &middot; {{ audiences.length }}</span>
      </div>
      <div class="aud-grid">
        <AppAudienceCard
          v-for="a in audiences"
          :key="a.id"
          :id="a.id"
          :name="a.name"
          :count="a.count"
          :growth="a.growth"
          :growth-dir="a.growthDir"
          :engagement="a.engagement"
          :last-sent="a.lastSent"
          :last-sent-relative="a.lastSentRelative"
          :tag="a.tag"
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.audiences {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.aud-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.aud-header-text { min-width: 0; }
.aud-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
}
.aud-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.aud-cta {
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
.aud-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.aud-cta:active {
  transform: translateY(1px);
}
.aud-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* KPI strip — 3 cards */
.aud-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .aud-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .aud-kpis { grid-template-columns: 1fr; }
}

/* Eyebrow section */
.aud-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.aud-eyebrow {
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
.aud-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Card grid — 3 cols ≥960px, 2 cols 720-960, 1 col below 720 */
.aud-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-5);
}
@media (max-width: 960px) {
  .aud-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .aud-grid { grid-template-columns: 1fr; }
}
</style>
