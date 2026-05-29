<script setup lang="ts">
// Test-send popover. Wired to the real sendTestEmail cloud function via
// useSending. Renders inline; the Shell anchors it under the Test send
// button via fixed positioning at a coordinate it passes in.
//
// Before sending, we ask the Shell to flush a save (saveFn) so the
// campaign — and its compiledHtml — is up to date on the server. The
// cloud function compiles/sends from the persisted campaign.
import { onMounted, onUnmounted, ref } from "vue";
import { useSending } from "~/composables/app/useSending";

interface Props {
  open: boolean;
  defaultEmail: string;
  campaignId: string;
  // Flushes a save in the Shell so compiledHtml is fresh before the test.
  saveFn: () => Promise<void>;
  // top/right in viewport pixels — Shell computes from button getBoundingClientRect
  anchorTop: number;
  anchorRight: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "close"): void }>();

const { sendTestEmail } = useSending();

const email = ref(props.defaultEmail);
const stage = ref<"idle" | "sending" | "sent" | "error">("idle");
const sentTo = ref<string>("");
const messageId = ref<string>("");
const errorMsg = ref<string>("");

async function onSend() {
  if (!email.value || stage.value === "sending") return;
  stage.value = "sending";
  errorMsg.value = "";
  try {
    // Make sure the latest edits (and the compiled HTML) are persisted
    // before the server compiles + sends the test.
    await props.saveFn();
    const res = await sendTestEmail(props.campaignId, [email.value.trim()]);
    sentTo.value = (res.sentTo && res.sentTo.join(", ")) || email.value.trim();
    messageId.value = res.messageId || "";
    stage.value = "sent";
  } catch (err: unknown) {
    errorMsg.value =
      (err as { message?: string })?.message || "Couldn't send the test. Try again.";
    stage.value = "error";
  }
}

function reset() {
  stage.value = "idle";
  email.value = props.defaultEmail;
  errorMsg.value = "";
  sentTo.value = "";
  messageId.value = "";
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
      <div v-if="stage === 'idle' || stage === 'sending' || stage === 'error'">
        <h3 class="tsp-title">Send a test email</h3>
        <p class="tsp-help">Receive this draft in your inbox to check it looks right.</p>
        <label class="tsp-row">
          <span class="tsp-label">Recipient</span>
          <TextInput
            v-model="email"
            type="email"
            placeholder="you@example.com"
            :disabled="stage === 'sending'"
          />
        </label>
        <p v-if="stage === 'error'" class="tsp-error" role="alert">{{ errorMsg }}</p>
        <div class="tsp-actions">
          <Button
            variant="ghost"
            :disabled="stage === 'sending'"
            @click="emit('close'); reset()"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            :disabled="!email || stage === 'sending'"
            :loading="stage === 'sending'"
            @click="onSend"
          >
            {{ stage === "error" ? "Try again" : "Send test" }}
          </Button>
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
        <h3 class="tsp-title">Test sent to {{ sentTo }}</h3>
        <p class="tsp-help">Check your inbox in a few seconds.</p>
        <p v-if="messageId" class="tsp-msgid">Message ID: {{ messageId }}</p>
        <div class="tsp-actions">
          <Button variant="ghost" @click="emit('close'); reset()">Done</Button>
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
.tsp-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
.tsp-error {
  margin: var(--space-3) 0 0;
  font-size: var(--text-xs);
  color: var(--color-danger);
  line-height: var(--leading-snug);
}
.tsp-msgid {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  word-break: break-all;
}

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
