<script setup lang="ts">
// REST API reference overview — prerendered marketing page (/docs/api).
// Long-form .mk-prose with h2 sections + styled <pre> code blocks. All visual
// values via tokens; <pre> styled with var(--color-ink) / --color-ink-on-pop.
definePageMeta({ layout: "marketing" });

useHead({
  title: "API reference — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "The Fe-Mail Gorilla REST API: base URL, API-key authentication, and the core resources — campaigns, contacts and audiences, events, and conversions.",
    },
  ],
});
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="API reference"
        title="A REST API built like the rest of it: blunt and reliable."
        lede="Everything in the app is reachable over HTTPS with a single API key. JSON in, JSON out, predictable resource URLs, and no surprises."
      >
        <Button variant="ghost" size="md" to="/docs">Back to docs</Button>
      </MarketingPageHeader>

      <div class="mk-prose">
        <h2>Base URL</h2>
        <p>
          All API requests are made to a single versioned base URL over HTTPS.
          Unversioned and plaintext HTTP requests are rejected.
        </p>
        <pre><code>https://api.gorilla.email/v1</code></pre>

        <h2>Authentication</h2>
        <p>
          Requests are authenticated with an <strong>API key</strong> passed in the
          <strong>X-Api-Key</strong> header. Create a key under
          <strong>Settings → API keys</strong> in the app; it is shown once at creation,
          so store it somewhere safe. Keys are scoped to a single organization and can be
          revoked at any time without affecting your other keys.
        </p>
        <pre><code>curl -H "X-Api-Key: fe_live_••••••••••••••••" \
     https://api.gorilla.email/v1/campaigns</code></pre>
        <p>
          A missing or revoked key returns <strong>401 Unauthorized</strong>. Never embed
          a live key in client-side code or a committed file — treat it like a password.
        </p>

        <h2>Campaigns</h2>
        <p>
          The <strong>/campaigns</strong> resource creates, lists, and sends campaigns.
          List campaigns, inspect their status (draft, scheduled, sending, sent), and
          trigger a send — all without leaving your own stack.
        </p>
        <pre><code>POST https://api.gorilla.email/v1/campaigns
{
  "name": "May product launch",
  "subject": "It's forged. It's shipping.",
  "audienceId": "aud_8f21",
  "fromName": "The Gorilla team"
}</code></pre>

        <h2>Contacts &amp; audiences</h2>
        <p>
          The <strong>/contacts</strong> and <strong>/audiences</strong> resources manage
          your subscribers. Upsert a contact, set custom fields and tags, and add it to an
          audience. Upserting by email keeps your list de-duplicated automatically.
        </p>
        <pre><code>PUT https://api.gorilla.email/v1/contacts/ada@example.com
{
  "audienceId": "aud_8f21",
  "fields": { "firstName": "Ada", "plan": "foundry" },
  "tags": ["beta", "engaged"]
}</code></pre>

        <h2>Events</h2>
        <p>
          The <strong>/events</strong> resource records behavioral events for a contact —
          things like <strong>signed_up</strong>, <strong>placed_order</strong>, or any
          custom event of your own. Events power automations and segment rules in real time.
        </p>
        <pre><code>POST https://api.gorilla.email/v1/events
{
  "email": "ada@example.com",
  "name": "placed_order",
  "properties": { "orderId": "1042", "total": 89.00 }
}</code></pre>

        <h2>Conversions</h2>
        <p>
          The <strong>/conversions</strong> resource attributes revenue back to the campaign
          or automation that earned it. Post a conversion with an amount and we tie it to the
          recipient's most recent qualifying send, feeding the revenue numbers in reports.
        </p>
        <pre><code>POST https://api.gorilla.email/v1/conversions
{
  "email": "ada@example.com",
  "amount": 89.00,
  "currency": "USD"
}</code></pre>

        <hr />
        <p>
          Ready to wire it up?
          <NuxtLink to="/signup">Create an account</NuxtLink>, generate a key in Settings,
          and make your first call.
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Code blocks — ink surface so they read as terminal/code against the prose.
   All values from tokens; mono font, comfortable padding, scrollable. */
.mk-prose pre {
  background: var(--color-ink);
  color: var(--color-ink-on-pop);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  overflow-x: auto;
  margin: 0 0 var(--space-5);
}
.mk-prose pre code {
  font-family: inherit;
  color: inherit;
  white-space: pre;
}
</style>
