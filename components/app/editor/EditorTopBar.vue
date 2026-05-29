<script setup lang="ts">
// EditorTopBar — the campaign-wide chrome bar. Per Editor-phase1.md:
//   - the campaign name field moves into the Setup popover (the popover
//     header owns the editable name + counters)
//   - new "Setup" button opens that popover
//   - new Desktop/Mobile segmented toggle drives the canvas preview width
//   - Send button now opens the Pre-flight checklist (Shell handles)
// Coral lives ONLY on the Send CTA + the saved-state check dot
// (Editor.md §14, Editor-phase1.md "Visual design").
import { computed } from "vue";

interface Props {
  name: string;
  saving: boolean;
  dirty: boolean;
  lastSavedAt: Date | null;
  now: number; // a tick from the Shell so the "Saved 12s ago" updates
  previewWidth: "desktop" | "mobile";
  canUndo: boolean;
  canRedo: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "save"): void;
  (e: "back"): void;
  (e: "open-test-send", anchor: HTMLElement): void;
  (e: "open-preview"): void;
  (e: "open-send"): void;
  (e: "open-setup", anchor: HTMLElement): void;
  (e: "update:previewWidth", v: "desktop" | "mobile"): void;
  (e: "undo"): void;
  (e: "redo"): void;
}>();

const statusText = computed(() => {
  if (props.saving) return "Saving…";
  if (props.dirty) return "Unsaved changes";
  if (!props.lastSavedAt) return "Not saved yet";
  const elapsedMs = props.now - props.lastSavedAt.getTime();
  return `Saved ${humanizeElapsed(elapsedMs)}`;
});

const statusKind = computed<"saving" | "dirty" | "saved" | "none">(() => {
  if (props.saving) return "saving";
  if (props.dirty) return "dirty";
  if (props.lastSavedAt) return "saved";
  return "none";
});

const displayName = computed(() => props.name || "Untitled campaign");

const previewWidthOptions = [
  { label: "Desktop", value: "desktop" },
  { label: "Mobile", value: "mobile" },
];

function humanizeElapsed(ms: number): string {
  if (ms < 5000) return "just now";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

function onTestSendClick(e: MouseEvent) {
  emit("open-test-send", e.currentTarget as HTMLElement);
}
function onSetupClick(e: MouseEvent) {
  // The Shell positions the setup popover relative to the button's
  // bounding rect. Marking the button with a data attribute lets the
  // popover's click-outside handler tell "user clicked the anchor again"
  // (close-on-click) apart from "user clicked elsewhere" (close).
  const el = e.currentTarget as HTMLElement;
  el.setAttribute("data-setup-anchor", "true");
  emit("open-setup", el);
}
</script>

<template>
  <header class="topbar">
    <div class="topbar-left">
      <button
        type="button"
        class="topbar-back"
        aria-label="Back to campaigns"
        @click="emit('back')"
      >
        <Icon name="back" size="sm" />
      </button>
      <!-- Name is a click-target into the Setup popover (the popover owns
           the actual edit field per Editor-phase1.md §1). -->
      <button
        type="button"
        class="topbar-name-btn"
        aria-label="Open setup"
        @click="onSetupClick"
      >
        <span class="topbar-name-text">{{ displayName }}</span>
        <Icon name="chevron-down" :size="14" class="topbar-name-caret" />
      </button>
      <span :class="['topbar-status', `topbar-status--${statusKind}`]">
        <span class="topbar-status-dot" aria-hidden="true"></span>
        {{ statusText }}
      </span>
    </div>

    <div class="topbar-center">
      <!-- Desktop/Mobile preview width toggle (Editor-phase1.md §7). -->
      <SegmentedControl
        :model-value="previewWidth"
        :options="previewWidthOptions"
        aria-label="Preview width"
        @update:model-value="emit('update:previewWidth', $event)"
      />
    </div>

    <div class="topbar-actions">
      <!-- Undo/Redo — keyboard shortcuts are the primary path; surfacing
           them as buttons too so the affordance is discoverable. -->
      <div class="topbar-undo-group">
        <button
          type="button"
          class="topbar-iconbtn"
          aria-label="Undo"
          title="Undo (Cmd+Z)"
          :disabled="!canUndo"
          @click="emit('undo')"
        >
          <Icon name="undo" :size="14" />
        </button>
        <button
          type="button"
          class="topbar-iconbtn"
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
          :disabled="!canRedo"
          @click="emit('redo')"
        >
          <Icon name="redo" :size="14" />
        </button>
      </div>
      <Button variant="ghost" size="sm" @click="onSetupClick">Setup</Button>
      <Button variant="ghost" size="sm" @click="emit('save')">Save draft</Button>
      <Button variant="ghost" size="sm" @click="onTestSendClick">Test send</Button>
      <Button variant="ghost" size="sm" @click="emit('open-preview')">Preview</Button>
      <Button variant="primary" size="sm" @click="emit('open-send')">Send</Button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-5);
  border-bottom: 1px solid var(--color-rule);
  background: var(--color-surface);
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1;
}
.topbar-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}
.topbar-back:hover {
  color: var(--color-ink);
  background: var(--color-surface-2);
}

.topbar-name-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-2);
  border: 0;
  background: transparent;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-ink);
  cursor: pointer;
  border-radius: var(--radius-xs);
  min-width: 0;
}
.topbar-name-btn:hover { background: var(--color-surface-2); }
.topbar-name-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}
.topbar-name-caret { color: var(--color-ink-dim); flex-shrink: 0; }

.topbar-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  padding-left: var(--space-2);
}
.topbar-status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-ink-dim);
}
.topbar-status--saving .topbar-status-dot {
  background: var(--color-ink-soft);
  animation: pulse 1.2s var(--ease-out) infinite;
}
.topbar-status--dirty .topbar-status-dot {
  background: var(--color-warn);
}
.topbar-status--saved .topbar-status-dot {
  background: var(--color-pop);
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

/* CENTER — desktop/mobile toggle. */
.topbar-center {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
.topbar-undo-group {
  display: inline-flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-surface);
}
.topbar-iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-right: 1px solid var(--color-rule);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  cursor: pointer;
  padding: 0;
}
.topbar-iconbtn:last-child { border-right: 0; }
.topbar-iconbtn:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.topbar-iconbtn[disabled] {
  color: var(--color-ink-dim);
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
