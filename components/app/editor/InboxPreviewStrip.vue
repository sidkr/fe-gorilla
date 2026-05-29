<script setup lang="ts">
// InboxPreviewStrip — a faux Gmail-row at the very top of the email card
// that previews what recipients see in their inbox. Three lines:
//   1. sender (avatar + fromName + timestamp)
//   2. subject (placeholder if empty)
//   3. preheader (placeholder if empty)
//
// Bound reactively to SetupValues so edits in the Setup popover update
// the preview live.
import { computed } from "vue";
import type { SetupValues } from "./editor-types";

interface Props {
  values: SetupValues;
}
const props = defineProps<Props>();

// Initials from `fromName` — first letters of up to two words. Empty
// becomes a placeholder dash so the avatar never collapses.
const initials = computed(() => {
  const v = (props.values.fromName || "").trim();
  if (!v) return "?";
  const parts = v.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
});

const senderLabel = computed(() => (props.values.fromName || "").trim() || "Sender name");
const senderIsPlaceholder = computed(() => !(props.values.fromName || "").trim());

const subjectText = computed(() => props.values.subject || "");
const subjectIsPlaceholder = computed(() => !subjectText.value);

const preheaderText = computed(() => props.values.preheader || "");
const preheaderIsPlaceholder = computed(() => !preheaderText.value);
</script>

<template>
  <div class="ips" role="presentation" aria-label="Inbox preview">
    <div class="ips-row ips-row--sender">
      <span class="ips-avatar" aria-hidden="true">{{ initials }}</span>
      <span :class="['ips-sender', { 'ips-sender--placeholder': senderIsPlaceholder }]">
        {{ senderLabel }}
      </span>
      <span class="ips-time">now</span>
    </div>
    <div :class="['ips-row', 'ips-subject', { 'ips-subject--placeholder': subjectIsPlaceholder }]">
      {{ subjectIsPlaceholder ? "Your subject line goes here" : subjectText }}
    </div>
    <div :class="['ips-row', 'ips-preheader', { 'ips-preheader--placeholder': preheaderIsPlaceholder }]">
      {{ preheaderIsPlaceholder ? "Add a preheader to summarize the email…" : preheaderText }}
    </div>
  </div>
</template>

<style scoped>
.ips {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: 0 0 var(--space-4);
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--color-rule);
  font-family: var(--font-body);
}

.ips-row {
  line-height: 32px;
}

.ips-row--sender {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.ips-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-pill);
  background: var(--color-pop);
  color: var(--color-ink-on-pop);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-xs);
  flex-shrink: 0;
  line-height: 1;
}
.ips-sender {
  font-weight: 600;
  color: var(--color-ink);
  font-size: var(--text-sm);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.ips-sender--placeholder {
  color: var(--color-ink-dim);
  font-weight: 500;
}
.ips-time {
  margin-left: auto;
  color: var(--color-ink-dim);
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  flex-shrink: 0;
}

.ips-subject {
  font-weight: 700;
  color: var(--color-ink);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ips-subject--placeholder {
  color: var(--color-ink-dim);
  font-weight: 500;
}

.ips-preheader {
  color: var(--color-ink-soft);
  font-size: var(--text-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ips-preheader--placeholder {
  color: var(--color-ink-soft);
  font-style: italic;
}
</style>
