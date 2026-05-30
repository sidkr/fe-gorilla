<script setup lang="ts">
// Mount-once host that renders the global toast stack. Drop a single
// <ToastHost/> into a layout; everywhere else just call useToast().push(...).
// Teleports to <body> so it floats above app chrome at --z-toast, anchored
// bottom-right. Tone drives the left accent border. Each toast carries a
// dismiss affordance and a slide+fade transition on the spring easing.
import { useToast } from "~/composables/shared/useToast";

const { toasts, dismiss } = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite" aria-atomic="false">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="`tone-${t.tone}`"
          role="status"
        >
          <span class="toast-msg">{{ t.message }}</span>
          <button
            type="button"
            class="toast-dismiss"
            aria-label="Dismiss"
            @click="dismiss(t.id)"
          >
            <Icon name="x" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  bottom: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 240px;
  max-width: 360px;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-left: 3px solid var(--color-rule-strong);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--space-3) var(--space-4);
  font-size: var(--text-sm);
  font-family: var(--font-body);
  color: var(--color-ink);
}

.tone-success { border-left-color: var(--color-ok); }
.tone-warn { border-left-color: var(--color-warn); }
.tone-danger { border-left-color: var(--color-danger); }

.toast-msg {
  flex: 1;
}

.toast-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  background: none;
  color: var(--color-ink-dim);
  cursor: pointer;
  line-height: 0;
  transition: color var(--dur-base) var(--ease-out);
}

.toast-dismiss:hover {
  color: var(--color-ink);
}

/* Slide + fade on the spring easing */
.toast-enter-active {
  transition:
    transform var(--dur-base) var(--ease-spring),
    opacity var(--dur-base) var(--ease-out);
}
.toast-leave-active {
  transition:
    transform var(--dur-base) var(--ease-out),
    opacity var(--dur-base) var(--ease-out);
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(16px);
}
</style>
