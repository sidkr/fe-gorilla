<script setup lang="ts">
// BlockHoverToolbar — a small floating vertical column of action buttons
// positioned at the right edge of each block. Per Editor-phase1.md §4:
//   - visible on hover; persistent when block is selected
//   - move-up / move-down / duplicate / delete
//   - Footer blocks show only move buttons (and trigger a CAN-SPAM toast
//     instead of deletion / duplication)
//
// The toolbar is dumb: it just emits intent. EditorShell does the
// undo-push + body mutation.
interface Props {
  isFooter: boolean;
  isFirst: boolean;
  isLast: boolean;
  // True iff the parent .block-wrap is selected — we surface the toolbar
  // permanently in that case (otherwise it shows on hover via CSS).
  selected: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
  (e: "move-up"): void;
  (e: "move-down"): void;
  (e: "duplicate"): void;
  (e: "delete"): void;
  (e: "footer-delete-blocked"): void;
  (e: "footer-duplicate-blocked"): void;
}>();

function onDuplicate(isFooter: boolean) {
  if (isFooter) {
    emit("footer-duplicate-blocked");
    return;
  }
  emit("duplicate");
}
function onDelete(isFooter: boolean) {
  if (isFooter) {
    emit("footer-delete-blocked");
    return;
  }
  emit("delete");
}
</script>

<template>
  <!-- @mousedown.prevent keeps focus on an inline-editable block's
       contenteditable while a toolbar button is pressed. Without it, pressing
       a button blurs the editor mid-click → a re-render swallows the click and
       delete/duplicate/move silently no-op on heading/paragraph blocks. -->
  <div :class="['bht', { 'bht--selected': selected }]" @click.stop @mousedown.prevent>
    <button
      type="button"
      class="bht-btn"
      :disabled="isFirst"
      aria-label="Move block up"
      title="Move up"
      @click="emit('move-up')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M12 5v14M6 11l6-6 6 6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      type="button"
      class="bht-btn"
      :disabled="isLast"
      aria-label="Move block down"
      title="Move down"
      @click="emit('move-down')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M12 5v14M6 13l6 6 6-6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <button
      v-if="!isFooter"
      type="button"
      class="bht-btn"
      aria-label="Duplicate block"
      title="Duplicate"
      @click="onDuplicate(isFooter)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path
          d="M5 16V6a1 1 0 0 1 1-1h10"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
    </button>
    <button
      v-if="!isFooter"
      type="button"
      class="bht-btn bht-btn--danger"
      aria-label="Delete block"
      title="Delete"
      @click="onDelete(isFooter)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path
          d="M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
    <!-- Footer-blocked delete is still clickable so the user gets the
         informative toast — but the button is styled muted to telegraph
         that it's not a normal delete. -->
    <button
      v-if="isFooter"
      type="button"
      class="bht-btn bht-btn--locked"
      aria-label="Footer cannot be removed"
      title="Required by CAN-SPAM"
      @click="onDelete(true)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <rect x="6" y="10" width="12" height="9" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M9 10V7a3 3 0 0 1 6 0v3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.bht {
  position: absolute;
  top: 50%;
  right: calc(var(--space-5) * -1);
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-1);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
/* The parent .block-wrap (defined in EditorCanvas) drives hover-visibility
   via the surrounding rules; here we surface the toolbar permanently
   when the block is selected (selected outline = coral by spec). */
.bht--selected {
  opacity: 1;
  pointer-events: auto;
  border-color: var(--color-pop);
}

.bht-btn {
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
.bht-btn:hover,
.bht-btn:focus-visible {
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  outline: none;
}
.bht-btn:active {
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
}
.bht-btn[disabled] {
  color: var(--color-ink-dim);
  opacity: 0.4;
  cursor: not-allowed;
  background: transparent;
}
.bht-btn--danger:hover { color: var(--color-danger); background: var(--color-danger-bg); }
.bht-btn--locked { color: var(--color-ink-dim); cursor: help; }
.bht-btn--locked:hover {
  background: var(--color-surface-sunk);
  color: var(--color-ink-soft);
}
</style>
