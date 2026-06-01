<script setup lang="ts">
// Privacy Policy — prerendered marketing page (/legal/privacy). Marketing chrome
// via layout: "marketing"; long-form content in .mk-prose. Template only, not
// legal advice. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Privacy Policy — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "How Fe-Mail Gorilla collects, uses, shares, and protects personal data — the information we collect, our legal bases, sub-processors, cookies, retention, and your rights.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Legal"
        title="Privacy Policy"
        lede="What personal data we collect, why we collect it, who we share it with, and the rights you have over it."
      />

      <div class="mk-prose">
        <p class="lg-meta">
          <strong>Last updated: May 2026.</strong> This is a template and not legal
          advice. Tailor it to your actual data practices and have it reviewed by a
          qualified privacy professional.
        </p>

        <hr />

        <p>
          This Privacy Policy explains how Fe-Mail Gorilla ("we," "us") handles personal
          data. It covers two audiences: visitors and customers who use our website and
          platform, and the contacts whose data our customers process through the Service.
          Where our customers use the Service to send their own campaigns, they are the
          controller of their contact data and we act as a processor — see our
          <NuxtLink to="/legal/gdpr">GDPR commitment</NuxtLink> for that relationship.
        </p>

        <h2>Information we collect</h2>
        <ul>
          <li>
            <strong>Account data</strong> — name, email address, organization, and
            credentials you provide when you sign up.
          </li>
          <li>
            <strong>Billing data</strong> — plan, billing contact, and payment metadata
            processed through our payment provider (we do not store full card numbers).
          </li>
          <li>
            <strong>Customer content</strong> — campaigns, templates, audiences, and the
            contact data you upload or collect through forms.
          </li>
          <li>
            <strong>Usage data</strong> — log data, device and browser information, IP
            address, and how you interact with the Service.
          </li>
          <li>
            <strong>Communications</strong> — messages you send to our support and sales
            teams.
          </li>
        </ul>

        <h2>How we use it</h2>
        <ul>
          <li>To provide, maintain, secure, and improve the Service.</li>
          <li>To process payments and manage your subscription.</li>
          <li>To deliver your campaigns and report on their performance.</li>
          <li>To provide support and respond to your requests.</li>
          <li>To detect, prevent, and address abuse, fraud, and security issues.</li>
          <li>To send service and, where permitted, marketing communications you can opt out of.</li>
        </ul>

        <h2>Legal bases</h2>
        <p>
          Where the GDPR or similar laws apply, we rely on the following legal bases to
          process personal data:
        </p>
        <ul>
          <li><strong>Contract</strong> — to provide the Service you have signed up for.</li>
          <li><strong>Legitimate interests</strong> — to secure, improve, and market our Service, balanced against your rights.</li>
          <li><strong>Consent</strong> — where we ask for it, such as certain cookies or optional communications.</li>
          <li><strong>Legal obligation</strong> — to comply with applicable law, including tax and accounting requirements.</li>
        </ul>

        <h2>Sharing &amp; sub-processors</h2>
        <p>
          We do not sell personal data. We share it only with service providers
          ("sub-processors") who help us run the Service — such as cloud hosting, email
          delivery, payment processing, and analytics — each bound by contractual
          obligations to protect it. A current list of sub-processors is available on
          request, and our <NuxtLink to="/legal/dpa">Data Processing Addendum</NuxtLink>
          governs how they may handle data on our behalf.
        </p>
        <p>
          We may also disclose data where required by law, to protect our rights, or in
          connection with a merger, acquisition, or sale of assets, subject to appropriate
          safeguards.
        </p>

        <h2>Cookies</h2>
        <p>
          We use cookies and similar technologies to keep you signed in, remember your
          preferences, and understand how the Service is used. Strictly necessary cookies
          are always on; analytics and marketing cookies are set only where permitted. You
          can control non-essential cookies through your browser settings or our cookie
          controls.
        </p>

        <h2>Data retention</h2>
        <p>
          We keep personal data for as long as your account is active and as needed to
          provide the Service. After your account closes, we retain data for a limited
          period to meet legal, tax, and security obligations, then delete or anonymize it.
          Customer content is deleted on the schedule described in our
          <NuxtLink to="/legal/dpa">DPA</NuxtLink>.
        </p>

        <h2>Your rights</h2>
        <p>
          Depending on where you live, you may have the right to access, correct, delete,
          export, or restrict the processing of your personal data, and to object to
          certain processing. To exercise these rights:
        </p>
        <ul>
          <li><strong>Access</strong> — request a copy of the personal data we hold about you.</li>
          <li><strong>Delete</strong> — ask us to erase your personal data, subject to legal limits.</li>
          <li><strong>Export</strong> — receive your data in a portable, machine-readable format.</li>
        </ul>
        <p>
          Email <a href="mailto:privacy@gorilla.email">privacy@gorilla.email</a> and we
          will respond within the timeframe required by applicable law. If you are a
          contact of one of our customers, please direct your request to that customer; we
          will assist them as the processor.
        </p>

        <h2>International transfers</h2>
        <p>
          We may process and store personal data in countries other than your own. When we
          transfer data across borders, we use appropriate safeguards such as the European
          Commission's Standard Contractual Clauses to ensure your data remains protected.
        </p>

        <h2>Security</h2>
        <p>
          We protect personal data with encryption in transit and at rest, strict access
          controls, and continuous monitoring. For details, see our
          <NuxtLink to="/security">Security overview</NuxtLink>. No system is perfectly
          secure, but we work hard to keep your data safe and to notify you promptly in the
          unlikely event of a breach.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or your data? Contact our privacy team at
          <a href="mailto:privacy@gorilla.email">privacy@gorilla.email</a>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lg-meta { color: var(--color-ink-soft); }
</style>
