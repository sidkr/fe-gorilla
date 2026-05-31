<script setup lang="ts">
// Suppression management (F-28). Addresses here are never emailed. Bounces and
// complaints are added automatically by the send pipeline; this page adds a
// manual surface: search, paste/CSV add, and remove (with audit). Pop chrome
// mirrors the sender-identities page.
import { onMounted, ref } from "vue";
import { useSuppression } from "~/composables/app/useSuppression";
import { useToast } from "~/composables/shared/useToast";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Suppression list" });

const { listSuppressions, addSuppressions, removeSuppression } = useSuppression();
const { push } = useToast();

interface Suppression {
  id: string;
  email: string;
  reason: string;
  campaignId: string | null;
  addedAt: string | null;
}

const rows = ref<Suppression[]>([]);
const total = ref(0);
const page = ref(0);
const pageSize = ref(50);
const hasMore = ref(false);
const loading = ref(true);
const loadError = ref("");
const search = ref("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    const res = await listSuppressions({ search: search.value, page: page.value });
    rows.value = res.results;
    total.value = res.total;
    pageSize.value = res.pageSize;
    hasMore.value = res.hasMore;
  } catch (err: any) {
    loadError.value = err?.message || "Could not load the suppression list.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

function onSearch() {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    page.value = 0;
    load();
  }, 250);
}

function goto(p: number) {
  page.value = Math.max(0, p);
  load();
}

function reasonTone(reason: string): "danger" | "neutral" {
  if (reason === "complaint" || reason === "hard_bounce") return "danger";
  return "neutral";
}

// Hard bounces and complaints are permanently suppressed — re-mailing them wrecks
// deliverability (and complaints carry legal risk), so they can't be removed. The
// removeSuppression cloud fn enforces this too; the UI just hides the affordance.
function isIrrevocable(reason: string): boolean {
  return reason === "complaint" || reason === "hard_bounce";
}

function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

// ── Add modal ───────────────────────────────────────────────────────────────-
const showAdd = ref(false);
const addText = ref("");
const adding = ref(false);
const addError = ref("");

function openAdd() {
  addText.value = "";
  addError.value = "";
  showAdd.value = true;
}
function closeAdd() {
  if (adding.value) {
    showAdd.value = true;
    return;
  }
  showAdd.value = false;
}

