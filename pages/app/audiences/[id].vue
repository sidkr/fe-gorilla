<script setup>
// Audience detail — the contact table for one List (F-08) plus an add-contact
// modal, inline edit, and a contact detail drawer (F-09). Contacts are loaded
// paginated via listContacts. Activity is a graceful empty state until the send
// pipeline exists (no CampaignSend / EmailEvent rows yet).
import { computed, onMounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useAudiences } from "~/composables/app/useAudiences";
import { useContacts } from "~/composables/app/useContacts";
import { useCustomFields } from "~/composables/app/useCustomFields";
import ImportWizard from "~/components/app/import/ImportWizard.vue";

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
  bulkDeleteContacts,
  bulkTagContacts,
} = useContacts();
const { listCustomFields } = useCustomFields();

const audience = ref(null);
const audienceError = ref("");

// ── Custom-field registry (drives the dynamic form section + extra columns) ───
const customFields = ref([]);
async function loadCustomFields() {
  try {
    customFields.value = await listCustomFields();
  } catch {
    customFields.value = []; // form still works with std fields only
  }
}
// Up to two custom fields are shown as extra table columns (compact table).
const columnFields = computed(() => customFields.value.slice(0, 2));

useHead(() => ({ title: audience.value ? audience.value.name : "Audience" }));

// ── Contact table state ───────────────────────────────────────────────────────
const contacts = ref([]);
const total = ref(0);
const page = ref(0);
const perPage = ref(25);
const search = ref("");
const statusFilter = ref("");
const tagFilter = ref("");
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

// Tag universe for the filter dropdown — derived from the currently loaded rows
// (best-effort; a contact carrying a tag not on the current page just won't show
// as an option until it's loaded). Cheap + good enough for the filter affordance.
const knownTags = computed(() => {
  const set = new Set();
  for (const c of contacts.value) for (const t of c.tags || []) set.add(t);
  return Array.from(set).sort();
});

// ── Row selection (bulk actions) ──────────────────────────────────────────────
const selected = ref(new Set());
const selectedCount = computed(() => selected.value.size);
const allOnPageSelected = computed(
  () =>
    contacts.value.length > 0 &&
    contacts.value.every((c) => selected.value.has(c.id)),
);
function toggleRow(id) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}
function toggleAllOnPage() {
  const next = new Set(selected.value);
  if (allOnPageSelected.value) {
    for (const c of contacts.value) next.delete(c.id);
  } else {
    for (const c of contacts.value) next.add(c.id);
  }
  selected.value = next;
}
function clearSelection() {
  selected.value = new Set();
}

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
      status: statusFilter.value || undefined,
      tag: tagFilter.value || undefined,
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
  await Promise.all([loadAudience(), loadCustomFields()]);
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

// Filters re-query immediately (and reset to page 0).
watch([statusFilter, tagFilter], () => {
  page.value = 0;
  void loadContacts();
});

// Display helper for a custom-field value in a table cell / drawer.
function displayCustomValue(field, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (field?.type === "boolean") return value ? "Yes" : "No";
  if (field?.type === "date") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? String(value) : formatDate(d.toISOString());
  }
  return String(value);
}

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
const dupContactId = ref(null);

const STD_STRING_FIELDS = ["company", "phone", "city", "country", "timezone"];

// Reactive form covers standard + rich fields. Custom-field values live in a
// separate keyed map so we can rebuild it from the registry each open.
const form = reactive({
  email: "",
  firstName: "",
  lastName: "",
  status: "subscribed",
  company: "",
  phone: "",
  city: "",
  country: "",
  timezone: "",
});
const tagsText = ref(""); // comma-separated in the input
const customForm = reactive({}); // { [fieldKey]: value }

// (Re)build the dynamic customForm map from the registry, seeding from a
// contact's stored values when editing. Booleans default to false, others "".
function seedCustomForm(contact) {
  for (const k of Object.keys(customForm)) delete customForm[k];
  const stored = contact?.customFields || {};
  for (const f of customFields.value) {
    const v = stored[f.key];
    if (f.type === "boolean") customForm[f.key] = v === true;
    else if (f.type === "date" && v) customForm[f.key] = String(v).slice(0, 10);
    else customForm[f.key] = v == null ? "" : String(v);
  }
}

