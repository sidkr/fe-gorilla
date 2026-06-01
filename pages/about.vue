<script setup lang="ts">
// About — prerendered marketing page (in nitro.prerender.routes). Company story
// + mission. Uses the shared marketing layout (nav + footer) and the standard
// MarketingPageHeader. All visual values via tokens (var(--…)).
definePageMeta({ layout: "marketing" });

useHead({
  title: "About — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Why we built Fe-Mail Gorilla: email that hits like iron. A marketing platform for senders who care about deliverability and craft, not vanity metrics.",
    },
  ],
});

const STATS = [
  { k: "99.2%", v: "Median inbox placement across customer sends last quarter." },
  { k: "1.4B+", v: "Emails forged and delivered through the platform to date." },
  { k: "11 yrs", v: "Combined deliverability experience on the founding team." },
  { k: "0", v: "Dark patterns. No fake urgency, no buried unsubscribe, ever." },
];

const VALUES = [
  {
    h: "Deliverability is the product",
    p: "A beautiful campaign that lands in spam is worth nothing. We treat the inbox as the finish line, not the send button.",
  },
  {
    h: "Craft over clutter",
    p: "Fewer features, sharpened. Every screen earns its place. We would rather do ten things impeccably than a hundred adequately.",
  },
  {
    h: "Senders, not spammers",
    p: "We build for people with something real to say to people who asked to hear it. Consent and clean lists are non-negotiable.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="About us"
        title="Email that hits like iron."
        lede="We are a small team obsessed with one thing: getting your message into the inbox and making it land. Fe-Mail Gorilla is the email platform we always wished we had."
      >
        <Button variant="primary" to="/signup">Start free</Button>
        <Button variant="ghost" to="/careers">See open roles</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <div class="mk-prose">
        <h2>Where it started</h2>
        <p>
          We spent years on the wrong side of the inbox — watching carefully written
          campaigns get throttled, foldered, or silently dropped. The tools we used
          optimized for sign-up flows and upsells, not for the unglamorous work of
          actually arriving. So we walked away and started forging our own.
        </p>
        <p>
          The name is a promise. <strong>Fe</strong> is iron on the periodic table,
          element 26 — dense, dependable, built to take a beating. That is the standard we
          hold every send to: authenticated, warmed, and tuned so your message lands with
          weight instead of bouncing off a filter.
        </p>
        <h2>What we are building</h2>
        <p>
          A complete email marketing platform — editor, audiences, segments, automations,
          and reports — wrapped around a deliverability engine that most teams never get to
          touch. No agency retainer, no black box. Just clean sending, honest numbers, and
          a tool that respects both your craft and your reader's attention.
        </p>
        <h2>Our mission</h2>
        <p>
          Make great email achievable for any team that has earned its audience. If you
          care about the people on your list, we will make sure they hear you.
        </p>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>By the numbers</SectionEyebrow>
      <div class="stats">
        <article v-for="s in STATS" :key="s.k" class="stat">
          <div class="stat-k">{{ s.k }}</div>
          <p class="stat-v">{{ s.v }}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>What we value</SectionEyebrow>
      <div class="mk-card-grid">
        <article v-for="val in VALUES" :key="val.h" class="mk-card">
          <h3>{{ val.h }}</h3>
          <p>{{ val.p }}</p>
        </article>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="cta">
        <h2 class="cta-title">Forge your next campaign with us.</h2>
        <p class="cta-lede">
          Start free with 10,000 emails a month — no card required — or come build the
          platform with us.
        </p>
        <div class="cta-actions">
          <Button variant="primary" size="lg" to="/signup">
            Start free
            <template #trailing><Icon name="arrow-right" /></template>
          </Button>
          <Button variant="ghost" size="lg" to="/careers">We're hiring</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.stats {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-5);
}
.stat {
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.stat-k {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-5xl);
  line-height: 1;
  letter-spacing: var(--tracking-tighter);
  color: var(--color-pop);
}
.stat-v {
  margin: var(--space-3) 0 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}

.cta {
  text-align: center;
  padding: var(--space-8) var(--space-6);
  background: var(--color-pop-bg);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.cta-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-4xl);
  letter-spacing: var(--tracking-tighter);
  color: var(--color-ink);
}
.cta-lede {
  margin: var(--space-4) auto 0;
  max-width: 52ch;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.cta-actions {
  margin-top: var(--space-6);
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  flex-wrap: wrap;
}
</style>
