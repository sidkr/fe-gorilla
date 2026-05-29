<script setup>
// Segmented toggle control — a horizontal track of mutually-exclusive options
// with one active segment. Replaces the ad-hoc `.topbar-seg` and `.ins-segmented`
// styles. Bind the selected value with v-model. Each option may carry an optional
// icon name surfaced via the `#icon` slot (scoped: { option }). Arrow keys move
// the selection between segments; the active button is the only roving tabstop.
import { computed } from 'vue';

const props = defineProps({
  // [{ label: string, value: any, icon?: string }]
  options: { type: Array, default: () => [] },
  // Accessible label for the radiogroup.
  ariaLabel: { type: String, default: undefined },
});

const model = defineModel({ default: undefined });

function isActive(option) {
  return model.value === option.value;
}

function select(option) {
  model.value = option.value;
}

const activeIndex = computed(() => {
  const i = props.options.findIndex((o) => o.value === model.value);
  return i === -1 ? 0 : i;
});

// Roving tabstop: the active segment (or the first, when nothing matches) is the
// only one reachable via Tab; arrow keys handle movement within the group.
function isTabstop(i) {
  return i === activeIndex.value;
}

function move(delta, event) {
  if (!props.options.length) return;
  event.preventDefault();
  const next = (activeIndex.value + delta + props.options.length) % props.options.length;
  select(props.options[next]);
}
</script>

<template>
  <div class="seg" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(option, i) in options"
      :key="i"
      type="button"
      role="radio"
      class="seg__btn"
      :class="{ 'is-active': isActive(option) }"
      :aria-checked="isActive(option)"
      :tabindex="isTabstop(i) ? 0 : -1"
      @click="select(option)"
      @keydown.right="move(1, $event)"
      @keydown.down="move(1, $event)"
      @keydown.left="move(-1, $event)"
      @keydown.up="move(-1, $event)"
    >
      <slot name="icon" :option="option">
        <span v-if="option.icon" class="seg__icon" aria-hidden="true">{{ option.icon }}</span>
      </slot>
      <span class="seg__label">{{ option.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-surface-sunk);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
}

.seg__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  padding: var(--space-1) var(--space-3);
  border: 0;
  background: transparent;
  border-radius: var(--radius-xs);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  white-space: nowrap;
  color: var(--color-ink-soft);
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out),
              background var(--dur-fast) var(--ease-out),
              box-shadow var(--dur-fast) var(--ease-out);
}

.seg__btn:hover {
  color: var(--color-ink);
}

.seg__btn.is-active {
  background: var(--color-surface);
  box-shadow: var(--shadow-xs);
  color: var(--color-ink);
}

.seg__btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}

.seg__icon {
  display: inline-flex;
  font-size: var(--text-base);
  line-height: 1;
}
</style>
