<script setup lang="ts">
// Product overview hub. Links out to each deep-dive feature page and closes on a
// sign-up CTA. Marketing chrome comes from the marketing layout.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Product — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Everything in Fe-Mail Gorilla: a drag-and-drop email editor, a visual segment builder, revenue-grade reporting, and multi-step automations. Built iron-forged for senders who mean it.",
    },
  ],
});

const features = [
  {
    to: "/features/editor",
    title: "Drag-and-drop editor",
    body: "Build campaigns from content blocks on a drop-anywhere canvas. Live desktop and mobile preview, merge tags, and bulletproof HTML on send.",
  },
  {
    to: "/features/segments",
    title: "Visual segment builder",
    body: "Slice your audience with AND/OR rule trees over fields, tags, and activity. Watch the matching count update live as you build.",
  },
  {
    to: "/features/reports",
    title: "Reporting that ties to revenue",
    body: "Opens, clicks, bounces, and unsubscribes — plus 14-day trends, an engagement funnel, and revenue attributed back to orders.",
  },
  {
    to: "/features/automations",
    title: "Automations",
    body: "Welcome series, win-backs, and event triggers. Compose multi-step flows with waits and sends that run while you sleep.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="The product"
        title="One forge for the whole send"
        lede="Fe-Mail Gorilla is the email marketing platform built for senders who want every part — design, targeting, measurement, automation — hammered into a single, dependable tool. No bolt-ons. No surprises."
      >
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
        <Button variant="ghost" size="lg" to="/pricing">See pricing</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Four pillars</SectionEyebrow>
      <div class="mk-card-grid feat-grid">
        <NuxtLink
          v-for="f in features"
          :key="f.to"
          :to="f.to"
          class="mk-card feat-card"
        >
          <h3>{{ f.title }}</h3>
          <p>{{ f.body }}</p>
          <span class="feat-more">
            Explore <Icon name="arrow-right" />
          </span>
        </NuxtLink>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="feat-cta">
        <div class="feat-cta__copy">
          <Pill tone="brand">No credit card</Pill>
          <h2 class="feat-cta__title">Forge your first campaign today</h2>
          <p class="feat-cta__lede">
            Free to start, generous on the way up. Bring your list, drop in a few
            blocks, and hit send in an afternoon.
          </p>
        </div>
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.feat-grid { margin-top: var(--space-5); }
.feat-card {
  display: flex;
  flex-direction: column;
  text-decoration: none;
}
.feat-more {
  margin-top: var(--space-4);
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-pop-deep);
}
.feat-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  flex-wrap: wrap;
  padding: var(--space-8);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.feat-cta__copy { max-width: 52ch; }
.feat-cta__title {
  margin: var(--space-3) 0 var(--space-2);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.feat-cta__lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
</style>
