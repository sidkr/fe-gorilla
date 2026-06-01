<script setup lang="ts">
// BlockLibrary — left rail. Tiles are draggable (HTML5 native; on dragstart we
// set `application/x-gorilla-block` to the block type, which EditorCanvas reads
// on drop) AND clickable: a click/Enter emits `add` so a block can be inserted
// without dragging. The Shell decides where (after the selection / before the
// footer).
import { blockTypesInOrder, registry, type BlockType } from "./blocks/registry";

const emit = defineEmits<{ (e: "add", type: BlockType): void }>();

function onDragStart(e: DragEvent, type: string) {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData("application/x-gorilla-block", type);
  e.dataTransfer.effectAllowed = "copy";
}
</script>

<template>
  <aside class="lib">
    <div class="lib-head">
      <h2 class="lib-title">Blocks</h2>
      <p class="lib-hint">Drag onto the canvas, or click to add</p>
    </div>
    <ul class="lib-grid">
      <li
        v-for="type in blockTypesInOrder"
        :key="type"
        class="lib-tile"
        draggable="true"
        role="button"
        tabindex="0"
        :aria-label="`Add ${registry[type].label} block`"
        :title="`Add ${registry[type].label}`"
        @dragstart="onDragStart($event, type)"
        @click="emit('add', type)"
        @keydown.enter.prevent="emit('add', type)"
        @keydown.space.prevent="emit('add', type)"
      >
        <span class="lib-tile-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path :d="registry[type].iconPath" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="lib-tile-text">
          <span class="lib-tile-label">{{ registry[type].label }}</span>
          <span class="lib-tile-desc">{{ registry[type].description }}</span>
        </span>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.lib {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-5);
  border-right: 1px solid var(--color-rule);
  background: var(--color-surface);
  height: 100%;
  overflow-y: auto;
}
.lib-head { margin-bottom: var(--space-2); }
.lib-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--color-ink-dim);
}
.lib-hint {
  margin: var(--space-1) 0 0;
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}

.lib-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
  list-style: none;
  padding: 0;
  margin: 0;
}

.lib-tile {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: grab;
  user-select: none;
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    transform var(--dur-fast) var(--ease-out);
}
.lib-tile:hover {
  border-color: var(--color-rule-strong);
  box-shadow: var(--shadow-xs);
}
.lib-tile:active {
  cursor: grabbing;
  transform: scale(0.99);
}

.lib-tile-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
  flex-shrink: 0;
}
.lib-tile-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.lib-tile-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.lib-tile-desc {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}
</style>
