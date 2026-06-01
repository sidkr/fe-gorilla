<script setup lang="ts">
// Deep-dive: the visual segment builder.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Segments — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "A visual segment builder with AND/OR rule trees over contact fields, tags, and activity. See the matching count update live, and choose dynamic or static segments.",
    },
  ],
});

const highlights = [
  {
    title: "AND/OR rule trees",
    body: "Nest conditions as deep as the question demands. Match contacts on fields, tags, and activity — and combine groups with AND or OR without writing a query.",
  },
  {
    title: "Live matching count",
    body: "Every rule you add or tweak re-counts the audience instantly. No guessing how many people a segment hits before you commit to it.",
  },
  {
    title: "Dynamic segments",
    body: "Dynamic segments re-evaluate on every send, so a contact joins or drops automatically as their data changes. Set it once; it stays current.",
  },
  {
    title: "Static segments",
    body: "Need a frozen snapshot? Static segments capture exactly who matched at the moment you saved — ideal for one-off sends and clean reporting.",
  },
];

const rules = [
  "Tag is \"VIP\"",
  "Opened a campaign in the last 30 days",
  "Country is one of US, CA, UK",
  "Last order value is greater than 50",
  "Joined before a specific date",
  "Has not clicked in 90 days",
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Segments"
        title="Target the right people, exactly"
        lede="Build segments visually with AND/OR rule trees over your contact fields, tags, and activity. Watch the matching count update as you go, then choose whether the segment stays dynamic or freezes as a static list."
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
      <SectionEyebrow>The builder</SectionEyebrow>
      <h2 class="sg-h2">Rules you can read at a glance</h2>
      <div class="rule-tree">
        <div class="rule-tree__op">
          <Pill tone="brand">Match ALL of</Pill>
        </div>
        <ul class="rule-tree__list">
          <li v-for="(r, i) in rules" :key="i" class="rule-row">
            <Icon name="filter" />
            <span>{{ r }}</span>
          </li>
        </ul>
        <p class="rule-tree__count">
          <Pill tone="success" dot>2,418 contacts match</Pill>
          <span class="rule-tree__note">updates live as you edit</span>
        </p>
      </div>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>What you get</SectionEyebrow>
      <div class="mk-card-grid sg-grid">
        <div v-for="h in highlights" :key="h.title" class="mk-card">
          <h3>{{ h.title }}</h3>
          <p>{{ h.body }}</p>
        </div>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="sg-cta">
        <h2 class="sg-cta__title">Send to who matters.</h2>
        <Button variant="primary" size="lg" to="/signup">
          Start free
          <template #trailing><Icon name="arrow-right" /></template>
        </Button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sg-h2 {
  margin: var(--space-3) 0 var(--space-5);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.rule-tree {
  max-width: 640px;
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
}
.rule-tree__op { margin-bottom: var(--space-4); }
.rule-tree__list {
  list-style: none;
  margin: 0 0 var(--space-5);
  padding: 0 0 0 var(--space-4);
  border-left: 2px solid var(--color-rule-strong);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.rule-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--color-ink);
}
.rule-row :deep(svg) { color: var(--color-ink-dim); flex: none; }
.rule-tree__count {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin: 0;
}
.rule-tree__note {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.sg-grid { margin-top: var(--space-5); }
.sg-cta {
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
.sg-cta__title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
</style>
