<script setup lang="ts">
// Segments-only rule builder. Renders a single top-level AND/OR group of leaf
// conditions over Contact. Each condition = field + operator + typed value.
// Fields are grouped: Standard / Tags / Custom (sourced from useCustomFields).
//
// v-model contract: the parent owns the SegmentRules object; we emit a fresh
// object on every edit so watchers (the debounced preview) fire reliably.
import type { CustomField } from "~/composables/app/useCustomFields";
import {
  OPERATORS_BY_TYPE,
  OPERATOR_LABELS,
  UNARY_OPERATORS,
  LIST_OPERATORS,
  STD_FIELDS,
  type RuleType,
  type SegmentRules,
  type SegmentCondition,
} from "~/composables/app/useSegments";

const props = defineProps<{
  modelValue: SegmentRules;
  customFields: CustomField[];
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: SegmentRules): void;
}>();

// ── field resolution ─────────────────────────────────────────────────────────
// Map any field path → its rule type, so the operator list + value input adapt.
function ruleTypeFor(field: string): RuleType {
  if (field === "tags") return "tags";
  const std = STD_FIELDS.find((f) => f.field === field);
  if (std) return std.type;
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    const cf = props.customFields.find((c) => c.key === key);
    if (cf) return cf.type as RuleType;
  }
  return "text";
}

function enumValuesFor(field: string): string[] {
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    const cf = props.customFields.find((c) => c.key === key);
    if (cf && cf.type === "enum") return cf.enumValues;
  }
  return [];
}

// Operators offered for a given condition's field.
function operatorsFor(field: string): { value: string; label: string }[] {
  const t = ruleTypeFor(field);
  return (OPERATORS_BY_TYPE[t] || []).map((op) => ({
    value: op,
    label: OPERATOR_LABELS[op] || op,
  }));
}

const isUnary = (op: string) => UNARY_OPERATORS.has(op);
const isList = (op: string) => LIST_OPERATORS.has(op);

// ── mutation helpers (always emit a fresh object) ─────────────────────────────
function commit(next: SegmentRules) {
  emit("update:modelValue", next);
}

function setOp(op: "and" | "or") {
  commit({ ...props.modelValue, op });
}

function leaves(): SegmentCondition[] {
  // The builder only edits leaf conditions (nested groups are tolerated by the
  // server but not exposed in this MVP UI).
  return (props.modelValue.conditions as SegmentCondition[]).slice();
}

function addCondition() {
  const conditions = leaves();
  conditions.push({ field: "email", operator: "contains", value: "" });
  commit({ ...props.modelValue, conditions });
}

function removeCondition(idx: number) {
  const conditions = leaves();
  conditions.splice(idx, 1);
  commit({ ...props.modelValue, conditions });
}

function patchCondition(idx: number, patch: Partial<SegmentCondition>) {
  const conditions = leaves();
  conditions[idx] = { ...conditions[idx], ...patch };
  commit({ ...props.modelValue, conditions });
}

// When the field changes, reset operator + value to sane defaults for the new type.
function onFieldChange(idx: number, field: string) {
  const ops = OPERATORS_BY_TYPE[ruleTypeFor(field)] || ["eq"];
  const operator = ops[0];
  patchCondition(idx, { field, operator, value: defaultValueFor(field, operator) });
}

// When the operator changes, coerce the value shape (unary → undefined,
// boolean → true, list → []).
function onOperatorChange(idx: number, operator: string) {
  const field = leaves()[idx].field;
  patchCondition(idx, { operator, value: defaultValueFor(field, operator) });
}

function defaultValueFor(field: string, operator: string): unknown {
  if (isUnary(operator)) return undefined;
  const t = ruleTypeFor(field);
  if (operator === "between") return ["", ""];
  if (isList(operator)) return [];
  if (t === "boolean") return true;
  if (t === "number" || operator === "last_n_days") return null;
  return "";
}

// ── value input wiring ────────────────────────────────────────────────────────
// `in`/`not_in` use a comma-separated text box that we split on commit.
function listToText(value: unknown): string {
  return Array.isArray(value) ? value.join(", ") : "";
}
function textToList(idx: number, text: string) {
  const field = leaves()[idx].field;
  const numeric = ruleTypeFor(field) === "number";
  const parts = text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => (numeric ? Number(s) : s));
  patchCondition(idx, { value: parts });
}

