<script setup lang="ts">
import { MOCK_AUDIENCES, type Audience } from "./editor-types";
// AudienceSelector — custom dropdown over MOCK_AUDIENCES. The list of
// audiences is hardcoded for Phase 1 (Editor-phase1.md §2). When the
// real Audiences feature ships, only the lookup source switches; this
// component's emit contract (audience id string) stays the same.
//
// Not using a native <select> because we want:
//   - the count rendered next to the name in the menu items
//   - a custom focus ring matching the Pop tokens
//   - keyboard navigation that doesn't surface the platform UI
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

interface Props {
  modelValue: string | null; // audienceId
  // Focus the trigger on mount (used by pre-flight "Edit →" deep-link).
  autofocus?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", v: string): void;
}>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const triggerEl = ref<HTMLButtonElement | null>(null);
const activeIndex = ref<number>(0);

const selected = computed<Audience | null>(
  () => MOCK_AUDIENCES.find((a) => a.id === props.modelValue) ?? null,
);

function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) {
    // Land focus on the currently-selected row, or the first one.
    const idx = MOCK_AUDIENCES.findIndex((a) => a.id === props.modelValue);
    activeIndex.value = idx >= 0 ? idx : 0;
  }
}

function choose(audience: Audience) {
  emit("update:modelValue", audience.id);
  open.value = false;
  // Restore focus to the trigger so keyboard users don't lose context.
  void nextTick(() => triggerEl.value?.focus());
}

function onTriggerKey(e: KeyboardEvent) {
  if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
    e.preventDefault();
    open.value = true;
    const idx = MOCK_AUDIENCES.findIndex((a) => a.id === props.modelValue);
    activeIndex.value = idx >= 0 ? idx : 0;
  }
}

function onMenuKey(e: KeyboardEvent) {
  if (!open.value) return;
  if (e.key === "Escape") {
    e.preventDefault();
    open.value = false;
    void nextTick(() => triggerEl.value?.focus());
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    activeIndex.value = (activeIndex.value + 1) % MOCK_AUDIENCES.length;
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    activeIndex.value =
      (activeIndex.value - 1 + MOCK_AUDIENCES.length) % MOCK_AUDIENCES.length;
    return;
  }
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    choose(MOCK_AUDIENCES[activeIndex.value]);
  }
}

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  if (!rootEl.value) return;
  if (!rootEl.value.contains(e.target as Node)) {
    open.value = false;
  }
}

onMounted(() => {
  document.addEventListener("mousedown", onClickOutside);
  if (props.autofocus) {
    void nextTick(() => triggerEl.value?.focus());
  }
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onClickOutside);
});

// Re-focus the trigger if the parent flips autofocus → true after mount
// (the pre-flight "Edit →" deep-link path).
watch(
  () => props.autofocus,
  (v) => {
    if (v) void nextTick(() => triggerEl.value?.focus());
  },
);

defineExpose({ focus: () => triggerEl.value?.focus() });
</script>

<template>
  <div class="aud" ref="rootEl" @keydown="onMenuKey">
    <button
      type="button"
      class="aud-trigger"
      ref="triggerEl"
      :aria-expanded="open"
      aria-haspopup="listbox"
      @click="toggleOpen"
      @keydown="onTriggerKey"
    >
      <span v-if="selected" class="aud-trigger-value">
        <span class="aud-name">{{ selected.name }}</span>
        <span class="aud-count">{{ formatCount(selected.count) }}</span>
      </span>
      <span v-else class="aud-trigger-placeholder">Choose an audience</span>
      <svg class="aud-caret" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
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

    <ul
      v-if="open"
      class="aud-menu"
      role="listbox"
      :aria-activedescendant="`aud-opt-${activeIndex}`"
    >
      <li
        v-for="(a, i) in MOCK_AUDIENCES"
        :key="a.id"
        :id="`aud-opt-${i}`"
        role="option"
        :aria-selected="a.id === modelValue"
        :class="[
          'aud-opt',
          { 'aud-opt--active': i === activeIndex, 'aud-opt--selected': a.id === modelValue },
        ]"
        @mouseenter="activeIndex = i"
        @mousedown.prevent="choose(a)"
      >
        <span class="aud-opt-text">
          <span class="aud-name">{{ a.name }}</span>
          <span class="aud-opt-meta">{{ formatCount(a.count) }} contacts</span>
        </span>
        <svg
          v-if="a.id === modelValue"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
          class="aud-opt-check"
        >
          <path
            d="M5 12l5 5 9-11"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.aud { position: relative; }

.aud-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  min-height: var(--field-height);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  outline: none;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.aud-trigger:hover { border-color: var(--color-rule-strong); }
.aud-trigger:focus-visible,
.aud-trigger[aria-expanded="true"] {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}

.aud-trigger-value {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.aud-name {
  font-weight: 500;
  color: var(--color-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.aud-count {
  color: var(--color-ink-dim);
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}
.aud-trigger-placeholder {
  color: var(--field-placeholder);
}
.aud-caret {
  color: var(--color-ink-dim);
  flex-shrink: 0;
}

/* MENU ------------------------------------------------------------------ */
.aud-menu {
  position: absolute;
  top: calc(100% + var(--space-1));
  left: 0;
  right: 0;
  margin: 0;
  padding: var(--space-1);
  list-style: none;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  z-index: var(--z-popover);
  max-height: 280px;
  overflow-y: auto;
}
.aud-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.aud-opt-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.aud-opt-meta {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-variant-numeric: tabular-nums;
}
.aud-opt--active {
  background: var(--color-surface-sunk);
}
.aud-opt--selected .aud-name {
  color: var(--color-ink);
}
.aud-opt-check {
  color: var(--color-ink-soft);
  flex-shrink: 0;
}
</style>
