<script setup>
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useAutomations } from "~/composables/app/useAutomations";

definePageMeta({
  layout: "app",
  middleware: "auth-required",
});

const route = useRoute();
const id = computed(() => route.params.id);

const {
  getAutomation,
  updateAutomation,
  activateAutomation,
  pauseAutomation,
  addStep,
  updateStep,
  deleteStep,
} = useAutomations();

const automation = ref(null);
const steps = ref([]);
const loading = ref(true);
const loadError = ref(null);
const actionError = ref(null);
const saving = ref(false);

useHead(() => ({ title: automation.value?.name || "Automation" }));

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const a = await getAutomation(id.value);
    automation.value = a;
    steps.value = a.steps ?? [];
    nameDraft.value = a.name;
    triggerDraft.value = a.trigger?.type || "manual";
  } catch (e) {
    loadError.value = e?.message || "Could not load automation.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);

// ── Name + trigger editing ───────────────────────────────────────────────────
const nameDraft = ref("");
const triggerDraft = ref("manual");
const TRIGGER_OPTIONS = [
  { value: "manual", label: "Manual enrollment" },
  { value: "contact_added_to_list", label: "Contact added to a list" },
  { value: "form_submission", label: "Form submission" },
  { value: "date_field", label: "Date field reached" },
];

async function saveMeta() {
  if (saving.value || !automation.value) return;
  saving.value = true;
  actionError.value = null;
  try {
    const a = await updateAutomation({
      id: id.value,
      name: nameDraft.value.trim() || "Untitled automation",
      triggerType: triggerDraft.value,
    });
    automation.value = { ...automation.value, name: a.name, trigger: a.trigger };
  } catch (e) {
    actionError.value = e?.message || "Could not save.";
  } finally {
    saving.value = false;
  }
}

// ── Status toggle ────────────────────────────────────────────────────────────
async function toggleStatus() {
  if (saving.value || !automation.value) return;
  saving.value = true;
  actionError.value = null;
  try {
    if (automation.value.status === "active") {
      await pauseAutomation(id.value);
      automation.value.status = "paused";
    } else {
      await activateAutomation(id.value);
      automation.value.status = "active";
    }
  } catch (e) {
    actionError.value = e?.message || "Could not change status.";
  } finally {
    saving.value = false;
  }
}

// ── Add step ─────────────────────────────────────────────────────────────────
const adding = ref(false);
async function onAddStep(type) {
  if (adding.value) return;
  adding.value = true;
  actionError.value = null;
  const defaults = {
    send_email: { subject: "New email", html: "<p>Hello {{firstName|there}}</p>" },
    wait: { delayHours: 24 },
    branch: { on: "opened" },
    exit: {},
  };
  try {
    const res = await addStep({ automationId: id.value, type, config: defaults[type] });
    steps.value = res.steps ?? steps.value;
  } catch (e) {
    actionError.value = e?.message || "Could not add step.";
  } finally {
    adding.value = false;
  }
}

async function onDeleteStep(step) {
  if (saving.value) return;
  saving.value = true;
  actionError.value = null;
  try {
    const res = await deleteStep({ automationId: id.value, stepId: step.id });
    steps.value = res.steps ?? [];
    if (selected.value?.id === step.id) selected.value = null;
  } catch (e) {
    actionError.value = e?.message || "Could not delete step.";
  } finally {
    saving.value = false;
  }
}

// ── Step inspector ───────────────────────────────────────────────────────────
const selected = ref(null);
const inspectorDraft = ref({});

function selectStep(step) {
  selected.value = step;
  inspectorDraft.value = JSON.parse(JSON.stringify(step.config || {}));
}

async function saveStep() {
  if (!selected.value || saving.value) return;
  saving.value = true;
  actionError.value = null;
  try {
    const res = await updateStep({
      stepId: selected.value.id,
      config: inspectorDraft.value,
    });
    const i = steps.value.findIndex((s) => s.id === selected.value.id);
    if (i !== -1) steps.value[i] = { ...steps.value[i], config: res.step.config };
    selected.value = steps.value[i] || null;
  } catch (e) {
    actionError.value = e?.message || "Could not save step.";
  } finally {
    saving.value = false;
  }
}

const STEP_META = {
  send_email: { label: "Send email", icon: "✉" },
  wait: { label: "Wait", icon: "⏱" },
  branch: { label: "Branch", icon: "⑂" },
  exit: { label: "Exit", icon: "■" },
};
function stepLabel(t) {
  return STEP_META[t]?.label || t;
}
function stepSummary(step) {
  const c = step.config || {};
  if (step.type === "send_email") return c.subject || "(no subject)";
  if (step.type === "wait") return `${c.delayHours ?? 0} hours`;
  if (step.type === "branch") return `If ${c.on || "opened"}`;
  if (step.type === "exit") return "End of journey";
  return "";
}
</script>

<template>
  <div class="builder">
    <div v-if="loading" class="bu-state">Loading…</div>
    <div v-else-if="loadError" class="bu-state bu-state--error">{{ loadError }}</div>

    <template v-else>
      <header class="bu-header">
        <NuxtLink to="/app/automations" class="bu-back">← Automations</NuxtLink>
        <div class="bu-header-main">
          <TextInput v-model="nameDraft" class="bu-name" placeholder="Automation name" @blur="saveMeta" />
          <div class="bu-header-actions">
            <AppStatusPill :status="automation.status" />
            <Button
              :variant="automation.status === 'active' ? 'ghost' : 'primary'"
              :loading="saving"
              @click="toggleStatus"
            >
              {{ automation.status === "active" ? "Pause" : "Activate" }}
            </Button>
          </div>
        </div>
        <div class="bu-trigger">
          <label class="bu-trigger-label" for="trigger">Trigger</label>
          <select id="trigger" v-model="triggerDraft" class="bu-select" @change="saveMeta">
            <option v-for="o in TRIGGER_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </div>
      </header>

      <div v-if="actionError" class="bu-banner" role="alert">
        <span>{{ actionError }}</span>
        <button type="button" class="bu-banner-x" aria-label="Dismiss" @click="actionError = null">×</button>
      </div>

      <div class="bu-grid">
        <!-- Canvas: linear list of steps -->
        <section class="bu-canvas">
          <div class="bu-flow">
            <div class="bu-trigger-node">
              <span class="bu-node-icon">▶</span>
              <span>Enrolled</span>
            </div>

            <template v-for="(step, i) in steps" :key="step.id">
              <div class="bu-connector" aria-hidden="true"></div>
              <button
                type="button"
                class="bu-step"
                :class="{ 'bu-step--selected': selected?.id === step.id }"
                @click="selectStep(step)"
              >
                <span class="bu-step-icon">{{ STEP_META[step.type]?.icon || "•" }}</span>
                <span class="bu-step-body">
                  <span class="bu-step-type">{{ stepLabel(step.type) }}</span>
                  <span class="bu-step-summary">{{ stepSummary(step) }}</span>
                </span>
                <span class="bu-step-order tabular">{{ i + 1 }}</span>
              </button>
            </template>

            <div v-if="!steps.length" class="bu-empty">
              No steps yet. Add your first step below.
            </div>

            <div class="bu-connector" aria-hidden="true"></div>
            <div class="bu-add">
              <span class="bu-add-label">Add step</span>
              <div class="bu-add-buttons">
                <Button size="sm" variant="secondary" :disabled="adding" @click="onAddStep('send_email')">Send email</Button>
                <Button size="sm" variant="secondary" :disabled="adding" @click="onAddStep('wait')">Wait</Button>
                <Button size="sm" variant="secondary" :disabled="adding" @click="onAddStep('branch')">Branch</Button>
                <Button size="sm" variant="secondary" :disabled="adding" @click="onAddStep('exit')">Exit</Button>
              </div>
            </div>
          </div>
        </section>

        <!-- Inspector -->
        <aside class="bu-inspector">
          <div v-if="!selected" class="bu-inspector-empty">
            Select a step to edit it.
          </div>
          <template v-else>
            <div class="bu-inspector-head">
              <h2>{{ stepLabel(selected.type) }}</h2>
              <button type="button" class="bu-del" @click="onDeleteStep(selected)">Delete step</button>
            </div>

            <!-- send_email -->
            <template v-if="selected.type === 'send_email'">
              <label class="bu-field">
                <span>Subject</span>
                <TextInput v-model="inspectorDraft.subject" placeholder="Subject line" />
              </label>
              <label class="bu-field">
                <span>From name</span>
                <TextInput v-model="inspectorDraft.fromName" placeholder="Sender name (optional)" />
              </label>
              <label class="bu-field">
                <span>From email</span>
                <TextInput v-model="inspectorDraft.fromEmail" placeholder="hello@send.gorilla.email" />
              </label>
              <label class="bu-field">
                <span>HTML body</span>
                <textarea v-model="inspectorDraft.html" class="bu-textarea" rows="8" placeholder="<p>Hello {{firstName}}</p>"></textarea>
              </label>
              <p class="bu-hint">
                Merge tags like <code v-pre>{{firstName|there}}</code> resolve per contact at send time.
                The unsubscribe link is injected automatically.
              </p>
            </template>

            <!-- wait -->
            <template v-else-if="selected.type === 'wait'">
              <label class="bu-field">
                <span>Wait (hours)</span>
                <TextInput v-model.number="inspectorDraft.delayHours" type="number" placeholder="24" />
              </label>
              <p class="bu-hint">The contact pauses here, then continues after the delay.</p>
            </template>

            <!-- branch -->
            <template v-else-if="selected.type === 'branch'">
              <label class="bu-field">
                <span>Branch on</span>
                <select v-model="inspectorDraft.on" class="bu-select">
                  <option value="opened">Opened the previous email</option>
                  <option value="clicked">Clicked the previous email</option>
                  <option value="field">A contact field</option>
                </select>
              </label>
              <template v-if="inspectorDraft.on === 'field'">
                <label class="bu-field">
                  <span>Field key</span>
                  <TextInput v-model="inspectorDraft.field" placeholder="e.g. firstName or custom.plan" />
                </label>
                <label class="bu-field">
                  <span>Equals (optional)</span>
                  <TextInput v-model="inspectorDraft.equals" placeholder="Leave blank for 'has any value'" />
                </label>
              </template>
              <p class="bu-hint">Yes/No paths route to the matching next step.</p>
            </template>

            <!-- exit -->
            <template v-else>
              <p class="bu-hint">This step ends the journey for the contact.</p>
            </template>

            <div v-if="selected.type !== 'exit'" class="bu-inspector-actions">
              <Button variant="primary" :loading="saving" @click="saveStep">Save step</Button>
            </div>
          </template>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}
