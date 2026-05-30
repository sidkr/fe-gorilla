<script setup>
// Styled <textarea>, mirroring TextInput's field look. Two-way bound via
// defineModel(). Vertical resize only; focus standardizes on
// --field-border-focus + --shadow-pop-glow. Wrap in <FormField> for labels.
const model = defineModel({ type: String, default: "" });

defineProps({
  rows: { type: [Number, String], default: 4 },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  invalid: { type: Boolean, default: false },
  mono: { type: Boolean, default: false },
});
</script>

<template>
  <textarea
    v-model="model"
    :rows="rows"
    :placeholder="placeholder"
    :disabled="disabled"
    :aria-invalid="invalid || undefined"
    class="text-area"
    :class="{ 'text-area--invalid': invalid, 'text-area--mono': mono }"
  />
</template>

<style scoped>
.text-area {
  width: 100%;
  box-sizing: border-box;
  min-height: 80px;
  resize: vertical;
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

.text-area--mono {
  font-family: var(--font-mono);
}

.text-area::placeholder {
  color: var(--field-placeholder);
}

.text-area:focus,
.text-area:focus-visible {
  outline: none;
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}

.text-area--invalid,
.text-area--invalid:focus {
  border-color: var(--color-danger);
}

.text-area:disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
  background: var(--color-surface-sunk);
}
</style>
