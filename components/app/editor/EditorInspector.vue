<script setup lang="ts">
// EditorInspector — right rail. Resolves the currently-selected block via
// the registry and renders its Inspect component. Inspect components emit
// `update` with a prop patch; we forward upward to the Shell which
// performs the actual body mutation (immutable replace by id).
import { computed } from "vue";
import { type Body, registry } from "./blocks/registry";

interface Props {
  body: Body;
  selectedBlockId: string | null;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (
    e: "update:props",
    payload: { blockId: string; patch: Record<string, unknown> },
  ): void;
}>();

const selectedBlock = computed(() =>
  props.body.blocks.find((b) => b.id === props.selectedBlockId) ?? null,
);

const def = computed(() =>
  selectedBlock.value ? registry[selectedBlock.value.type] : null,
);

function onChildUpdate(patch: Record<string, unknown>) {
  if (!selectedBlock.value) return;
  emit("update:props", { blockId: selectedBlock.value.id, patch });
}
</script>

<template>
  <aside class="ins">
    <div v-if="selectedBlock && def" class="ins-body">
      <div class="ins-head">
        <span class="ins-eyebrow">Block</span>
        <h2 class="ins-title">{{ def.label }}</h2>
      </div>
      <div class="ins-controls">
        <component
          :is="def.Inspect"
          :mode="'inspect'"
          :block-props="selectedBlock.props"
          @update="onChildUpdate"
        />
      </div>
    </div>

    <div v-else class="ins-empty">
      <div class="ins-empty-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22">
          <path
            d="M4 6h14M4 12h14M4 18h10M20 6l1 1-1 1M20 12l1 1-1 1M20 18l1 1-1 1"
            fill="none"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
      <p class="ins-empty-title">Nothing selected</p>
      <p class="ins-empty-text">
        Click a block in the canvas to edit its properties here.
      </p>
    </div>
  </aside>
</template>

<style>
/* Unscoped so block-level Inspect components can use these utility
   classes (ins-row / ins-input / ins-segmented / ins-color / ins-range).
   The block files already use these class names; rather than re-declare
   them in every block file, we centralise them here. */
.ins-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.ins-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.ins-units {
  font-style: normal;
  font-weight: 500;
  text-transform: none;
  letter-spacing: var(--tracking-normal);
  color: var(--color-ink-dim);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
}
.ins-input,
.ins-textarea {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
  outline: none;
  transition: border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.ins-input:focus,
.ins-textarea:focus {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}
.ins-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: var(--font-body);
}
.ins-input-mono {
  font-family: var(--font-mono);
  text-transform: uppercase;
}

.ins-segmented {
  display: flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface);
}
.ins-seg {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-rule);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: capitalize;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.ins-seg:last-child {
  border-right: 0;
}
.ins-seg:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.ins-seg.active {
  background: var(--color-ink);
  color: var(--color-surface);
}

.ins-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ins-color-swatch {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.ins-color-swatch::-webkit-color-swatch-wrapper { padding: 2px; }
.ins-color-swatch::-webkit-color-swatch { border: 0; border-radius: var(--radius-xs); }

.ins-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--color-surface-sunk);
  outline: none;
  cursor: pointer;
}
.ins-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-ink);
  cursor: grab;
  border: 2px solid var(--color-surface);
  box-shadow: var(--shadow-xs);
}
.ins-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-ink);
  cursor: grab;
  border: 2px solid var(--color-surface);
}
</style>

<style scoped>
.ins {
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-rule);
  background: var(--color-surface);
  height: 100%;
  overflow-y: auto;
}
.ins-body { padding: var(--space-5); }

.ins-head { margin-bottom: var(--space-5); }
.ins-eyebrow {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--color-ink-dim);
}
.ins-title {
  margin: var(--space-1) 0 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
}

.ins-controls { display: grid; gap: var(--space-5); }

.ins-empty {
  padding: var(--space-7) var(--space-5);
  text-align: center;
  color: var(--color-ink-dim);
}
.ins-empty-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-bottom: var(--space-3);
  border-radius: var(--radius-md);
  background: var(--color-surface-sunk);
  color: var(--color-ink-dim);
}
.ins-empty-title {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.ins-empty-text {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  max-width: 28ch;
  margin-left: auto;
  margin-right: auto;
}
</style>
