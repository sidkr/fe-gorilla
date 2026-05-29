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
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "send"): void;
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

function onSend() {
  if (!canSend.value) return;
  emit("send");
}

function onEdit(field: SetupField | null) {
  if (!field) return;
  emit("edit", field);
}

function onSchedule() {
  emit("toast", "Scheduling lands in the next iteration.");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pf-backdrop" @click.self="emit('close')">
      <div class="pf-modal" role="dialog" aria-labelledby="pf-title">
        <header class="pf-head">
          <h2 id="pf-title" class="pf-title">Ready to send?</h2>
          <button
            type="button"
            class="pf-close"
            aria-label="Close"
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
            <button
              v-if="check.status === 'fail' && check.fixField"
              type="button"
              class="pf-edit"
              @click="onEdit(check.fixField)"
            >
              Edit
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
            </button>
          </li>
        </ul>

        <footer class="pf-foot">
          <div class="pf-foot-left">
            <button type="button" class="pf-link" @click="emit('open-test-send')">
              Send a test first
            </button>
          </div>
          <div class="pf-foot-right">
            <button type="button" class="pf-btn pf-btn--ghost" @click="onSchedule">
              Schedule for later
            </button>
            <button
              type="button"
              class="pf-btn pf-btn--pop"
              :disabled="!canSend"
              @click="onSend"
            >
              {{ ctaLabel }}
            </button>
          </div>
        </footer>
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

.pf-edit {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 0;
  background: transparent;
  color: var(--color-pop-deep);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}
.pf-edit:hover { color: var(--color-pop); background: var(--color-pop-bg); }

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

.pf-link {
  background: transparent;
  border: 0;
  padding: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--link-color);
  cursor: pointer;
  white-space: nowrap;
}
.pf-link:hover { color: var(--link-color-hover); text-decoration: underline; }

.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.pf-btn--ghost {
  background: var(--color-surface);
  color: var(--color-ink);
  border-color: var(--color-rule);
}
.pf-btn--ghost:hover { background: var(--color-surface-2); }
.pf-btn--pop {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border-color: var(--btn-primary-bg);
}
.pf-btn--pop:hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}
.pf-btn--pop[disabled] {
  background: var(--color-surface-sunk);
  color: var(--color-ink-dim);
  border-color: var(--color-rule);
  cursor: not-allowed;
}
</style>
