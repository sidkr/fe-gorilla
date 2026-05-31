<script setup lang="ts">
// GDPR commitment — prerendered marketing page (/legal/gdpr). Marketing chrome
// via layout: "marketing"; long-form content in .mk-prose. Template only, not
// legal advice. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "GDPR — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "How Fe-Mail Gorilla supports your GDPR compliance — our role as processor, lawful processing, data subject rights, sub-processors, international transfers, and our DPA.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Legal"
        title="Our GDPR commitment"
        lede="Fe-Mail Gorilla is built to help you meet your obligations under the EU and UK General Data Protection Regulation. Here is how we work together."
      />

      <div class="mk-prose">
        <p class="lg-meta">
          <strong>Last updated: May 2026.</strong> This is a template and not legal
          advice. Your compliance depends on how you use the Service; consult a qualified
          professional for your specific situation.
        </p>

        <hr />

        <h2>Our role</h2>
        <p>
          Under the GDPR, responsibilities split between the <strong>controller</strong>,
          who decides why and how personal data is processed, and the
          <strong>processor</strong>, who processes that data on the controller's behalf.
        </p>
        <ul>
          <li>
            <strong>You are the controller</strong> of the contact data you upload, collect,
            and send to through Fe-Mail Gorilla. You decide who is on your lists and why you
            contact them.
          </li>
          <li>
            <strong>We are the processor</strong> for that data. We process it only on your
            documented instructions to deliver the Service.
          </li>
        </ul>
        <p>
          For data about your own account (your name, billing, and usage), we act as a
          controller, as described in our <NuxtLink to="/legal/privacy">Privacy Policy</NuxtLink>.
        </p>

        <h2>Lawful processing</h2>
        <p>
          As the controller, you must have a lawful basis to process your contacts'
          personal data — most commonly consent or legitimate interests — and you must be
          able to demonstrate it. Fe-Mail Gorilla gives you the tools to do so:
        </p>
        <ul>
          <li>Double opt-in signup forms and timestamped consent records.</li>
          <li>Clear unsubscribe handling and suppression lists applied automatically.</li>
          <li>Custom fields to record the source and basis of each contact's consent.</li>
        </ul>

        <h2>Data subject rights &amp; how we help</h2>
        <p>
          Data subjects have rights to access, rectify, erase, restrict, port, and object
          to the processing of their personal data. When one of your contacts exercises a
          right, you can act on it directly in the Service, and we support you:
        </p>
        <ul>
          <li><strong>Access &amp; portability</strong> — export a contact's full record in a machine-readable format.</li>
          <li><strong>Rectification</strong> — edit any contact field at any time.</li>
          <li><strong>Erasure</strong> — permanently delete a contact and their associated data.</li>
          <li><strong>Restriction &amp; objection</strong> — suppress or unsubscribe a contact so they are never sent to again.</li>
        </ul>
        <p>
          If we receive a request directly from one of your contacts, we will promptly
          refer it to you as the controller and assist as needed.
        </p>

        <h2>Sub-processors</h2>
        <p>
          We engage carefully vetted sub-processors — for hosting, email delivery, payment
          processing, and analytics — to help us run the Service. Each is bound by data
          protection terms at least as protective as those in our
          <NuxtLink to="/legal/dpa">Data Processing Addendum</NuxtLink>. A current list is
          available on request, and we will notify you of changes so you can object.
        </p>

        <h2>International transfers (SCCs)</h2>
        <p>
          Where personal data is transferred outside the European Economic Area or the UK,
          we rely on the European Commission's Standard Contractual Clauses (SCCs) and the
          UK International Data Transfer Addendum, supplemented by technical and
          organizational measures, to ensure an adequate level of protection.
        </p>

        <h2>Data Processing Addendum</h2>
        <p>
          Our <NuxtLink to="/legal/dpa">Data Processing Addendum (DPA)</NuxtLink> sets out
          the contractual terms that govern our processing of personal data on your behalf,
          including security measures, sub-processing, breach notification, and the SCCs. It
          forms part of our Terms of Service and applies automatically to every customer.
        </p>

        <h2>DPO contact</h2>
        <p>
          For any GDPR-related question — including data protection inquiries, SCCs, or our
          DPA — contact our Data Protection Officer at
          <a href="mailto:dpo@gorilla.email">dpo@gorilla.email</a>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lg-meta { color: var(--color-ink-soft); }
</style>
