<script setup lang="ts">
// Security overview — prerendered marketing page (/security). Marketing chrome
// via layout: "marketing"; a pillar card grid then long-form content in
// .mk-prose. Template only, not legal advice. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Security — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "How Fe-Mail Gorilla keeps your data safe — encryption in transit and at rest, tenant isolation, access controls, sending safeguards, monitoring, compliance, and responsible disclosure.",
    },
  ],
});

const PILLARS = [
  {
    title: "Encryption everywhere",
    body: "TLS in transit and strong encryption at rest, so your data is protected on the wire and on disk.",
  },
  {
    title: "Tenant isolation",
    body: "Every customer's data is logically isolated in our multi-tenant platform, with least-privilege access throughout.",
  },
  {
    title: "Sending safeguards",
    body: "SPF, DKIM, and DMARC alignment plus suppression lists protect your domain reputation and your recipients.",
  },
  {
    title: "Always monitored",
    body: "Continuous logging, alerting, and resilient infrastructure keep the platform watched and available.",
  },
];
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Security"
        title="Security you can send on"
        lede="Fe-Mail Gorilla is built to protect your data and your sender reputation at every layer — from the network up to the inbox."
      />

      <div class="mk-card-grid sec-pillars">
        <article v-for="p in PILLARS" :key="p.title" class="mk-card">
          <h3>{{ p.title }}</h3>
          <p>{{ p.body }}</p>
        </article>
      </div>

      <div class="mk-prose">
        <p class="lg-meta">
          <strong>Last updated: May 2026.</strong> This page describes our security
          program at a high level. It is a template and not a contractual commitment or
          legal advice.
        </p>

        <hr />

        <h2>Encryption</h2>
        <p>
          All traffic between you, your recipients, and Fe-Mail Gorilla is encrypted in
          transit using TLS. Data at rest — including your audiences, campaigns, and
          account information — is encrypted using strong, industry-standard algorithms.
          Encryption keys are managed and rotated according to documented procedures.
        </p>

        <h2>Infrastructure &amp; isolation</h2>
        <p>
          The platform runs on hardened, regularly patched cloud infrastructure. In our
          multi-tenant architecture, each customer's data is logically isolated so one
          tenant can never reach another's data. We apply the principle of least
          privilege across services and networks, segmenting access so each component
          can reach only what it needs.
        </p>

        <h2>Access controls &amp; authentication</h2>
        <ul>
          <li>Account access is protected by credentials and session management, with support for strong passwords.</li>
          <li>Internal access to production systems is restricted, logged, and granted on a need-to-know basis.</li>
          <li>Team workspaces support roles so you can limit what each member can see and do.</li>
          <li>API access is authenticated with revocable keys scoped to your organization.</li>
        </ul>

        <h2>Sending safeguards</h2>
        <p>
          Protecting deliverability is a security function. We help you authenticate your
          sending so mailbox providers can trust your messages, and we shield recipients
          from abuse:
        </p>
        <ul>
          <li><strong>SPF, DKIM, and DMARC</strong> — guided domain authentication so your mail is signed and aligned.</li>
          <li><strong>Suppression lists</strong> — unsubscribes, bounces, and complaints are recorded and automatically excluded from future sends.</li>
          <li><strong>Abuse controls</strong> — complaint and bounce monitoring with throttling to protect the shared sending reputation.</li>
        </ul>

        <h2>Monitoring &amp; resilience</h2>
        <p>
          We continuously log and monitor system activity to detect anomalies and respond
          quickly to incidents. Backups, redundancy, and a documented incident-response
          process help us recover from failures and keep the Service available. In the
          unlikely event of a Personal Data breach, we will notify affected customers in
          line with our <NuxtLink to="/legal/dpa">Data Processing Addendum</NuxtLink>.
        </p>

        <h2>Compliance</h2>
        <p>
          Our practices are designed to support your compliance obligations. We act as a
          processor for the contact data you send through the Service — see our
          <NuxtLink to="/legal/gdpr">GDPR commitment</NuxtLink> — and our
          <NuxtLink to="/legal/dpa">DPA</NuxtLink> sets out the contractual safeguards,
          including Standard Contractual Clauses for international transfers. Our
          <NuxtLink to="/legal/privacy">Privacy Policy</NuxtLink> explains how we handle
          your account data.
        </p>

        <h2>Responsible disclosure</h2>
        <p>
          We welcome reports from security researchers. If you believe you have found a
          vulnerability, please report it to
          <a href="mailto:security@gorilla.email">security@gorilla.email</a> with enough
          detail to reproduce the issue. Please give us a reasonable opportunity to
          investigate and remediate before public disclosure, and avoid accessing or
          modifying data that is not yours. We will acknowledge your report and keep you
          informed of our progress.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sec-pillars { margin-top: var(--space-2); margin-bottom: var(--space-8); }
.lg-meta { color: var(--color-ink-soft); }
</style>
