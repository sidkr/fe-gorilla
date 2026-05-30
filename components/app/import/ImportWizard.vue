<script setup>
// CSV import wizard (F-07 + F-29). A modal-style overlay with four steps:
//   1. upload   — pick a .csv, POST it to /api/imports/upload, get a preview
//   2. map      — map each CSV column to email / a std field / a custom field / ignore
//                 + the required consent step (F-29)
//   3. progress — start the import, poll getImportJob, show live counters
//   4. summary  — imported / updated / skipped, with an errors.csv download
//
// Emits `done` when an import finishes (parent reloads the contact table) and
// `close` when the user dismisses the wizard.
import { computed, reactive, ref } from "vue";
import { useImports } from "~/composables/app/useImports";

const props = defineProps({
  audienceId: { type: String, required: true },
  customFields: { type: Array, default: () => [] }, // [{ key, label, type, ... }]
});
const emit = defineEmits(["close", "done"]);

const {
  uploadCsv,
  startImport,
  pollImportJob,
  getImportJobErrors,
  errorsToCsv,
} = useImports();

const step = ref("upload"); // upload | map | progress | summary
const error = ref("");
const busy = ref(false);

// ── Step 1: upload ──────────────────────────────────────────────────────────--
const fileName = ref("");
const upload = ref(null); // ImportUploadResult
const hasHeader = ref(true);

async function onFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  error.value = "";
  if (!/\.csv$/i.test(file.name) && file.type && !/csv|text/.test(file.type)) {
    error.value = "Please choose a .csv file.";
    return;
  }
  busy.value = true;
  try {
    upload.value = await uploadCsv(file);
    fileName.value = file.name;
    seedMapping();
    step.value = "map";
  } catch (err) {
    error.value = err?.message || "Could not upload the file.";
  } finally {
    busy.value = false;
  }
}

