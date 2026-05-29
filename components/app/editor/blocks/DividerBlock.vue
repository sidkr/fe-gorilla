<script setup lang="ts">
// DividerBlock — horizontal rule. The block has its own padding so it
// reads as a discrete element when selected, even though the rendered
// rule itself is just 1–8px tall.
//
// On hover or selection, a small floating "Divider" label appears just
// above the rule so the user can tell what's selected (canvas-polish §8) —
// the horizontal-rule visual alone gives no indication.
import { computed } from "vue";
import BrandColorPicker from "../BrandColorPicker.vue";

interface Props {
  mode: "render" | "inspect";
  // Render-mode only. Either flag turns on the floating label.
  hovered?: boolean;
  selected?: boolean;
  blockProps: {
    color: string;
    thickness: number;
  };
}

const props = withDefaults(defineProps<Props>(), { hovered: false, selected: false });
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
}>();

const styleVars = computed(() => ({
  "--rule-color": props.blockProps.color,
  "--rule-thickness": `${props.blockProps.thickness}px`,
}));

const showChrome = computed(() => props.hovered || props.selected);

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}
</script>

<template>
  <div
    v-if="mode === 'render'"
    :class="['rule-render', { 'rule-render--chrome': showChrome }]"
    :style="styleVars"
  >
    <span class="rule-label">Divider</span>
    <hr />
  </div>

  <div v-else class="rule-inspect">
    <div class="ins-row">
      <span class="ins-label">Color</span>
      <BrandColorPicker
        :model-value="blockProps.color"
        @update:model-value="patch('color', $event)"
      />
    </div>

    <label class="ins-row">
      <span class="ins-label">Thickness <em class="ins-units">{{ blockProps.thickness }}px</em></span>
      <input
        type="range"
        class="ins-range"
        min="1"
        max="8"
        step="1"
        :value="blockProps.thickness"
        @input="patch('thickness', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>
</template>

<style scoped>
.rule-render {
  position: relative;
}
.rule-render hr {
  border: 0;
  height: var(--rule-thickness);
  background: var(--rule-color);
  margin: 0;
}
.rule-label {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  margin-bottom: var(--space-1);
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
.rule-render--chrome .rule-label {
  opacity: 1;
}
.rule-inspect { display: grid; gap: var(--space-4); }
</style>
