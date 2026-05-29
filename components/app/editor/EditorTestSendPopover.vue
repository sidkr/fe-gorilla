<script setup lang="ts">
// Test-send popover. Stub for MVP — does not call any cloud function.
// Renders inline; the Shell anchors it under the Test send button via
// fixed positioning at a coordinate it passes in.
import { onMounted, onUnmounted, ref } from "vue";

interface Props {
  open: boolean;
  defaultEmail: string;
  // top/right in viewport pixels — Shell computes from button getBoundingClientRect
  anchorTop: number;
  anchorRight: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "close"): void }>();

const email = ref(props.defaultEmail);
const stage = ref<"idle" | "sent">("idle");

function onSend() {
  // Stub: real test-send is a cloud function landing with the send
  // pipeline. We just optimistically show success after a beat so the
  // UI flow is honest about being clickable.
  setTimeout(() => {
    stage.value = "sent";
  }, 200);
}

function reset() {
  stage.value = "idle";
  email.value = props.defaultEmail;
}

function onClickOutside(e: MouseEvent) {
  if (!props.open) return;
  const target = e.target as HTMLElement;
  if (!target.closest(".tsp-popover") && !target.closest('[data-test-send-anchor="true"]')) {
    emit("close");
    reset();
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="tsp-popover"
      :style="{ top: `${anchorTop}px`, right: `${anchorRight}px` }"
      role="dialog"
      aria-label="Test send"
    >
      <div v-if="stage === 'idle'">
        <h3 class="tsp-title">Send a test email</h3>
        <p class="tsp-help">Receive this draft in your inbox to check it looks right.</p>
        <label class="tsp-row">
          <span class="tsp-label">Recipient</span>
          <input
            type="email"
            class="tsp-input"
            v-model="email"
            placeholder="you@example.com"
          />
        </label>
        <div class="tsp-actions">
          <button type="button" class="tsp-btn tsp-btn--ghost" @click="emit('close'); reset()">
            Cancel
          </button>
          <button
            type="button"
            class="tsp-btn tsp-btn--pop"
            :disabled="!email"
            @click="onSend"
          >
            Send test
          </button>
        </div>
      </div>

      <div v-else class="tsp-sent">
        <span class="tsp-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M5 12l5 5 9-11"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <h3 class="tsp-title">Test sent to {{ email }}</h3>
        <p class="tsp-help">Check your inbox in a few seconds.</p>
        <div class="tsp-actions">
          <button type="button" class="tsp-btn tsp-btn--ghost" @click="emit('close'); reset()">
            Done
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tsp-popover {
  position: fixed;
  width: 320px;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--space-4);
  z-index: 1000;
}
.tsp-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-md);
  font-weight: 700;
  color: var(--color-ink);
}
.tsp-help {
  margin: var(--space-2) 0 var(--space-4);
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
  line-height: var(--leading-snug);
}
.tsp-row {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.tsp-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--color-ink-soft);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}
.tsp-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  outline: none;
}
.tsp-input:focus {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}
.tsp-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.tsp-btn {
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
}
.tsp-btn--ghost {
  background: var(--color-surface);
  color: var(--color-ink);
  border-color: var(--color-rule);
}
.tsp-btn--ghost:hover { background: var(--color-surface-2); }
.tsp-btn--pop {
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  border-color: var(--color-pop);
}
.tsp-btn--pop:hover {
  background: var(--color-pop-deep);
  border-color: var(--color-pop-deep);
}
.tsp-btn--pop[disabled] { opacity: 0.5; cursor: not-allowed; }

.tsp-sent { text-align: center; }
.tsp-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  margin-bottom: var(--space-3);
}
</style>
