<script setup lang="ts">
// Deliverability guide — prerendered marketing page (/deliverability). Long-form
// .mk-prose with h2 sections + a checklist. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Deliverability — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "How to land in the inbox: SPF, DKIM and DMARC authentication, list hygiene and double opt-in, gradual warmup, and engagement-based sending. We measure 98.4% inbox placement.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Deliverability"
        title="A sent email isn't a delivered one. We obsess over the difference."
        lede="The best campaign in the world is worthless in a spam folder. Here's how Fe-Mail Gorilla — and you — keep your mail landing where it belongs."
      >
        <Button variant="primary" size="md" to="/signup">Start free</Button>
      </MarketingPageHeader>

      <div class="placement">
        <span class="placement-num">98.4%</span>
        <span class="placement-label">measured inbox placement across our sending pool</span>
      </div>

      <div class="mk-prose">
        <h2>Authentication: prove the mail is yours</h2>
        <p>
          Mailbox providers trust mail they can verify. Authenticating your sending domain
          is the single highest-leverage thing you can do for deliverability, and we walk
          you through all three records during setup.
        </p>
        <ul>
          <li><strong>SPF</strong> — declares which servers may send on your domain's behalf.</li>
          <li><strong>DKIM</strong> — cryptographically signs every message so receivers can confirm it wasn't forged or altered.</li>
          <li><strong>DMARC</strong> — tells receivers what to do with mail that fails SPF or DKIM, and sends you reports so you can spot abuse.</li>
        </ul>

        <h2>List hygiene &amp; double opt-in</h2>
        <p>
          Your reputation is the average quality of who you send to. Permission is
          non-negotiable: we require an unambiguous opt-in, and we recommend
          <strong>double opt-in</strong> so every address on your list has actively
          confirmed it wants to hear from you. Clean lists bounce less, complain less, and
          land more.
        </p>

        <h2>Gradual warmup</h2>
        <p>
          A brand-new sending domain has no reputation, so blasting it with a million
          messages on day one looks exactly like a spammer. We ramp your volume gradually,
          letting positive engagement build trust before you send at full scale.
        </p>

        <h2>Engagement-based sending</h2>
        <p>
          Providers watch whether people open, click, and reply — and whether they delete
          without reading. Sending to your most engaged contacts first, and easing off
          recipients who've gone quiet, keeps those signals healthy. Our segment builder
          makes engagement-based audiences a two-click affair.
        </p>

        <h2>Your inbox checklist</h2>
        <ul>
          <li>Authenticate your domain with SPF, DKIM, and DMARC before your first send.</li>
          <li>Collect addresses with explicit permission — use double opt-in where you can.</li>
          <li>Warm up a new domain gradually instead of all at once.</li>
          <li>Send to engaged contacts and suppress chronically inactive ones.</li>
          <li>Always include a clear, working unsubscribe link.</li>
          <li>Watch your bounce and complaint rates, and prune your list when they climb.</li>
        </ul>

        <hr />
        <p>
          We handle the hard infrastructure; you bring the permission and the relevance.
          Together that's how you hit the inbox.
          <NuxtLink to="/signup">Start sending free</NuxtLink>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.placement {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
  flex-wrap: wrap;
  padding: var(--space-6) var(--space-7);
  margin-bottom: var(--space-7);
  background: var(--color-pop-bg);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.placement-num {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-6xl);
  line-height: 1;
  letter-spacing: var(--tracking-tighter);
  color: var(--color-pop);
}
.placement-label {
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
  max-width: 32ch;
}
</style>
