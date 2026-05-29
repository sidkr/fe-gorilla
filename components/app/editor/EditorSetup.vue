<script setup lang="ts">
import type { SetupField, SetupValues } from "./editor-types";
// EditorSetup — the popover behind the "Setup" button in the top bar.
// Holds subject, preheader, fromName, fromEmail, replyTo, audienceId,
// and (per Editor-phase1.md §1) the campaign name. The popover is the
// single editing surface for sender metadata; values flow up via v-model
// patches and the Shell folds them into its standard autosave debounce.
//
// `focusField` is a one-shot directive driven by the pre-flight modal's
// "Edit →" links: when the popover opens we focus that named field.
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import AudienceSelector from "./AudienceSelector.vue";
import BrandColorPicker from "./BrandColorPicker.vue";

interface Props {
  open: boolean;
  values: SetupValues;
  // Top/right viewport coordinates of the anchoring "Setup" button.
  anchorTop: number;
  anchorLeft: number;
  // If set, focus this field when the popover opens (pre-flight deep-link).
  focusField: SetupField | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "update", patch: Partial<SetupValues>): void;
  (e: "focus-handled"): void;
}>();

// ── Validation ────────────────────────────────────────────────────────────
// RFC 5322 is huge; this is the practical subset everyone ships and what
// MJML/ESPs accept. Surfaces validation inline; we don't block save (the
// pre-flight checklist enforces send-readiness — see Editor-phase1.md §1).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const subjectError = computed(() => {
  if (props.values.subject.length > 150) return "Keep it under 150 characters.";
  return null;
});
const preheaderError = computed(() => {
  if (props.values.preheader.length > 120) return "Keep it under 120 characters.";
  return null;
});
const fromNameError = computed(() => {
  if (props.values.fromName.length > 80) return "Keep it under 80 characters.";
  return null;
});
const fromEmailError = computed(() => {
  const v = props.values.fromEmail.trim();
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return "That doesn't look like a valid email address.";
  return null;
});
const replyToError = computed(() => {
  const v = props.values.replyTo.trim();
  if (!v) return null;
  if (!EMAIL_RE.test(v)) return "That doesn't look like a valid email address.";
  return null;
});

function patch<K extends keyof SetupValues>(k: K, v: SetupValues[K]) {
  emit("update", { [k]: v } as Partial<SetupValues>);
}

// ── Focus management ─────────────────────────────────────────────────────
const nameInput = ref<HTMLInputElement | null>(null);
const subjectInput = ref<HTMLInputElement | null>(null);
const preheaderInput = ref<HTMLInputElement | null>(null);
const fromNameInput = ref<HTMLInputElement | null>(null);
const fromEmailInput = ref<HTMLInputElement | null>(null);
const replyToInput = ref<HTMLInputElement | null>(null);
const audienceSel = ref<InstanceType<typeof AudienceSelector> | null>(null);
const rootEl = ref<HTMLElement | null>(null);

function focusField(f: SetupField | null) {
  if (!f) return;
  void nextTick(() => {
    if (f === "name") nameInput.value?.focus();
    else if (f === "subject") subjectInput.value?.focus();
    else if (f === "preheader") preheaderInput.value?.focus();
    else if (f === "fromName") fromNameInput.value?.focus();
    else if (f === "fromEmail") fromEmailInput.value?.focus();
    else if (f === "replyTo") replyToInput.value?.focus();
    else if (f === "audience") audienceSel.value?.focus();
    emit("focus-handled");
  });
}

watch(
  () => [props.open, props.focusField] as const,
  ([open, f]) => {
    if (open && f) focusField(f);
  },
);

