<script setup lang="ts">
// BrandColorPicker — swatch row + native color input + hex text input.
// Used by every block inspector that takes a color (Heading/Paragraph
// color, Button bg/fg, Divider color, Setup bodyBg). Centralizes the
// brand-color palette so changing the swatch set is a one-file edit.
//
// The native <input type="color"> keeps arbitrary-color flexibility; the
// swatch row gives a fast path to brand presets without a typing detour.
//
// Swatches are emitted as raw hex strings — we resolve the token values
// to hex once at mount via getComputedStyle so the model never stores
// `var(--…)` (which would be meaningless once compiled to MJML / HTML).
import { computed, onMounted, ref } from "vue";

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

// CSS custom-property names to use for the swatch palette. Order is
// intentional: dark → light, ending with white. The native input below
// remains available for any other color the user wants.
const SWATCH_TOKENS: string[] = [
  "--color-ink",
  "--color-ink-soft",
  "--color-ink-dim",
  "--color-pop",
  "--color-pop-deep",
  "--color-bg",
];

// Resolved hex strings. Filled at mount from getComputedStyle on the
// document root. Falls back to the raw token reference if the runtime
// resolve fails (SSR or very early call) — but this component is only
// mounted inside the CSR /app/* surface, so resolution should always
// succeed.
const swatches = ref<string[]>([]);

function rgbToHex(rgb: string): string {
  // accepts "rgb(r, g, b)" or "rgba(r, g, b, a)" or "#rrggbb"
  const trimmed = rgb.trim();
  if (trimmed.startsWith("#")) return trimmed.toUpperCase();
  const m = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!m) return trimmed;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  const [r, g, b] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return trimmed;
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

onMounted(() => {
  const cs = getComputedStyle(document.documentElement);
  swatches.value = SWATCH_TOKENS.map((t) => rgbToHex(cs.getPropertyValue(t).trim()));
});

const normalizedValue = computed(() => (props.modelValue || "").toUpperCase());

function pick(hex: string) {
  emit("update:modelValue", hex);
}

function onHexInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  emit("update:modelValue", v);
}
function onNativeInput(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  emit("update:modelValue", v);
}
</script>

<template>
  <div class="bcp">
    <div class="bcp-swatches" role="group" aria-label="Brand color presets">
      <button
        v-for="hex in swatches"
        :key="hex"
        type="button"
        :class="['bcp-swatch', { 'bcp-swatch--active': normalizedValue === hex }]"
        :style="{ background: hex }"
        :aria-label="`Set color to ${hex}`"
        :title="hex"
        @click.prevent="pick(hex)"
      ></button>
    </div>
    <div class="bcp-custom">
      <input
        type="color"
        class="bcp-native"
        :value="normalizedValue || '#000000'"
        aria-label="Custom color"
        @input="onNativeInput"
      />
      <input
        type="text"
        class="bcp-hex"
        :value="normalizedValue"
        spellcheck="false"
        autocomplete="off"
        @input="onHexInput"
      />
    </div>
  </div>
</template>

<style scoped>
.bcp {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.bcp-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.bcp-swatch {
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-pill);
  cursor: pointer;
  position: relative;
  transition: transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.bcp-swatch:hover {
  transform: scale(1.08);
}
.bcp-swatch:focus-visible {
  outline: none;
  box-shadow: var(--shadow-pop-glow);
}
/* Active swatch — 2px coral ring sitting just outside the swatch border
   without changing the swatch's footprint. */
.bcp-swatch--active {
  box-shadow: 0 0 0 2px var(--color-pop);
}

.bcp-custom {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.bcp-native {
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.bcp-native::-webkit-color-swatch-wrapper { padding: 2px; }
.bcp-native::-webkit-color-swatch { border: 0; border-radius: var(--radius-xs); }

.bcp-hex {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--field-border);
  border-radius: var(--radius-sm);
  background: var(--field-bg);
  color: var(--field-text);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  text-transform: uppercase;
  outline: none;
  transition: border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.bcp-hex:focus {
  border-color: var(--field-border-focus);
  box-shadow: var(--shadow-pop-glow);
}
</style>
