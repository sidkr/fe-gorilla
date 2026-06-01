<script setup lang="ts">
// Documentation home — prerendered marketing page (/docs). A header + a card
// grid of doc sections. Pure marketing chrome via layout: "marketing"; content
// lives in .wrap inside .mk-section. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Docs — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Everything you need to build, send, and measure with Fe-Mail Gorilla. Getting started, campaigns, audiences, deliverability, automations, and the REST API.",
    },
  ],
});

const SECTIONS = [
  {
    title: "Getting started",
    blurb:
      "Create your organization, verify a sending domain, and ship your first campaign in under ten minutes.",
    to: "/signup",
    cta: "Create an account",
  },
  {
    title: "Building campaigns",
    blurb:
      "Drag-and-drop blocks, the HTML editor, reusable templates, A/B subject tests, and scheduling.",
    to: "/templates",
    cta: "Browse templates",
  },
  {
    title: "Audiences & segments",
    blurb:
      "Import contacts via CSV, capture them with signup forms, and slice your list with the segment builder.",
    to: "/signup",
    cta: "Start building",
  },
  {
    title: "Sending & deliverability",
    blurb:
      "SPF, DKIM, and DMARC setup, warmup, engagement-based sending, and how we hold 98.4% inbox placement.",
    to: "/deliverability",
    cta: "Read the guide",
  },
  {
    title: "Automations",
    blurb:
      "Trigger journeys on signup, tag, or purchase. Branch on behavior and let sequences run while you sleep.",
    to: "/signup",
    cta: "Build a journey",
  },
  {
    title: "API",
    blurb:
      "A clean REST API for campaigns, contacts, events, and conversions — authenticated with a single key.",
    to: "/docs/api",
    cta: "API reference",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Documentation"
        title="Forge campaigns that actually arrive."
        lede="Guides, references, and recipes for every corner of Fe-Mail Gorilla — from your first send to a fully automated, revenue-attributed sending program."
      >
        <Button variant="primary" size="md" to="/signup">Start free</Button>
        <Button variant="ghost" size="md" to="/docs/api">API reference</Button>
      </MarketingPageHeader>

      <div class="mk-card-grid docs-grid">
        <article v-for="s in SECTIONS" :key="s.title" class="mk-card docs-card">
          <h3>{{ s.title }}</h3>
          <p>{{ s.blurb }}</p>
          <Button variant="subtle" size="sm" :to="s.to" class="docs-card-cta">
            {{ s.cta }}
            <template #trailing><Icon name="arrow-right" /></template>
          </Button>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.docs-grid { margin-top: var(--space-2); }
.docs-card { display: flex; flex-direction: column; }
.docs-card p { flex: 1; }
.docs-card-cta { margin-top: var(--space-4); align-self: flex-start; }
</style>
