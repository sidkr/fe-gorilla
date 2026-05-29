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
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type ComponentPublicInstance,
} from "vue";
import AudienceSelector from "./AudienceSelector.vue";
import BrandColorPicker from "./BrandColorPicker.vue";
import MergeTagPicker from "./MergeTagPicker.vue";
import { insertAtCursor } from "~/composables/app/useMergeTags";

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

// ── Merge-tag insertion ──────────────────────────────────────────────────
// Splice the token into the focused input at the caret, then push the new
// value up through the normal patch path. Subject + preview text are the
// two personalizable sender-metadata fields.
//
// The text fields render via the shared <TextInput> component; a template
// ref on a component resolves to its public instance, so reach through `$el`
// to get the underlying <input> that insertAtCursor / .focus() operate on.
function inputEl(
  r: ComponentPublicInstance | HTMLInputElement | null,
): HTMLInputElement | null {
  if (!r) return null;
  const el = (r as ComponentPublicInstance).$el ?? r;
  return (el as HTMLElement)?.tagName === "INPUT" ? (el as HTMLInputElement) : null;
}
function insertSubjectTag(token: string) {
  patch("subject", insertAtCursor(inputEl(subjectInput.value), token));
}
function insertPreheaderTag(token: string) {
  patch("preheader", insertAtCursor(inputEl(preheaderInput.value), token));
}

// ── Focus management ─────────────────────────────────────────────────────
// `name` is still a raw <input> (no label/validation), so its ref is a real
// element. The rest are <TextInput> instances, reached via inputEl().
const nameInput = ref<HTMLInputElement | null>(null);
const subjectInput = ref<ComponentPublicInstance | null>(null);
const preheaderInput = ref<ComponentPublicInstance | null>(null);
const fromNameInput = ref<ComponentPublicInstance | null>(null);
const fromEmailInput = ref<ComponentPublicInstance | null>(null);
const replyToInput = ref<ComponentPublicInstance | null>(null);
const audienceSel = ref<InstanceType<typeof AudienceSelector> | null>(null);
const rootEl = ref<HTMLElement | null>(null);

function focusField(f: SetupField | null) {
  if (!f) return;
  void nextTick(() => {
    if (f === "name") nameInput.value?.focus();
    else if (f === "subject") inputEl(subjectInput.value)?.focus();
    else if (f === "preheader") inputEl(preheaderInput.value)?.focus();
    else if (f === "fromName") inputEl(fromNameInput.value)?.focus();
    else if (f === "fromEmail") inputEl(fromEmailInput.value)?.focus();
    else if (f === "replyTo") inputEl(replyToInput.value)?.focus();
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
            <span class="setup-row-head-right">
              <MergeTagPicker compact @insert="insertSubjectTag" />
              <span class="setup-counter" :class="{ 'setup-counter--over': subjectError }">
                {{ values.subject.length }} / 150
              </span>
            </span>
          </span>
          <TextInput
            ref="subjectInput"
            type="text"
            :model-value="values.subject"
            :invalid="!!subjectError"
            placeholder="Spring sale is here"
            @update:model-value="patch('subject', $event as string)"
          />
          <span v-if="subjectError" class="setup-err">{{ subjectError }}</span>
        </label>

        <!-- Preheader --------------------------------------------------- -->
        <label class="setup-row">
          <span class="setup-row-head">
            <span class="setup-label">Preview text</span>
            <span class="setup-row-head-right">
              <MergeTagPicker compact @insert="insertPreheaderTag" />
              <span class="setup-counter" :class="{ 'setup-counter--over': preheaderError }">
                {{ values.preheader.length }} / 120
              </span>
            </span>
          </span>
          <TextInput
            ref="preheaderInput"
            type="text"
            :model-value="values.preheader"
            :invalid="!!preheaderError"
            placeholder="20% off, members first"
            @update:model-value="patch('preheader', $event as string)"
          />
          <span class="setup-hint">Inbox preview shown next to the subject in most clients.</span>
          <span v-if="preheaderError" class="setup-err">{{ preheaderError }}</span>
        </label>

        <!-- From name --------------------------------------------------- -->
        <FormField class="setup-row" label="From name" :error="fromNameError || ''">
          <TextInput
            ref="fromNameInput"
            type="text"
            :model-value="values.fromName"
            :invalid="!!fromNameError"
            placeholder="Folkways"
            @update:model-value="patch('fromName', $event as string)"
          />
        </FormField>

        <!-- From email -------------------------------------------------- -->
        <FormField class="setup-row" label="From email" :error="fromEmailError || ''">
          <TextInput
            ref="fromEmailInput"
            type="email"
            :model-value="values.fromEmail"
            :invalid="!!fromEmailError"
            placeholder="team@folkways.io"
            autocomplete="off"
            @update:model-value="patch('fromEmail', $event as string)"
          />
        </FormField>

        <!-- Reply-to ---------------------------------------------------- -->
        <FormField
          class="setup-row"
          label="Reply-to (optional)"
          :error="replyToError || ''"
          hint="Defaults to your From email if left blank."
        >
          <TextInput
            ref="replyToInput"
            type="email"
            :model-value="values.replyTo"
            :invalid="!!replyToError"
            :placeholder="values.fromEmail || 'replies@folkways.io'"
            autocomplete="off"
            @update:model-value="patch('replyTo', $event as string)"
          />
        </FormField>

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
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  min-height: 24px;
}
.setup-row-head-right {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
}
.setup-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.setup-counter {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
}
.setup-counter--over { color: var(--color-danger); }

.setup-hint {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}
.setup-err {
  font-size: var(--text-xs);
  color: var(--color-danger);
}
</style>
