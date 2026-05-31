<script setup lang="ts">
// Deep-dive: automations and multi-step flows.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Automations — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Automations that run while you sleep: welcome series, win-backs, and triggers like contact-added, form-submission, and date-reached — composed into multi-step flows with waits and sends.",
    },
  ],
});

const triggers = [
  { name: "Contact added to a list", body: "Kick off the moment someone joins — the classic entry point for a welcome series." },
  { name: "Form submission", body: "Fire when a contact submits a signup or lead form, with their answers in hand." },
  { name: "Date reached", body: "Schedule around a date field — a birthday, renewal, or onboarding milestone." },
];

const recipes = [
  {
    title: "Welcome series",
    body: "Greet new contacts the instant they join, then drip a short sequence — who you are, what to expect, and a first nudge to act — with waits between each step.",
  },
  {
    title: "Win-backs",
    body: "Catch contacts going quiet. Trigger on inactivity, wait, then send a re-engagement offer. Stay quiet if they re-engage on their own.",
  },
  {
    title: "Multi-step flows",
    body: "Chain sends and waits into a flow that mirrors your customer journey. Each step runs automatically once a contact enters at the trigger.",
  },
  {
    title: "Waits & sends",
    body: "Pause for hours or days between actions, then send the next campaign. Build the rhythm once and let every new contact walk it on their own clock.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Automations"
        title="Set it once. It runs forever."
        lede="Welcome new contacts, win back the quiet ones, and react to what people do. Start from a trigger, add waits and sends, and let multi-step flows do the follow-up while you focus on the next campaign."
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
      <SectionEyebrow>Triggers</SectionEyebrow>
      <h2 class="au-h2">Start a flow on the right moment</h2>
      <div class="trigger-row">
        <div v-for="t in triggers" :key="t.name" class="trigger">
          <Icon name="paper-plane" />
          <div>
            <strong>{{ t.name }}</strong>
            <span>{{ t.body }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Build the flow</SectionEyebrow>
      <ol class="flow">
        <li class="flow__step"><Pill tone="brand">Trigger</Pill><span>Contact added to "Newsletter"</span></li>
        <li class="flow__step flow__step--wait"><Pill tone="neutral">Wait</Pill><span>1 day</span></li>
        <li class="flow__step"><Pill tone="success" dot>Send</Pill><span>Welcome &amp; what to expect</span></li>
        <li class="flow__step flow__step--wait"><Pill tone="neutral">Wait</Pill><span>3 days</span></li>
        <li class="flow__step"><Pill tone="success" dot>Send</Pill><span>Your first-order offer</span></li>
      </ol>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Recipes</SectionEyebrow>
      <div class="mk-card-grid au-grid">
        <div v-for="r in recipes" :key="r.title" class="mk-card">
          <h3>{{ r.title }}</h3>
          <p>{{ r.body }}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="au-cta">
        <h2 class="au-cta__title">Let the follow-up run itself.</h2>
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.au-h2 {
  margin: var(--space-3) 0 var(--space-5);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.trigger-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-3);
}
.trigger {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.trigger :deep(svg) { color: var(--color-pop); flex: none; margin-top: 2px; }
.trigger strong {
  display: block;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-base);
  color: var(--color-ink);
  margin-bottom: var(--space-1);
}
.trigger span {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.flow {
  list-style: none;
  margin: var(--space-3) 0 0;
  padding: 0 0 0 var(--space-4);
  border-left: 2px dashed var(--color-rule-strong);
  max-width: 520px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.flow__step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink);
}
.flow__step--wait { background: var(--color-surface-2); }
.au-grid { margin-top: var(--space-5); }
.au-cta {
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
.au-cta__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
</style>
