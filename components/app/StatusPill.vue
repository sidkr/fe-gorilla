<script setup>
// StatusPill — small rounded status badge for campaign states.
// Public API is unchanged: a single `status` string drives the color.
// We now render via the shared <Pill> primitive, mapping each status to a
// tone that mirrors the previous hand-rolled colors as closely as possible:
//   - sent      → brand   (coral / pop)
//   - draft     → neutral  (muted ink-soft on sunk surface)
//   - scheduled → success (green, matches the old --color-ok treatment)
//   - sending   → info
//   - failed    → danger
// Unknown values fall through to the neutral "draft" treatment so we never
// blow up on bad data while the Parse pipeline isn't fully wired.
import { computed } from "vue";

const props = defineProps({
  status: { type: String, required: true },
});

const TONE_BY_STATUS = {
  sent: "brand",
  draft: "neutral",
  scheduled: "success",
  sending: "info",
  failed: "danger",
};

const tone = computed(() => TONE_BY_STATUS[props.status] || "neutral");

const label = computed(() => {
  if (!props.status) return "";
  return props.status.charAt(0).toUpperCase() + props.status.slice(1);
});
</script>

<template>
  <Pill :tone="tone">{{ label }}</Pill>
</template>
