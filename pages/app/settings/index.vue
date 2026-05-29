<script setup lang="ts">
// Org general settings — name, default sender, reply-to, timezone, and the
// physical mailing address used in email footers for CAN-SPAM compliance.
// Reads/writes via useSettings. Pop chrome mirrors the custom-fields page.
import { onMounted, reactive, ref } from "vue";
import { useSettings, type OrgSettings } from "~/composables/app/useSettings";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Settings" });

const { getOrgSettings, updateOrgSettings } = useSettings();

const settings = ref<OrgSettings | null>(null);
const loading = ref(true);
const loadError = ref("");

const form = reactive({
  name: "",
  defaultFromName: "",
  defaultFromEmail: "",
  replyTo: "",
  timezone: "UTC",
  address: "",
});

const saving = ref(false);
const saveError = ref("");
const saved = ref(false);

// A small, common set of timezones. Free-text would be more flexible but a
// curated list keeps the MVP form simple; the server accepts any string.
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function fillForm(s: OrgSettings) {
  form.name = s.name;
  form.defaultFromName = s.defaultFromName;
  form.defaultFromEmail = s.defaultFromEmail;
  form.replyTo = s.replyTo;
  form.timezone = s.timezone || "UTC";
  form.address = s.address;
}

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const s = await getOrgSettings();
    settings.value = s;
    fillForm(s);
  } catch (err: any) {
    loadError.value = err?.message || "Could not load settings.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

async function submit() {
  saved.value = false;
  saveError.value = "";
  const name = form.name.trim();
  if (!name) {
    saveError.value = "Organization name is required.";
    return;
  }
  saving.value = true;
  try {
    const updated = await updateOrgSettings({
      name,
      defaultFromName: form.defaultFromName.trim(),
      defaultFromEmail: form.defaultFromEmail.trim(),
      replyTo: form.replyTo.trim(),
      timezone: form.timezone,
      address: form.address,
    });
    settings.value = updated;
    fillForm(updated);
    saved.value = true;
  } catch (err: any) {
    saveError.value = err?.message || "Could not save settings.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="set">
    <header class="set-header">
      <div class="set-header-text">
        <h1>Settings</h1>
        <p class="set-lede">Your organization profile and email defaults.</p>
      </div>
    </header>

    <!-- Sub-nav between the settings surfaces -->
    <nav class="set-tabs" aria-label="Settings sections">
      <NuxtLink to="/app/settings" class="set-tab">General</NuxtLink>
      <NuxtLink to="/app/settings/senders" class="set-tab">Sender identities</NuxtLink>
    </nav>

    <p v-if="loading" class="set-state">Loading settings…</p>
    <p v-else-if="loadError" class="set-state set-state--error">
      {{ loadError }}
      <button type="button" class="set-retry" @click="load">Retry</button>
    </p>

    <form v-else class="set-card" @submit.prevent="submit">
      <section class="set-section">
        <h2 class="set-section-title">Organization</h2>
        <FormField label="Organization name">
          <TextInput v-model="form.name" type="text" />
        </FormField>
        <div class="set-field set-field--readonly">
          <span class="set-field-label">Plan</span>
          <span class="set-readonly">{{ settings?.plan || "free" }}</span>
        </div>
        <FormField label="Timezone">
          <SelectInput v-model="form.timezone">
            <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
          </SelectInput>
        </FormField>
      </section>

      <section class="set-section">
        <h2 class="set-section-title">Email defaults</h2>
        <p class="set-section-lede">
          Used to pre-fill new campaigns. From-email should be a verified
          <NuxtLink to="/app/settings/senders" class="set-inline-link">sender identity</NuxtLink>.
        </p>
        <FormField label="Default from-name">
          <TextInput v-model="form.defaultFromName" type="text" placeholder="e.g. Acme Team" />
        </FormField>
        <FormField label="Default from-email">
          <TextInput v-model="form.defaultFromEmail" type="email" placeholder="hello@acme.com" />
        </FormField>
        <FormField label="Reply-to (optional)">
          <TextInput v-model="form.replyTo" type="email" placeholder="support@acme.com" />
        </FormField>
      </section>

      <section class="set-section">
        <h2 class="set-section-title">Mailing address</h2>
        <p class="set-section-lede">
          A physical mailing address is included in your email footers — it's
          required by anti-spam law (CAN-SPAM).
        </p>
        <FormField label="Postal address">
          <TextArea
            v-model="form.address"
            :rows="3"
            placeholder="123 Main St, Suite 100&#10;Springfield, IL 62704&#10;USA"
          />
        </FormField>
      </section>

      <div class="set-actions">
        <p v-if="saveError" class="set-msg set-msg--error">{{ saveError }}</p>
        <p v-else-if="saved" class="set-msg set-msg--ok">Settings saved.</p>
        <span v-else class="set-msg"></span>
        <Button type="submit" variant="primary" :loading="saving" :disabled="saving">
          {{ saving ? "Saving…" : "Save changes" }}
        </Button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.set { display: flex; flex-direction: column; gap: var(--space-5); }

.set-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 800;
  letter-spacing: var(--tracking-tight); color: var(--color-ink);
}
.set-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.set-tabs { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-rule); }
.set-tab {
  padding: var(--space-3) var(--space-4); margin-bottom: -1px;
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--color-ink-soft); text-decoration: none;
  border-bottom: 2px solid transparent;
}
.set-tab:hover { color: var(--color-ink); }
.set-tab.router-link-exact-active {
  color: var(--color-ink); border-bottom-color: var(--color-pop);
}

.set-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.set-state--error { color: var(--color-danger); }
.set-retry {
  margin-left: var(--space-3); background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}

.set-card {
  display: flex; flex-direction: column; gap: var(--space-6);
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); padding: var(--space-6); max-width: 640px;
}
.set-section { display: flex; flex-direction: column; gap: var(--space-4); }
.set-section-title { margin: 0; font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-ink); }
.set-section-lede { margin: calc(var(--space-2) * -1) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); max-width: 56ch; }
.set-inline-link, .set-msg .set-inline-link { color: var(--link-color); text-decoration: none; font-weight: 600; }
.set-inline-link:hover { text-decoration: underline; }

.set-field { display: flex; flex-direction: column; gap: var(--space-2); }
.set-field-label { font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; color: var(--color-ink); }
.set-field--readonly { gap: var(--space-1); }
.set-readonly {
  font-family: var(--font-mono, monospace); font-size: var(--text-sm); color: var(--color-ink-soft);
  text-transform: capitalize;
}

.set-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-4); }
.set-msg { margin: 0; flex: 1; font-family: var(--font-body); font-size: var(--text-sm); }
.set-msg--error { color: var(--color-danger); }
.set-msg--ok { color: var(--color-success, var(--color-pop-deep)); }
</style>
