<script setup>
// Shared centered modal dialog. Teleports to <body>, dims the page behind a
// scrim, and traps focus-of-attention via Escape + overlay-click + a close
// button. Visibility is a two-way `open` model (defineModel); callers may also
// listen for the "close" emit. Locks body scroll while open. App- and
// marketing-agnostic — no imports from components/app or stores.
const open = defineModel("open", { type: Boolean, default: false });

defineProps({
  title: { type: String, default: "" },
  // Max width of the dialog. Number → px; string passed through (e.g. "60ch").
  width: { type: [Number, String], default: 480 },
});

const emit = defineEmits(["close"]);

function close() {
  open.value = false;
  emit("close");
}

function onKeydown(e) {
  if (e.key === "Escape") close();
}

// Body-scroll lock + window Escape listener, wired only while the modal is open.
watch(
  open,
  (isOpen) => {
    if (typeof window === "undefined") return;
    if (isOpen) {
      window.addEventListener("keydown", onKeydown);
      document.body.style.overflow = "hidden";
    } else {
      window.removeEventListener("keydown", onKeydown);
      document.body.style.overflow = "";
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (typeof window === "undefined") return;
  window.removeEventListener("keydown", onKeydown);
  document.body.style.overflow = "";
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="overlay" @click.self="close">
        <div
          class="dialog"
          role="dialog"
          aria-modal="true"
          :style="{ maxWidth: typeof width === 'number' ? width + 'px' : width }"
        >
          <header class="dialog-head">
            <slot name="header">
              <h2 v-if="title" class="dialog-title">{{ title }}</h2>
            </slot>
            <button
              type="button"
              class="dialog-close"
              aria-label="Close"
              @click="close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M4 4 L12 12 M12 4 L4 12"
                  stroke="currentColor"
                  stroke-width="1.75"
                  stroke-linecap="round"
                />
              </svg>
            </button>
          </header>

          <div class="dialog-body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="dialog-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(24, 24, 27, 0.45);
}

.dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - var(--space-7));
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.dialog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-5) var(--space-3);
}

.dialog-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-ink);
}

.dialog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 28px;
  height: 28px;
  margin: calc(var(--space-1) * -1) calc(var(--space-1) * -1) 0 0;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.dialog-close:hover {
  background: var(--color-surface-sunk);
  color: var(--color-ink);
}

.dialog-body {
  padding: 0 var(--space-5) var(--space-5);
  overflow-y: auto;
  color: var(--color-ink);
  font-size: var(--text-base);
}

.dialog-foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--color-rule);
}

/* Scale/fade entrance with a spring on the dialog itself. */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--dur-base) var(--ease-out);
}

.modal-enter-active .dialog,
.modal-leave-active .dialog {
  transition: transform var(--dur-base) var(--ease-spring),
    opacity var(--dur-base) var(--ease-out);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .dialog,
.modal-leave-to .dialog {
  opacity: 0;
  transform: scale(0.96) translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .dialog,
  .modal-leave-active .dialog {
    transition-duration: 1ms;
  }
  .modal-enter-from .dialog,
  .modal-leave-to .dialog {
    transform: none;
  }
}
</style>