.bu-state {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}
.bu-state--error { color: var(--color-danger, var(--color-ink-soft)); }

.bu-header { display: flex; flex-direction: column; gap: var(--space-3); }
.bu-back {
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  text-decoration: none;
  font-weight: 600;
}
.bu-back:hover { color: var(--color-pop); }
.bu-header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.bu-name {
  flex: 1;
  min-width: 240px;
  font-family: var(--font-display);
  font-weight: 700;
}
.bu-header-actions { display: flex; align-items: center; gap: var(--space-3); }
.bu-trigger { display: flex; align-items: center; gap: var(--space-3); }
.bu-trigger-label {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.bu-select {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-sm);
}

.bu-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--color-danger-bg, var(--color-surface-2));
  color: var(--color-danger, var(--color-ink));
  border: 1px solid var(--color-danger, var(--color-rule));
}
.bu-banner-x {
  border: 0; background: transparent; color: inherit;
  font-size: 18px; line-height: 1; cursor: pointer; padding: 0 var(--space-1);
}

.bu-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: var(--space-5);
  align-items: start;
}
@media (max-width: 900px) { .bu-grid { grid-template-columns: 1fr; } }

/* Canvas */
.bu-canvas {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-6);
}
.bu-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.bu-trigger-node {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-pop-bg);
  color: var(--color-ink);
  font-size: var(--text-sm);
  font-weight: 600;
}
.bu-node-icon { color: var(--color-pop); }
.bu-connector {
  width: 2px;
  height: var(--space-4);
  background: var(--color-rule);
}
.bu-step {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  max-width: 420px;
  padding: var(--space-4);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.bu-step:hover { border-color: var(--color-pop); }
.bu-step--selected {
  border-color: var(--color-pop);
  box-shadow: var(--shadow-pop-glow);
}
.bu-step-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px; height: 32px;
  border-radius: var(--radius-md);
  background: var(--color-surface-sunk);
  font-size: var(--text-md);
}
.bu-step-body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.bu-step-type { font-weight: 600; color: var(--color-ink); font-size: var(--text-sm); }
.bu-step-summary {
  color: var(--color-ink-soft);
  font-size: var(--text-xs);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bu-step-order { color: var(--color-ink-dim); font-family: var(--font-mono); font-size: var(--text-xs); }
.bu-empty {
  padding: var(--space-5);
  color: var(--color-ink-dim);
  font-size: var(--text-sm);
}
.bu-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border: 1px dashed var(--color-rule);
  border-radius: var(--radius-md);
  width: 100%;
  max-width: 420px;
}
.bu-add-label {
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--color-ink-dim);
}
.bu-add-buttons { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; }
.tabular { font-variant-numeric: tabular-nums; }

/* Inspector */
.bu-inspector {
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  position: sticky;
  top: var(--space-5);
}
.bu-inspector-empty { color: var(--color-ink-dim); font-size: var(--text-sm); }
.bu-inspector-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.bu-inspector-head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
}
.bu-del {
  border: 0; background: transparent;
  color: var(--color-danger, #d23b3b);
  font-size: var(--text-sm);
  cursor: pointer;
}
.bu-del:hover { text-decoration: underline; }
.bu-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.bu-textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  resize: vertical;
}
.bu-hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  line-height: var(--leading-normal);
}
.bu-hint code {
  font-family: var(--font-mono);
  background: var(--color-surface-sunk);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
}
.bu-inspector-actions { display: flex; justify-content: flex-end; }
</style>
