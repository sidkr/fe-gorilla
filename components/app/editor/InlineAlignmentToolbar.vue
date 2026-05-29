<script setup lang="ts">
// InlineAlignmentToolbar — floats above the selected Heading or
// Paragraph block. Three icon buttons: align-left, align-center,
// align-right. Active alignment highlighted; clicking emits an
// `update` event with the new alignment value.
//
// The toolbar is positioned by its parent (.block-wrap in EditorCanvas)
// using absolute positioning relative to the block.
type Align = "left" | "center" | "right";

interface Props {
  value: Align;
}
defineProps<Props>();

const emit = defineEmits<{
  (e: "update", value: Align): void;
}>();

function set(v: Align) {
  emit("update", v);
}
</script>

<template>
  <div class="iat" role="toolbar" aria-label="Alignment" @click.stop>
    <button
      type="button"
      :class="['iat-btn', { 'iat-btn--active': value === 'left' }]"
      aria-label="Align left"
      title="Align left"
      @mousedown.prevent
      @click="set('left')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M4 6h16M4 12h10M4 18h13"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      type="button"
      :class="['iat-btn', { 'iat-btn--active': value === 'center' }]"
      aria-label="Align center"
      title="Align center"
      @mousedown.prevent
      @click="set('center')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M4 6h16M7 12h10M5 18h14"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      type="button"
      :class="['iat-btn', { 'iat-btn--active': value === 'right' }]"
      aria-label="Align right"
      title="Align right"
      @mousedown.prevent
      @click="set('right')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M4 6h16M10 12h10M7 18h13"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.iat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.iat-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-ink-soft);
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.iat-btn:hover,
.iat-btn:focus-visible {
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  outline: none;
}
.iat-btn--active {
  background: var(--color-ink);
  color: var(--color-ink-on-pop);
}
.iat-btn--active:hover,
.iat-btn--active:focus-visible {
  background: var(--color-ink);
  color: var(--color-ink-on-pop);
}
</style>
