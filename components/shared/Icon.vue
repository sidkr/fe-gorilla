<script setup lang="ts">
// Shared icon renderer. Pulls inner SVG markup from the central ICONS registry
// (components/shared/icons.ts) and renders it on a 24x24 viewBox. Color is
// inherited via `currentColor`, so callers set `color` on the element (or a
// parent). Size accepts a named token ("sm"|"md"|"lg") or an explicit px number.
//
// Note on v-html: the markup comes only from our local, trusted ICONS registry
// (never user input), so injecting it is safe here.
import { computed } from "vue";
import { ICONS, type IconName } from "./icons";

const props = withDefaults(
  defineProps<{
    name: IconName;
    /** "sm"=16, "md"=20, "lg"=24, or an explicit pixel number. */
    size?: number | "sm" | "md" | "lg";
    /** Accessible label. When omitted, the icon is aria-hidden (decorative). */
    label?: string;
  }>(),
  {
    size: "md",
    label: undefined,
  },
);

const SIZES = { sm: 16, md: 20, lg: 24 } as const;

const px = computed(() =>
  typeof props.size === "number" ? props.size : SIZES[props.size],
);

const markup = computed(() => ICONS[props.name]);

if (import.meta.dev) {
  if (!markup.value) {
    // eslint-disable-next-line no-console
    console.warn(`[Icon] unknown icon name: "${props.name}"`);
  }
}
</script>

<template>
  <svg
    v-if="markup"
    viewBox="0 0 24 24"
    :width="px"
    :height="px"
    role="img"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    xmlns="http://www.w3.org/2000/svg"
    v-html="markup"
  />
</template>

<style scoped>
svg {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
  color: inherit;
}
</style>
