<script setup lang="ts">
// Custom-field (data-point) management for the org. Lists the registry and lets
// you create / edit / delete field definitions via useCustomFields. The contact
// form reads this same registry to render its dynamic section, so this page is
// where you shape the contact data model. Pop chrome mirrors the audiences page.
import { computed, onMounted, reactive, ref } from "vue";
import {
  useCustomFields,
  FIELD_TYPES,
  type CustomField,
  type FieldType,
} from "~/composables/app/useCustomFields";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Custom fields" });

const {
  listCustomFields,
  createCustomField,
  updateCustomField,
  deleteCustomField,
} = useCustomFields();

const fields = ref<CustomField[]>([]);
const loading = ref(true);
const loadError = ref("");

const TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Yes / No",
  enum: "Choice (enum)",
};

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    fields.value = await listCustomFields();
  } catch (err: any) {
    loadError.value = err?.message || "Could not load custom fields.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Create / edit modal ───────────────────────────────────────────────────────
const showForm = ref(false);
const mode = ref<"create" | "edit">("create");
const editingId = ref<string | null>(null);
const saving = ref(false);
const formError = ref("");

const form = reactive({
  label: "",
  type: "text" as FieldType,
  required: false,
  enumValuesText: "", // newline / comma separated in the textarea
});

function parseEnumValues(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function openCreate() {
  mode.value = "create";
  editingId.value = null;
  formError.value = "";
  form.label = "";
  form.type = "text";
  form.required = false;
  form.enumValuesText = "";
  showForm.value = true;
}
function openEdit(f: CustomField) {
  mode.value = "edit";
  editingId.value = f.id;
  formError.value = "";
  form.label = f.label;
  form.type = f.type; // type is immutable on edit; shown disabled
  form.required = f.required;
  form.enumValuesText = (f.enumValues || []).join("\n");
  showForm.value = true;
}
function closeForm() {
  if (saving.value) return;
  showForm.value = false;
}

async function submitForm() {
  const label = form.label.trim();
  if (!label) {
    formError.value = "A label is required.";
    return;
  }
  const enumValues = parseEnumValues(form.enumValuesText);
  if (form.type === "enum" && enumValues.length === 0) {
    formError.value = "A choice field needs at least one value.";
    return;
  }
  saving.value = true;
  formError.value = "";
  try {
    if (mode.value === "create") {
      await createCustomField({
        label,
        type: form.type,
        required: form.required,
        enumValues: form.type === "enum" ? enumValues : undefined,
      });
    } else if (editingId.value) {
      await updateCustomField(editingId.value, {
        label,
        required: form.required,
        // enumValues only meaningful for enum; harmless otherwise.
        enumValues: form.type === "enum" ? enumValues : undefined,
      });
    }
    showForm.value = false;
    await load();
  } catch (err: any) {
    formError.value = err?.message || "Could not save the field.";
  } finally {
    saving.value = false;
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deletingId = ref<string | null>(null);
async function removeField(f: CustomField) {
  if (
    !confirm(
      `Delete the "${f.label}" field? Existing contact values are kept but hidden.`,
    )
  ) {
    return;
  }
  deletingId.value = f.id;
  try {
    await deleteCustomField(f.id);
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not delete the field.";
  } finally {
    deletingId.value = null;
  }
}

const isEnum = computed(() => form.type === "enum");
</script>

<template>
  <div class="cf">
    <!-- Breadcrumb -->
    <div class="cf-crumb">
      <NuxtLink to="/app/audiences" class="cf-crumb-link">Audiences</NuxtLink>
      <span aria-hidden="true">/</span>
      <span class="cf-crumb-current">Custom fields</span>
    </div>

    <header class="cf-header">
      <div class="cf-header-text">
        <h1>Custom fields</h1>
        <p class="cf-lede">
          Data points you collect on contacts. These appear on the contact form,
          in segment rules, and as merge-tags in the editor.
        </p>
      </div>
      <Button variant="primary" @click="openCreate">
        <template #leading>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </template>
        New field
      </Button>
    </header>

    <p v-if="loading" class="cf-state">Loading fields…</p>
    <p v-else-if="loadError" class="cf-state cf-state--error">
      {{ loadError }}
      <button type="button" class="cf-retry" @click="load">Retry</button>
    </p>

    <div v-else-if="fields.length === 0" class="cf-empty">
      <h2 class="cf-empty-title">No custom fields yet</h2>
      <p class="cf-empty-lede">
        Add a field like "Plan tier" or "Signup source" to capture more about
        your contacts.
      </p>
      <Button variant="primary" @click="openCreate">
        <template #leading>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </template>
        New field
      </Button>
    </div>

    <TableShell v-else>
      <template #head>
        <th>Label</th>
        <th>Key</th>
        <th>Type</th>
        <th>Required</th>
        <th class="cf-th-actions"><span class="sr-only">Actions</span></th>
      </template>
      <template #body>
        <tr v-for="f in fields" :key="f.id">
          <td class="cf-td-label">{{ f.label }}</td>
          <td><code class="cf-key">{{ f.key }}</code></td>
          <td>
            <span class="cf-type">{{ TYPE_LABELS[f.type] || f.type }}</span>
            <span v-if="f.type === 'enum' && f.enumValues.length" class="cf-enum-vals">
              {{ f.enumValues.join(", ") }}
            </span>
          </td>
          <td>{{ f.required ? "Yes" : "—" }}</td>
          <td class="cf-td-actions">
            <button type="button" class="cf-link" @click="openEdit(f)">Edit</button>
            <button
              type="button"
              class="cf-link cf-link--danger"
              :disabled="deletingId === f.id"
              @click="removeField(f)"
            >
              {{ deletingId === f.id ? "Deleting…" : "Delete" }}
            </button>
          </td>
        </tr>
      </template>
    </TableShell>

    <!-- Create / edit modal -->
    <div v-if="showForm" class="cf-modal-backdrop" @mousedown.self="closeForm">
      <div class="cf-modal" role="dialog" aria-modal="true" aria-labelledby="cf-modal-title">
        <h2 id="cf-modal-title" class="cf-modal-title">
          {{ mode === "create" ? "New custom field" : "Edit field" }}
        </h2>
        <form @submit.prevent="submitForm">
          <FormField label="Label" class="cf-field">
            <TextInput v-model="form.label" type="text" placeholder="e.g. Plan tier" />
          </FormField>

          <FormField
            label="Type"
            :hint="mode === 'edit' ? `(can't change after creation)` : ''"
            class="cf-field"
          >
            <SelectInput v-model="form.type" :disabled="mode === 'edit'">
              <option v-for="t in FIELD_TYPES" :key="t" :value="t">{{ TYPE_LABELS[t] }}</option>
            </SelectInput>
          </FormField>

          <FormField v-if="isEnum" label="Choices" hint="(one per line)" class="cf-field">
            <TextArea v-model="form.enumValuesText" :rows="4" placeholder="free&#10;pro&#10;enterprise" />
          </FormField>

          <div class="cf-checkbox">
            <Checkbox v-model="form.required">Required when adding a contact</Checkbox>
          </div>

          <p v-if="formError" class="cf-modal-error">{{ formError }}</p>
          <div class="cf-modal-actions">
            <Button variant="ghost" :disabled="saving" @click="closeForm">Cancel</Button>
            <Button type="submit" variant="primary" :loading="saving">
              {{ saving ? "Saving…" : mode === "create" ? "Create field" : "Save changes" }}
            </Button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cf { display: flex; flex-direction: column; gap: var(--space-5); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

.cf-crumb {
  display: flex; align-items: center; gap: var(--space-2);
  font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-dim);
}
.cf-crumb-link { color: var(--link-color); text-decoration: none; font-weight: 600; }
.cf-crumb-link:hover { text-decoration: underline; }
.cf-crumb-current { color: var(--color-ink-soft); }

.cf-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: var(--space-5); flex-wrap: wrap;
}
.cf-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 800;
  letter-spacing: var(--tracking-tight); color: var(--color-ink);
}
.cf-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); max-width: 56ch; }

