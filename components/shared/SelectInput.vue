<script setup>
// Styled native <select> matching the shared field look (border/focus/disabled).
// Pass <option>s through the default slot. Two-way bound via defineModel().
// Custom chevron drawn via background SVG; native arrow suppressed.
const model = defineModel({ type: [String, Number], default: "" });

defineProps({
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
});
</script>

<template>
  <select
    v-model="model"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    class="select-input"
    :class="{ 'select-input--invalid': invalid }"
  >
    <slot />
  </select>
</template>

<style scoped>
.select-input {
  width: 100%;
  box-sizing: border-box;
  min-height: var(--field-height);
  padding: var(--space-2) var(--space-3);
  padding-right: calc(var(--space-3) + 18px);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%2356565E' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--space-3) center;
  transition: border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.select-input:focus,
.select-input:focus-visible {
  outline: none;
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}

.select-input--invalid,
.select-input--invalid:focus {
  border-color: var(--color-danger);
}

.select-input:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
  background-color: var(--color-surface-sunk);
}
</style>
