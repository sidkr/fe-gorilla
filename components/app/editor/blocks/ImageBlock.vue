<script setup lang="ts">
// ImageBlock — URL-only in MVP (no upload pipeline; see Editor.md §2).
//
// Empty-state path: when `src` is empty, the render shows a dashed
// placeholder with a click-to-edit affordance. Clicking the placeholder
// reveals an inline URL field + Insert button so the user can paste a
// URL without making the round-trip to the inspector. The inspector's
// image controls still work as the canonical path.
import { computed, nextTick, ref, watch } from "vue";

interface Props {
  mode: "render" | "inspect";
  blockProps: {
    src: string;
    alt: string;
    width: number;
    align: "left" | "center" | "right";
    linkHref?: string;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
}>();

const failed = ref(false);
watch(
  () => props.blockProps.src,
  () => {
    failed.value = false;
  },
);

const styleVars = computed(() => ({
  "--img-width": `${props.blockProps.width}px`,
  "--img-align": props.blockProps.align === "left"
    ? "flex-start"
    : props.blockProps.align === "right"
      ? "flex-end"
      : "center",
}));

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}

// ── Inline URL input (render mode, empty-state) ──────────────────────────
const inlineOpen = ref(false);
const inlineUrl = ref("");
// The inline field is a shared <TextInput> whose root element IS the <input>,
// so capture that DOM node via a function ref for focus()/select().
const inlineInput = ref<HTMLInputElement | null>(null);
function setInlineInput(el: unknown) {
  inlineInput.value = (el && (el as { $el?: HTMLInputElement }).$el)
    ? (el as { $el: HTMLInputElement }).$el
    : (el as HTMLInputElement | null);
}

async function openInline(e?: Event) {
  e?.stopPropagation();
  inlineUrl.value = props.blockProps.src ?? "";
  inlineOpen.value = true;
  await nextTick();
  inlineInput.value?.focus();
  inlineInput.value?.select();
}

function cancelInline(e?: Event) {
  e?.stopPropagation();
  inlineOpen.value = false;
  inlineUrl.value = "";
}

function commitInline(e?: Event) {
  e?.stopPropagation();
  const v = inlineUrl.value.trim();
  if (v) patch("src", v);
  inlineOpen.value = false;
}
</script>

<template>
  <div v-if="mode === 'render'" class="img-render" :style="styleVars">
    <div class="img-wrap">
      <img
        v-if="blockProps.src && !failed"
        :src="blockProps.src"
        :alt="blockProps.alt"
        :width="blockProps.width"
        @error="failed = true"
      />
      <!-- Empty-state placeholder with click-to-edit. -->
      <template v-else>
        <button
          v-if="!inlineOpen"
          type="button"
          class="img-empty"
          :class="{ 'img-empty--failed': failed }"
          @click="openInline"
        >
          <svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
            <path
              d="M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linejoin="round"
            />
          </svg>
          <span class="img-empty-label">
            {{ failed ? "Image failed to load" : "Click to add image" }}
          </span>
          <span class="img-empty-sub">
            {{ failed ? "Try a different URL." : "Paste a URL or browse your library" }}
          </span>
        </button>
        <div v-else class="img-inline" @click.stop>
          <TextInput
            :ref="setInlineInput"
            type="url"
            size="sm"
            placeholder="https://…"
            v-model="inlineUrl"
            @keydown.enter.prevent="commitInline"
            @keydown.escape.prevent="cancelInline"
          />
          <Button variant="primary" size="sm" type="button" @click="commitInline">
            Insert
          </Button>
          <Button variant="subtle" size="sm" type="button" @click="cancelInline">
            Cancel
          </Button>
        </div>
      </template>
    </div>
  </div>

  <div v-else class="img-inspect">
    <label class="ins-row">
      <span class="ins-label">Source URL</span>
      <input
        type="url"
        class="ins-input"
        placeholder="https://…"
        :value="blockProps.src"
        @input="patch('src', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="ins-row">
      <span class="ins-label">Alt text</span>
      <input
        type="text"
        class="ins-input"
        placeholder="Describe the image"
        :value="blockProps.alt"
        @input="patch('alt', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="ins-row">
      <span class="ins-label">Width <em class="ins-units">{{ blockProps.width }}px</em></span>
      <input
        type="range"
        class="ins-range"
        min="100"
        max="600"
        step="10"
        :value="blockProps.width"
        @input="patch('width', Number(($event.target as HTMLInputElement).value))"
      />
    </label>

    <div class="ins-row">
      <span class="ins-label">Align</span>
      <div class="ins-segmented" role="group">
        <button
          v-for="a in ['left', 'center', 'right'] as const"
          :key="a"
          type="button"
          :class="['ins-seg', { active: blockProps.align === a }]"
          @click="patch('align', a)"
        >
          {{ a }}
        </button>
      </div>
    </div>

    <label class="ins-row">
      <span class="ins-label">Link URL (optional)</span>
      <input
        type="url"
        class="ins-input"
        placeholder="https://…"
        :value="blockProps.linkHref ?? ''"
        @input="patch('linkHref', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<style scoped>
.img-render {
  display: flex;
  justify-content: var(--img-align);
}
.img-wrap {
  max-width: 100%;
  width: var(--img-width);
}
.img-wrap img {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: var(--radius-xs);
}

/* Empty-state placeholder. Aspect ratio matches the default 600×280 so
   the dropped-but-unfilled block doesn't suddenly collapse to nothing. */
.img-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  aspect-ratio: 2.14 / 1;
  width: 100%;
  background: var(--color-surface-sunk);
  border: 1.5px dashed var(--color-rule-strong);
  border-radius: var(--radius-sm);
  color: var(--color-ink-dim);
  font-family: var(--font-body);
  cursor: pointer;
  padding: var(--space-4);
  transition: border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.img-empty:hover {
  border-color: var(--color-pop);
  color: var(--color-pop-deep);
}
.img-empty--failed {
  border-color: var(--color-warn);
  color: var(--color-warn);
}
.img-empty-label {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-ink);
}
.img-empty-sub {
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
}

.img-inline {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--color-surface);
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-xs);
}
/* The inline URL field (shared <TextInput>) flexes to fill the row; the
   Insert/Cancel buttons keep their intrinsic width. */
.img-inline > :first-child {
  flex: 1;
  min-width: 0;
}

.img-inspect { display: grid; gap: var(--space-4); }
</style>
