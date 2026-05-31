<script setup lang="ts">
// Customers — prerendered marketing page. Fictional customer stories. All
// brand/company names below are invented; no real or competitor names are used.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Customers — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "How senders use Fe-Mail Gorilla to lift open rates, fix deliverability, and turn email into revenue. Stories from teams who care about the inbox.",
    },
  ],
});

// Fictional brands — invented for illustration only.
const BRANDS = [
  "Folkways",
  "Northbeam",
  "Maple & Co.",
  "Argonaut",
  "Kindling",
  "Tidewater",
  "Granite Press",
  "Wildfern",
];

const QUOTES = [
  {
    quote:
      "We went from a 19% open rate to 41% in two months. The deliverability tools caught a domain auth issue our old platform never flagged — that one fix is why our reactivation campaign worked at all.",
    name: "Priya Raman",
    role: "Head of Lifecycle",
    company: "Northbeam",
    metric: "+22pt open rate",
  },
  {
    quote:
      "Our Black Friday flow drove $310K in attributed revenue, and I could watch it land in real time. Inbox placement stayed above 99% even at peak volume — that has never happened for us before.",
    name: "Marcus Vela",
    role: "Director of Growth",
    company: "Argonaut",
    metric: "$310K attributed",
  },
  {
    quote:
      "I run email solo for a small shop. Fe-Mail Gorilla makes me look like a full team. The editor is fast, the segments are clean, and my unsubscribe rate dropped by half once I started sending to people who actually wanted it.",
    name: "Dana Okafor",
    role: "Founder",
    company: "Wildfern",
    metric: "-50% unsubscribes",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Customers"
        title="Senders who refuse to settle for the spam folder."
        lede="From solo founders to lifecycle teams, the people who care most about the inbox build their email on Fe-Mail Gorilla. Here is what that looks like."
      >
        <Button variant="primary" to="/signup">Start free</Button>
        <Button variant="ghost" to="/contact">Talk to sales</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section--tight">
    <div class="wrap">
      <p class="trust-label">Trusted by teams who sweat every send</p>
      <ul class="brands">
        <li v-for="b in BRANDS" :key="b" class="brand">{{ b }}</li>
      </ul>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <SectionEyebrow>In their words</SectionEyebrow>
      <div class="quotes">
        <figure v-for="q in QUOTES" :key="q.company" class="quote">
          <Pill tone="brand" size="sm">{{ q.metric }}</Pill>
          <blockquote class="quote-body">"{{ q.quote }}"</blockquote>
          <figcaption class="quote-by">
            <span class="quote-name">{{ q.name }}</span>
            <span class="quote-role">{{ q.role }}, {{ q.company }}</span>
          </figcaption>
        </figure>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="cta">
        <h2 class="cta-title">Your story is the next one.</h2>
        <p class="cta-lede">
          Start free, fix your deliverability, and watch the inbox numbers move. No card
          required.
        </p>
        <div class="cta-actions">
          <Button variant="primary" size="lg" to="/signup">
            Start free
            <template #trailing><Icon name="arrow-right" /></template>
          </Button>
          <Button variant="ghost" size="lg" to="/contact">Talk to sales</Button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.trust-label {
  margin: 0 0 var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.brands {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}
.brand {
  padding: var(--space-3) var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-md);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}

.quotes {
  margin-top: var(--space-5);
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-5);
}
.quote {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.quote-body {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink);
}
.quote-by {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-rule);
}
.quote-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-sm);
  color: var(--color-ink);
}
.quote-role {
  font-family: var(--font-body);
  font-size: var(--text-sm);
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