// ── Dismissal ────────────────────────────────────────────────────────────
function onClickOutside(e: MouseEvent) {
  if (!props.open) return;
  const target = e.target as HTMLElement;
  if (!target.closest(".setup-pop") && !target.closest('[data-setup-anchor="true"]')) {
    emit("close");
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && props.open) {
    emit("close");
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onClickOutside);
  document.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="rootEl"
      class="setup-pop"
      :style="{ top: `${anchorTop}px`, left: `${anchorLeft}px` }"
      role="dialog"
      aria-label="Campaign setup"
    >
      <header class="setup-head">
        <span class="setup-eyebrow">Campaign name</span>
        <input
          ref="nameInput"
          type="text"
          class="setup-name"
          :value="values.name"
          placeholder="Untitled campaign"
          @input="patch('name', ($event.target as HTMLInputElement).value)"
        />
      </header>

      <div class="setup-body">
        <!-- Subject ----------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-row-head">
            <span class="setup-label">Subject line</span>
            <span class="setup-counter" :class="{ 'setup-counter--over': subjectError }">
              {{ values.subject.length }} / 150
            </span>
          </span>
          <input
            ref="subjectInput"
            type="text"
            class="setup-input"
            :class="{ 'setup-input--err': subjectError }"
            :value="values.subject"
            placeholder="Spring sale is here"
            @input="patch('subject', ($event.target as HTMLInputElement).value)"
          />
          <span v-if="subjectError" class="setup-err">{{ subjectError }}</span>
        </label>

        <!-- Preheader --------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-row-head">
            <span class="setup-label">Preview text</span>
            <span class="setup-counter" :class="{ 'setup-counter--over': preheaderError }">
              {{ values.preheader.length }} / 120
            </span>
          </span>
          <input
            ref="preheaderInput"
            type="text"
            class="setup-input"
            :class="{ 'setup-input--err': preheaderError }"
            :value="values.preheader"
            placeholder="20% off, members first"
            @input="patch('preheader', ($event.target as HTMLInputElement).value)"
          />
          <span class="setup-hint">Inbox preview shown next to the subject in most clients.</span>
          <span v-if="preheaderError" class="setup-err">{{ preheaderError }}</span>
        </label>

        <!-- From name --------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-label">From name</span>
          <input
            ref="fromNameInput"
            type="text"
            class="setup-input"
            :class="{ 'setup-input--err': fromNameError }"
            :value="values.fromName"
            placeholder="Folkways"
            @input="patch('fromName', ($event.target as HTMLInputElement).value)"
          />
          <span v-if="fromNameError" class="setup-err">{{ fromNameError }}</span>
        </label>

        <!-- From email -------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-label">From email</span>
          <input
            ref="fromEmailInput"
            type="email"
            class="setup-input"
            :class="{ 'setup-input--err': fromEmailError }"
            :value="values.fromEmail"
            placeholder="team@folkways.io"
            autocomplete="off"
            @input="patch('fromEmail', ($event.target as HTMLInputElement).value)"
          />
          <span v-if="fromEmailError" class="setup-err">{{ fromEmailError }}</span>
        </label>

        <!-- Reply-to ---------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-label">Reply-to <span class="setup-optional">(optional)</span></span>
          <input
            ref="replyToInput"
            type="email"
            class="setup-input"
            :class="{ 'setup-input--err': replyToError }"
            :value="values.replyTo"
            :placeholder="values.fromEmail || 'replies@folkways.io'"
            autocomplete="off"
            @input="patch('replyTo', ($event.target as HTMLInputElement).value)"
          />
          <span class="setup-hint">Defaults to your From email if left blank.</span>
          <span v-if="replyToError" class="setup-err">{{ replyToError }}</span>
        </label>

        <!-- Audience ---------------------------------------------------- -->
        <div class="setup-row">
          <span class="setup-label">Send to</span>
          <AudienceSelector
            ref="audienceSel"
            :model-value="values.audienceId"
            @update:model-value="patch('audienceId', $event)"
          />
        </div>

        <!-- Background ------------------------------------------------- -->
        <!-- The workspace tint behind the email card. The card stays
             white regardless; this is the surrounding area only. -->
        <div class="setup-row">
          <span class="setup-label">Background</span>
          <BrandColorPicker
            :model-value="values.bodyBg"
            @update:model-value="patch('bodyBg', $event)"
          />
          <span class="setup-hint">The tinted area around the email; the email card stays white.</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.setup-pop {
  position: fixed;
  width: 480px;
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-popover);
}

.setup-head {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-surface);
}
.setup-eyebrow {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-dim);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.setup-name {
  border: 0;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
  outline: none;
  padding: var(--space-1) 0;
  width: 100%;
}
.setup-name::placeholder { color: var(--color-ink-dim); }

.setup-body {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-5);
}

.setup-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.setup-row-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.setup-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.setup-optional {
  font-weight: 500;
  color: var(--color-ink-dim);
  text-transform: none;
  letter-spacing: var(--tracking-normal);
  margin-left: var(--space-1);
}
.setup-counter {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
}
.setup-counter--over { color: var(--color-danger); }

.setup-input {
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
  transition: border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.setup-input::placeholder { color: var(--field-placeholder); }
.setup-input:focus {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}
.setup-input--err {
  border-color: var(--color-danger);
}
.setup-input--err:focus {
  box-shadow: 0 0 0 4px var(--color-danger-bg);
}

.setup-hint {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}
.setup-err {
  font-size: var(--text-xs);
  color: var(--color-danger);
}
</style>
