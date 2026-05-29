<script setup>
// Audience detail — the contact table for one List (F-08) plus an add-contact
// modal, inline edit, and a contact detail drawer (F-09). Contacts are loaded
// paginated via listContacts. Activity is a graceful empty state until the send
// pipeline exists (no CampaignSend / EmailEvent rows yet).
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAudiences } from "~/composables/app/useAudiences";
import { useContacts } from "~/composables/app/useContacts";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

const route = useRoute();
const audienceId = computed(() => String(route.params.id));

const { getAudience } = useAudiences();
const {
  listContacts,
  addContact,
  updateContact,
  deleteContact: deleteContactCloud,
} = useContacts();

const audience = ref(null);
const audienceError = ref("");

useHead(() => ({ title: audience.value ? audience.value.name : "Audience" }));

// ── Contact table state ───────────────────────────────────────────────────────
const contacts = ref([]);
const total = ref(0);
const page = ref(0);
const perPage = ref(25);
const search = ref("");
const loading = ref(true);
const listError = ref("");

const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / perPage.value)),
);

const STATUS_LABELS = {
  subscribed: "Subscribed",
  unsubscribed: "Unsubscribed",
  cleaned: "Cleaned",
  pending: "Pending",
};

async function loadAudience() {
  audienceError.value = "";
  try {
    audience.value = await getAudience(audienceId.value);
  } catch (err) {
    audienceError.value = err?.message || "Audience not found.";
  }
}

async function loadContacts() {
  loading.value = true;
  listError.value = "";
  try {
    const res = await listContacts({
      audienceId: audienceId.value,
      page: page.value,
      perPage: perPage.value,
      search: search.value.trim() || undefined,
    });
    contacts.value = res.rows;
    total.value = res.total;
  } catch (err) {
    listError.value = err?.message || "Could not load contacts.";
  } finally {
    loading.value = false;
  }
}

function fullName(c) {
  return [c.firstName, c.lastName].filter(Boolean).join(" ") || "—";
}
function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

onMounted(async () => {
  await loadAudience();
  await loadContacts();
});

// Debounced search re-query.
let searchTimer = null;
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 0;
    void loadContacts();
  }, 350);
});

function goPage(delta) {
  const next = page.value + delta;
  if (next < 0 || next >= totalPages.value) return;
  page.value = next;
  void loadContacts();
}

// ── Add / edit modal ──────────────────────────────────────────────────────────
const showForm = ref(false);
const formMode = ref("add"); // "add" | "edit"
const formError = ref("");
const saving = ref(false);
const editingId = ref(null);
const form = ref({
  email: "",
  firstName: "",
  lastName: "",
  status: "subscribed",
});
const dupContactId = ref(null);

function openAdd() {
  formMode.value = "add";
  editingId.value = null;
  dupContactId.value = null;
  formError.value = "";
  form.value = { email: "", firstName: "", lastName: "", status: "subscribed" };
  showForm.value = true;
}
function openEdit(c) {
  formMode.value = "edit";
  editingId.value = c.id;
  dupContactId.value = null;
  formError.value = "";
  form.value = {
    email: c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    status: c.status,
  };
  showForm.value = true;
}
function closeForm() {
  if (saving.value) return;
  showForm.value = false;
}

async function submitForm() {
  const email = form.value.email.trim();
  if (!email) {
    formError.value = "Email is required.";
    return;
  }
  saving.value = true;
  formError.value = "";
  dupContactId.value = null;
  try {
    if (formMode.value === "add") {
      await addContact(audienceId.value, {
        email,
        firstName: form.value.firstName.trim(),
        lastName: form.value.lastName.trim(),
        status: form.value.status,
      });
    } else {
      await updateContact(editingId.value, {
        email,
        firstName: form.value.firstName.trim(),
        lastName: form.value.lastName.trim(),
        status: form.value.status,
      });
    }
    showForm.value = false;
    await Promise.all([loadContacts(), loadAudience()]);
  } catch (err) {
    formError.value = err?.message || "Could not save contact.";
    // 137 = DUPLICATE_VALUE → offer "open contact".
    if (err?.code === 137 && err?.contactId) dupContactId.value = err.contactId;
  } finally {
    saving.value = false;
  }
}

// ── Contact detail drawer (F-09) ──────────────────────────────────────────────
const drawerContact = ref(null);
const drawerTab = ref("details"); // "details" | "activity"

function openDrawer(c) {
  drawerContact.value = c;
  drawerTab.value = "details";
}
function closeDrawer() {
  drawerContact.value = null;
}
function openDrawerById(id) {
  const c = contacts.value.find((x) => x.id === id);
  if (c) openDrawer(c);
}

