<script setup lang="ts">
// Terms of Service — prerendered marketing page (/legal/terms). Marketing chrome
// via layout: "marketing"; long-form content in .mk-prose inside .wrap/.mk-section.
// Template language only — not legal advice. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Terms of Service — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "The terms that govern your use of Fe-Mail Gorilla — your account, acceptable use and anti-spam rules, plans and billing, intellectual property, and liability.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Legal"
        title="Terms of Service"
        lede="The agreement between you and Fe-Mail Gorilla. Please read it carefully — using the service means you accept these terms."
      />

      <div class="mk-prose">
        <p class="lg-meta">
          <strong>Last updated: May 2026.</strong> This is a template and not legal
          advice. Adapt it to your business and have it reviewed by a qualified lawyer
          before relying on it.
        </p>

        <hr />

        <h2>Acceptance of terms</h2>
        <p>
          These Terms of Service ("Terms") govern your access to and use of the
          Fe-Mail Gorilla email marketing platform, websites, APIs, and related
          services (together, the "Service"). By creating an account, accessing, or
          using the Service, you agree to be bound by these Terms and by any policies
          referenced here, including our <NuxtLink to="/legal/privacy">Privacy Policy</NuxtLink>.
        </p>
        <p>
          If you are entering into these Terms on behalf of a company or other legal
          entity, you represent that you have authority to bind that entity, in which
          case "you" refers to that entity. If you do not agree, you may not use the
          Service.
        </p>

        <h2>Your account</h2>
        <p>
          You must provide accurate, complete information when you register and keep it
          up to date. You are responsible for safeguarding your credentials and for all
          activity that occurs under your account. Notify us promptly at
          <a href="mailto:security@gorilla.email">security@gorilla.email</a> if you
          suspect unauthorized access.
        </p>
        <ul>
          <li>You must be at least 18 years old, or the age of majority in your jurisdiction.</li>
          <li>One person or entity may not maintain more than one free account without our consent.</li>
          <li>You are responsible for the conduct of every user you invite to your workspace.</li>
        </ul>

        <h2>Acceptable use</h2>
        <p>
          Email is a privilege, not a right. You may only send messages to recipients
          who have given you permission to contact them, and you must comply with all
          applicable anti-spam and communications laws, including the U.S. CAN-SPAM Act
          and Canada's Anti-Spam Legislation (CASL).
        </p>
        <h3>Consent and permission</h3>
        <ul>
          <li>
            <strong>Permission is required.</strong> Every recipient must have opted in
            to receive email from you, or have a clear, demonstrable relationship that
            constitutes consent under applicable law.
          </li>
          <li>
            <strong>No purchased, rented, or scraped lists.</strong> You may not upload
            contacts obtained from third-party lists, harvested addresses, or any source
            where the recipient did not consent to hear from you.
          </li>
          <li>
            <strong>Honor unsubscribes.</strong> Every campaign must include a working
            unsubscribe mechanism, and opt-outs must be processed promptly. We add
            unsubscribe handling and suppression automatically — do not circumvent it.
          </li>
        </ul>
        <h3>Message integrity</h3>
        <ul>
          <li>Use accurate "From," "To," and routing information, and a non-deceptive subject line.</li>
          <li>Identify the message as an advertisement where required, and include a valid physical postal address.</li>
          <li>
            Do not use the Service to send unlawful, infringing, deceptive, harassing,
            or malicious content, or to distribute malware, phishing, or other harmful
            material.
          </li>
        </ul>
        <p>
          We may suspend sending, throttle delivery, or terminate accounts that generate
          excessive spam complaints, hard bounces, or otherwise threaten the deliverability
          of the shared sending infrastructure.
        </p>

        <h2>Plans &amp; billing</h2>
        <p>
          Paid plans are billed in advance on a recurring basis (monthly or annually) and
          are metered on your monthly email sends and contact count as described on our
          <NuxtLink to="/pricing">pricing page</NuxtLink>. Unless stated otherwise, fees
          are non-refundable except where required by law.
        </p>
        <ul>
          <li>You authorize us to charge your payment method for all fees as they become due.</li>
          <li>Upgrades take effect immediately and are prorated; downgrades apply at the next billing cycle.</li>
          <li>If a payment fails, we may suspend the Service until the balance is settled.</li>
          <li>Fees are exclusive of taxes, which you are responsible for where applicable.</li>
        </ul>

        <h2>Intellectual property</h2>
        <p>
          The Service, including its software, design, and the Fe-Mail Gorilla brand,
          is owned by us and protected by intellectual-property laws. We grant you a
          limited, non-exclusive, non-transferable right to use the Service in accordance
          with these Terms.
        </p>
        <p>
          You retain all rights to the content you create, upload, or send ("Your
          Content"). You grant us a worldwide, royalty-free license to host, process, and
          transmit Your Content solely as needed to operate and improve the Service and to
          deliver your campaigns.
        </p>

        <h2>Termination</h2>
        <p>
          You may cancel your account at any time from your settings. We may suspend or
          terminate your access if you breach these Terms, fail to pay fees, or use the
          Service in a way that creates legal exposure or harms other customers.
        </p>
        <p>
          On termination, your right to use the Service ends immediately. We will make
          your data available for export for a limited period and then delete it in
          accordance with our retention practices, except where retention is required by
          law.
        </p>

        <h2>Disclaimers &amp; limitation of liability</h2>
        <p>
          The Service is provided "as is" and "as available," without warranties of any
          kind, whether express or implied, including warranties of merchantability,
          fitness for a particular purpose, and non-infringement. We do not warrant that
          the Service will be uninterrupted, error-free, or that any message will reach a
          particular inbox.
        </p>
        <p>
          To the maximum extent permitted by law, Fe-Mail Gorilla will not be liable for
          any indirect, incidental, special, consequential, or punitive damages, or for
          lost profits or revenues, arising out of or related to your use of the Service.
          Our aggregate liability for any claim is limited to the amount you paid us in
          the twelve months preceding the event giving rise to the claim.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these Terms from time to time. When we make material changes, we
          will update the "Last updated" date above and, where appropriate, notify you by
          email or in-app. Your continued use of the Service after changes take effect
          constitutes acceptance of the revised Terms.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these Terms? Reach our legal team at
          <a href="mailto:legal@gorilla.email">legal@gorilla.email</a>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lg-meta { color: var(--color-ink-soft); }
</style>
