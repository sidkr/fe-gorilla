<script setup>
// Shared lightweight anchored popover. A `#trigger` slot is the clickable
// anchor; the default slot is the floating panel rendered just below it.
// Positioning is intentionally simple — the panel is absolutely placed inside a
// relatively-positioned wrapper, so it follows the anchor without any external
// positioning library. Visibility is a two-way `open` model that also toggles
// internally on trigger click. Closes on outside click and Escape. No imports
// from components/app or stores.
const open = defineModel("open", { type: Boolean, default: false });

defineProps({
  // Horizontal edge the panel aligns to relative to the trigger.
  align: {
    type: String,
    default: "start",
    validator: (v) => ["start", "end"].includes(v),
  },
});

const emit = defineEmits(["close"]);

const root = ref(null);

function toggle() {
  open.value ? close() : (open.value = true);
}

function close() {
  if (!open.value) return;
  open.value = false;
  emit("close");
}

function onDocClick(e) {
  if (root.value && !root.value.contains(e.target)) close();
}

function onKeydown(e) {
  if (e.key === "Escape") close();
}

// Attach the global outside-click + Escape listeners only while open.
watch(open, (isOpen) => {
  if (typeof document === "undefined") return;
  if (isOpen) {
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeydown);
  } else {
    document.removeEventListener("mousedown", onDocClick);
    document.removeEventListener("keydown", onKeydown);
  }
});

onBeforeUnmount(() => {
  if (typeof document === "undefined") return;
  document.removeEventListener("mousedown", onDocClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div ref="root" class="popover">
    <div class="popover-trigger" @click="toggle">
      <slot name="trigger" :open="open" />
    </div>

    <Transition name="pop">
      <div
        v-if="open"
        class="popover-panel"
        :class="`align-${align}`"
        role="dialog"
      >
        <slot />
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.popover {
  position: relative;
  display: inline-block;
}

.popover-trigger {
  display: inline-flex;
}

.popover-panel {
  position: absolute;
  top: calc(100% + var(--space-2));
  z-index: var(--z-popover);
  min-width: max-content;
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  color: var(--color-ink);
  font-size: var(--text-base);
}

.align-start {
  left: 0;
}

.align-end {
  right: 0;
}

.pop-enter-active,
.pop-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out),
    transform var(--dur-fast) var(--ease-spring);
  transform-origin: top;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.97) translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .pop-enter-active,
  .pop-leave-active {
    transition-duration: 1ms;
  }
  .pop-enter-from,
  .pop-leave-to {
    transform: none;
  }
}
</style>
