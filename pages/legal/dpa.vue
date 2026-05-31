<script setup lang="ts">
// Data Processing Addendum — prerendered marketing page (/legal/dpa). Marketing
// chrome via layout: "marketing"; long-form content in .mk-prose. Forms part of
// the Terms. Template only, not legal advice. No competitor names.
definePageMeta({ layout: "marketing" });

useHead({
  title: "Data Processing Addendum — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "The Fe-Mail Gorilla Data Processing Addendum — definitions, roles, scope of processing, sub-processing, security measures, breach notification, SCCs, and data deletion.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Legal"
        title="Data Processing Addendum"
        lede="The contractual terms governing our processing of personal data on your behalf. This DPA forms part of, and is incorporated into, our Terms of Service."
      />

      <div class="mk-prose">
        <p class="lg-meta">
          <strong>Last updated: May 2026.</strong> This is a template and not legal
          advice. It forms part of the <NuxtLink to="/legal/terms">Terms of Service</NuxtLink>
          and should be reviewed by a qualified professional before you rely on it.
        </p>

        <hr />

        <p>
          This Data Processing Addendum ("DPA") applies where Fe-Mail Gorilla
          ("Processor") processes Personal Data on behalf of the customer ("Controller")
          in connection with the Service. It supplements and forms part of the Terms of
          Service. In the event of a conflict regarding the processing of Personal Data,
          this DPA prevails.
        </p>

        <h2>Definitions</h2>
        <ul>
          <li><strong>Personal Data</strong> — any information relating to an identified or identifiable natural person processed under the Terms.</li>
          <li><strong>Processing</strong> — any operation performed on Personal Data, such as collection, storage, use, transfer, or deletion.</li>
          <li><strong>Controller</strong> — the customer, who determines the purposes and means of Processing.</li>
          <li><strong>Processor</strong> — Fe-Mail Gorilla, which Processes Personal Data on the Controller's behalf.</li>
          <li><strong>Sub-processor</strong> — any third party engaged by the Processor to Process Personal Data.</li>
          <li><strong>Data Protection Laws</strong> — all applicable laws governing the Processing of Personal Data, including the GDPR.</li>
        </ul>

        <h2>Roles &amp; responsibilities</h2>
        <p>
          The Controller determines the purposes and means of Processing and is responsible
          for the lawfulness of the Personal Data it provides, including obtaining any
          necessary consents. The Processor Processes Personal Data only on the Controller's
          documented instructions, including those set out in the Terms and this DPA, unless
          required to do otherwise by law.
        </p>

        <h2>Scope &amp; duration of processing</h2>
        <ul>
          <li><strong>Subject matter</strong> — provision of the email marketing Service.</li>
          <li><strong>Duration</strong> — the term of the Terms, plus any period during which data is retained for return or deletion.</li>
          <li><strong>Nature and purpose</strong> — storing, processing, and delivering campaigns and managing audiences on the Controller's behalf.</li>
          <li><strong>Types of data</strong> — contact identifiers such as names and email addresses, custom fields, and engagement data.</li>
          <li><strong>Categories of data subjects</strong> — the Controller's contacts, subscribers, and recipients.</li>
        </ul>

        <h2>Sub-processing</h2>
        <p>
          The Controller authorizes the Processor to engage Sub-processors to support the
          Service. The Processor will impose data protection obligations on each
          Sub-processor that are no less protective than those in this DPA, and remains
          responsible for their performance. We will maintain a list of Sub-processors and
          give the Controller reasonable notice of additions or replacements, allowing the
          Controller to object on reasonable data-protection grounds.
        </p>

        <h2>Security measures</h2>
        <p>
          The Processor implements appropriate technical and organizational measures to
          protect Personal Data, including:
        </p>
        <ul>
          <li>Encryption of Personal Data in transit and at rest.</li>
          <li>Logical isolation of each customer's data in our multi-tenant environment.</li>
          <li>Role-based access controls and the principle of least privilege.</li>
          <li>Logging, monitoring, and regular review of access and activity.</li>
          <li>Secure development practices and routine vulnerability management.</li>
        </ul>
        <p>
          Further detail is available in our <NuxtLink to="/security">Security overview</NuxtLink>.
        </p>

        <h2>Data subject requests</h2>
        <p>
          Taking into account the nature of the Processing, the Processor will assist the
          Controller by appropriate technical and organizational measures, insofar as
          possible, in responding to requests from data subjects exercising their rights.
          Where the Processor receives such a request directly, it will promptly refer the
          request to the Controller and will not respond except on the Controller's
          instructions.
        </p>

        <h2>Personal data breach notification</h2>
        <p>
          The Processor will notify the Controller without undue delay after becoming aware
          of a Personal Data breach affecting the Controller's Personal Data, and will
          provide information reasonably available to help the Controller meet its own
          notification obligations under Data Protection Laws.
        </p>

        <h2>International transfers (Standard Contractual Clauses)</h2>
        <p>
          Where Processing involves a transfer of Personal Data outside the European
          Economic Area or the UK to a country without an adequacy decision, the parties
          agree that the European Commission's Standard Contractual Clauses (and, for UK
          data, the UK International Data Transfer Addendum) are incorporated into this DPA
          and apply to that transfer, supplemented by appropriate safeguards.
        </p>

        <h2>Return/deletion of data</h2>
        <p>
          On termination or expiry of the Terms, the Processor will, at the Controller's
          choice, return or delete the Personal Data it Processes on the Controller's
          behalf, and delete existing copies, unless retention is required by law. The
          Controller may export its data through the Service before deletion.
        </p>

        <hr />

        <p>
          For questions about this DPA or to request a countersigned copy, contact
          <a href="mailto:dpo@gorilla.email">dpo@gorilla.email</a> or
          <a href="mailto:legal@gorilla.email">legal@gorilla.email</a>.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.lg-meta { color: var(--color-ink-soft); }
</style>