function resetStdForm(contact) {
  form.email = contact?.email || "";
  form.firstName = contact?.firstName || "";
  form.lastName = contact?.lastName || "";
  form.status = contact?.status || "subscribed";
  for (const f of STD_STRING_FIELDS) form[f] = contact?.[f] || "";
  tagsText.value = (contact?.tags || []).join(", ");
}

// ── CSV import wizard (F-07) ────────────────────────────────────────────────--
const showImport = ref(false);
function openImport() {
  showImport.value = true;
}
async function onImportDone() {
  await Promise.all([loadContacts(), loadAudience()]);
}

function openAdd() {
  formMode.value = "add";
  editingId.value = null;
  dupContactId.value = null;
  formError.value = "";
  resetStdForm(null);
  seedCustomForm(null);
  showForm.value = true;
}
function openEdit(c) {
  formMode.value = "edit";
  editingId.value = c.id;
  dupContactId.value = null;
  formError.value = "";
  resetStdForm(c);
  seedCustomForm(c);
  showForm.value = true;
}
function closeForm() {
  if (saving.value) return;
  showForm.value = false;
}

// Assemble the customFields payload from the dynamic form. Empty values are
// omitted (server treats absent / "" as no-value); the server cleans + coerces.
function collectCustomFields() {
  const out = {};
  for (const f of customFields.value) {
    const v = customForm[f.key];
    if (f.type === "boolean") {
      out[f.key] = v === true;
    } else if (v !== "" && v !== null && v !== undefined) {
      out[f.key] = v;
    }
  }
  return out;
}