// ── Step 2: column mapping + consent ─────────────────────────────────────────--
// mapping[colIndex] = target string. Seed by best-effort header matching.
const mapping = reactive({});
const STD_TARGETS = [
  { value: "email", label: "Email (required)" },
  { value: "firstName", label: "First name" },
  { value: "lastName", label: "Last name" },
  { value: "company", label: "Company" },
  { value: "phone", label: "Phone" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
  { value: "timezone", label: "Timezone" },
];

const columns = computed(() => upload.value?.headers || []);
const previewRows = computed(() => upload.value?.preview || []);

function guessTarget(header) {
  const h = String(header || "").trim().toLowerCase();
  if (/e-?mail/.test(h)) return "email";
  if (/first.*name|fname|given/.test(h)) return "firstName";
  if (/last.*name|lname|surname|family/.test(h)) return "lastName";
  if (/company|org/.test(h)) return "company";
  if (/phone|mobile|tel/.test(h)) return "phone";
  if (/city|town/.test(h)) return "city";
  if (/country/.test(h)) return "country";
  if (/time.?zone|tz/.test(h)) return "timezone";
  return "ignore";
}

function seedMapping() {
  for (const k of Object.keys(mapping)) delete mapping[k];
  const heads = upload.value?.headers || [];
  let emailAssigned = false;
  heads.forEach((h, i) => {
    let t = hasHeader.value ? guessTarget(h) : "ignore";
    if (t === "email") {
      if (emailAssigned) t = "ignore";
      else emailAssigned = true;
    }
    mapping[String(i)] = t;
  });
}

const emailColumnCount = computed(
  () => Object.values(mapping).filter((v) => v === "email").length,
);

// Consent (F-29) — required before the job runs.
const consentSource = ref("");
const consentDetail = ref("");
const CONSENT_OPTIONS = [
  { value: "signupForm", label: "They signed up via a form" },
  { value: "purchase", label: "They made a purchase" },
  { value: "event", label: "They attended an event" },
  { value: "manuallyEntered", label: "I entered them manually" },
  { value: "other", label: "Other" },
];

const canStart = computed(
  () =>
    emailColumnCount.value === 1 &&
    !!consentSource.value &&
    (consentSource.value !== "other" || consentDetail.value.trim().length > 0),
);

// ── Step 3 + 4: run + summary ────────────────────────────────────────────────-
const job = ref(null); // latest ImportJob snapshot
const jobId = ref("");

async function start() {
  if (!canStart.value) {
    error.value =
      emailColumnCount.value !== 1
        ? "Map exactly one column to Email."
        : "Choose how you collected consent for these contacts.";
    return;
  }
  error.value = "";
  busy.value = true;
  try {
    const consent = { source: consentSource.value };
    if (consentSource.value === "other") consent.detail = consentDetail.value.trim();

    const res = await startImport({
      listId: props.audienceId,
      mapping: { ...mapping },
      consent,
      hasHeader: hasHeader.value,
      filePath: upload.value.filePath,
      fileName: fileName.value,
    });
    jobId.value = res.jobId;
    step.value = "progress";
    job.value = await pollImportJob(jobId.value, (j) => {
      job.value = j;
    });
    step.value = "summary";
    emit("done");
  } catch (err) {
    error.value = err?.message || "Import failed.";
    step.value = "map";
  } finally {
    busy.value = false;
  }
}

const progressPct = computed(() => {
  const j = job.value;
  if (!j || !j.totalRows) return null;
  return Math.min(100, Math.round((j.processedRows / j.totalRows) * 100));
});

async function downloadErrors() {
  try {
    const { rows } = await getImportJobErrors(jobId.value);
    const csv = errorsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "errors.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    error.value = err?.message || "Could not download errors.";
  }
}

function close() {
  if (busy.value) return;
  emit("close");
}

function targetLabel(value) {
  if (value === "ignore" || !value) return "Ignore";
  const std = STD_TARGETS.find((t) => t.value === value);
  if (std) return std.label;
  if (value.startsWith("custom:")) {
    const key = value.slice("custom:".length);
    const cf = props.customFields.find((f) => f.key === key);
    return cf ? cf.label : key;
  }
  return value;
}
</script>

<template>
  <div class="iw-backdrop" @mousedown.self="close">
    <div class="iw" role="dialog" aria-modal="true" aria-labelledby="iw-title">
      <header class="iw-head">
        <h2 id="iw-title" class="iw-title">Import contacts from CSV</h2>
        <button type="button" class="iw-close" aria-label="Close" @click="close">×</button>
      </header>

      <!-- Step indicator -->
      <ol class="iw-steps" aria-hidden="true">
        <li :class="{ 'iw-step--on': step === 'upload' }">Upload</li>
        <li :class="{ 'iw-step--on': step === 'map' }">Map &amp; consent</li>
        <li :class="{ 'iw-step--on': step === 'progress' }">Import</li>
        <li :class="{ 'iw-step--on': step === 'summary' }">Summary</li>
      </ol>

      <p v-if="error" class="iw-error">{{ error }}</p>

      <!-- Step 1: upload -->
      <section v-if="step === 'upload'" class="iw-body">
        <p class="iw-lede">
          Upload a UTF-8 <code>.csv</code> file (up to 100MB). The next step lets
          you map each column.
        </p>
        <label class="iw-file">
          <input type="file" accept=".csv,text/csv" :disabled="busy" @change="onFileChange" />
          <span>{{ busy ? "Uploading…" : "Choose a CSV file" }}</span>
        </label>
        <label class="iw-check">
          <input v-model="hasHeader" type="checkbox" />
          First row is a header
        </label>
      </section>

      <!-- Step 2: map + consent -->
      <section v-else-if="step === 'map'" class="iw-body">
        <h3 class="iw-subhead">Map your columns</h3>
        <p class="iw-lede">
          Showing the first {{ previewRows.length }} rows. Map exactly one column
          to <strong>Email</strong>.
        </p>

        <div class="iw-maptable-wrap">
          <table class="iw-maptable">
            <thead>
              <tr>
                <th v-for="(h, i) in columns" :key="i">
                  <div class="iw-col-head">{{ h || `Column ${i + 1}` }}</div>
                  <SelectInput v-model="mapping[String(i)]" :aria-label="`Map column ${i + 1}`">
                    <option value="ignore">Ignore</option>
                    <optgroup label="Standard">
                      <option v-for="t in STD_TARGETS" :key="t.value" :value="t.value">
                        {{ t.label }}
                      </option>
                    </optgroup>
                    <optgroup v-if="customFields.length" label="Custom fields">
                      <option
                        v-for="cf in customFields"
                        :key="cf.key"
                        :value="`custom:${cf.key}`"
                      >
                        {{ cf.label }}
                      </option>
                    </optgroup>
                  </SelectInput>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in previewRows" :key="ri">
                <td v-for="(h, ci) in columns" :key="ci">{{ row[ci] ?? "" }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p v-if="emailColumnCount !== 1" class="iw-warn">
          Map exactly one column to Email to continue
          ({{ emailColumnCount }} currently mapped).
        </p>

        <h3 class="iw-subhead">How did you collect consent?</h3>
        <p class="iw-lede">
          Required for compliance. We store this with each imported contact.
        </p>
        <FormField label="Consent source" class="iw-field">
          <SelectInput v-model="consentSource" aria-label="Consent source">
            <option value="">Select a source…</option>
            <option v-for="o in CONSENT_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </SelectInput>
        </FormField>
        <FormField v-if="consentSource === 'other'" label="Describe the source" class="iw-field">
          <TextInput v-model="consentDetail" type="text" placeholder="e.g. trade show badge scan" />
        </FormField>
      </section>

      <!-- Step 3: progress -->
      <section v-else-if="step === 'progress'" class="iw-body">
        <p class="iw-lede">Importing contacts… you can leave this open.</p>
        <div class="iw-progress">
          <div
            class="iw-progress-bar"
            :style="{ width: (progressPct ?? 30) + '%' }"
            :class="{ 'iw-progress-bar--indeterminate': progressPct === null }"
          ></div>
        </div>
        <dl class="iw-counters" v-if="job">
          <div><dt>Processed</dt><dd>{{ job.processedRows.toLocaleString("en-US") }}</dd></div>
          <div><dt>Imported</dt><dd>{{ job.created.toLocaleString("en-US") }}</dd></div>
          <div><dt>Updated</dt><dd>{{ job.updated.toLocaleString("en-US") }}</dd></div>
        </dl>
      </section>

      <!-- Step 4: summary -->
      <section v-else-if="step === 'summary'" class="iw-body">
        <h3 class="iw-subhead">Import complete</h3>
        <dl class="iw-counters iw-counters--summary" v-if="job">
          <div><dt>Imported</dt><dd>{{ job.created.toLocaleString("en-US") }}</dd></div>
          <div><dt>Updated</dt><dd>{{ job.updated.toLocaleString("en-US") }}</dd></div>
          <div><dt>Skipped (invalid)</dt><dd>{{ job.skippedInvalid.toLocaleString("en-US") }}</dd></div>
          <div><dt>Skipped (suppressed)</dt><dd>{{ job.skippedSuppressed.toLocaleString("en-US") }}</dd></div>
        </dl>
        <p v-if="job && job.errorCount" class="iw-lede">
          {{ job.errorCount }} row(s) were skipped.
          <button type="button" class="iw-link" @click="downloadErrors">Download errors.csv</button>
        </p>
      </section>

      <!-- Footer actions -->
      <footer class="iw-foot">
        <Button v-if="step !== 'progress'" variant="ghost" :disabled="busy" @click="close">
          {{ step === "summary" ? "Done" : "Cancel" }}
        </Button>
        <Button
          v-if="step === 'map'"
          variant="primary"
          :disabled="busy || !canStart"
          @click="start"
        >
          {{ busy ? "Starting…" : "Start import" }}
        </Button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.iw-backdrop {
  position: fixed; inset: 0; z-index: var(--z-modal);
  display: flex; align-items: center; justify-content: center;
  padding: var(--space-5);
  background: rgba(24, 24, 27, 0.45);
}
.iw {
  width: 100%; max-width: 720px; max-height: 90vh;
  display: flex; flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.iw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-rule);
}
.iw-title {
  margin: 0; font-family: var(--font-display); font-size: var(--text-xl);
  font-weight: 700; color: var(--color-ink);
}
.iw-close {
  background: none; border: none; font-size: var(--text-2xl); line-height: 1;
  color: var(--color-ink-dim); cursor: pointer; padding: 0 var(--space-2);
}
.iw-close:hover { color: var(--color-ink); }
.iw-steps {
  display: flex; gap: var(--space-2); list-style: none;
  margin: 0; padding: var(--space-3) var(--space-5) 0;
  font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-ink-dim);
}
.iw-steps li { padding: var(--space-1) var(--space-2); border-radius: var(--radius-pill); }
.iw-step--on { background: var(--color-pop-glow, var(--color-surface-sunk)); color: var(--color-ink); font-weight: 600; }
.iw-error {
  margin: var(--space-3) var(--space-5) 0;
  font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger);
}
.iw-body { padding: var(--space-5); overflow-y: auto; }
.iw-lede { margin: 0 0 var(--space-4); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.iw-subhead {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-body); font-size: var(--text-xs); font-weight: 600;
  letter-spacing: var(--tracking-wider); text-transform: uppercase; color: var(--color-ink-dim);
}
.iw-file {
  display: inline-flex; align-items: center; gap: var(--space-2);
  cursor: pointer;
}
.iw-file input { font: inherit; }
.iw-check { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-3); font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.iw-maptable-wrap { overflow-x: auto; border: 1px solid var(--color-rule); border-radius: var(--radius-md); }
.iw-maptable { border-collapse: collapse; width: 100%; }
.iw-maptable th, .iw-maptable td {
  padding: var(--space-2) var(--space-3);
  border-bottom: 1px solid var(--color-rule);
  font-family: var(--font-body); font-size: var(--text-sm);
  text-align: left; vertical-align: top; white-space: nowrap;
}
.iw-maptable td { color: var(--color-ink-soft); }
.iw-col-head { font-weight: 600; margin-bottom: var(--space-2); color: var(--color-ink); }
.iw-warn { margin: var(--space-3) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-warn); }
.iw-field { margin-bottom: var(--space-4); max-width: 360px; }
.iw-progress { height: 8px; background: var(--color-surface-sunk); border-radius: var(--radius-pill); overflow: hidden; margin-bottom: var(--space-4); }
.iw-progress-bar { height: 100%; background: var(--color-pop); transition: width var(--dur-base) var(--ease-out); }
.iw-progress-bar--indeterminate { animation: iw-pulse 1.2s ease-in-out infinite; }
@keyframes iw-pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
.iw-counters { display: flex; flex-wrap: wrap; gap: var(--space-5); margin: 0; }
.iw-counters div { display: flex; flex-direction: column; }
.iw-counters dt { font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-ink-dim); }
.iw-counters dd { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); font-variant-numeric: tabular-nums; }
.iw-counters--summary { gap: var(--space-6); }
.iw-link { background: none; border: none; padding: 0; color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline; }
.iw-foot {
  display: flex; justify-content: flex-end; gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-rule);
}
</style>