async function removeContact(c) {
  if (!confirm(`Remove ${c.email} from this audience?`)) return;
  try {
    await deleteContactCloud(c.id);
    if (drawerContact.value?.id === c.id) closeDrawer();
    await Promise.all([loadContacts(), loadAudience()]);
  } catch (err) {
    listError.value = err?.message || "Could not remove contact.";
  }
}

const drawerCustomFields = computed(() => {
  const cf = drawerContact.value?.customFields || {};
  return Object.entries(cf);
});
</script>

<template>
  <div class="ad">
    <!-- Breadcrumb + header -->
    <div class="ad-crumb">
      <NuxtLink to="/app/audiences" class="ad-crumb-link">Audiences</NuxtLink>
      <span aria-hidden="true">/</span>
      <span class="ad-crumb-current">{{ audience ? audience.name : "…" }}</span>
    </div>

    <p v-if="audienceError" class="ad-state ad-state--error">{{ audienceError }}</p>

    <header v-else class="ad-header">
      <div class="ad-header-text">
        <h1>{{ audience ? audience.name : "Audience" }}</h1>
        <p class="ad-lede">
          <span v-if="audience">{{ (audience.contactCount || 0).toLocaleString("en-US") }} contacts</span>
          <span v-if="audience && audience.description"> &middot; {{ audience.description }}</span>
        </p>
      </div>
      <button type="button" class="ad-cta" @click="openAdd">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Add contact</span>
      </button>
    </header>

    <!-- Toolbar -->
    <div class="ad-toolbar">
      <input
        v-model="search"
        class="ad-search"
        type="search"
        placeholder="Search by email…"
        aria-label="Search contacts by email"
      />
    </div>

    <!-- Table -->
    <p v-if="loading" class="ad-state">Loading contacts…</p>
    <p v-else-if="listError" class="ad-state ad-state--error">
      {{ listError }}
      <button type="button" class="ad-retry" @click="loadContacts">Retry</button>
    </p>
    <div v-else-if="contacts.length === 0" class="ad-empty">
      <h2 class="ad-empty-title">No contacts yet</h2>
      <p class="ad-empty-lede">Add your first contact to start building this audience.</p>
      <button type="button" class="ad-cta" @click="openAdd">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>Add contact</span>
      </button>
    </div>

    <div v-else class="ad-table-wrap">
      <table class="ad-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Status</th>
            <th>Added</th>
            <th class="ad-th-actions"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in contacts" :key="c.id" class="ad-row" @click="openDrawer(c)">
            <td class="ad-td-email">{{ c.email }}</td>
            <td>{{ fullName(c) }}</td>
            <td>
              <span :class="['ad-status', `ad-status--${c.status}`]">
                {{ STATUS_LABELS[c.status] || c.status }}
              </span>
            </td>
            <td class="ad-td-date">{{ formatDate(c.createdAt) }}</td>
            <td class="ad-td-actions" @click.stop>
              <button type="button" class="ad-link" @click="openEdit(c)">Edit</button>
              <button type="button" class="ad-link ad-link--danger" @click="removeContact(c)">Remove</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pager -->
      <div class="ad-pager">
        <span class="ad-pager-info">
          {{ total.toLocaleString("en-US") }} contacts &middot; page {{ page + 1 }} of {{ totalPages }}
        </span>
        <div class="ad-pager-btns">
          <button type="button" class="ad-btn ad-btn--ghost" :disabled="page === 0" @click="goPage(-1)">
            Previous
          </button>
          <button
            type="button"
            class="ad-btn ad-btn--ghost"
            :disabled="page + 1 >= totalPages"
            @click="goPage(1)"
          >
            Next
          </button>
        </div>
      </div>
    </div>

    <!-- Add / edit modal -->
    <div v-if="showForm" class="ad-modal-backdrop" @mousedown.self="closeForm">
      <div class="ad-modal" role="dialog" aria-modal="true" aria-labelledby="ad-form-title">
        <h2 id="ad-form-title" class="ad-modal-title">
          {{ formMode === "add" ? "Add contact" : "Edit contact" }}
        </h2>
        <form @submit.prevent="submitForm">
          <label class="ad-field">
            <span class="ad-field-label">Email</span>
            <input v-model="form.email" class="ad-input" type="email" placeholder="name@example.com" autofocus />
          </label>
          <div class="ad-field-row">
            <label class="ad-field">
              <span class="ad-field-label">First name</span>
              <input v-model="form.firstName" class="ad-input" type="text" />
            </label>
            <label class="ad-field">
              <span class="ad-field-label">Last name</span>
              <input v-model="form.lastName" class="ad-input" type="text" />
            </label>
          </div>
          <label class="ad-field">
            <span class="ad-field-label">Status</span>
            <select v-model="form.status" class="ad-input">
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="pending">Pending</option>
              <option value="cleaned">Cleaned</option>
            </select>
          </label>
          <p v-if="formError" class="ad-modal-error">
            {{ formError }}
            <button
              v-if="dupContactId"
              type="button"
              class="ad-link"
              @click="(showForm = false), openDrawerById(dupContactId)"
            >
              Open contact
            </button>
          </p>
          <div class="ad-modal-actions">
            <button type="button" class="ad-btn ad-btn--ghost" :disabled="saving" @click="closeForm">Cancel</button>
            <button type="submit" class="ad-btn ad-btn--primary" :disabled="saving">
              {{ saving ? "Saving…" : formMode === "add" ? "Add contact" : "Save changes" }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Contact detail drawer (F-09) -->
    <div v-if="drawerContact" class="ad-drawer-backdrop" @mousedown.self="closeDrawer">
      <aside class="ad-drawer" role="dialog" aria-modal="true" aria-labelledby="ad-drawer-title">
        <header class="ad-drawer-head">
          <div>
            <h2 id="ad-drawer-title" class="ad-drawer-title">{{ drawerContact.email }}</h2>
            <span :class="['ad-status', `ad-status--${drawerContact.status}`]">
              {{ STATUS_LABELS[drawerContact.status] || drawerContact.status }}
            </span>
          </div>
          <button type="button" class="ad-drawer-close" aria-label="Close" @click="closeDrawer">×</button>
        </header>

        <div class="ad-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            :aria-selected="drawerTab === 'details'"
            :class="['ad-tab', { 'ad-tab--active': drawerTab === 'details' }]"
            @click="drawerTab = 'details'"
          >
            Details
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="drawerTab === 'activity'"
            :class="['ad-tab', { 'ad-tab--active': drawerTab === 'activity' }]"
            @click="drawerTab = 'activity'"
          >
            Activity
          </button>
        </div>

        <div v-if="drawerTab === 'details'" class="ad-drawer-body">
          <dl class="ad-deflist">
            <dt>First name</dt><dd>{{ drawerContact.firstName || "—" }}</dd>
            <dt>Last name</dt><dd>{{ drawerContact.lastName || "—" }}</dd>
            <dt>Status</dt><dd>{{ STATUS_LABELS[drawerContact.status] || drawerContact.status }}</dd>
            <dt>List membership</dt><dd>{{ (drawerContact.lists || []).length }} list(s)</dd>
            <dt>Added</dt><dd>{{ formatDate(drawerContact.createdAt) }}</dd>
          </dl>

          <template v-if="drawerCustomFields.length">
            <h3 class="ad-drawer-subhead">Custom fields</h3>
            <dl class="ad-deflist">
              <template v-for="[k, v] in drawerCustomFields" :key="k">
                <dt>{{ k }}</dt><dd>{{ v }}</dd>
              </template>
            </dl>
          </template>

          <div class="ad-drawer-actions">
            <button type="button" class="ad-btn ad-btn--ghost" @click="openEdit(drawerContact)">Edit</button>
            <button type="button" class="ad-btn ad-btn--ghost ad-btn--danger" @click="removeContact(drawerContact)">
              Remove
            </button>
          </div>
        </div>

        <div v-else class="ad-drawer-body">
          <div class="ad-activity-empty">
            <p class="ad-activity-title">No activity yet</p>
            <p class="ad-activity-lede">
              Opens, clicks, and deliveries will appear here once you send a
              campaign to this contact.
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.ad {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Breadcrumb */
.ad-crumb {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-dim);
}
.ad-crumb-link { color: var(--link-color); text-decoration: none; font-weight: 600; }
.ad-crumb-link:hover { text-decoration: underline; }
.ad-crumb-current { color: var(--color-ink-soft); }

/* Header */
.ad-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.ad-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  color: var(--color-ink);
}
.ad-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.ad-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background-color var(--dur-base) var(--ease-out);
}
.ad-cta:hover { background: var(--btn-primary-hover); }
.ad-cta:focus-visible { outline: none; box-shadow: var(--shadow-pop-glow); }

