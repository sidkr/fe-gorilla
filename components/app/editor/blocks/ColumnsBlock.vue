<script setup lang="ts">
// ColumnsBlock — a structured multi-column layout (2–3 columns). Each column has
// a fixed, inspector-edited set: image + heading + text + button. (Arbitrary
// block nesting per column is a larger follow-up.) Render = the side-by-side
// columns; Inspect = per-column fields with add/remove. The server compiles this
// to its own <mj-section> with one <mj-column> per column (see campaigns.js).
import { computed, ref } from "vue";

export interface ColumnContent {
  image: string; alt: string; heading: string; text: string;
  buttonLabel: string; buttonHref: string;
}
interface Props {
  mode: "render" | "inspect";
  blockProps: { columns: ColumnContent[] };
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: "update", patch: Partial<Props["blockProps"]>): void }>();

const MAX_COLS = 3;
const MIN_COLS = 1;
const columns = computed<ColumnContent[]>(() => props.blockProps.columns || []);

function emptyColumn(): ColumnContent {
  return { image: "", alt: "", heading: "New column", text: "Describe this column.", buttonLabel: "", buttonHref: "" };
}
function patchCols(next: ColumnContent[]) { emit("update", { columns: next }); }
function setField(ci: number, key: keyof ColumnContent, v: string) {
  patchCols(columns.value.map((c, i) => (i === ci ? { ...c, [key]: v } : c)));
}
function addColumn() {
  if (columns.value.length >= MAX_COLS) return;
  patchCols([...columns.value, emptyColumn()]);
}
function removeColumn(ci: number) {
  if (columns.value.length <= MIN_COLS) return;
  patchCols(columns.value.filter((_, i) => i !== ci));
  if (activeTab.value >= columns.value.length - 1) activeTab.value = Math.max(0, columns.value.length - 2);
}

// Inspector: edit one column at a time via tabs.
const activeTab = ref(0);
</script>

<template>
  <!-- RENDER -->
  <div v-if="mode === 'render'" class="col-render">
    <div v-for="(c, i) in columns" :key="i" class="col-cell">
      <img v-if="c.image" class="col-img" :src="c.image" :alt="c.alt" />
      <div v-else class="col-img col-img--empty" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24"><path d="M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
      </div>
      <h3 v-if="c.heading" class="col-heading">{{ c.heading }}</h3>
      <p v-if="c.text" class="col-text">{{ c.text }}</p>
      <span v-if="c.buttonLabel" class="col-btn">{{ c.buttonLabel }}</span>
    </div>
  </div>

  <!-- INSPECT -->
  <div v-else class="col-inspect">
    <div class="col-tabs" role="tablist">
      <button
        v-for="(c, i) in columns"
        :key="i"
        type="button"
        class="col-tab"
        :class="{ 'is-active': activeTab === i }"
        role="tab"
        :aria-selected="activeTab === i"
        @click="activeTab = i"
      >Col {{ i + 1 }}</button>
      <button
        v-if="columns.length < MAX_COLS"
        type="button"
        class="col-tab col-tab--add"
        aria-label="Add column"
        @click="addColumn(); activeTab = columns.length - 1"
      >+</button>
    </div>

    <template v-for="(c, i) in columns" :key="i">
      <div v-show="activeTab === i" class="col-fields">
        <label class="ins-row"><span class="ins-label">Image URL</span>
          <input type="url" class="ins-input" placeholder="https://…" :value="c.image" @input="setField(i, 'image', ($event.target as HTMLInputElement).value)" /></label>
        <label class="ins-row"><span class="ins-label">Heading</span>
          <input type="text" class="ins-input" :value="c.heading" @input="setField(i, 'heading', ($event.target as HTMLInputElement).value)" /></label>
        <label class="ins-row"><span class="ins-label">Text</span>
          <textarea class="ins-input" rows="3" :value="c.text" @input="setField(i, 'text', ($event.target as HTMLTextAreaElement).value)"></textarea></label>
        <label class="ins-row"><span class="ins-label">Button label</span>
          <input type="text" class="ins-input" placeholder="Optional" :value="c.buttonLabel" @input="setField(i, 'buttonLabel', ($event.target as HTMLInputElement).value)" /></label>
        <label class="ins-row"><span class="ins-label">Button link</span>
          <input type="url" class="ins-input" placeholder="https://…" :value="c.buttonHref" @input="setField(i, 'buttonHref', ($event.target as HTMLInputElement).value)" /></label>
        <button v-if="columns.length > MIN_COLS" type="button" class="col-remove" @click="removeColumn(i)">Remove column {{ i + 1 }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* RENDER — real side-by-side columns. Stacks on narrow widths so the mobile
   preview reads correctly (matches MJML's responsive column behavior). */
.col-render { display: flex; gap: var(--space-4); align-items: flex-start; }
.col-cell { flex: 1; min-width: 0; }
.col-img { display: block; width: 100%; height: auto; border-radius: var(--radius-sm); }
.col-img--empty {
  display: flex; align-items: center; justify-content: center; aspect-ratio: 16/10;
  background: var(--color-surface-sunk); border: 1.5px dashed var(--color-rule-strong); color: var(--color-ink-dim);
}
.col-heading { margin: var(--space-3) 0 var(--space-1); font-family: var(--font-display); font-weight: 700; font-size: var(--text-md); color: var(--color-ink); }
.col-text { margin: 0 0 var(--space-2); font-family: var(--font-body); font-size: var(--text-sm); line-height: var(--leading-normal); color: var(--color-ink-soft); }
.col-btn { display: inline-block; padding: 6px var(--space-3); border-radius: var(--radius-md); background: var(--color-pop); color: var(--color-ink-on-pop); font-weight: 600; font-size: var(--text-xs); }
@media (max-width: 480px) { .col-render { flex-direction: column; } }

/* INSPECT */
.col-inspect { display: grid; gap: var(--space-4); }
.col-tabs { display: flex; gap: var(--space-1); flex-wrap: wrap; }
.col-tab {
  border: 1px solid var(--color-rule); background: var(--color-surface); color: var(--color-ink-soft);
  border-radius: var(--radius-sm); padding: var(--space-1-5) var(--space-3); font-size: var(--text-xs); font-weight: 600; cursor: pointer;
}
.col-tab.is-active { background: var(--color-pop); color: var(--color-ink-on-pop); border-color: var(--color-pop); }
.col-tab--add { color: var(--color-ink-dim); }
.col-fields { display: grid; gap: var(--space-3); }
.col-remove {
  justify-self: start; border: none; background: none; color: var(--color-danger); font-size: var(--text-sm); font-weight: 600; cursor: pointer; padding: var(--space-1) 0;
}
.col-remove:hover { text-decoration: underline; }
</style>