async function submitAdd() {
  if (!addText.value.trim()) {
    addError.value = "Paste at least one email address.";
    return;
  }
  adding.value = true;
  addError.value = "";
  try {
    const res = await addSuppressions({ emails: addText.value, reason: "manual" });
    showAdd.value = false;
    push(`Added ${res.added}, skipped ${res.skipped} already-suppressed.`, { tone: "success" });
    page.value = 0;
    await load();
  } catch (err: any) {
    addError.value = err?.message || "Could not add the addresses.";
  } finally {
    adding.value = false;
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────-
const busyId = ref<string | null>(null);
async function remove(r: Suppression) {
  if (!confirm(`Remove ${r.email}? They will be eligible to receive email again.`)) return;
  busyId.value = r.id;
  try {
    await removeSuppression(r.id);
    await load();
  } catch (err: any) {
    loadError.value = err?.message || "Could not remove the address.";
  } finally {
    busyId.value = null;
  }
}
</script>

<template>
  <div class="sup">
    <header class="sup-header">
      <div class="sup-header-text">
        <h1>Settings</h1>
        <p class="sup-lede">Addresses your campaigns will never email.</p>
      </div>
    </header>

    <nav class="sup-tabs" aria-label="Settings sections">
      <NuxtLink to="/app/settings" class="sup-tab">General</NuxtLink>
      <NuxtLink to="/app/settings/senders" class="sup-tab">Sender identities</NuxtLink>
      <NuxtLink to="/app/settings/domains" class="sup-tab">Domains</NuxtLink>
      <NuxtLink to="/app/settings/suppression" class="sup-tab">Suppression</NuxtLink>
    </nav>

    <div class="sup-bar">
      <input
        v-model="search"
        type="search"
        class="sup-search"
        placeholder="Search by email…"
        aria-label="Search suppressions"
        @input="onSearch"
      />
      <Button type="button" variant="primary" @click="openAdd">Add addresses</Button>
    </div>

    <p v-if="loading" class="sup-state">Loading…</p>
    <p v-else-if="loadError" class="sup-state sup-state--error">
      {{ loadError }}
      <button type="button" class="sup-retry" @click="load">Retry</button>
    </p>

    <div v-else-if="rows.length === 0" class="sup-empty">
      <h2 class="sup-empty-title">No suppressed addresses</h2>
      <p class="sup-empty-lede">
        Bounces and complaints land here automatically. You can also add addresses manually.
      </p>
    </div>

    <TableShell v-else>
      <template #head>
        <th>Email</th>
        <th>Reason</th>
        <th>Campaign</th>
        <th>Added</th>
        <th class="sup-th-actions"><span class="sr-only">Actions</span></th>
      </template>
      <template #body>
        <tr v-for="r in rows" :key="r.id">
          <td><code class="sup-email">{{ r.email }}</code></td>
          <td><Pill :tone="reasonTone(r.reason)">{{ r.reason }}</Pill></td>
          <td class="sup-dim">{{ r.campaignId || "—" }}</td>
          <td class="sup-dim">{{ fmtDate(r.addedAt) }}</td>
          <td class="sup-td-actions">
            <span
              v-if="isIrrevocable(r.reason)"
              class="sup-locked"
              title="Hard bounces and complaints are permanently suppressed and can't be removed."
            >
              🔒 Permanent
            </span>
            <button
              v-else
              type="button"
              class="sup-link sup-link--danger"
              :disabled="busyId === r.id"
              @click="remove(r)"
            >
              Remove
            </button>
          </td>
        </tr>
      </template>
    </TableShell>

    <div v-if="!loading && total > pageSize" class="sup-pager">
      <Button type="button" variant="ghost" :disabled="page === 0" @click="goto(page - 1)">
        Previous
      </Button>
      <span class="sup-dim">Page {{ page + 1 }} · {{ total }} total</span>
      <Button type="button" variant="ghost" :disabled="!hasMore" @click="goto(page + 1)">
        Next
      </Button>
    </div>

    <Modal v-model:open="showAdd" title="Add suppressed addresses" @close="closeAdd">
      <FormField label="Email addresses">
        <TextArea
          v-model="addText"
          :rows="6"
          placeholder="a@example.com, b@example.com&#10;c@example.com"
        />
      </FormField>
      <p class="sup-hint">Separate with commas, spaces, or new lines. CSV is fine too.</p>
      <p v-if="addError" class="sup-modal-error">{{ addError }}</p>
      <template #footer>
        <Button type="button" variant="ghost" :disabled="adding" @click="closeAdd">Cancel</Button>
        <Button type="button" variant="primary" :loading="adding" :disabled="adding" @click="submitAdd">
          {{ adding ? "Adding…" : "Add" }}
        </Button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.sup { display: flex; flex-direction: column; gap: var(--space-5); }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.sup-header h1 {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 800;
  letter-spacing: var(--tracking-tight); color: var(--color-ink);
}
.sup-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.sup-tabs { display: flex; gap: var(--space-2); border-bottom: 1px solid var(--color-rule); flex-wrap: wrap; }
.sup-tab {
  padding: var(--space-3) var(--space-4); margin-bottom: -1px;
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--color-ink-soft); text-decoration: none; border-bottom: 2px solid transparent;
}
.sup-tab:hover { color: var(--color-ink); }
.sup-tab.router-link-exact-active { color: var(--color-ink); border-bottom-color: var(--color-pop); }

.sup-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.sup-search {
  flex: 1; max-width: 360px; padding: var(--space-3) var(--space-4);
  font: inherit; font-size: var(--text-sm); color: var(--color-ink);
  background: var(--color-surface); border: 1px solid var(--color-rule); border-radius: var(--radius-md);
}

.sup-state { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }
.sup-state--error { color: var(--color-danger); }
.sup-retry {
  margin-left: var(--space-3); background: none; border: none; color: var(--link-color);
  font: inherit; font-weight: 600; cursor: pointer; text-decoration: underline;
}

.sup-empty {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-7) var(--space-6);
  background: var(--color-surface); border: 1px dashed var(--color-rule-strong); border-radius: var(--radius-lg);
}
.sup-empty-title { margin: 0; font-family: var(--font-display); font-size: var(--text-xl); font-weight: 700; color: var(--color-ink); }
.sup-empty-lede { margin: 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-ink-soft); }

.sup-email { font-family: var(--font-mono, monospace); font-size: var(--text-xs); color: var(--color-ink-soft); background: var(--color-surface-sunk); padding: 2px 6px; border-radius: var(--radius-sm); }
.sup-dim { color: var(--color-ink-dim); font-size: var(--text-sm); }
.sup-th-actions { width: 1%; }
.sup-td-actions { white-space: nowrap; text-align: right; }
.sup-link { background: none; border: none; padding: 0 var(--space-2); color: var(--link-color); font: inherit; font-weight: 600; cursor: pointer; }
.sup-link:hover { text-decoration: underline; }
.sup-link:disabled { opacity: 0.5; cursor: default; }
.sup-link--danger { color: var(--color-danger); }
.sup-locked { display: inline-flex; align-items: center; gap: 4px; padding: 0 var(--space-2); color: var(--color-ink-dim); font-size: var(--text-xs); font-weight: 600; white-space: nowrap; cursor: help; }

.sup-pager { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }

.sup-hint { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-xs); color: var(--color-ink-dim); }
.sup-modal-error { margin: var(--space-2) 0 0; font-family: var(--font-body); font-size: var(--text-sm); color: var(--color-danger); }
</style>