/* Toolbar */
.ad-toolbar { display: flex; gap: var(--space-3); }
.ad-search {
  width: 100%;
  max-width: 320px;
  padding: var(--space-2) var(--space-3);
  min-height: var(--field-height);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  outline: none;
}
.ad-search:focus-visible { border-color: var(--field-border-focus); box-shadow: var(--shadow-pop-glow); }

/* State + empty */
.ad-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.ad-state--error { color: var(--color-danger); }
.ad-retry {
  margin-left: var(--space-3);
  background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}
.ad-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface);
  border: 1px dashed var(--color-rule-strong);
  border-radius: var(--radius-lg);
}
.ad-empty-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.ad-empty-lede { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

/* Table */
.ad-table-wrap {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.ad-table { width: 100%; border-collapse: collapse; font-family: var(--font-body); font-size: var(--text-sm); }
.ad-table thead th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-surface-sunk);
}
.ad-th-actions { width: 1%; }
.ad-row { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-out); }
.ad-row:hover { background: var(--color-surface-sunk); }
.ad-table td {
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-rule);
  color: var(--color-ink);
}
.ad-table tbody tr:last-child td { border-bottom: none; }
.ad-td-email { font-weight: 500; }
.ad-td-date { color: var(--color-ink-soft); font-variant-numeric: tabular-nums; }
.ad-td-actions { white-space: nowrap; text-align: right; }
.ad-link {
  background: none; border: none; padding: 0 var(--space-2);
  color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer;
}
.ad-link:hover { text-decoration: underline; }
.ad-link--danger { color: var(--color-danger); }

