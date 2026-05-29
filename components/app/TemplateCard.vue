<script setup>
// TemplateCard — a single card on /app/templates.
// The thumbnail is an inline SVG whose shape varies per template (selected
// by `id` via the renderer in the parent). The card owns the surrounding
// chrome: white surface, hover border, name + tag chip, and meta row.
//
// Click target wraps the whole card via NuxtLink so the entire surface is
// keyboard-focusable. The destination `/app/templates/{id}/edit` does not
// exist yet — that's intentional; the editor route lands in a later phase.
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
  <NuxtLink :to="to" class="tpl-card">
    <!-- Thumbnail surface. The actual stylized email layout SVG is rendered
         via the named slot so each template can supply its own shape. -->
    <div class="tpl-card-thumb">
      <slot name="thumb" />
    </div>

    <!-- Body: name + tag chip, meta line -->
    <div class="tpl-card-body">
      <div class="tpl-card-head">
        <h3 class="tpl-card-name">{{ name }}</h3>
        <span class="tpl-card-tag">{{ tagLabel }}</span>
      </div>
      <p class="tpl-card-meta">{{ metaLine }}</p>
    </div>
  </NuxtLink>
</template>

<style scoped>
.tpl-card {
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  text-decoration: none;
  color: inherit;
  transition: border-color var(--dur-base) var(--ease-out),
              box-shadow var(--dur-base) var(--ease-out),
              transform var(--dur-fast) var(--ease-out);
}
.tpl-card:hover {
  border-color: var(--color-pop);
  box-shadow: var(--shadow-md);
}
.tpl-card:focus-visible {
  outline: none;
  border-color: var(--color-pop);
  box-shadow: var(--shadow-pop-glow);
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
.tpl-card-tag {
  flex: none;
  padding: var(--space-1) var(--space-3);
  background: var(--color-pop-bg);
  color: var(--color-pop-deep);
  border-radius: var(--radius-pill);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: var(--tracking-wide);
  line-height: 1.2;
  white-space: nowrap;
}
.tpl-card-meta {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-ink-soft);
  font-variant-numeric: tabular-nums;
}
</style>