function betweenValue(value: unknown, i: number): string {
  return Array.isArray(value) ? String(value[i] ?? "") : "";
}
function setBetween(idx: number, i: number, v: string) {
  const cur = leaves()[idx].value;
  const pair = Array.isArray(cur) ? [...cur] : ["", ""];
  pair[i] = v;
  patchCondition(idx, { value: pair });
}

function asString(v: unknown): string {
  return v == null ? "" : String(v);
}

const grouped = computed(() => ({
  std: STD_FIELDS,
  cf: props.customFields,
}));
</script>

<template>
  <div class="rb">
    <!-- match-all toggle -->
    <div class="rb-match">
      <span class="rb-match-label">Match</span>
      <div class="rb-seg" role="group" aria-label="Match all or any">
        <button
          type="button"
          class="rb-seg-btn"
          :class="{ 'is-active': modelValue.op === 'and' }"
          @click="setOp('and')"
        >ALL</button>
        <button
          type="button"
          class="rb-seg-btn"
          :class="{ 'is-active': modelValue.op === 'or' }"
          @click="setOp('or')"
        >ANY</button>
      </div>
      <span class="rb-match-label">of the conditions below</span>
    </div>

    <!-- conditions -->
    <ul class="rb-list">
      <li
        v-for="(c, idx) in (modelValue.conditions as SegmentCondition[])"
        :key="idx"
        class="rb-cond"
      >
        <span class="rb-joiner" v-if="idx > 0">{{ modelValue.op === 'or' ? 'OR' : 'AND' }}</span>
        <span class="rb-joiner rb-joiner-where" v-else>WHERE</span>

        <!-- field -->
        <select
          class="rb-input rb-field"
          :value="c.field"
          @change="onFieldChange(idx, ($event.target as HTMLSelectElement).value)"
        >
          <optgroup label="Standard fields">
            <option v-for="f in grouped.std" :key="f.field" :value="f.field">{{ f.label }}</option>
          </optgroup>
          <optgroup label="Tags">
            <option value="tags">Tags</option>
          </optgroup>
          <optgroup v-if="grouped.cf.length" label="Custom fields">
            <option
              v-for="cf in grouped.cf"
              :key="cf.id"
              :value="`customFields.${cf.key}`"
            >{{ cf.label }}</option>
          </optgroup>
        </select>

        <!-- operator -->
        <select
          class="rb-input rb-operator"
          :value="c.operator"
          @change="onOperatorChange(idx, ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="o in operatorsFor(c.field)" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>

        <!-- value: typed by field type + operator -->
        <template v-if="isUnary(c.operator)">
          <span class="rb-novalue">—</span>
        </template>

        <!-- enum → select -->
        <select
          v-else-if="ruleTypeFor(c.field) === 'enum' && !isList(c.operator)"
          class="rb-input rb-value"
          :value="asString(c.value)"
          @change="patchCondition(idx, { value: ($event.target as HTMLSelectElement).value })"
        >
          <option value="" disabled>Choose…</option>
          <option v-for="ev in enumValuesFor(c.field)" :key="ev" :value="ev">{{ ev }}</option>
        </select>

        <!-- boolean → toggle -->
        <select
          v-else-if="ruleTypeFor(c.field) === 'boolean'"
          class="rb-input rb-value"
          :value="c.value === true ? 'true' : 'false'"
          @change="patchCondition(idx, { value: ($event.target as HTMLSelectElement).value === 'true' })"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>

        <!-- last_n_days → number -->
        <input
          v-else-if="c.operator === 'last_n_days'"
          class="rb-input rb-value rb-value-num"
          type="number"
          min="1"
          placeholder="days"
          :value="asString(c.value)"
          @input="patchCondition(idx, { value: Number(($event.target as HTMLInputElement).value) })"
        />

        <!-- date before/after → date input -->
        <input
          v-else-if="ruleTypeFor(c.field) === 'date' && (c.operator === 'before' || c.operator === 'after')"
          class="rb-input rb-value"
          type="date"
          :value="asString(c.value).slice(0, 10)"
          @input="patchCondition(idx, { value: ($event.target as HTMLInputElement).value })"
        />

        <!-- date between → two date inputs -->
        <template v-else-if="ruleTypeFor(c.field) === 'date' && c.operator === 'between'">
          <input
            class="rb-input rb-value rb-value-half"
            type="date"
            :value="betweenValue(c.value, 0).slice(0, 10)"
            @input="setBetween(idx, 0, ($event.target as HTMLInputElement).value)"
          />
          <span class="rb-and">and</span>
          <input
            class="rb-input rb-value rb-value-half"
            type="date"
            :value="betweenValue(c.value, 1).slice(0, 10)"
            @input="setBetween(idx, 1, ($event.target as HTMLInputElement).value)"
          />
        </template>

        <!-- in / not_in → comma list -->
        <input
          v-else-if="isList(c.operator)"
          class="rb-input rb-value"
          type="text"
          placeholder="value, value, …"
          :value="listToText(c.value)"
          @input="textToList(idx, ($event.target as HTMLInputElement).value)"
        />

        <!-- number → number input -->
        <input
          v-else-if="ruleTypeFor(c.field) === 'number'"
          class="rb-input rb-value rb-value-num"
          type="number"
          placeholder="0"
          :value="asString(c.value)"
          @input="patchCondition(idx, { value: Number(($event.target as HTMLInputElement).value) })"
        />

        <!-- default text -->
        <input
          v-else
          class="rb-input rb-value"
          type="text"
          placeholder="value"
          :value="asString(c.value)"
          @input="patchCondition(idx, { value: ($event.target as HTMLInputElement).value })"
        />

        <button
          type="button"
          class="rb-remove"
          aria-label="Remove condition"
          @click="removeCondition(idx)"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M3.5 3.5 L10.5 10.5 M10.5 3.5 L3.5 10.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
          </svg>
        </button>
      </li>
    </ul>

    <p v-if="modelValue.conditions.length === 0" class="rb-empty">
      No conditions yet — this segment matches every contact. Add a condition to narrow it.
    </p>

    <button type="button" class="rb-add" @click="addCondition">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M7 2.5 V11.5 M2.5 7 H11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
      <span>Add condition</span>
    </button>
  </div>
