<script setup lang="ts">
// MergeTagPicker — a small, unobtrusive "{ } Merge tag" button that opens a
// grouped dropdown (Standard / Custom). Clicking a tag emits `insert` with
// the formatted token string (e.g. "{{firstName}}"); the parent owns where
// the token lands (it knows which field/input has focus).
//
// The picker is deliberately dumb about insertion: it never touches the DOM
// of the field. This keeps it reusable across the inspector text inputs and
// the setup popover's subject/preheader inputs, each of which has its own
// idea of "the cursor".
//
// Tags are loaded lazily on first open via useMergeTags() so the custom-field
// registry call only fires if the user actually reaches for a merge tag.
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { formatTag, useMergeTags, type MergeTag } from "~/composables/app/useMergeTags";

interface Props {
  // Compact variant for tight inline rows (inspector). Default is the
  // standard pill.
  compact?: boolean;
  // Optional override of the trigger label.
  label?: string;
}
const props = withDefaults(defineProps<Props>(), {
  compact: false,
  label: "Merge tag",
});

const emit = defineEmits<{
  // The formatted token, ready to splice in: "{{firstName}}".
  (e: "insert", token: string): void;
}>();

const { tags, loaded, loadTags } = useMergeTags();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

const standardTags = computed(() => tags.value.filter((t) => t.group === "standard"));
const customTags = computed(() => tags.value.filter((t) => t.group === "custom"));

async function toggle() {
  open.value = !open.value;
  if (open.value && !loaded.value) {
    await loadTags();
  }
}

function choose(tag: MergeTag) {
  emit("insert", formatTag(tag.token));
  open.value = false;
}

// ── Dismissal ─────────────────────────────────────────────────────────────
function onDocMouseDown(e: MouseEvent) {
  if (!open.value) return;
  const t = e.target as Node;
  if (rootEl.value && !rootEl.value.contains(t)) open.value = false;
}
function onKey(e: KeyboardEvent) {
  if (e.key === "Escape" && open.value) {
    open.value = false;
    void nextTick();
  }
}
onMounted(() => {
  document.addEventListener("mousedown", onDocMouseDown);
  document.addEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.removeEventListener("mousedown", onDocMouseDown);
  document.removeEventListener("keydown", onKey);
});
</script>

<template>
  <div ref="rootEl" class="mtp" :class="{ 'mtp--compact': compact }">
    <button
      type="button"
      class="mtp-trigger"
      :class="{ 'mtp-trigger--open': open }"
      :aria-expanded="open"
      aria-haspopup="menu"
      :title="'Insert a personalization tag'"
      @click="toggle"
    >
      <span class="mtp-glyph" aria-hidden="true">{ }</span>
      <span v-if="!compact" class="mtp-trigger-label">{{ label }}</span>
    </button>

    <div v-if="open" class="mtp-menu" role="menu" aria-label="Insert merge tag">
      <p class="mtp-help">Inserts a placeholder that fills in per-contact when you send.</p>

      <div class="mtp-group">
        <p class="mtp-group-head">Standard</p>
        <button
          v-for="tag in standardTags"
          :key="tag.token"
          type="button"
          class="mtp-item"
          role="menuitem"
          @click="choose(tag)"
        >
          <span class="mtp-item-label">{{ tag.label }}</span>
          <code class="mtp-item-token">{{ formatTag(tag.token) }}</code>
        </button>
      </div>

      <div v-if="customTags.length" class="mtp-group">
        <p class="mtp-group-head">Custom</p>
        <button
          v-for="tag in customTags"
          :key="tag.token"
          type="button"
          class="mtp-item"
          role="menuitem"
          @click="choose(tag)"
        >
          <span class="mtp-item-label">{{ tag.label }}</span>
          <code class="mtp-item-token">{{ formatTag(tag.token) }}</code>
        </button>
      </div>

      <p v-if="loaded && !customTags.length" class="mtp-empty">
        No custom fields yet. Add data points in Settings to personalize further.
      </p>
    </div>
  </div>
</template>

<style scoped>
.mtp {
  position: relative;
  display: inline-flex;
}

.mtp-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-ink-soft);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out);
}
.mtp-trigger:hover,
.mtp-trigger--open {
  border-color: var(--color-pop);
  color: var(--color-pop);
  background: var(--color-pop-bg);
}
.mtp--compact .mtp-trigger {
  padding: 2px var(--space-1);
}
.mtp-glyph {
  font-family: var(--font-mono);
  font-weight: 700;
  letter-spacing: -1px;
}
.mtp-trigger-label {
  white-space: nowrap;
}

.mtp-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-popover);
  padding: var(--space-2);
}

.mtp-help {
  margin: 0 0 var(--space-2);
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  line-height: var(--leading-snug);
}

.mtp-group + .mtp-group {
  margin-top: var(--space-2);
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-rule);
}
.mtp-group-head {
  margin: 0 0 var(--space-1);
  padding: 0 var(--space-2);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--color-ink-dim);
}

.mtp-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-ink);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}
.mtp-item:hover {
  background: var(--color-surface-2);
}
.mtp-item-label {
  font-weight: 500;
}
.mtp-item-token {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  white-space: nowrap;
}
.mtp-item:hover .mtp-item-token {
  color: var(--color-pop);
}

.mtp-empty {
  margin: var(--space-1) 0 0;
  padding: 0 var(--space-2) var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  line-height: var(--leading-snug);
}
</style>
