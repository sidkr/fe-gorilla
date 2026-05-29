<script setup lang="ts">
// HeadingBlock — renders either the canvas preview (mode="render") or the
// inspector controls (mode="inspect"). One file per block keeps the
// per-block contract close to its props; the registry simply uses this
// twice (Render + Inspect) under two different roles.
//
// In render mode, when the block is selected the rendered <h*> becomes
// contenteditable="plaintext-only" so the user can edit the text in
// place (Editor-phase1.md §3). Enter is preventDefault'd — headings are
// single-line by design.
import { computed, nextTick, ref, watch } from "vue";
import BrandColorPicker from "../BrandColorPicker.vue";
import MergeTagPicker from "../MergeTagPicker.vue";
import { insertAtCursor } from "~/composables/app/useMergeTags";

interface Props {
  mode: "render" | "inspect";
  // Render-mode only: when true, the rendered element becomes editable
  // and receives focus (cursor at end). Falsy by default — the inspector
  // mode and pre-selection render both ignore this.
  editable?: boolean;
  // Loose typing is acceptable here — block props are validated against
  // the per-block default() when blocks are inserted. Tightening props
  // per block-type is future work alongside generics on BlockDefinition.
  blockProps: {
    text: string;
    level: 1 | 2 | 3;
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
  "--heading-color": props.blockProps.color,
  "--heading-align": props.blockProps.align,
}));

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}

// ── Merge-tag insertion (inspect mode) ───────────────────────────────────
const textInput = ref<HTMLInputElement | null>(null);
function insertTag(token: string) {
  const next = insertAtCursor(textInput.value, token);
  patch("text", next);
}

// ── Inline editing (render mode) ─────────────────────────────────────────
// The contenteditable element is rendered with v-once-like semantics
// while editable=true: Vue puts the initial text in on entering edit
// mode, and from then on the DOM is the source of truth until blur.
// If we let `{{ blockProps.text }}` keep re-binding on every input,
// Vue would replace the text node mid-keystroke and kill the cursor.
const editEl = ref<HTMLElement | null>(null);

function onInput(e: Event) {
  const text = (e.target as HTMLElement).innerText ?? "";
  // Granular per-keystroke event; EditorShell applies the 500ms
  // throttled undo-push (Editor-phase1.md §5) and updates body.
  emit("inline-input", text);
}
function onBlur(e: Event) {
  const text = (e.target as HTMLElement).innerText ?? "";
  emit("inline-commit", text);
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    // Single-line; commit and blur on Enter so the user has a clear way
    // out of the editor without inserting a (visually broken) newline.
    e.preventDefault();
    (e.target as HTMLElement).blur();
  }
}

// When the block becomes editable, write the current text into the DOM
// once, then focus + place cursor at end. The render template renders
// the element WITHOUT the {{ text }} interpolation when editable=true
// so Vue's reactivity doesn't fight the contenteditable's mutations.
watch(
  () => [props.editable, props.blockProps.level] as const,
  async ([v]) => {
    if (!v) return;
    await nextTick();
    const el = editEl.value;
    if (!el) return;
    el.textContent = props.blockProps.text;
    el.focus();
    // Move cursor to the end of the text.
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
  <!-- RENDER -->
  <div v-if="mode === 'render'" class="heading-render" :style="styleVars">
    <!-- We render the same element shape for all three levels and just
         swap the wrapper tag. When NOT editable, Vue interpolates
         {{ text }} so updates from the inspector flow into the DOM.
         When editable, we suppress the interpolation and write the text
         imperatively in the `editable` watcher; this prevents Vue from
         replacing the text node on each keystroke (which would kill
         the cursor). -->
    <h1
      v-if="blockProps.level === 1"
      ref="editEl"
      :class="['heading-text', { 'heading-text--editable': editable }]"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      spellcheck="true"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    ><template v-if="!editable">{{ blockProps.text }}</template></h1>
    <h2
      v-else-if="blockProps.level === 2"
      ref="editEl"
      :class="['heading-text', { 'heading-text--editable': editable }]"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      spellcheck="true"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    ><template v-if="!editable">{{ blockProps.text }}</template></h2>
    <h3
      v-else
      ref="editEl"
      :class="['heading-text', { 'heading-text--editable': editable }]"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      spellcheck="true"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKeydown"
    ><template v-if="!editable">{{ blockProps.text }}</template></h3>
  </div>

  <!-- INSPECT -->
  <div v-else class="heading-inspect">
    <div class="ins-row">
      <span class="ins-label">
        <span>Text</span>
        <MergeTagPicker compact @insert="insertTag" />
      </span>
      <input
        ref="textInput"
        type="text"
        class="ins-input"
        :value="blockProps.text"
        @input="patch('text', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="ins-row">
      <span class="ins-label">Level</span>
      <div class="ins-segmented" role="group">
        <button
          v-for="l in [1, 2, 3]"
          :key="l"
          type="button"
          :class="['ins-seg', { active: blockProps.level === l }]"
          @click="patch('level', l)"
        >
          H{{ l }}
        </button>
      </div>
    </div>

    <div class="ins-row">
      <span class="ins-label">Align</span>
      <div class="ins-segmented" role="group">
        <button
          v-for="a in ['left', 'center', 'right'] as const"
          :key="a"
          type="button"
          :class="['ins-seg', { active: blockProps.align === a }]"
          @click="patch('align', a)"
        >
          {{ a }}
        </button>
      </div>
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
.heading-render {
  color: var(--heading-color);
  text-align: var(--heading-align);
}
.heading-text {
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  margin: 0;
  line-height: var(--leading-tight);
  outline: none;
}
.heading-render h1.heading-text { font-size: var(--text-3xl); }
.heading-render h2.heading-text { font-size: var(--text-2xl); }
.heading-render h3.heading-text { font-size: var(--text-xl); }

.heading-text--editable {
  cursor: text;
}
/* No special background — the .block-wrap--selected coral outline owns
   the selected visual; the contenteditable layer should feel like the
   text just woke up, not like a separate input box. */

/* Inspector styles intentionally generic — could be promoted to the
   inspector shell later. For now they live with the block so each block
   file is self-contained. */
.heading-inspect { display: grid; gap: var(--space-4); }
</style>
