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
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
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
        <svg viewBox="0 0 24 24" width="14" height="14" class="topbar-name-caret" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <span :class="['topbar-status', `topbar-status--${statusKind}`]">
        <span class="topbar-status-dot" aria-hidden="true"></span>
        {{ statusText }}
      </span>
    </div>

    <div class="topbar-center">
      <!-- Desktop/Mobile preview width toggle (Editor-phase1.md §7). -->
      <div class="topbar-segmented" role="group" aria-label="Preview width">
        <button
          type="button"
          :class="['topbar-seg', { 'topbar-seg--active': previewWidth === 'desktop' }]"
          :aria-pressed="previewWidth === 'desktop'"
          @click="emit('update:previewWidth', 'desktop')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <rect x="3" y="5" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M8 21h8M12 17v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          Desktop
        </button>
        <button
          type="button"
          :class="['topbar-seg', { 'topbar-seg--active': previewWidth === 'mobile' }]"
          :aria-pressed="previewWidth === 'mobile'"
          @click="emit('update:previewWidth', 'mobile')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <rect x="7" y="3" width="10" height="18" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" />
            <path d="M11 18h2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          Mobile
        </button>
      </div>
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
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M9 14l-5-5 5-5M4 9h9a6 6 0 0 1 0 12h-3"
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
          class="topbar-iconbtn"
          aria-label="Redo"
          title="Redo (Cmd+Shift+Z)"
          :disabled="!canRedo"
          @click="emit('redo')"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d="M15 14l5-5-5-5M20 9h-9a6 6 0 0 0 0 12h3"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
      <button type="button" class="btn btn--ghost" @click="onSetupClick">
        Setup
      </button>
      <button type="button" class="btn btn--ghost" @click="emit('save')">
        Save draft
      </button>
      <button type="button" class="btn btn--ghost" @click="onTestSendClick">
        Test send
      </button>
      <button type="button" class="btn btn--ghost" @click="emit('open-preview')">
        Preview
      </button>
      <button type="button" class="btn btn--pop" @click="emit('open-send')">
        Send
      </button>
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
.topbar-segmented {
  display: inline-flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
}
.topbar-seg {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  gap: var(--space-1-5);
  padding: var(--space-1-5) var(--space-3);
  background: var(--color-surface);
  border: 0;
  border-right: 1px solid var(--color-rule);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.topbar-seg:last-child { border-right: 0; }
.topbar-seg:hover {
  background: var(--color-surface-2);
  color: var(--color-ink);
}
.topbar-seg--active {
  background: var(--color-pop-bg);
  color: var(--color-ink);
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

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-4);
  height: 36px;
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.btn--ghost {
  background: var(--color-surface);
  color: var(--btn-ghost-fg);
  border: 1px solid var(--btn-ghost-border);
}
.btn--ghost:hover {
  background: var(--btn-ghost-hover-bg);
  border-color: var(--color-rule-strong);
}
.btn--pop {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-fg);
  border: 1px solid var(--btn-primary-bg);
}
.btn--pop:hover {
  background: var(--btn-primary-hover);
  border-color: var(--btn-primary-hover);
}
</style>
