<script setup lang="ts">
// Press — prerendered marketing page. Press kit: boilerplate, brand assets,
// Pop palette swatches (driven by token vars), and a press contact.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Press — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Press kit for Fe-Mail Gorilla: company boilerplate, brand assets, the Pop color palette, and how to reach our press team.",
    },
  ],
});

// Swatches reference the canonical token vars — never hardcoded hex. The hex
// label shown to journalists is the documented value of each token.
const PALETTE = [
  { name: "Pop", token: "--color-pop", hex: "#FF4E4E", note: "The brand — hot coral red." },
  { name: "Pop Deep", token: "--color-pop-deep", hex: "#C53030", note: "Hover / deeper accent." },
  { name: "Pop BG", token: "--color-pop-bg", hex: "#FFE8E8", note: "Soft tint panels." },
  { name: "Ink", token: "--color-ink", hex: "#18181B", note: "Primary text / dark fills." },
  { name: "Lemon", token: "--color-lemon", hex: "#FFD93D", note: "Supporting bright." },
  { name: "Surface", token: "--color-surface", hex: "#FFFFFF", note: "Base background." },
];

const ASSETS = [
  { h: "Logomark", p: "The iron-gorilla mark in SVG and PNG, on light and dark backgrounds." },
  { h: "Wordmark", p: "The full Fe-Mail Gorilla wordmark, horizontal and stacked lockups." },
  { h: "Brand guide", p: "A one-page PDF covering clear space, minimum sizing, and color usage." },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Press"
        title="Press kit."
        lede="Everything a journalist needs to write about Fe-Mail Gorilla — boilerplate, brand assets, and our colors. Reach us any time at press@gorilla.email."
      >
        <Button variant="primary" href="mailto:press@gorilla.email">Contact press</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <div class="mk-prose">
        <h2>About Fe-Mail Gorilla</h2>
        <p>
          Fe-Mail Gorilla is an email marketing platform for senders who care about
          deliverability and craft. It pairs a fast drag-and-drop editor, audiences,
          segments, automations, and honest reporting with a deliverability engine that
          keeps campaigns landing in the inbox. Founded by a remote team with deep email
          infrastructure experience, the company's mission is to make great email
          achievable for any team that has earned its audience — without agencies, black
          boxes, or dark patterns. The name nods to iron (Fe, element 26): email built to
          hit with weight and arrive every time.
        </p>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Brand assets</SectionEyebrow>
      <div class="assets">
        <div class="logo-sample">
          <BrandMark :size="48" />
          <span class="logo-caption">The iron-gorilla mark</span>
        </div>
        <div class="mk-card-grid asset-grid">
          <article v-for="a in ASSETS" :key="a.h" class="mk-card">
            <h3>{{ a.h }}</h3>
            <p>{{ a.p }}</p>
          </article>
        </div>
      </div>
      <p class="assets-note">
        Downloadable asset bundle (SVG, PNG, and brand guide PDF) available on request —
        email <a href="mailto:press@gorilla.email">press@gorilla.email</a> and we'll send
        it over. Please don't alter, recolor, or stretch the mark.
      </p>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Brand colors — Pop</SectionEyebrow>
      <div class="swatches">
        <figure
          v-for="c in PALETTE"
          :key="c.token"
          class="swatch"
        >
          <div
            class="swatch-chip"
            :style="{ background: `var(${c.token})` }"
            aria-hidden="true"
          />
          <figcaption class="swatch-meta">
            <span class="swatch-name">{{ c.name }}</span>
            <code class="swatch-hex">{{ c.hex }}</code>
            <span class="swatch-note">{{ c.note }}</span>
          </figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="contact-band">
        <div>
          <h2 class="contact-title">Press inquiries</h2>
          <p class="contact-lede">
            For interviews, briefings, or fact-checking, reach our press team directly. We
            aim to reply within one business day.
          </p>
        </div>
        <Button variant="primary" size="lg" href="mailto:press@gorilla.email">
          press@gorilla.email
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.assets {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: minmax(200px, 280px) 1fr;
  gap: var(--space-5);
  align-items: start;
}
.logo-sample {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.logo-caption {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.asset-grid { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
.assets-note {
  margin: var(--space-6) 0 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.assets-note a { color: var(--link-color); text-decoration: underline; }

.swatches {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--space-4);
}
.swatch {
  margin: 0;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
  background: var(--color-surface);
}
.swatch-chip {
  height: 96px;
  border-bottom: 1px solid var(--color-rule);
}
.swatch-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4);
}
.swatch-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-md);
  color: var(--color-ink);
}
.swatch-hex {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.swatch-note {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}

.contact-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-6);
  flex-wrap: wrap;
  padding: var(--space-8) var(--space-6);
  background: var(--color-ink);
  border-radius: var(--radius-xl);
}
.contact-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tighter);
  color: var(--color-ink-on-pop);
}
.contact-lede {
  margin: var(--space-3) 0 0;
  max-width: 52ch;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-on-pop-soft);
}

@media (max-width: 720px) {
  .assets { grid-template-columns: 1fr; }
}
</style>
