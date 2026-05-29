<script setup lang="ts">
// DragHandle — the small 6-dot glyph on the left edge of every block.
// Visible on hover or selection; canonical drag-to-move affordance.
// The actual DnD wiring (dragstart / dragend with the
// `application/x-gorilla-move` payload) lives in EditorCanvas — this
// component is just the visual + the cursor.
interface Props {
  ariaLabel?: string;
}
withDefaults(defineProps<Props>(), { ariaLabel: "Reorder block" });
</script>

<template>
  <span class="dh" :aria-label="ariaLabel" role="img">
    <svg viewBox="0 0 12 16" width="10" height="14" aria-hidden="true">
      <circle cx="4" cy="3" r="1.2" fill="currentColor" />
      <circle cx="8" cy="3" r="1.2" fill="currentColor" />
      <circle cx="4" cy="8" r="1.2" fill="currentColor" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" />
      <circle cx="4" cy="13" r="1.2" fill="currentColor" />
      <circle cx="8" cy="13" r="1.2" fill="currentColor" />
    </svg>
  </span>
</template>

<style scoped>
.dh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 18px;
  color: var(--color-ink-dim);
  pointer-events: none;
}
</style>
