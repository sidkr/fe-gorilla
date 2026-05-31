<script setup lang="ts">
// Contact — prerendered marketing page. Channel grid + a presentational contact
// form. The form has NO backend; submit just prevents default and shows a note.
import { ref } from "vue";

definePageMeta({ layout: "marketing" });

useHead({
  title: "Contact — Fe-Mail Gorilla",
  meta: [
    {
      name: "description",
      content:
        "Get in touch with Fe-Mail Gorilla — sales, support, press, and careers. Or send us a note and we'll get back to you within one business day.",
    },
  ],
});

const CHANNELS = [
  { h: "Sales", email: "sales@gorilla.email", p: "Plans, volume pricing, migrations, and demos." },
  { h: "Support", email: "support@gorilla.email", p: "Account help, deliverability, and how-tos." },
  { h: "Press", email: "press@gorilla.email", p: "Interviews, briefings, and brand assets." },
  { h: "Careers", email: "careers@gorilla.email", p: "Roles, referrals, and open applications." },
];

const name = ref("");
const email = ref("");
const message = ref("");
const sent = ref(false);

// Presentational only — no network call. We just acknowledge in the UI.
function onSubmit() {
  sent.value = true;
}
</script>

<template>
  <section class="mk-section">
    <div class="wrap">
      <MarketingPageHeader
        eyebrow="Contact"
        title="Let's talk."
        lede="Pick the channel that fits, or drop us a note below. A real person reads every message — we aim to reply within one business day."
      />
    </div>
  </section>

  <section class="mk-section--tight">
    <div class="wrap">
      <SectionEyebrow>Reach the right team</SectionEyebrow>
      <div class="mk-card-grid">
        <article v-for="c in CHANNELS" :key="c.email" class="mk-card channel">
          <h3>{{ c.h }}</h3>
          <p>{{ c.p }}</p>
          <a class="channel-email" :href="`mailto:${c.email}`">{{ c.email }}</a>
        </article>
      </div>
    </div>
  </section>

  <section class="mk-section">
    <div class="wrap">
      <div class="form-band">
        <div class="form-intro">
          <SectionEyebrow>Send a note</SectionEyebrow>
          <h2 class="form-title">Tell us what you need.</h2>
          <p class="form-lede">
            Whether it's a sales question, a deliverability puzzle, or just hello — we read
            it all.
          </p>
        </div>

        <form class="contact-form" @submit.prevent="onSubmit">
          <FormField label="Name" input-id="cf-name" required>
            <TextInput id="cf-name" v-model="name" placeholder="Ada Forge" />
          </FormField>

          <FormField label="Email" input-id="cf-email" required>
            <TextInput id="cf-email" v-model="email" type="email" placeholder="you@company.com" />
          </FormField>

          <FormField label="Message" input-id="cf-message" required>
            <TextArea id="cf-message" v-model="message" :rows="5" placeholder="How can we help?" />
          </FormField>

          <div class="form-actions">
            <Button type="submit" variant="primary" size="lg">
              Send message
              <template #trailing><Icon name="paper-plane" /></template>
            </Button>
            <p v-if="sent" class="form-ack" role="status">
              Thanks — message noted. (This demo form doesn't send yet; email us directly
              and we'll reply fast.)
            </p>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<style scoped>
.channel { display: flex; flex-direction: column; }
.channel-email {
  margin-top: var(--space-4);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--link-color);
  text-decoration: none;
}
.channel-email:hover { color: var(--link-color-hover); text-decoration: underline; }

.form-band {
  display: grid;
  grid-template-columns: 0.9fr 1.1fr;
  gap: var(--space-7);
  align-items: start;
  padding: var(--space-8) var(--space-7);
  background: var(--color-surface-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
}
.form-title {
  margin: var(--space-4) 0 0;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: var(--text-3xl);
  letter-spacing: var(--tracking-tighter);
  color: var(--color-ink);
}
.form-lede {
  margin: var(--space-4) 0 0;
  max-width: 40ch;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-normal);
  color: var(--color-ink-soft);
}

.contact-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-2);
}
.form-ack {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  color: var(--color-ok);
}

@media (max-width: 720px) {
  .form-band { grid-template-columns: 1fr; }
}
</style>
