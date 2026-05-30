<script setup>
// Accessible checkbox: a real (visually hidden) <input type=checkbox> driving a
// styled 18px box, with a default-slot label. Boolean two-way via defineModel().
// Focus ring standardizes on --shadow-pop-glow; checked fill is --color-pop.
const model = defineModel({ type: Boolean, default: false });

defineProps({
  disabled: { type: Boolean, default: false },
});
</script>

<template>
  <label class="checkbox" :class="{ 'checkbox--disabled': disabled }">
    <input
      v-model="model"
      type="checkbox"
      :disabled="disabled"
      class="checkbox__input"
    />
    <span class="checkbox__box" aria-hidden="true">
      <svg class="checkbox__check" width="12" height="12" viewBox="0 0 12 12">
        <path d="M2.5 6.5l2.5 2.5 4.5-5" fill="none" stroke="#FFFFFF"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </span>
    <span v-if="$slots.default" class="checkbox__label"><slot /></span>
  </label>
</template>

<style scoped>
.checkbox {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--color-ink);
}

.checkbox--disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}

/* Visually hidden but still focusable / accessible */
.checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

.checkbox__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  background: var(--field-bg);
  border: 1px solid var(--color-rule-strong);
  border-radius: var(--radius-xs);
  transition: background-color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.checkbox__check {
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}

.checkbox__input:checked + .checkbox__box {
  background: var(--color-pop);
  border-color: var(--color-pop);
}

.checkbox__input:checked + .checkbox__box .checkbox__check {
  opacity: 1;
}

.checkbox__input:focus-visible + .checkbox__box {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}

.checkbox__label {
  line-height: var(--leading-normal);
}
</style>
