<script setup lang="ts">
// SpacerBlock — vertical gap. In the canvas it is invisible by default
// so the reserved height reads as quiet whitespace. On hover or when
// the block is selected, dashed lines at the top + bottom of the spacer
// surface its boundaries plus a "Spacer · Npx" label so the user can
// see what they're editing.
//
// The visualization is driven by the `hovered` / `selected` prop, both
// of which are passed in from EditorCanvas (the canvas owns the
// hover/selected state and knows when to surface chrome).
import { computed } from "vue";

interface Props {
  mode: "render" | "inspect";
  // Render-mode only. Either flag turns on the dashed-band + label.
  hovered?: boolean;
  selected?: boolean;
  blockProps: {
    height: number;
  };
}

const props = withDefaults(defineProps<Props>(), { hovered: false, selected: false });
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
}>();

const styleVars = computed(() => ({
  "--spacer-height": `${props.blockProps.height}px`,
}));

const showChrome = computed(() => props.hovered || props.selected);

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}
</script>

<template>
  <div
    v-if="mode === 'render'"
    :class="['spacer-render', { 'spacer-render--chrome': showChrome }]"
    :style="styleVars"
  >
    <span class="spacer-line spacer-line--top" aria-hidden="true"></span>
    <span class="spacer-label">Spacer · {{ blockProps.height }}px</span>
    <span class="spacer-line spacer-line--bot" aria-hidden="true"></span>
  </div>

  <div v-else class="spacer-inspect">
    <label class="ins-row">
      <span class="ins-label">Height <em class="ins-units">{{ blockProps.height }}px</em></span>
      <input
        type="range"
        class="ins-range"
        min="4"
        max="96"
        step="2"
        :value="blockProps.height"
        @input="patch('height', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>
</template>

<style scoped>
.spacer-render {
  position: relative;
  height: var(--spacer-height);
  width: 100%;
}

/* Lines + label are present in the DOM but transparent until the
   block is hovered or selected. Keeps the compiled-output approximation
   (just transparent height) the default state. */
.spacer-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--color-rule-strong);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
}
.spacer-line--top { top: 0; }
.spacer-line--bot { bottom: 0; }

.spacer-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  background: var(--color-surface);
  padding: 0 var(--space-2);
  opacity: 0;
  transition: opacity var(--dur-fast) var(--ease-out);
  pointer-events: none;
  white-space: nowrap;
}

.spacer-render--chrome .spacer-line,
.spacer-render--chrome .spacer-label {
  opacity: 1;
}

.spacer-inspect { display: grid; gap: var(--space-4); }
</style>
