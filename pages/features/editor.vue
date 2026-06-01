<script setup lang="ts">
// Deep-dive: the drag-and-drop email editor.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Editor — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "A drag-and-drop email editor with content blocks, a drop-anywhere canvas, live desktop and mobile preview, merge tags for personalization, and bulletproof HTML on every send.",
    },
  ],
});

const blocks = [
  { name: "Heading", body: "Set the tone in one line. Sizes and weights pull straight from your brand styles." },
  { name: "Paragraph", body: "Rich text with links, bold, and lists — no fiddly formatting toolbar fights." },
  { name: "Image", body: "Drop in a hero or product shot. Auto-scaled, retina-ready, alt-text prompted." },
  { name: "Button", body: "A real bulletproof button that renders the same everywhere, not a fragile image." },
  { name: "Columns", body: "Split a row two or three across. Stacks cleanly on mobile without extra work." },
  { name: "Social", body: "Linked icons for your channels, pulled from your account profile." },
  { name: "Product", body: "Pull a product card — image, title, price, link — from your connected store." },
];

const highlights = [
  {
    title: "Drop-anywhere canvas",
    body: "Grab any block from the rail and place it exactly where you want. Reorder by dragging, duplicate in a click, delete with a keystroke.",
  },
  {
    title: "Live desktop & mobile preview",
    body: "Toggle between desktop and mobile as you build. What you see is what lands — no guessing how it reflows in the inbox.",
  },
  {
    title: "Merge tags",
    body: "Personalize with merge tags like {{ first_name }} or {{ last_order }}. Preview against a real contact to confirm every field resolves.",
  },
  {
    title: "Bulletproof HTML on send",
    body: "Your layout compiles from MJML to bulletproof, table-based HTML at send time — so it renders the same across every major mail client.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Editor"
        title="Build the email, not the HTML"
        lede="Compose campaigns from content blocks on a drop-anywhere canvas. Preview desktop and mobile side by side, personalize with merge tags, and let Fe-Mail Gorilla forge bulletproof HTML the moment you hit send."
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
      <SectionEyebrow>Content blocks</SectionEyebrow>
      <h2 class="ed-h2">Seven blocks, infinite layouts</h2>
      <ul class="block-list">
        <li v-for="b in blocks" :key="b.name" class="block-chip">
          <strong>{{ b.name }}</strong>
          <span>{{ b.body }}</span>
        </li>
      </ul>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>How it feels</SectionEyebrow>
      <div class="mk-card-grid ed-grid">
        <div v-for="h in highlights" :key="h.title" class="mk-card">
          <h3>{{ h.title }}</h3>
          <p>{{ h.body }}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="ed-cta">
        <h2 class="ed-cta__title">Drag, drop, send.</h2>
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ed-h2 {
  margin: var(--space-3) 0 var(--space-5);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.block-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-3);
}
.block-chip {
  padding: var(--space-4) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-left: 3px solid var(--color-pop);
  border-radius: var(--radius-md);
}
.block-chip strong {
  display: block;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-ink);
  margin-bottom: var(--space-1);
}
.block-chip span {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.ed-grid { margin-top: var(--space-5); }
.ed-cta {
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
.ed-cta__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
</style>