</template>

<style scoped>
.rb {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* match-all bar */
.rb-match {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
}
.rb-match-label {
  font-weight: 500;
}
.rb-seg {
  display: inline-flex;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  overflow: hidden;
}
.rb-seg-btn {
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  background: var(--color-surface);
  color: var(--color-ink-dim);
  border: none;
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.rb-seg-btn.is-active {
  background: var(--color-pop);
  color: var(--btn-primary-fg);
}

/* condition rows */
.rb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rb-cond {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.rb-joiner {
  flex: 0 0 auto;
  width: 56px;
  text-align: right;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wide);
  color: var(--color-pop);
}
.rb-joiner-where {
  color: var(--color-ink-dim);
}

.rb-input {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-md);
  padding: var(--space-2) var(--space-3);
  height: 36px;
  box-sizing: border-box;
}
.rb-input:focus-visible {
  outline: none;
  border-color: var(--color-pop);
  box-shadow: 0 0 0 3px var(--color-pop-glow);
}
.rb-field { min-width: 160px; }
.rb-operator { min-width: 130px; }
.rb-value { flex: 1 1 160px; min-width: 120px; }
.rb-value-num { flex: 0 0 110px; }
.rb-value-half { flex: 0 0 150px; }
.rb-and {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}
.rb-novalue {
  flex: 1 1 auto;
  color: var(--color-ink-dim);
  font-family: var(--font-mono);
}

.rb-remove {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-ink-dim);
  cursor: pointer;
  transition: background-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.rb-remove:hover {
  background: var(--color-danger-bg);
  color: var(--color-danger);
}

.rb-empty {
  margin: 0;
  padding: var(--space-3) 0 var(--space-3) 64px;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-dim);
}

.rb-add {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-left: 64px;
  padding: var(--space-2) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-pop);
  background: var(--color-surface);
  border: 1px dashed var(--color-rule);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out);
}
.rb-add:hover {
  border-color: var(--color-pop);
  background: var(--color-surface-2);
}
</style>
