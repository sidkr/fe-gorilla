<script setup lang="ts">
// Careers — prerendered marketing page. Values + open roles. Roles are
// illustrative; "Apply" routes to /contact (no ATS wired up yet).
definePageMeta({ layout: "marketing" });

useHead({
  title: "Careers — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Build the email platform we always wished we had. Open roles in engineering, deliverability, design, and customer success at Fe-Mail Gorilla.",
    },
  ],
});

const VALUES = [
  {
    h: "Small team, big leverage",
    p: "Everyone here ships. No layers, no theater — your work reaches customers in days, not quarters.",
  },
  {
    h: "Default to ownership",
    p: "Pick up the problem, see it through to the inbox. We trust you with the whole loop, not a ticket.",
  },
  {
    h: "Remote, on purpose",
    p: "Async-first across time zones. We optimize for written clarity and deep focus over meetings.",
  },
  {
    h: "Forged, not fragile",
    p: "We sweat reliability and deliverability because our customers' livelihoods ride on every send.",
  },
];

const ROLES = [
  {
    title: "Senior Frontend Engineer",
    team: "Engineering",
    location: "Remote (US / EU overlap)",
    type: "Full-time",
    blurb:
      "Own the editor and reporting surfaces in our Nuxt 3 app. Vue, TypeScript, and a taste for fast, honest UI.",
  },
  {
    title: "Deliverability Engineer",
    team: "Infrastructure",
    location: "Remote (Global)",
    type: "Full-time",
    blurb:
      "Keep customer mail in the inbox. SMTP, DKIM/SPF/DMARC, IP warming, feedback loops, and the dark arts of reputation.",
  },
  {
    title: "Product Designer",
    team: "Design",
    location: "Remote (US / EU overlap)",
    type: "Full-time",
    blurb:
      "Shape the Pop design system end to end — from marketing pages to the campaign builder. Craft-obsessed, systems-minded.",
  },
  {
    title: "Customer Success Lead",
    team: "Customer",
    location: "Remote (US)",
    type: "Full-time",
    blurb:
      "Be the reason customers stay. Onboard senders, untangle deliverability issues, and turn feedback into roadmap.",
  },
  {
    title: "Backend Engineer, Sending Pipeline",
    team: "Engineering",
    location: "Remote (Global)",
    type: "Full-time",
    blurb:
      "Move millions of messages reliably. Node, Parse Server, MongoDB, queues, and tracking at scale.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Careers"
        title="Help us forge better email."
        lede="We are a small, remote team building the email platform we always wished we had. If you care about craft and the inbox in equal measure, we should talk."
      >
        <Button variant="primary" href="#roles">See open roles</Button>
        <Button variant="ghost" to="/about">About the company</Button>
      </MarketingPageHeader>
    </div>
  </section>

  <section class="mk-section mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>How we work</SectionEyebrow>
      <div class="mk-card-grid">
        <article v-for="v in VALUES" :key="v.h" class="mk-card">
          <h3>{{ v.h }}</h3>
          <p>{{ v.p }}</p>
        </article>
      </div>
    </div>
  </section>

  <section id="roles" class="mk-section">
    <div class="wrap">
      <SectionEyebrow>Open roles</SectionEyebrow>
      <div class="roles">
        <article v-for="r in ROLES" :key="r.title" class="role">
          <div class="role-main">
            <h3 class="role-title">{{ r.title }}</h3>
            <div class="role-meta">
              <Pill tone="brand" size="sm">{{ r.team }}</Pill>
              <span class="role-dot" aria-hidden="true">·</span>
              <span>{{ r.location }}</span>
              <span class="role-dot" aria-hidden="true">·</span>
              <span>{{ r.type }}</span>
            </div>
            <p class="role-blurb">{{ r.blurb }}</p>
          </div>
          <div class="role-action">
            <Button variant="ghost" to="/contact">Apply</Button>
          </div>
        </article>
      </div>
      <p class="roles-note">
        Don't see your role? We are always glad to meet sharp people. Email
        <a href="mailto:careers@gorilla.email">careers@gorilla.email</a> and tell us what
        you would build.
      </p>
    </div>
  </section>
</template>

<style scoped>
.roles {
  margin-top: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.role {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  transition: border-color var(--dur-base) var(--ease-out), box-shadow var(--dur-base) var(--ease-out);
}
.role:hover {
  border-color: var(--color-rule-strong);
  box-shadow: var(--shadow-sm);
}
.role-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-lg);
  color: var(--color-ink);
}
.role-meta {
  margin-top: var(--space-2);
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.role-dot { color: var(--color-ink-dim); }
.role-blurb {
  margin: var(--space-3) 0 0;
  max-width: 64ch;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.role-action { flex: none; }

.roles-note {
  margin: var(--space-6) 0 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}
.roles-note a {
  color: var(--link-color);
  text-decoration: underline;
}

@media (max-width: 640px) {
  .role { flex-direction: column; align-items: flex-start; }
}
</style>
