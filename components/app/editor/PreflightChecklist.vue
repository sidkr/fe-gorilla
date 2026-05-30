<script setup lang="ts">
import type { PreflightCheck, SetupField } from "./editor-types";
// PreflightChecklist — replaces the old "Are you sure?" send confirm.
// Per Editor-phase1.md §8: a checklist of send-readiness conditions
// with deep-links (the "Edit →" buttons) into the relevant setup field.
//
// We don't compute checks here from raw campaign + body — the Shell
// passes a pre-computed `checks` array. That keeps this component a
// dumb presenter; the source of truth for what passes lives next to
// the Shell where the data lives.
import { computed } from "vue";

interface Props {
  open: boolean;
  checks: PreflightCheck[];
  // The selected audience's recipient count, for the primary CTA copy.
  recipientCount: number | null;
  // Send pipeline state, owned by the Shell. `idle` shows the checklist;
  // `sending` shows progress + disables the button; `sent`/`error` swap in
  // a result panel.
  sendStage?: "idle" | "sending" | "sent" | "error";
  sendRecipientCount?: number | null;
  sendError?: string;
  // Org timezone label shown next to the schedule picker (Phase 0 §0.3).
  timezone?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  sendStage: "idle",
  sendRecipientCount: null,
  sendError: "",
  timezone: null,
});
const emit = defineEmits<{
  (e: "close"): void;
  // `send` now carries when: "now" or a future ISO timestamp (Phase 0 §0.3).
  (e: "send", payload: { when: string }): void;
  (e: "send-success-done"): void;
  (e: "send-error-dismiss"): void;
  (e: "open-test-send"): void;
  (e: "edit", field: SetupField): void;
  (e: "toast", text: string): void;
}>();

const failingCount = computed(
  () => props.checks.filter((c) => c.status === "fail").length,
);
const canSend = computed(() => failingCount.value === 0);

const ctaLabel = computed(() => {
  if (!canSend.value) {
    const n = failingCount.value;
    return `${n} item${n === 1 ? "" : "s"} need attention`;
  }
  if (props.recipientCount == null) return "Send";
  return `Send to ${props.recipientCount.toLocaleString("en-US")} recipients`;
});

const sending = computed(() => props.sendStage === "sending");

// ── Send now vs schedule (Phase 0 §0.3) ───────────────────────────────────
// mode "now" sends immediately; "schedule" reveals a date+time picker that
// produces a future ISO timestamp. scheduleSend enforces the future-time rule
// server-side; we mirror a 5-minute floor in the UI so the obvious case never
// round-trips just to be rejected.
const mode = ref<"now" | "schedule">("now");

// Format a Date as a <input type="datetime-local"> value: local "YYYY-MM-DDTHH:mm".
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

const minLocal = computed(() => toLocalInput(new Date(Date.now() + 5 * 60_000)));
const scheduledLocal = ref<string>(minLocal.value);

// Org timezone label, falling back to the browser zone.
const tzLabel = computed(() => {
  if (props.timezone) return props.timezone;
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (z) return `${z} (your timezone)`;
  } catch {
    /* ignore */
  }
  return "your timezone";
});

const scheduleValid = computed(() => {
  if (mode.value !== "schedule") return true;
  const t = new Date(scheduledLocal.value).getTime();
  return Number.isFinite(t) && t > Date.now();
});

const ctaText = computed(() => {
  if (sending.value) return mode.value === "schedule" ? "Scheduling…" : "Sending…";
  if (mode.value === "schedule") return "Schedule send";
  return ctaLabel.value;
});

function onSend() {
  if (!canSend.value || sending.value || !scheduleValid.value) return;
  if (mode.value === "schedule") {
    // datetime-local has no zone; new Date(localString) interprets it in the
    // browser's local zone and toISOString() normalizes to UTC for the server.
    emit("send", { when: new Date(scheduledLocal.value).toISOString() });
  } else {
    emit("send", { when: "now" });
  }
}

