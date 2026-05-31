<script setup lang="ts">
// Product changelog — prerendered marketing page (/changelog). Reverse-chrono
// dated entries in .mk-prose, each tagged New or Improved via <Pill>.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Changelog — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "What's new in Fe-Mail Gorilla: the homepage live demo, new content blocks, CSV import and signup forms, automations, revenue attribution, and the segment builder.",
    },
  ],
});

type Entry = {
  date: string;
  tag: "New" | "Improved";
  title: string;
  points: string[];
};

const ENTRIES: Entry[] = [
  {
    date: "May 28, 2026",
    tag: "New",
    title: "Try it live on the homepage",
    points: [
      "An interactive demo on the homepage lets you build and preview a campaign before you ever sign up.",
      "No account, no email — just open the editor and start dragging blocks.",
    ],
  },
  {
    date: "May 14, 2026",
    tag: "New",
    title: "Three new content blocks",
    points: [
      "Columns block for side-by-side layouts that hold up on mobile.",
      "Social block to drop in your profiles with one click.",
      "Product block that pulls in an image, price, and buy button for launches and receipts.",
    ],
  },
  {
    date: "April 30, 2026",
    tag: "New",
    title: "CSV import & signup forms",
    points: [
      "Bring your existing list in via CSV with field mapping and automatic de-duplication.",
      "Hosted signup forms grow your audience and feed straight into automations.",
    ],
  },
  {
    date: "April 9, 2026",
    tag: "New",
    title: "Automations",
    points: [
      "Trigger journeys on signup, tag, or a custom event, then branch on what people do next.",
      "Welcome series, win-backs, and post-purchase flows now run on autopilot.",
    ],
  },
  {
    date: "March 20, 2026",
    tag: "Improved",
    title: "Revenue attribution & the segment builder",
    points: [
      "Reports now tie revenue back to the campaign or automation that earned it.",
      "The new segment builder slices your list on fields, tags, and engagement in a couple of clicks.",
    ],
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Changelog"
        title="Forged in the open. Here's what we've been shipping."
        lede="New features, sharper tools, and the occasional quiet fix. The most recent work sits up top."
      >
        <Button variant="primary" size="md" to="/signup">Start free</Button>
      </MarketingPageHeader>

      <div class="mk-prose">
        <article v-for="(e, i) in ENTRIES" :key="e.date" class="log-entry">
          <div class="log-meta">
            <time class="log-date">{{ e.date }}</time>
            <Pill :tone="e.tag === 'New' ? 'brand' : 'neutral'">{{ e.tag }}</Pill>
          </div>
          <h2>{{ e.title }}</h2>
          <ul>
            <li v-for="p in e.points" :key="p">{{ p }}</li>
          </ul>
          <hr v-if="i < ENTRIES.length - 1" />
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.log-entry { margin: 0; }
.log-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-top: var(--space-7);
}
.log-date {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
/* Pull the entry h2's default top margin in — the meta row owns the spacing. */
.mk-prose .log-entry h2 { margin-top: var(--space-2); }
</style>
