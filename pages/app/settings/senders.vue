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
  if (saving.value) return;
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
    </nav>

    <div class="snd-bar">
      <p class="snd-note">
        Verification here is a placeholder for the MVP — a real confirmation
        flow ships with the send pipeline.
      </p>
      <button type="button" class="snd-cta" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Add sender</span>
      </button>
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
      <button type="button" class="snd-cta" @click="openCreate">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Add sender</span>
      </button>
    </div>

    <div v-else class="snd-table-wrap">
      <table class="snd-table">
        <thead>
          <tr>
            <th>From name</th>
            <th>From email</th>
            <th>Status</th>
            <th class="snd-th-actions"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in senders" :key="s.id">
            <td class="snd-td-name">{{ s.fromName }}</td>
            <td><code class="snd-email">{{ s.fromEmail }}</code></td>
            <td>
              <span
                class="snd-badge"
                :class="s.status === 'verified' ? 'snd-badge--ok' : 'snd-badge--pending'"
              >
                {{ s.status === "verified" ? "Verified" : "Pending" }}
              </span>
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
        </tbody>
      </table>
    </div>

    <!-- Create modal -->
    <div v-if="showForm" class="snd-modal-backdrop" @mousedown.self="closeForm">
      <div class="snd-modal" role="dialog" aria-modal="true" aria-labelledby="snd-modal-title">
        <h2 id="snd-modal-title" class="snd-modal-title">Add sender identity</h2>
        <form @submit.prevent="submitForm">
          <label class="snd-field">
            <span class="snd-field-label">From name</span>
            <input v-model="form.fromName" class="snd-input" type="text" maxlength="120" placeholder="e.g. Acme Team" autofocus />
          </label>
          <label class="snd-field">
            <span class="snd-field-label">From email</span>
            <input v-model="form.fromEmail" class="snd-input" type="email" placeholder="hello@acme.com" />
          </label>
          <p v-if="formError" class="snd-modal-error">{{ formError }}</p>
          <div class="snd-modal-actions">
            <button type="button" class="snd-btn snd-btn--ghost" :disabled="saving" @click="closeForm">Cancel</button>
            <button type="submit" class="snd-btn snd-btn--primary" :disabled="saving">
              {{ saving ? "Adding…" : "Add sender" }}
            </button>
          </div>
        </form>
      </div>
    </div>
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

.snd-cta {
  display: inline-flex; align-items: center; gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg); color: var(--btn-primary-fg);
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  border: none; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);
  cursor: pointer; white-space: nowrap;
  transition: background-color var(--dur-base) var(--ease-out);
}
.snd-cta:hover { background: var(--btn-primary-hover); }
.snd-cta:focus-visible { outline: none; box-shadow: var(--shadow-pop-glow); }

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

.snd-table-wrap {
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); overflow: hidden;
}
.snd-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--text-sm); }
.snd-table thead th {
  text-align: left; padding: var(--space-3) var(--space-4);
  font-size: var(--text-xs); font-weight: 600; letter-spacing: var(--tracking-wider);
  text-transform: uppercase; color: var(--color-ink-dim);
  border-bottom: 1px solid var(--color-rule); background: var(--color-surface-sunk);
}
.snd-th-actions { width: 1%; }
.snd-table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-rule); color: var(--color-ink); vertical-align: middle; }
.snd-table tbody tr:last-child td { border-bottom: none; }
.snd-td-name { font-weight: 600; }
.snd-email { font-family: var(--font-mono, monospace); font-size: var(--text-xs); color: var(--color-ink-soft); background: var(--color-surface-sunk); padding: 2px 6px; border-radius: var(--radius-sm); }
.snd-td-actions { white-space: nowrap; text-align: right; }
.snd-link { background: none; border: none; padding: 0 var(--space-2); color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; }
.snd-link:hover { text-decoration: underline; }
.snd-link:disabled { opacity: 0.5; cursor: default; }
.snd-link--danger { color: var(--color-danger); }

.snd-badge {
  display: inline-block; padding: 2px var(--space-2); border-radius: var(--radius-pill);
  font-size: var(--text-xs); font-weight: 600; letter-spacing: var(--tracking-wide);
}
.snd-badge--ok { background: var(--color-success-soft, rgba(34, 139, 84, 0.14)); color: var(--color-success, var(--color-pop-deep)); }
.snd-badge--pending { background: var(--color-surface-sunk); color: var(--color-ink-dim); }

/* Modal */
.snd-modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal, 1000);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-5); background: rgba(24, 24, 27, 0.45);
}
.snd-modal {
  width: 100%; max-width: 460px; padding: var(--space-6);
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
}
.snd-modal-title { margin: 0 0 var(--space-5); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.snd-field { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
.snd-field-label { font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; color: var(--color-ink); }
.snd-input {
  width: 100%; padding: var(--space-2) var(--space-3); min-height: var(--field-height);
  border: 1px solid var(--field-border); border-radius: var(--radius-sm);
  background: var(--field-bg); color: var(--field-text);
  font-family: var(--font-body); font-size: var(--text-sm); outline: none;
}
.snd-input:focus-visible { border-color: var(--field-border-focus); box-shadow: var(--shadow-pop-glow); }
.snd-modal-error { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }
.snd-modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
.snd-btn {
  padding: var(--space-2) var(--space-5); border-radius: var(--radius-md);
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  cursor: pointer; border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out);
}
.snd-btn:disabled { opacity: 0.6; cursor: default; }
.snd-btn--primary { background: var(--btn-primary-bg); color: var(--btn-primary-fg); }
.snd-btn--primary:not(:disabled):hover { background: var(--btn-primary-hover); }
.snd-btn--ghost { background: transparent; color: var(--color-ink-soft); border-color: var(--color-rule); }
.snd-btn--ghost:not(:disabled):hover { background: var(--color-surface-sunk); }
</style>
