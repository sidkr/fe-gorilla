<script setup>
// Form-field wrapper — provides structure (label, control slot, help/error text)
// around any control. Owns NO control styling itself; just layout + labelling.
// Pair with TextInput/TextArea/SelectInput/Checkbox via the default slot.
defineProps({
  label: { type: String, default: "" },
  hint: { type: String, default: "" },
  error: { type: String, default: "" },
  required: { type: Boolean, default: false },
  // `inputId` (not `for`) — `for` is a JS reserved word and breaks the
  // template expression in a production build. Binds the label's `for` attr.
  inputId: { type: String, default: "" },
});
</script>

<template>
  <div class="form-field">
    <label v-if="label" class="form-field__label" :for="inputId || undefined">
      {{ label }}<span v-if="required" class="form-field__req" aria-hidden="true">*</span>
    </label>

    <slot />

    <p v-if="error" class="form-field__error">{{ error }}</p>
    <p v-else-if="hint" class="form-field__hint">{{ hint }}</p>
  </div>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1-5);
}

.form-field__label {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink);
}

.form-field__req {
  color: var(--color-danger);
  margin-left: var(--space-1);
}

.form-field__error,
.form-field__hint {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: var(--leading-normal);
}

.form-field__error {
  color: var(--color-danger);
}

.form-field__hint {
  color: var(--color-ink-dim);
}
</style>
