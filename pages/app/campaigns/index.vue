<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from "vue";
import { useCampaigns } from "~/composables/app/useCampaigns";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

useHead({ title: "Campaigns" });

// Live data from listCampaigns (server/cloud/campaigns.js), org-scoped. Status
// filtering happens client-side against `status`; KPIs come back precomputed.
// Per-row management (rename/update/duplicate/archive/delete) goes through the
// matching cloud fns, which enforce the status guards (see campaigns.js header).
const {
  listCampaigns,
  renameCampaign,
  duplicateCampaign,
  archiveCampaign,
  deleteCampaign,
} = useCampaigns();

const campaigns = ref([]);
const summary = ref(null);
const loading = ref(true);
const loadError = ref(null);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const res = await listCampaigns();
    campaigns.value = res.campaigns ?? [];
    summary.value = res.kpis ?? null;
  } catch (e) {
    loadError.value = e?.message || "Could not load campaigns.";
    campaigns.value = [];
    summary.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

// Summary KPI strip — derived from the cloud-computed kpis. Avg open rate is
// null until at least one campaign has sent.
const kpis = computed(() => {
  const s = summary.value;
  return [
    {
      label: "Total campaigns",
      value: String(s?.total ?? 0),
      delta: `${s?.sent ?? 0} sent`,
      deltaDirection: "neutral",
    },
    {
      label: "Avg open rate",
      value: s?.avgOpenRate ?? "—",
      delta: s?.avgOpenRate ? "Across sent campaigns" : "No sends yet",
      deltaDirection: s?.avgOpenRate ? "up" : "neutral",
    },
    {
      label: "Drafts",
      value: String(s?.drafts ?? 0),
      delta: (s?.drafts ?? 0) > 0 ? "Ready to ship" : "All sent",
      deltaDirection: "neutral",
    },
  ];
});

// Tab definitions. "sending"/"paused" omitted from the rail to avoid empty-tab
// noise; those campaigns still show under "All". Counts derive from results.
const tabs = computed(() => [
  { id: "all",       label: "All",       count: campaigns.value.length },
  { id: "draft",     label: "Drafts",    count: campaigns.value.filter((c) => c.status === "draft").length },
  { id: "scheduled", label: "Scheduled", count: campaigns.value.filter((c) => c.status === "scheduled").length },
  { id: "sent",      label: "Sent",      count: campaigns.value.filter((c) => c.status === "sent").length },
]);

const activeTab = ref("all");

const filtered = computed(() =>
  activeTab.value === "all"
    ? campaigns.value
    : campaigns.value.filter((c) => c.status === activeTab.value),
);

// ── Row helpers ──────────────────────────────────────────────────────────────
const NAME_MAX = 36;
function truncate(s) {
  if (!s) return "";
  return s.length > NAME_MAX ? s.slice(0, NAME_MAX - 1) + "…" : s;
}

// Drafts open in the editor; everything else opens the read-only detail route.
function rowHref(c) {
  return c.status === "draft"
    ? `/app/campaigns/${c.id}/edit`
    : `/app/campaigns/${c.id}`;
}

// Mirrors the server status-guard matrix so the menu only offers actions the
// cloud fn will accept — keeps the UI honest instead of surfacing rejections.
const EDITABLE = new Set(["draft", "scheduled", "paused"]);
const canEdit = (c) => EDITABLE.has(c.status);      // rename / open editor
const canArchive = (c) => c.status !== "sending" && c.status !== "archived";
const canDelete = (c) => c.status !== "sending";    // sent → soft-archive

// ── Per-row action menu ──────────────────────────────────────────────────────
const openMenuId = ref(null);
function toggleMenu(id) {
  openMenuId.value = openMenuId.value === id ? null : id;
}
function closeMenu() {
  openMenuId.value = null;
}
function onDocClick() {
  closeMenu();
}
onMounted(() => document.addEventListener("click", onDocClick));
onBeforeUnmount(() => document.removeEventListener("click", onDocClick));

// Transient busy + error state for the row currently being acted on.
const busyId = ref(null);
const actionError = ref(null);

async function onEdit(c) {
  closeMenu();
  await navigateTo(rowHref(c));
}

async function onDuplicate(c) {
  closeMenu();
  if (busyId.value) return;
  busyId.value = c.id;
  actionError.value = null;
  try {
    await duplicateCampaign(c.id);
    await load();
  } catch (e) {
    actionError.value = e?.message || "Could not duplicate campaign.";
  } finally {
    busyId.value = null;
  }
}

async function onArchive(c) {
  closeMenu();
  if (busyId.value) return;
  busyId.value = c.id;
  actionError.value = null;
  try {
    await archiveCampaign(c.id);
    // Optimistic: archived rows are excluded from the list.
    campaigns.value = campaigns.value.filter((x) => x.id !== c.id);
    await load();
  } catch (e) {
    actionError.value = e?.message || "Could not archive campaign.";
  } finally {
    busyId.value = null;
  }
}

// ── Rename modal ─────────────────────────────────────────────────────────────
const renameTarget = ref(null);
const renameValue = ref("");
const renameError = ref(null);
const renameSaving = ref(false);
const renameInput = ref(null);

function openRename(c) {
  closeMenu();
  renameTarget.value = c;
  renameValue.value = c.name === "Untitled campaign" ? "" : c.name;
  renameError.value = null;
  nextTick(() => renameInput.value?.focus());
}
function cancelRename() {
  renameTarget.value = null;
  renameValue.value = "";
  renameError.value = null;
}
async function confirmRename() {
  const c = renameTarget.value;
  if (!c) return;
  const name = renameValue.value.trim();
  if (!name) {
    renameError.value = "Name can't be empty.";
    return;
  }
  renameSaving.value = true;
  renameError.value = null;
  try {
    await renameCampaign(c.id, name);
    // Optimistic local update so the row reflects the rename immediately.
    const row = campaigns.value.find((x) => x.id === c.id);
    if (row) row.name = name;
    cancelRename();
  } catch (e) {
    renameError.value = e?.message || "Could not rename campaign.";
  } finally {
    renameSaving.value = false;
  }
}

// ── Delete confirm dialog ────────────────────────────────────────────────────
const deleteTarget = ref(null);
const deleteError = ref(null);
const deleteBusy = ref(false);

function openDelete(c) {
  closeMenu();
  deleteTarget.value = c;
  deleteError.value = null;
}
function cancelDelete() {
  deleteTarget.value = null;
  deleteError.value = null;
}
// A sent campaign is soft-archived (history preserved); everything else is
// destroyed. Surface that distinction in the confirm copy.
const deleteIsSoft = computed(() => deleteTarget.value?.status === "sent");
async function confirmDelete() {
  const c = deleteTarget.value;
  if (!c) return;
  deleteBusy.value = true;
  deleteError.value = null;
  try {
    await deleteCampaign(c.id);
    campaigns.value = campaigns.value.filter((x) => x.id !== c.id);
    cancelDelete();
    await load();
  } catch (e) {
    deleteError.value = e?.message || "Could not delete campaign.";
  } finally {
    deleteBusy.value = false;
  }
}
</script>

<template>
  <div class="campaigns">
    <!-- 1. Header -->
    <header class="cmp-header">
      <div class="cmp-header-text">
        <h1>Campaigns</h1>
        <p class="cmp-lede">All your campaign activity, drafts to deliveries.</p>
      </div>
      <NuxtLink to="/app/campaigns/new" class="cmp-cta">
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        <span>New campaign</span>
      </NuxtLink>
    </header>

    <!-- 2. KPI strip -->
    <section class="cmp-kpis" aria-label="Campaign summary">
      <AppKpiCard
        v-for="kpi in kpis"
        :key="kpi.label"
        :label="kpi.label"
        :value="kpi.value"
        :delta="kpi.delta"
        :delta-direction="kpi.deltaDirection"
      />
    </section>

    <!-- Action-level error banner (duplicate/archive/delete failures) -->
    <div v-if="actionError" class="cmp-banner cmp-banner--error" role="alert">
      <span>{{ actionError }}</span>
      <button type="button" class="cmp-banner-x" aria-label="Dismiss" @click="actionError = null">×</button>
    </div>

    <!-- 3. Filter tabs + 4. Table, grouped under one eyebrow -->
    <section class="cmp-section">
      <div class="cmp-eyebrow">
        <span class="cmp-eyebrow-dot" aria-hidden="true"></span>
        <span>All campaigns</span>
      </div>

      <div class="cmp-tabs" role="tablist" aria-label="Filter campaigns by status">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === t.id"
          :class="['cmp-tab', { 'cmp-tab--active': activeTab === t.id }]"
          @click="activeTab = t.id"
        >
          <span class="cmp-tab-label">{{ t.label }}</span>
          <span class="cmp-tab-count tabular">{{ t.count }}</span>
        </button>
      </div>

      <div class="cmp-card cmp-card-flush">
        <div v-if="loading" class="cmp-state">Loading campaigns…</div>
        <div v-else-if="loadError" class="cmp-state cmp-state--error">{{ loadError }}</div>

        <!-- Table with a per-row actions column. Rendered inline (not via
             AppCampaignsTable) because rows need an interactive actions menu. -->
        <div v-else class="ct">
          <div class="ct-row ct-head" role="row">
            <div class="ct-cell ct-cell-name">Name</div>
            <div class="ct-cell ct-cell-status">Status</div>
            <div class="ct-cell ct-cell-audience">Audience</div>
            <div class="ct-cell ct-cell-date">Sent / created</div>
            <div class="ct-cell ct-cell-num">Open rate</div>
            <div class="ct-cell ct-cell-num">Click rate</div>
            <div class="ct-cell ct-cell-actions"><span class="sr-only">Actions</span></div>
          </div>

          <template v-if="filtered.length">
            <div
              v-for="c in filtered"
              :key="c.id"
              class="ct-row ct-body"
              :class="{ 'ct-body--busy': busyId === c.id }"
              role="row"
            >
              <NuxtLink :to="rowHref(c)" class="ct-cell ct-cell-name ct-namelink" :title="c.name">
                {{ truncate(c.name) }}
              </NuxtLink>
              <div class="ct-cell ct-cell-status">
                <AppStatusPill :status="c.status" />
              </div>
              <div class="ct-cell ct-cell-audience">{{ c.audience || "—" }}</div>
              <div class="ct-cell ct-cell-date">
                <span class="ct-date-primary tabular">{{ c.date }}</span>
                <span class="ct-date-secondary">{{ c.relative }}</span>
              </div>
              <div class="ct-cell ct-cell-num tabular">{{ c.openRate || "—" }}</div>
              <div class="ct-cell ct-cell-num tabular">{{ c.clickRate || "—" }}</div>

              <!-- Actions kebab -->
              <div class="ct-cell ct-cell-actions" @click.stop>
                <div class="ct-menu-wrap">
                  <button
                    type="button"
                    class="ct-kebab"
                    :aria-expanded="openMenuId === c.id"
                    :aria-label="`Actions for ${c.name}`"
                    :disabled="busyId === c.id"
                    @click.stop="toggleMenu(c.id)"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="3" r="1.4" fill="currentColor" />
                      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
                      <circle cx="8" cy="13" r="1.4" fill="currentColor" />
                    </svg>
                  </button>

                  <div v-if="openMenuId === c.id" class="ct-menu" role="menu">
                    <button
                      v-if="canEdit(c)"
                      type="button"
                      class="ct-menu-item"
                      role="menuitem"
                      @click="onEdit(c)"
                    >
                      Edit
                    </button>
                    <button
                      v-if="canEdit(c)"
                      type="button"
                      class="ct-menu-item"
                      role="menuitem"
                      @click="openRename(c)"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      class="ct-menu-item"
                      role="menuitem"
                      @click="onDuplicate(c)"
                    >
                      Duplicate
                    </button>
                    <button
                      v-if="canArchive(c)"
                      type="button"
                      class="ct-menu-item"
                      role="menuitem"
                      @click="onArchive(c)"
                    >
                      Archive
                    </button>
                    <button
                      v-if="canDelete(c)"
                      type="button"
                      class="ct-menu-item ct-menu-item--danger"
                      role="menuitem"
                      @click="openDelete(c)"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
          <div v-else class="ct-empty">No campaigns match this filter.</div>
        </div>
      </div>
    </section>

    <!-- Rename modal -->
    <div v-if="renameTarget" class="cmp-modal-scrim" @click.self="cancelRename">
      <div class="cmp-modal" role="dialog" aria-modal="true" aria-labelledby="rename-title">
        <h2 id="rename-title" class="cmp-modal-title">Rename campaign</h2>
        <p class="cmp-modal-lede">Give this campaign a name you'll recognise.</p>
        <input
          ref="renameInput"
          v-model="renameValue"
          type="text"
          class="cmp-modal-input"
          placeholder="Campaign name"
          maxlength="120"
          @keydown.enter.prevent="confirmRename"
          @keydown.esc="cancelRename"
        />
        <p v-if="renameError" class="cmp-modal-error" role="alert">{{ renameError }}</p>
        <div class="cmp-modal-actions">
          <button type="button" class="cmp-btn cmp-btn--ghost" :disabled="renameSaving" @click="cancelRename">
            Cancel
          </button>
          <button type="button" class="cmp-btn cmp-btn--primary" :disabled="renameSaving" @click="confirmRename">
            {{ renameSaving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>
    </div>

    <!-- Delete confirm dialog -->
    <div v-if="deleteTarget" class="cmp-modal-scrim" @click.self="cancelDelete">
      <div class="cmp-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <h2 id="delete-title" class="cmp-modal-title">
          {{ deleteIsSoft ? "Archive this campaign?" : "Delete this campaign?" }}
        </h2>
        <p class="cmp-modal-lede">
          <template v-if="deleteIsSoft">
            “{{ deleteTarget.name }}” has already been sent, so it'll be archived to
            preserve its delivery history rather than permanently deleted.
          </template>
          <template v-else>
            “{{ deleteTarget.name }}” will be permanently deleted. This can't be undone.
          </template>
        </p>
        <p v-if="deleteError" class="cmp-modal-error" role="alert">{{ deleteError }}</p>
        <div class="cmp-modal-actions">
          <button type="button" class="cmp-btn cmp-btn--ghost" :disabled="deleteBusy" @click="cancelDelete">
            Cancel
          </button>
          <button type="button" class="cmp-btn cmp-btn--danger" :disabled="deleteBusy" @click="confirmDelete">
            {{ deleteBusy ? "Working…" : deleteIsSoft ? "Archive" : "Delete" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.campaigns {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}

/* Header */
.cmp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.cmp-header-text { min-width: 0; }
.cmp-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.cmp-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.cmp-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  border-radius: var(--radius-md);
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition: background-color var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out);
  white-space: nowrap;
}
.cmp-cta:hover {
  background: var(--btn-primary-hover);
  box-shadow: var(--shadow-md);
}
.cmp-cta:active {
  transform: translateY(1px);
}
.cmp-cta:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

/* KPI strip — three cards across, stack on narrow viewports. */
.cmp-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 960px) {
  .cmp-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 520px) {
  .cmp-kpis { grid-template-columns: 1fr; }
}

/* Action error banner */
.cmp-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.cmp-banner--error {
  background: var(--color-danger-bg, var(--color-surface-2));
  color: var(--color-danger, var(--color-ink));
  border: 1px solid var(--color-danger, var(--color-rule));
}
.cmp-banner-x {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 var(--space-1);
}

/* Section wrapper */
.cmp-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cmp-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.cmp-eyebrow-dot {
  display: inline-block;
  width: var(--space-2);
  height: var(--space-2);
  background: var(--color-pop);
  border-radius: var(--radius-pill);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}

/* Segmented filter tabs */
.cmp-tabs {
  display: inline-flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
  align-self: flex-start;
  flex-wrap: wrap;
}
.cmp-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-rule);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
              color var(--dur-fast) var(--ease-out);
}
.cmp-tab:last-child { border-right: 0; }
.cmp-tab:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.cmp-tab--active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
}
.cmp-tab--active:hover {
  background: var(--color-pop-bg);
}
.cmp-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  padding: 0 var(--space-1-5);
  height: 18px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
  font-size: var(--text-xs);
  font-weight: 600;
  line-height: 1;
}
.cmp-tab--active .cmp-tab-count {
  background: var(--color-surface);
  color: var(--color-ink);
}
.cmp-tab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
  position: relative;
  z-index: 1;
}

