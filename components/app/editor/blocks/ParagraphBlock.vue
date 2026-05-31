<script setup lang="ts">
// ParagraphBlock — plain textarea in inspector, no rich text editor.
// The `html` prop name is kept for forward compatibility with the
// future sanitized-HTML pipeline; for now we treat it as plain text in
// both render and inspect.
//
// In render mode, when the block is selected the rendered <p> becomes
// contenteditable="plaintext-only" (Editor-phase1.md §3). Newlines are
// allowed (Paragraph is multi-line by nature) and are stored as `\n`
// in `html`.
import { computed, nextTick, ref, watch } from "vue";
import BrandColorPicker from "../BrandColorPicker.vue";
import MergeTagPicker from "../MergeTagPicker.vue";
import { insertAtCursor } from "~/composables/app/useMergeTags";
import { plaintextEditableValue } from "~/composables/app/useEditable";

// "plaintext-only" where supported (Chromium/Safari), "true" in Firefox.
const editableMode = plaintextEditableValue();

interface Props {
  mode: "render" | "inspect";
  editable?: boolean;
  blockProps: {
    html: string;
    align: "left" | "center" | "right";
    color: string;
  };
}

const props = withDefaults(defineProps<Props>(), { editable: false });
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
  (e: "inline-input", text: string): void;
  (e: "inline-commit", text: string): void;
}>();

const styleVars = computed(() => ({
  "--p-color": props.blockProps.color,
  "--p-align": props.blockProps.align,
}));

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}

// ── Merge-tag insertion (inspect mode) ───────────────────────────────────
// The text field is a shared <TextArea> whose root element IS the <textarea>,
// so we capture that DOM node via a function ref for caret-aware insertion.
const textArea = ref<HTMLTextAreaElement | null>(null);
function setTextArea(el: unknown) {
  textArea.value = (el && (el as { $el?: HTMLTextAreaElement }).$el)
    ? (el as { $el: HTMLTextAreaElement }).$el
    : (el as HTMLTextAreaElement | null);
}
function insertTag(token: string) {
  const next = insertAtCursor(textArea.value, token);
  patch("html", next);
}

const alignOptions = [
  { label: "Left", value: "left" },
  { label: "Center", value: "center" },
  { label: "Right", value: "right" },
] as const;

// The contenteditable element holds the DOM-side source of truth while
// editing. Vue's text-interpolation is suppressed in editable mode so
// the keystroke-driven prop updates don't replace the DOM node and
// kill the cursor. See HeadingBlock for the same pattern.
const editEl = ref<HTMLElement | null>(null);

function onInput(e: Event) {
  // innerText preserves visual line breaks better than textContent here
  // (browsers convert <br>/<div> wrappers used by contenteditable's
  // Enter handling into newlines in innerText).
  const text = (e.target as HTMLElement).innerText ?? "";
  emit("inline-input", text);
}
function onBlur(e: Event) {
  const text = (e.target as HTMLElement).innerText ?? "";
  emit("inline-commit", text);
}

watch(
  () => props.editable,
  async (v) => {
    if (!v) return;
    await nextTick();
    const el = editEl.value;
    if (!el) return;
    el.textContent = props.blockProps.html;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="mode === 'render'" class="p-render" :style="styleVars">
    <!-- Editable + display are separate elements; the editable one has NO
         Vue-managed children so the imperative textContent write in the editable
         watcher can't desync the VDOM. See HeadingBlock for the full rationale
         (the old shared element corrupted the tree → next insert crashed). -->
    <p
      v-if="editable"
      ref="editEl"
      class="p-text p-text--editable"
      :contenteditable="editableMode"
      spellcheck="true"
      @input="onInput"
      @blur="onBlur"
    />
    <p v-else class="p-text">{{ blockProps.html }}</p>
  </div>

  <div v-else class="p-inspect">
    <div class="ins-row">
      <span class="ins-label">
        <span>Text</span>
        <MergeTagPicker compact @insert="insertTag" />
      </span>
      <TextArea
        :ref="setTextArea"
        :rows="5"
        :model-value="blockProps.html"
        @update:model-value="patch('html', $event)"
      />
    </div>

    <div class="ins-row">
      <span class="ins-label">Align</span>
      <SegmentedControl
        :options="alignOptions"
        aria-label="Align"
        :model-value="blockProps.align"
        @update:model-value="patch('align', $event)"
      />
    </div>

    <div class="ins-row">
      <span class="ins-label">Color</span>
      <BrandColorPicker
        :model-value="blockProps.color"
        @update:model-value="patch('color', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.p-render {
  color: var(--p-color);
  text-align: var(--p-align);
}
.p-text {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  line-height: var(--leading-loose);
  white-space: pre-wrap;
  outline: none;
}
.p-text--editable {
  cursor: text;
}
.p-inspect { display: grid; gap: var(--space-4); }
</style>