.cf-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.cf-state--error { color: var(--color-danger); }
.cf-retry {
  margin-left: var(--space-3); background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}

.cf-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface); border: 1px dashed var(--color-rule-strong);
  border-radius: var(--radius-lg);
}
.cf-empty-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.cf-empty-lede { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.cf-th-actions { width: 1%; }
.cf-td-label { font-weight: 600; }
.cf-key { font-family: var(--font-mono, monospace); font-size: var(--text-xs); color: var(--color-ink-soft); background: var(--color-surface-sunk); padding: 2px 6px; border-radius: var(--radius-sm); }
.cf-type { display: inline-block; }
.cf-enum-vals { display: block; margin-top: var(--space-1); font-size: var(--text-xs); color: var(--color-ink-dim); }
.cf-td-actions { white-space: nowrap; text-align: right; }
.cf-link { background: none; border: none; padding: 0 var(--space-2); color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; }
.cf-link:hover { text-decoration: underline; }
.cf-link:disabled { opacity: 0.5; cursor: default; }
.cf-link--danger { color: var(--color-danger); }

/* Modal */
.cf-modal-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal, 1000);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-5); background: rgba(24, 24, 27, 0.45);
}
.cf-modal {
  width: 100%; max-width: 460px; padding: var(--space-6);
  background: var(--color-surface); border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
}
.cf-modal-title { margin: 0 0 var(--space-5); font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.cf-field { margin-bottom: var(--space-4); }
.cf-checkbox { margin-bottom: var(--space-2); }
.cf-modal-error { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }
.cf-modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-5); }
</style>
