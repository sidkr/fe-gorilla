<script setup lang="ts">
// ButtonBlock — CTA. The canvas renders it as a real-looking pill so
// the user gets immediate visual feedback when adjusting bg/fg/radius.
import { computed } from "vue";
import BrandColorPicker from "../BrandColorPicker.vue";

interface Props {
  mode: "render" | "inspect";
  blockProps: {
    label: string;
    href: string;
    bg: string;
    fg: string;
    align: "left" | "center" | "right";
    radius: number;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
}>();

const styleVars = computed(() => ({
  "--btn-bg": props.blockProps.bg,
  "--btn-fg": props.blockProps.fg,
  "--btn-radius": `${props.blockProps.radius}px`,
  "--btn-align": props.blockProps.align === "left"
    ? "flex-start"
    : props.blockProps.align === "right"
      ? "flex-end"
      : "center",
}));

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}
</script>

<template>
  <div v-if="mode === 'render'" class="btn-render" :style="styleVars">
    <!-- Anchor disabled inside the canvas (preventDefault on click) so
         users don't navigate away while editing. The compiled MJML
         output will produce a real anchor. -->
    <a class="btn-pill" :href="blockProps.href" @click.prevent>
      {{ blockProps.label }}
    </a>
  </div>

  <div v-else class="btn-inspect">
    <label class="ins-row">
      <span class="ins-label">Label</span>
      <input
        type="text"
        class="ins-input"
        :value="blockProps.label"
        @input="patch('label', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <label class="ins-row">
      <span class="ins-label">Link URL</span>
      <input
        type="url"
        class="ins-input"
        placeholder="https://…"
        :value="blockProps.href"
        @input="patch('href', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <div class="ins-row">
      <span class="ins-label">Background</span>
      <BrandColorPicker
        :model-value="blockProps.bg"
        @update:model-value="patch('bg', $event)"
      />
    </div>

    <div class="ins-row">
      <span class="ins-label">Text color</span>
      <BrandColorPicker
        :model-value="blockProps.fg"
        @update:model-value="patch('fg', $event)"
      />
    </div>

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
      <span class="ins-label">Corner radius <em class="ins-units">{{ blockProps.radius }}px</em></span>
      <input
        type="range"
        class="ins-range"
        min="0"
        max="24"
        step="1"
        :value="blockProps.radius"
        @input="patch('radius', Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>
</template>

<style scoped>
.btn-render {
  display: flex;
  justify-content: var(--btn-align);
}
.btn-pill {
  display: inline-block;
  padding: var(--space-3) var(--space-5);
  background: var(--btn-bg);
  color: var(--btn-fg);
  border-radius: var(--btn-radius);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: var(--text-md);
  text-decoration: none;
  cursor: pointer;
  user-select: none;
}
.btn-inspect { display: grid; gap: var(--space-4); }
</style>
