<script setup>
// Styled text <input>. Two-way bound via defineModel(). Field look is driven
// entirely by --field-* tokens; focus standardizes on --field-border-focus +
// --shadow-pop-glow. Wrap in <FormField> for labels/help.
const model = defineModel({ type: [String, Number], default: "" });

defineProps({
  type: { type: String, default: "text" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  mono: { type: Boolean, default: false },
  size: { type: String, default: "md" }, // "sm" | "md"
});
</script>

<template>
  <input
    v-model="model"
    :type="type"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    class="text-input"
    :class="[`text-input--${size}`, { 'text-input--invalid': invalid, 'text-input--mono': mono }]"
  />
</template>

<style scoped>
.text-input {
  width: 100%;
  box-sizing: border-box;
  min-height: var(--field-height);
  padding: var(--space-2) var(--space-3);
  background: var(--field-bg);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  color: var(--field-text);
  font-family: var(--font-body);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  transition: border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.text-input--sm {
  min-height: 36px;
  padding: var(--space-1-5) var(--space-2);
  font-size: var(--text-sm);
}

.text-input--mono {
  font-family: var(--font-mono);
}

.text-input::placeholder {
  color: var(--field-placeholder);
}

.text-input:focus,
.text-input:focus-visible {
  outline: none;
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}

.text-input--invalid,
.text-input--invalid:focus {
  border-color: var(--color-danger);
}

.text-input:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
  background: var(--color-surface-sunk);
}
</style>
