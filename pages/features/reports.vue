<script setup lang="ts">
// Deep-dive: reporting and revenue attribution.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Reports — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Reporting that goes past opens and clicks: bounces, unsubscribes, 14-day trends, an engagement funnel, and revenue attribution that ties every email to real orders and AOV.",
    },
  ],
});

const metrics = [
  { label: "Opens", value: "42.6%" },
  { label: "Clicks", value: "11.3%" },
  { label: "Bounces", value: "0.4%" },
  { label: "Unsubscribes", value: "0.1%" },
];

const highlights = [
  {
    title: "The core four",
    body: "Opens, clicks, bounces, and unsubscribes for every campaign — clean rates, raw counts, and per-link click maps so you know what actually pulled.",
  },
  {
    title: "14-day trends",
    body: "Every metric plotted over a rolling 14 days, so a single campaign reads in the context of your recent sends instead of in a vacuum.",
  },
  {
    title: "Engagement funnel",
    body: "Watch contacts move from delivered to opened to clicked to converted. Spot exactly where attention leaks out of the journey.",
  },
  {
    title: "Revenue attribution",
    body: "Connect Shopify or WooCommerce and we tie email to orders — total revenue, revenue per recipient, and average order value, per campaign.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Reports"
        title="Know what the send was worth"
        lede="Go beyond opens and clicks. Track bounces and unsubscribes, read 14-day trends, walk the engagement funnel, and tie every campaign back to real orders with revenue attribution from your store."
      >
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
        <Button variant="ghost" size="lg" to="/features">All features</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>At a glance</SectionEyebrow>
      <h2 class="rp-h2">Every campaign, measured</h2>
      <div class="metric-row">
        <div v-for="m in metrics" :key="m.label" class="metric">
          <span class="metric__value">{{ m.value }}</span>
          <span class="metric__label">{{ m.label }}</span>
        </div>
        <div class="metric metric--rev">
          <span class="metric__value">$8,140</span>
          <span class="metric__label">Attributed revenue</span>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>What you can see</SectionEyebrow>
      <div class="mk-card-grid rp-grid">
        <div v-for="h in highlights" :key="h.title" class="mk-card">
          <h3>{{ h.title }}</h3>
          <p>{{ h.body }}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="rp-cta">
        <h2 class="rp-cta__title">Measure what you send.</h2>
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.rp-h2 {
  margin: var(--space-3) 0 var(--space-5);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: var(--space-3);
}
.metric {
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.metric--rev {
  background: var(--color-pop-bg);
  border-color: var(--color-pop);
}
.metric__value {
  display: block;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.metric--rev .metric__value { color: var(--color-pop-deep); }
.metric__label {
  display: block;
  margin-top: var(--space-1);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.rp-grid { margin-top: var(--space-5); }
.rp-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
  padding: var(--space-8);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.rp-cta__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
</style>
