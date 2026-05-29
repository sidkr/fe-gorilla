<script setup>
// TemplateCard — a single card on /app/templates.
// The thumbnail is an inline SVG whose shape varies per template (selected
// by `id` via the renderer in the parent). The surrounding chrome now comes
// from the shared <Card> primitive (interactive, navigates via `to`); we use
// padding="none" so the thumbnail can bleed edge-to-edge and supply the body
// padding ourselves.
//
// The destination `/app/templates/{id}/edit` does not exist yet — that's
// intentional; the editor route lands in a later phase.
import { computed } from "vue";

const props = defineProps({
  id:         { type: String, required: true },
  name:       { type: String, required: true },
  kind:       { type: String, required: true },   // "standard" | "saved"
  lastEdited: { type: String, required: true },
  relative:   { type: String, required: true },
  usedIn:     { type: Number, required: true },
});

const to = computed(() => `/app/templates/${props.id}/edit`);

const tagLabel = computed(() => (props.kind === "standard" ? "Standard" : "Saved"));

// Build the meta line. Standard templates show "Default · Used in N campaigns"
// (no edit date / relative timestamp — they're system-owned), saved
// templates show the full "Last edited <date> · Used in N campaigns".
const metaLine = computed(() => {
  const used = `Used in ${props.usedIn} campaign${props.usedIn === 1 ? "" : "s"}`;
  if (props.kind === "standard") {
    return `Default · ${used}`;
  }
  return `Last edited ${props.lastEdited} · ${used}`;
});
</script>

<template>
  <Card :interactive="true" :to="to" padding="none" class="tpl-card">
    <!-- Thumbnail surface. The actual stylized email layout SVG is rendered
         via the named slot so each template can supply its own shape. -->
    <div class="tpl-card-thumb">
      <slot name="thumb" />
    </div>

    <!-- Body: name + tag chip, meta line -->
    <div class="tpl-card-body">
      <div class="tpl-card-head">
        <h3 class="tpl-card-name">{{ name }}</h3>
        <Pill tone="brand">{{ tagLabel }}</Pill>
      </div>
      <p class="tpl-card-meta">{{ metaLine }}</p>
    </div>
  </Card>
</template>

<style scoped>
/* Card chrome (surface, border, radius, shadow, hover, focus) now comes from
   the shared <Card> primitive. With padding="none" the body holds the
   thumbnail + text stack; clip its corners so the thumbnail respects the
   card radius. */
.tpl-card :deep(.card__body) {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: inherit;
}

/* Thumbnail — fixed 3:4 ratio so the gallery reads as a uniform grid even
   though each SVG inside has a different layout. */
.tpl-card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-rule);
  overflow: hidden;
}
.tpl-card-thumb :slotted(svg) {
  display: block;
  width: 100%;
  height: 100%;
}

/* Body */
.tpl-card-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  min-width: 0;
}
.tpl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-3);
  min-width: 0;
}
.tpl-card-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  color: var(--color-ink);
  min-width: 0;
  overflow-wrap: anywhere;
}
.tpl-card-meta {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  font-variant-numeric: tabular-nums;
}
</style>