function onEdit(field: SetupField | null) {
  if (!field) return;
  emit("edit", field);
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pf-backdrop" @click.self="emit('close')">
      <div class="pf-modal" role="dialog" aria-labelledby="pf-title">
        <!-- Success state: the send was scheduled/queued. -->
        <div v-if="sendStage === 'sent'" class="pf-result">
          <span class="pf-result-icon pf-result-icon--ok" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="26" height="26">
              <path
                d="M5 12l5 5 9-11"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <h2 class="pf-title">
            Sending<template v-if="sendRecipientCount != null">
              to {{ sendRecipientCount.toLocaleString("en-US") }}
              recipient{{ sendRecipientCount === 1 ? "" : "s" }}</template>
          </h2>
          <p class="pf-result-desc">Track it in Reports.</p>
          <div class="pf-result-actions">
            <Button variant="primary" @click="emit('send-success-done')">
              View campaigns
            </Button>
          </div>
        </div>

        <!-- Error state: the cloud fn rejected (validation or send failure). -->
        <div v-else-if="sendStage === 'error'" class="pf-result">
          <span class="pf-result-icon pf-result-icon--fail" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="24" height="24">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
              />
            </svg>
          </span>
          <h2 class="pf-title">Couldn't send</h2>
          <p class="pf-result-desc pf-result-desc--error">{{ sendError }}</p>
          <div class="pf-result-actions">
            <Button variant="ghost" @click="emit('send-error-dismiss')">
              Back to checklist
            </Button>
          </div>
        </div>

        <!-- Default: the readiness checklist (also shown while sending). -->
        <template v-else>
        <header class="pf-head">
          <h2 id="pf-title" class="pf-title">Ready to send?</h2>
          <button
            type="button"
            class="pf-close"
            aria-label="Close"
            :disabled="sending"
            @click="emit('close')"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </header>

        <ul class="pf-list">
          <li
            v-for="check in checks"
            :key="check.id"
            :class="['pf-row', `pf-row--${check.status}`]"
          >
            <span :class="['pf-icon', `pf-icon--${check.status}`]" aria-hidden="true">
              <svg v-if="check.status === 'ok'" viewBox="0 0 24 24" width="14" height="14">
                <path
                  d="M5 12l5 5 9-11"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <svg v-else-if="check.status === 'warn'" viewBox="0 0 24 24" width="14" height="14">
                <path
                  d="M12 3l10 18H2L12 3zM12 10v5M12 18h.01"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="14" height="14">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.2"
                  stroke-linecap="round"
                />
              </svg>
            </span>
            <div class="pf-text">
              <div class="pf-label">{{ check.label }}</div>
              <div class="pf-desc">{{ check.description }}</div>
            </div>
            <Button
              v-if="check.status === 'fail' && check.fixField"
              variant="subtle"
              size="sm"
              @click="onEdit(check.fixField)"
            >
              Edit
              <template #trailing>
                <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
                  <path
                    d="M5 12h14M13 6l6 6-6 6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </template>
            </Button>
          </li>
        </ul>

        <!-- When to send: now vs scheduled (Phase 0 §0.3). -->
        <div class="pf-schedule">
          <div class="pf-mode" role="radiogroup" aria-label="When to send">
            <label class="pf-mode-opt">
              <input type="radio" value="now" v-model="mode" :disabled="sending" />
              <span>Send now</span>
            </label>
            <label class="pf-mode-opt">
              <input
                type="radio"
                value="schedule"
                v-model="mode"
                :disabled="sending"
              />
              <span>Schedule for…</span>
            </label>
          </div>
          <div v-if="mode === 'schedule'" class="pf-when">
            <input
              type="datetime-local"
              class="pf-when-input"
              v-model="scheduledLocal"
              :min="minLocal"
              :disabled="sending"
            />
            <p class="pf-when-tz">Times are in {{ tzLabel }}.</p>
            <p v-if="!scheduleValid" class="pf-when-err">
              Pick a time at least a few minutes from now.
            </p>
          </div>
        </div>

        <footer class="pf-foot">
          <div class="pf-foot-left">
            <Button
              variant="subtle"
              size="sm"
              :disabled="sending"
              @click="emit('open-test-send')"
            >
              Send a test first
            </Button>
          </div>
          <div class="pf-foot-right">
            <Button
              variant="primary"
              :disabled="!canSend || sending || !scheduleValid"
              :loading="sending"
              @click="onSend"
            >
              {{ ctaText }}
            </Button>
          </div>
        </footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pf-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(24, 24, 27, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--space-5);
}
.pf-modal {
  width: 100%;
  max-width: 520px;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.pf-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: var(--space-6) var(--space-5);
  gap: var(--space-2);
}
.pf-result-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: var(--radius-pill);
  margin-bottom: var(--space-2);
}
.pf-result-icon--ok {
  background: var(--color-ok-bg);
  color: var(--color-ok);
}
.pf-result-icon--fail {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}
.pf-result-desc {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  line-height: var(--leading-snug);
}
.pf-result-desc--error { color: var(--color-danger); }
.pf-result-actions {
  margin-top: var(--space-4);
  display: flex;
  justify-content: center;
}

.pf-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-5);
  border-bottom: 1px solid var(--color-rule);
}
.pf-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-ink);
}
.pf-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  cursor: pointer;
  padding: 0;
}
.pf-close:hover { background: var(--color-surface-2); color: var(--color-ink); }

.pf-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;
}
.pf-row {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-5);
}
.pf-row + .pf-row {
  border-top: 1px solid var(--color-rule);
}

.pf-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  margin-top: 1px;
  border-radius: var(--radius-pill);
}
.pf-icon--ok {
  background: var(--color-ok-bg);
  color: var(--color-ok);
}
.pf-icon--warn {
  background: var(--color-warn-bg);
  color: var(--color-warn);
}
.pf-icon--fail {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.pf-text {
  flex: 1;
  min-width: 0;
}
.pf-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.pf-desc {
  margin-top: 2px;
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
  line-height: var(--leading-snug);
}

.pf-schedule {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-rule);
}
.pf-mode {
  display: flex;
  gap: var(--space-4);
}
.pf-mode-opt {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--color-ink);
  cursor: pointer;
}
.pf-mode-opt input { accent-color: var(--color-pop); }
.pf-when {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.pf-when-input {
  font-size: var(--text-sm);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-ink);
  align-self: flex-start;
}
.pf-when-tz {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
}
.pf-when-err {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--color-danger);
}
.pf-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-rule);
  background: var(--color-surface-2);
}
.pf-foot-left { display: flex; }
.pf-foot-right { display: flex; gap: var(--space-2); }
</style>
