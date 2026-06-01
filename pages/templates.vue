<script setup lang="ts">
// Template gallery — prerendered MARKETING page (/templates). Distinct from the
// in-app /app/templates surface: this sells the gallery and pushes to /signup.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Templates — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Start from polished, on-brand templates — newsletters, announcements, product launches, re-engagement, receipts — or open a blank canvas and build your own.",
    },
  ],
});

const CATEGORIES = [
  {
    title: "Newsletters",
    blurb:
      "Clean, readable layouts for your weekly or monthly send. Lead story, sections, and a clear unsubscribe footer baked in.",
  },
  {
    title: "Announcements",
    blurb:
      "Big-news templates with a single, unmissable message and one decisive call to action. Built to be forwarded.",
  },
  {
    title: "Product launches",
    blurb:
      "Hero image, feature highlights, and a buy-now button — engineered to convert the moment it lands in the inbox.",
  },
  {
    title: "Re-engagement",
    blurb:
      "Win-back layouts that ask the quiet question: still want to hear from us? Pair them with an engagement segment.",
  },
  {
    title: "Receipts & transactional",
    blurb:
      "Order confirmations, shipping updates, and password resets — structured, on-brand, and ready to wire to events.",
  },
  {
    title: "Start from blank",
    blurb:
      "An empty canvas and every content block at your fingertips. For when you know exactly what you want to forge.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Template gallery"
        title="Don't start from a blank page. Start from a strong one."
        lede="Every template is responsive, accessibility-minded, and ready to carry your brand. Pick a starting point, swap in your words and colors, and send."
      >
        <Button variant="primary" size="md" to="/signup">Browse templates</Button>
        <Button variant="ghost" size="md" to="/docs">Read the docs</Button>
      </MarketingPageHeader>

      <div class="mk-card-grid tpl-grid">
        <article v-for="c in CATEGORIES" :key="c.title" class="mk-card">
          <h3>{{ c.title }}</h3>
          <p>{{ c.blurb }}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <div class="tpl-cta">
        <div>
          <h2 class="tpl-cta-title">Pick one and make it yours.</h2>
          <p class="tpl-cta-sub">
            Open any template in the editor, drop in your content, and send your first
            campaign free — no card required.
          </p>
        </div>
        <Button variant="primary" size="lg" to="/signup">
          Browse templates
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.tpl-grid { margin-top: var(--space-2); }
.tpl-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  flex-wrap: wrap;
  padding: var(--space-7);
  background: var(--color-pop-bg);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.tpl-cta-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.tpl-cta-sub {
  margin: var(--space-3) 0 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
  max-width: 52ch;
}
</style>