/* Status pills */
.ad-status {
  display: inline-flex;
  align-items: center;
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  border-radius: var(--radius-pill);
  line-height: 1.2;
}
.ad-status--subscribed { background: var(--color-ok-bg); color: var(--color-ok); }
.ad-status--unsubscribed { background: var(--color-danger-bg); color: var(--color-danger); }
.ad-status--pending { background: var(--color-warn-bg); color: var(--color-warn); }
.ad-status--cleaned { background: var(--color-surface-sunk); color: var(--color-ink-soft); }

/* Pager */
.ad-pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-rule);
  background: var(--color-surface-sunk);
}
.ad-pager-info { font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-ink-dim); }
.ad-pager-btns { display: flex; gap: var(--space-2); }

/* Buttons */
.ad-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background-color var(--dur-base) var(--ease-out);
}
.ad-btn:disabled { opacity: 0.5; cursor: default; }
.ad-btn--primary { background: var(--btn-primary-bg); color: var(--btn-primary-fg); }
.ad-btn--primary:not(:disabled):hover { background: var(--btn-primary-hover); }
.ad-btn--ghost { background: var(--color-surface); color: var(--color-ink-soft); border-color: var(--color-rule); }
.ad-btn--ghost:not(:disabled):hover { background: var(--color-surface-sunk); }
.ad-btn--danger { color: var(--color-danger); }

/* Modal */
.ad-modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-5);
  background: rgba(24, 24, 27, 0.45);
}
.ad-modal {
  width: 100%; max-width: 480px;
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.ad-modal-title { margin: 0 0 var(--space-5); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.ad-field { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-4); }
.ad-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.ad-field-label { font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; color: var(--color-ink); }
.ad-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  min-height: var(--field-height);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  outline: none;
}
.ad-input:focus-visible { border-color: var(--field-border-focus); box-shadow: var(--shadow-pop-glow); }
.ad-modal-error { margin: 0 0 var(--space-3); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }
.ad-modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }

/* Drawer */
.ad-drawer-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; justify-content: flex-end;
  background: rgba(24, 24, 27, 0.45);
}
.ad-drawer {
  width: 100%; max-width: 420px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-left: 1px solid var(--color-rule);
  box-shadow: var(--shadow-lg);
  overflow-y: auto;
}
.ad-drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-rule);
}
.ad-drawer-title { margin: 0 0 var(--space-2); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-ink); overflow-wrap: anywhere; }
.ad-drawer-close { background: none; border: none; font-size: var(--text-2xl); line-height: 1; color: var(--color-ink-dim); cursor: pointer; padding: 0 var(--space-2); }
.ad-drawer-close:hover { color: var(--color-ink); }
.ad-tabs { display: flex; gap: var(--space-1); padding: 0 var(--space-5); border-bottom: 1px solid var(--color-rule); }
.ad-tab {
  background: none; border: none;
  padding: var(--space-3) var(--space-2);
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--color-ink-dim); cursor: pointer;
  border-bottom: 2px solid transparent;
}
.ad-tab--active { color: var(--color-ink); border-bottom-color: var(--color-pop); }
.ad-drawer-body { padding: var(--space-5); display: flex; flex-direction: column; gap: var(--space-4); }
.ad-deflist {
  display: grid;
  grid-template-columns: minmax(0, 40%) minmax(0, 60%);
  gap: var(--space-2) var(--space-3);
  margin: 0;
  font-family: var(--font-body); font-size: var(--text-sm);
}
.ad-deflist dt { color: var(--color-ink-dim); font-weight: 600; }
.ad-deflist dd { margin: 0; color: var(--color-ink); overflow-wrap: anywhere; }
.ad-drawer-subhead { margin: 0; font-family: var(--font-body); font-size: var(--text-xs); font-weight: 600; letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--color-ink-dim); }
.ad-drawer-actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); }
.ad-activity-empty {
  padding: var(--space-6);
  text-align: center;
  background: var(--color-surface-sunk);
  border-radius: var(--radius-md);
}
.ad-activity-title { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--text-md); font-weight: 600; color: var(--color-ink); }
.ad-activity-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
</style>
