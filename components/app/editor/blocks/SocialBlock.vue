<script setup lang="ts">
// SocialBlock — a row of social icon links. Render shows circular icon chips;
// Inspect edits a list of {platform, url} rows. The sent email uses MJML's
// <mj-social> built-in brand icons (server compile); the canvas preview draws
// the simplified glyphs below.
import { computed } from "vue";

export interface SocialLink { platform: string; url: string }
interface Props {
  mode: "render" | "inspect";
  blockProps: { links: SocialLink[]; align: "left" | "center" | "right" };
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: "update", patch: Partial<Props["blockProps"]>): void }>();

// platform → { label, mjml name, preview icon path }. `mjml` maps to the
// <mj-social-element name>; the server uses MJML's hosted brand icon.
const PLATFORMS: Record<string, { label: string; icon: string }> = {
  x: { label: "X / Twitter", icon: "M5 5l14 14M19 5L5 19" },
  instagram: { label: "Instagram", icon: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4z M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17.5 6.5h.01" },
  facebook: { label: "Facebook", icon: "M14 8h2.5V5H14a3 3 0 0 0-3 3v2H9v3h2v6h3v-6h2l.5-3H14V8z" },
  linkedin: { label: "LinkedIn", icon: "M6 9v9M6 6v.01M10 18v-5a2 2 0 0 1 4 0v5M10 18v-9" },
  youtube: { label: "YouTube", icon: "M3 8.5a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z M10.5 9.5l5 2.5-5 2.5z" },
};
const PLATFORM_OPTIONS = Object.entries(PLATFORMS).map(([value, p]) => ({ value, label: p.label }));

const links = computed<SocialLink[]>(() => props.blockProps.links || []);
const justify = computed(() =>
  props.blockProps.align === "left" ? "flex-start" : props.blockProps.align === "right" ? "flex-end" : "center",
);
function iconFor(platform: string) { return PLATFORMS[platform]?.icon || PLATFORMS.x.icon; }

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}
function setLink(i: number, key: keyof SocialLink, v: string) {
  const next = links.value.map((l, idx) => (idx === i ? { ...l, [key]: v } : l));
  patch("links", next);
}
function addLink() {
  // Pick the first platform not already used, else default to x.
  const used = new Set(links.value.map((l) => l.platform));
  const next = Object.keys(PLATFORMS).find((p) => !used.has(p)) || "x";
  patch("links", [...links.value, { platform: next, url: "https://" }]);
}
function removeLink(i: number) {
  patch("links", links.value.filter((_, idx) => idx !== i));
}
</script>

<template>
  <!-- RENDER -->
  <div v-if="mode === 'render'" class="soc-render" :style="{ justifyContent: justify }">
    <span v-if="!links.length" class="soc-empty">Add social links in the inspector →</span>
    <a
      v-for="(l, i) in links"
      :key="i"
      class="soc-chip"
      :href="l.url || '#'"
      :aria-label="PLATFORMS[l.platform]?.label || l.platform"
      @click.prevent
    >
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path :d="iconFor(l.platform)" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
  </div>

  <!-- INSPECT -->
  <div v-else class="soc-inspect">
    <div v-for="(l, i) in links" :key="i" class="soc-row">
      <SelectInput
        :model-value="l.platform"
        :options="PLATFORM_OPTIONS"
        aria-label="Platform"
        @update:model-value="(v: string) => setLink(i, 'platform', v)"
      />
      <input
        type="url"
        class="ins-input"
        placeholder="https://…"
        :value="l.url"
        @input="setLink(i, 'url', ($event.target as HTMLInputElement).value)"
      />
      <button type="button" class="soc-del" aria-label="Remove link" @click="removeLink(i)">×</button>
    </div>
    <button type="button" class="soc-add" @click="addLink">+ Add link</button>

    <div class="ins-row">
      <span class="ins-label">Align</span>
      <SegmentedControl
        :options="[{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }, { label: 'Right', value: 'right' }]"
        aria-label="Align"
        :model-value="blockProps.align"
        @update:model-value="(v: string) => patch('align', v)"
      />
    </div>
  </div>
</template>

<style scoped>
.soc-render { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.soc-empty { font-size: var(--text-sm); color: var(--color-ink-dim); }
.soc-chip {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: var(--radius-pill);
  background: var(--color-ink); color: var(--color-surface);
  transition: background var(--dur-fast) var(--ease-out);
}
.soc-chip:hover { background: var(--color-pop); }

.soc-inspect { display: grid; gap: var(--space-3); }
.soc-row { display: grid; grid-template-columns: 1fr 1.4fr auto; gap: var(--space-2); align-items: center; }
.soc-del {
  width: 28px; height: 28px; border: 1px solid var(--color-rule); border-radius: var(--radius-sm);
  background: var(--color-surface); color: var(--color-ink-dim); cursor: pointer; font-size: var(--text-lg); line-height: 1;
}
.soc-del:hover { color: var(--color-danger); border-color: var(--color-danger); }
.soc-add {
  justify-self: start; border: 1px dashed var(--color-rule-strong); background: none;
  color: var(--color-ink-soft); border-radius: var(--radius-sm); padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm); font-weight: 600; cursor: pointer;
}
.soc-add:hover { border-color: var(--color-pop); color: var(--color-pop-deep); }
</style>