function parseTags(text) {
  return text
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

async function submitForm() {
  const email = form.email.trim();
  if (!email) {
    formError.value = "Email is required.";
    return;
  }
  // Client-side required-field check for custom fields.
  for (const f of customFields.value) {
    if (f.required) {
      const v = customForm[f.key];
      const missing =
        f.type === "boolean" ? v !== true : v === "" || v == null;
      if (missing) {
        formError.value = `"${f.label}" is required.`;
        return;
      }
    }
  }
  saving.value = true;
  formError.value = "";
  dupContactId.value = null;

  const payload = {
    email,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    status: form.status,
    company: form.company.trim(),
    phone: form.phone.trim(),
    city: form.city.trim(),
    country: form.country.trim(),
    timezone: form.timezone.trim(),
    tags: parseTags(tagsText.value),
    customFields: collectCustomFields(),
  };

  try {
    if (formMode.value === "add") {
      await addContact(audienceId.value, payload);
    } else {
      await updateContact(editingId.value, payload);
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

// ── Bulk actions ──────────────────────────────────────────────────────────────
const bulkBusy = ref(false);
async function bulkDelete() {
  const ids = Array.from(selected.value);
  if (ids.length === 0) return;
  if (!confirm(`Remove ${ids.length} contact(s) from this audience?`)) return;
  bulkBusy.value = true;
  try {
    await bulkDeleteContacts(ids);
    clearSelection();
    await Promise.all([loadContacts(), loadAudience()]);
  } catch (err) {
    listError.value = err?.message || "Could not remove contacts.";
  } finally {
    bulkBusy.value = false;
  }
}
async function bulkTag(action) {
  const ids = Array.from(selected.value);
  if (ids.length === 0) return;
  const tag = window.prompt(
    action === "add" ? "Tag to add to selected contacts:" : "Tag to remove:",
  );
  if (!tag || !tag.trim()) return;
  bulkBusy.value = true;
  try {
    await bulkTagContacts(ids, tag.trim(), action);
    await loadContacts();
  } catch (err) {
    listError.value = err?.message || "Could not update tags.";
  } finally {
    bulkBusy.value = false;
  }
}

// Drawer custom fields: prefer the registry order + labels; fall back to any
// stored keys that are no longer in the registry (deleted fields) so nothing
// silently vanishes from the detail view.
const drawerCustomFields = computed(() => {
  const cf = drawerContact.value?.customFields || {};
  const out = [];
  const seen = new Set();
  for (const f of customFields.value) {
    if (cf[f.key] !== undefined) {
      out.push({ label: f.label, value: displayCustomValue(f, cf[f.key]) });
      seen.add(f.key);
    }
  }
  for (const [k, v] of Object.entries(cf)) {
    if (!seen.has(k)) out.push({ label: k, value: String(v) });
  }
  return out;
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
      <div class="ad-header-actions">
        <Button variant="ghost" @click="openImport">
          <template #leading>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 9.5 V2.5 M4 5.5 L7 2.5 L10 5.5 M2.5 11.5 H11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
          </template>
          Import CSV
        </Button>
        <Button variant="primary" @click="openAdd">
          <template #leading>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </template>
          Add contact
        </Button>
      </div>
    </header>

    <!-- Toolbar -->
    <div class="ad-toolbar">
      <div class="ad-search">
        <TextInput
          v-model="search"
          type="search"
          placeholder="Search by email…"
          aria-label="Search contacts by email"
        />
      </div>
      <div class="ad-filter">
        <SelectInput v-model="statusFilter" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="subscribed">Subscribed</option>
          <option value="unsubscribed">Unsubscribed</option>
          <option value="pending">Pending</option>
          <option value="cleaned">Cleaned</option>
        </SelectInput>
      </div>
      <div v-if="knownTags.length" class="ad-filter">
        <SelectInput v-model="tagFilter" aria-label="Filter by tag">
          <option value="">All tags</option>
          <option v-for="t in knownTags" :key="t" :value="t">{{ t }}</option>
        </SelectInput>
      </div>
      <span class="ad-toolbar-spacer" aria-hidden="true"></span>
      <NuxtLink to="/app/audiences/fields" class="ad-toolbar-link">Manage fields</NuxtLink>
    </div>

    <!-- Bulk action bar -->
    <div v-if="selectedCount > 0" class="ad-bulkbar">
      <span class="ad-bulkbar-count">{{ selectedCount }} selected</span>
      <div class="ad-bulkbar-actions">
        <Button variant="ghost" size="sm" :disabled="bulkBusy" @click="bulkTag('add')">Add tag</Button>
        <Button variant="ghost" size="sm" :disabled="bulkBusy" @click="bulkTag('remove')">Remove tag</Button>
        <Button variant="danger" size="sm" :disabled="bulkBusy" @click="bulkDelete">Remove from audience</Button>
        <Button variant="ghost" size="sm" :disabled="bulkBusy" @click="clearSelection">Clear</Button>
      </div>
    </div>

    <!-- Table -->
    <p v-if="loading" class="ad-state">Loading contacts…</p>
    <p v-else-if="listError" class="ad-state ad-state--error">
      {{ listError }}
      <button type="button" class="ad-retry" @click="loadContacts">Retry</button>
    </p>
    <EmptyState
      v-else-if="contacts.length === 0"
      title="No contacts yet"
      subtitle="Add your first contact to start building this audience."
    >
      <template #action>
        <Button variant="primary" @click="openAdd">
          <template #leading>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </template>
          Add contact
        </Button>
      </template>
    </EmptyState>

    <div v-else>
      <TableShell>
        <template #head>
          <th class="ad-th-check">
            <input
              type="checkbox"
              :checked="allOnPageSelected"
              aria-label="Select all on this page"
              @change="toggleAllOnPage"
            />
          </th>
          <th>Email</th>
          <th>Name</th>
          <th>Status</th>
          <th v-for="f in columnFields" :key="f.id">{{ f.label }}</th>
          <th>Tags</th>
          <th>Added</th>
          <th class="ad-th-actions"><span class="sr-only">Actions</span></th>
        </template>
        <template #body>
          <tr
            v-for="c in contacts"
            :key="c.id"
            class="ad-row"
            :class="{ 'ad-row--selected': selected.has(c.id) }"
            @click="openDrawer(c)"
          >
            <td class="ad-td-check" @click.stop>
              <input
                type="checkbox"
                :checked="selected.has(c.id)"
                :aria-label="`Select ${c.email}`"
                @change="toggleRow(c.id)"
              />
            </td>
            <td class="ad-td-email">{{ c.email }}</td>
            <td>{{ fullName(c) }}</td>
            <td>
              <span :class="['ad-status', `ad-status--${c.status}`]">
                {{ STATUS_LABELS[c.status] || c.status }}
              </span>
            </td>
            <td v-for="f in columnFields" :key="f.id" class="ad-td-cf">
              {{ displayCustomValue(f, (c.customFields || {})[f.key]) }}
            </td>
            <td class="ad-td-tags">
              <span v-if="(c.tags || []).length === 0" class="ad-td-muted">—</span>
              <span v-for="t in c.tags" :key="t" class="ad-tag-chip">{{ t }}</span>
            </td>
            <td class="ad-td-date">{{ formatDate(c.createdAt) }}</td>
            <td class="ad-td-actions" @click.stop>
              <button type="button" class="ad-link" @click="openEdit(c)">Edit</button>
              <button type="button" class="ad-link ad-link--danger" @click="removeContact(c)">Remove</button>
            </td>
          </tr>
        </template>
      </TableShell>

      <!-- Pager -->
      <div class="ad-pager">
        <span class="ad-pager-info">
          {{ total.toLocaleString("en-US") }} contacts &middot; page {{ page + 1 }} of {{ totalPages }}
        </span>
        <div class="ad-pager-btns">
          <Button variant="ghost" size="sm" :disabled="page === 0" @click="goPage(-1)">
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            :disabled="page + 1 >= totalPages"
            @click="goPage(1)"
          >
            Next
          </Button>
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
          <FormField label="Email" class="ad-field">
            <TextInput v-model="form.email" type="email" placeholder="name@example.com" />
          </FormField>
          <div class="ad-field-row">
            <FormField label="First name" class="ad-field">
              <TextInput v-model="form.firstName" type="text" />
            </FormField>
            <FormField label="Last name" class="ad-field">
              <TextInput v-model="form.lastName" type="text" />
            </FormField>
          </div>
          <FormField label="Status" class="ad-field">
            <SelectInput v-model="form.status">
              <option value="subscribed">Subscribed</option>
              <option value="unsubscribed">Unsubscribed</option>
              <option value="pending">Pending</option>
              <option value="cleaned">Cleaned</option>
            </SelectInput>
          </FormField>

          <div class="ad-field-row">
            <FormField label="Company" class="ad-field">
              <TextInput v-model="form.company" type="text" />
            </FormField>
            <FormField label="Phone" class="ad-field">
              <TextInput v-model="form.phone" type="tel" />
            </FormField>
          </div>
          <div class="ad-field-row">
            <FormField label="City" class="ad-field">
              <TextInput v-model="form.city" type="text" />
            </FormField>
            <FormField label="Country" class="ad-field">
              <TextInput v-model="form.country" type="text" />
            </FormField>
          </div>
          <FormField label="Timezone" class="ad-field">
            <TextInput v-model="form.timezone" type="text" placeholder="e.g. Europe/Berlin" />
          </FormField>
          <FormField label="Tags" hint="(comma separated)" class="ad-field">
            <TextInput v-model="tagsText" type="text" placeholder="vip, beta, newsletter" />
          </FormField>

          <!-- Dynamic custom-field section, generated from the org registry. -->
          <template v-if="customFields.length">
            <h3 class="ad-form-subhead">Custom fields</h3>
            <FormField
              v-for="f in customFields"
              :key="f.id"
              :label="f.label"
              :required="f.required"
              class="ad-field"
            >
              <Checkbox v-if="f.type === 'boolean'" v-model="customForm[f.key]">Yes</Checkbox>
              <SelectInput v-else-if="f.type === 'enum'" v-model="customForm[f.key]">
                <option value="">—</option>
                <option v-for="opt in f.enumValues" :key="opt" :value="opt">{{ opt }}</option>
              </SelectInput>
              <TextInput
                v-else-if="f.type === 'number'"
                v-model="customForm[f.key]"
                type="number"
                step="any"
              />
              <TextInput
                v-else-if="f.type === 'date'"
                v-model="customForm[f.key]"
                type="date"
              />
              <TextInput v-else v-model="customForm[f.key]" type="text" />
            </FormField>
          </template>

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
            <Button variant="ghost" :disabled="saving" @click="closeForm">Cancel</Button>
            <Button type="submit" variant="primary" :loading="saving">
              {{ saving ? "Saving…" : formMode === "add" ? "Add contact" : "Save changes" }}
            </Button>
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
            <dt>Company</dt><dd>{{ drawerContact.company || "—" }}</dd>
            <dt>Phone</dt><dd>{{ drawerContact.phone || "—" }}</dd>
            <dt>City</dt><dd>{{ drawerContact.city || "—" }}</dd>
            <dt>Country</dt><dd>{{ drawerContact.country || "—" }}</dd>
            <dt>Timezone</dt><dd>{{ drawerContact.timezone || "—" }}</dd>
            <dt>Tags</dt>
            <dd>
              <template v-if="(drawerContact.tags || []).length">
                <span v-for="t in drawerContact.tags" :key="t" class="ad-tag-chip">{{ t }}</span>
              </template>
              <span v-else>—</span>
            </dd>
            <dt>List membership</dt><dd>{{ (drawerContact.lists || []).length }} list(s)</dd>
            <dt>Added</dt><dd>{{ formatDate(drawerContact.createdAt) }}</dd>
          </dl>

          <template v-if="drawerCustomFields.length">
            <h3 class="ad-drawer-subhead">Custom fields</h3>
            <dl class="ad-deflist">
              <template v-for="row in drawerCustomFields" :key="row.label">
                <dt>{{ row.label }}</dt><dd>{{ row.value }}</dd>
              </template>
            </dl>
          </template>

          <div class="ad-drawer-actions">
            <Button variant="ghost" size="sm" @click="openEdit(drawerContact)">Edit</Button>
            <Button variant="danger" size="sm" @click="removeContact(drawerContact)">
              Remove
            </Button>
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

    <!-- CSV import wizard (F-07) -->
    <ImportWizard
      v-if="showImport"
      :audience-id="audienceId"
      :custom-fields="customFields"
      @close="showImport = false"
      @done="onImportDone"
    />
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
.ad-header-actions { display: flex; gap: var(--space-3); align-items: center; }

/* Toolbar */
.ad-toolbar { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap; }
.ad-search { width: 100%; max-width: 280px; }
.ad-filter { min-width: 160px; }
.ad-toolbar-spacer { flex: 1 1 auto; }
.ad-toolbar-link {
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--link-color); text-decoration: none; white-space: nowrap;
}
.ad-toolbar-link:hover { text-decoration: underline; }

/* Bulk action bar */
.ad-bulkbar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-3); flex-wrap: wrap;
  padding: var(--space-3) var(--space-4);
  background: var(--color-surface-sunk);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
}
.ad-bulkbar-count { font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; color: var(--color-ink); }
.ad-bulkbar-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

/* State + empty */
.ad-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.ad-state--error { color: var(--color-danger); }
.ad-retry {
  margin-left: var(--space-3);
  background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}
/* Table */
.ad-th-actions { width: 1%; }
.ad-th-check { width: 1%; }
.ad-td-check { width: 1%; }
.ad-row { cursor: pointer; transition: background-color var(--dur-fast) var(--ease-out); }
.ad-row:hover { background: var(--color-surface-sunk); }
.ad-row--selected { background: var(--color-pop-glow, var(--color-surface-sunk)); }
.ad-td-cf { color: var(--color-ink-soft); }
.ad-td-muted { color: var(--color-ink-dim); }
.ad-td-tags { max-width: 220px; }
.ad-tag-chip {
  display: inline-block;
  margin: 0 var(--space-1) var(--space-1) 0;
  padding: 1px var(--space-2);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  background: var(--color-surface-sunk);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
}
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

/* Modal */
.ad-modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-5);
  background: rgba(24, 24, 27, 0.45);
}
.ad-modal {
  width: 100%; max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  padding: var(--space-6);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.ad-modal-title { margin: 0 0 var(--space-5); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.ad-field { margin-bottom: var(--space-4); }
.ad-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.ad-form-subhead {
  margin: var(--space-2) 0 var(--space-3);
  font-family: var(--font-body); font-size: var(--text-xs); font-weight: 600;
  letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--color-ink-dim);
}
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
