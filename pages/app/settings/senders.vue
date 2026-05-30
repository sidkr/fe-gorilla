<script setup lang="ts">
// Sender identities — the from-name / from-email pairs an org may send as.
// List with status badges + add / verify / delete via useSettings. Verification
// is an MVP stub (status flip); real email/domain verification is the send
// pipeline's job. Pop chrome mirrors the custom-fields page.
import { onMounted, reactive, ref } from "vue";
import {
  useSettings,
  type SenderIdentity,
} from "~/composables/app/useSettings";
import { useToast } from "~/composables/shared/useToast";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Sender identities" });

const {
  listSenderIdentities,
  createSenderIdentity,
  verifySenderIdentity,
  deleteSenderIdentity,
} = useSettings();

const { push } = useToast();

const senders = ref<SenderIdentity[]>([]);
const loading = ref(true);
const loadError = ref("");

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    senders.value = await listSenderIdentities();
  } catch (err: any) {
    loadError.value = err?.message || "Could not load sender identities.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Create modal ──────────────────────────────────────────────────────────--
const showForm = ref(false);
const saving = ref(false);
const formError = ref("");
const form = reactive({ fromName: "", fromEmail: "" });

function openCreate() {
  formError.value = "";
  form.fromName = "";
  form.fromEmail = "";
  showForm.value = true;
}
function closeForm() {
  // Block dismissal mid-save. The Modal toggles `showForm` via v-model before
  // emitting `close`, so re-assert open rather than just early-returning.
  if (saving.value) {
    showForm.value = true;
    return;
  }
  showForm.value = false;
}

async function submitForm() {
  const fromName = form.fromName.trim();
  const fromEmail = form.fromEmail.trim();
  if (!fromName) {
    formError.value = "A from-name is required.";
    return;
  }
  if (!fromEmail) {
    formError.value = "A from-email is required.";
    return;
  }
  saving.value = true;
  formError.value = "";
  try {
    await createSenderIdentity({ fromName, fromEmail });
    showForm.value = false;
    push("Sender identity added.", { tone: "success" });
    await load();
  } catch (err: any) {
    formError.value = err?.message || "Could not add the sender.";
  } finally {
    saving.value = false;
  }
}

// ── Verify / delete ───────────────────────────────────────────────────────--
const busyId = ref<string | null>(null);

async function verify(s: SenderIdentity) {
  busyId.value = s.id;
  loadError.value = "";
  try {
    await verifySenderIdentity(s.id);
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not verify the sender.";
  } finally {
    busyId.value = null;
  }
}

async function remove(s: SenderIdentity) {
  if (!confirm(`Remove the sender "${s.fromEmail}"?`)) return;
  busyId.value = s.id;
  loadError.value = "";
  try {
    await deleteSenderIdentity(s.id);
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not remove the sender.";
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="snd">
    <header class="snd-header">
      <div class="snd-header-text">
        <h1>Settings</h1>
        <p class="snd-lede">Verified addresses your campaigns can send from.</p>
      </div>
    </header>

    <nav class="snd-tabs" aria-label="Settings sections">
      <NuxtLink to="/app/settings" class="snd-tab">General</NuxtLink>
      <NuxtLink to="/app/settings/senders" class="snd-tab">Sender identities</NuxtLink>
      <NuxtLink to="/app/settings/domains" class="snd-tab">Domains</NuxtLink>
      <NuxtLink to="/app/settings/suppression" class="snd-tab">Suppression</NuxtLink>
    </nav>

    <div class="snd-bar">
      <p class="snd-note">
        Verifying the address here confirms the From identity. For best
        deliverability, also authenticate the sending domain (DKIM/SPF/DMARC) on
        the <NuxtLink to="/app/settings/domains" class="snd-link">Domains</NuxtLink>
        page — domain verification is enforced at send time.
      </p>
      <Button type="button" variant="primary" @click="openCreate">
        <template #leading>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </template>
        Add sender
      </Button>
    </div>

    <p v-if="loading" class="snd-state">Loading senders…</p>
    <p v-else-if="loadError" class="snd-state snd-state--error">
      {{ loadError }}
      <button type="button" class="snd-retry" @click="load">Retry</button>
    </p>

    <div v-else-if="senders.length === 0" class="snd-empty">
      <h2 class="snd-empty-title">No sender identities yet</h2>
      <p class="snd-empty-lede">
        Add a from-name and from-email so your campaigns have a verified sender.
      </p>
      <Button type="button" variant="primary" @click="openCreate">
        <template #leading>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </template>
        Add sender
      </Button>
    </div>

    <TableShell v-else>
      <template #head>
        <th>From name</th>
        <th>From email</th>
        <th>Status</th>
        <th class="snd-th-actions"><span class="sr-only">Actions</span></th>
      </template>
      <template #body>
        <tr v-for="s in senders" :key="s.id">
          <td class="snd-td-name">{{ s.fromName }}</td>
          <td><code class="snd-email">{{ s.fromEmail }}</code></td>
          <td>
            <Pill :tone="s.status === 'verified' ? 'success' : 'neutral'">
              {{ s.status === "verified" ? "Verified" : "Pending" }}
            </Pill>
          </td>
          <td class="snd-td-actions">
            <button
              v-if="s.status !== 'verified'"
              type="button"
              class="snd-link"
              :disabled="busyId === s.id"
              @click="verify(s)"
            >
              {{ busyId === s.id ? "Verifying…" : "Verify" }}
            </button>
            <button
              type="button"
              class="snd-link snd-link--danger"
              :disabled="busyId === s.id"
              @click="remove(s)"
            >
              Remove
            </button>
          </td>
        </tr>
      </template>
    </TableShell>

    <!-- Create modal -->
    <Modal v-model:open="showForm" title="Add sender identity" @close="closeForm">
      <form @submit.prevent="submitForm">
        <FormField label="From name">
          <TextInput v-model="form.fromName" type="text" placeholder="e.g. Acme Team" />
        </FormField>
        <FormField label="From email">
          <TextInput v-model="form.fromEmail" type="email" placeholder="hello@acme.com" />
        </FormField>
        <p v-if="formError" class="snd-modal-error">{{ formError }}</p>
      </form>
      <template #footer>
        <Button type="button" variant="ghost" :disabled="saving" @click="closeForm">Cancel</Button>
        <Button type="button" variant="primary" :loading="saving" :disabled="saving" @click="submitForm">
          {{ saving ? "Adding…" : "Add sender" }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.snd { display: flex; flex-direction: column; gap: var(--space-5); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.snd-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 800;
  letter-spacing: var(--tracking-tight); color: var(--color-ink);
}
.snd-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.snd-tabs { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-rule); }
.snd-tab {
  padding: var(--space-3) var(--space-4); margin-bottom: -1px;
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--color-ink-soft); text-decoration: none;
  border-bottom: 2px solid transparent;
}
.snd-tab:hover { color: var(--color-ink); }
.snd-tab.router-link-exact-active {
  color: var(--color-ink); border-bottom-color: var(--color-pop);
}

.snd-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-5); flex-wrap: wrap; }
.snd-note { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-dim); max-width: 56ch; }

.snd-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.snd-state--error { color: var(--color-danger); }
.snd-retry {
  margin-left: var(--space-3); background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}

.snd-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface); border: 1px dashed var(--color-rule-strong);
  border-radius: var(--radius-lg);
}
.snd-empty-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.snd-empty-lede { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.snd-th-actions { width: 1%; }
.snd-td-name { font-weight: 600; }
.snd-email { font-family: var(--font-mono, monospace); font-size: var(--text-xs); color: var(--color-ink-soft); background: var(--color-surface-sunk); padding: 2px 6px; border-radius: var(--radius-sm); }
.snd-td-actions { white-space: nowrap; text-align: right; }
.snd-link { background: none; border: none; padding: 0 var(--space-2); color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; }
.snd-link:hover { text-decoration: underline; }
.snd-link:disabled { opacity: 0.5; cursor: default; }
.snd-link--danger { color: var(--color-danger); }

.snd-modal-error { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }
</style>