/* Card wrapper for the table */
.cmp-card {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: visible; /* let the actions menu escape the card edge */
}
.cmp-card-flush { padding: 0; }

/* Loading / error states inside the table card */
.cmp-state {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}
.cmp-state--error {
  color: var(--color-danger, var(--color-ink-soft));
}

/* ── Inline table with actions column ───────────────────────────────────────
   Same visual language as AppCampaignsTable, plus a trailing actions cell. */
.ct {
  display: flex;
  flex-direction: column;
}
.ct-row {
  display: grid;
  grid-template-columns:
    minmax(0, 1.8fr)
    minmax(96px, 0.6fr)
    minmax(0, 1fr)
    minmax(160px, 1fr)
    minmax(96px, 0.6fr)
    minmax(96px, 0.6fr)
    48px;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  color: var(--color-ink);
}
.ct-head {
  border-bottom: 1px solid var(--color-rule);
  padding-top: var(--space-3);
  padding-bottom: var(--space-3);
}
.ct-head .ct-cell {
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.ct-body {
  border-bottom: 1px solid var(--color-rule);
  transition: background-color var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out);
}
.ct-body:last-child { border-bottom: none; }
.ct-body:hover { background: var(--color-surface-2); }
.ct-body--busy { opacity: 0.5; pointer-events: none; }
.ct-cell {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
}
.ct-cell-name {
  font-weight: 600;
  color: var(--color-ink);
  font-family: var(--font-display);
  letter-spacing: var(--tracking-tight);
}
.ct-namelink {
  text-decoration: none;
  color: var(--color-ink);
  display: block;
}
.ct-namelink:hover { color: var(--color-pop); }
.ct-cell-audience { color: var(--color-ink-soft); }
.ct-cell-date {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.ct-date-primary {
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
}
.ct-date-secondary {
  color: var(--color-ink-dim);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  overflow: hidden;
  text-overflow: ellipsis;
}
.ct-cell-num {
  color: var(--color-ink);
  font-family: var(--font-mono);
  text-align: right;
}
.ct-cell-actions {
  overflow: visible;
  display: flex;
  justify-content: flex-end;
}
.tabular { font-variant-numeric: tabular-nums; }
.ct-empty {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}

/* Kebab + menu */
.ct-menu-wrap { position: relative; }
.ct-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.ct-kebab:hover {
  background: var(--color-surface-sunk);
  color: var(--color-ink);
}
.ct-kebab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
.ct-kebab:disabled { opacity: 0.5; cursor: default; }
.ct-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 20;
  min-width: 160px;
  padding: var(--space-1-5);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg, var(--shadow-md));
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ct-menu-item {
  text-align: left;
  padding: var(--space-2) var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.ct-menu-item:hover { background: var(--color-surface-2); }
.ct-menu-item--danger { color: var(--color-danger, #d23b3b); }
.ct-menu-item--danger:hover { background: var(--color-danger-bg, var(--color-surface-2)); }

.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap; border: 0;
}

@media (max-width: 960px) {
  .ct-row {
    grid-template-columns:
      minmax(0, 1.6fr)
      minmax(80px, 0.6fr)
      minmax(140px, 1fr)
      minmax(80px, 0.6fr)
      48px;
    gap: var(--space-3);
  }
  .ct-cell-audience,
  .ct-cell-num:last-child {
    display: none;
  }
}

/* ── Modal / confirm dialog ─────────────────────────────────────────────────── */
.cmp-modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(0, 0, 0, 0.4);
}
.cmp-modal {
  width: 100%;
  max-width: 420px;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg, var(--shadow-md));
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.cmp-modal-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  margin: 0;
  color: var(--color-ink);
}
.cmp-modal-lede {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  line-height: var(--leading-normal);
}
.cmp-modal-input {
  width: 100%;
  padding: var(--space-3) var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-md);
}
.cmp-modal-input:focus-visible {
  outline: none;
  border-color: var(--color-pop);
  box-shadow: var(--shadow-pop-glow);
}
.cmp-modal-error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-danger, #d23b3b);
}
.cmp-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
.cmp-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.cmp-btn:disabled { opacity: 0.6; cursor: default; }
.cmp-btn--ghost {
  background: transparent;
  color: var(--color-ink-soft);
  border-color: var(--color-rule);
}
.cmp-btn--ghost:hover:not(:disabled) { background: var(--color-surface-2); color: var(--color-ink); }
.cmp-btn--primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
}
.cmp-btn--primary:hover:not(:disabled) { background: var(--btn-primary-hover); }
.cmp-btn--danger {
  background: var(--color-danger, #d23b3b);
  color: #fff;
}
.cmp-btn--danger:hover:not(:disabled) { filter: brightness(0.94); }
</style>
