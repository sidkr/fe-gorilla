<script setup lang="ts">
// ProductBlock — an ecommerce product card: image, name, price, and a CTA.
// Manual entry for now; pulling from a connected Shopify/Woo store is a
// follow-up (needs the store integration API). Render = the card; Inspect =
// the fields.
interface Props {
  mode: "render" | "inspect";
  blockProps: {
    image: string;
    alt: string;
    name: string;
    price: string;
    buttonLabel: string;
    buttonHref: string;
    align: "left" | "center" | "right";
  };
}
const props = defineProps<Props>();
const emit = defineEmits<{ (e: "update", patch: Partial<Props["blockProps"]>): void }>();

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}
</script>

<template>
  <!-- RENDER -->
  <div v-if="mode === 'render'" class="pr-render" :style="{ textAlign: blockProps.align }">
    <div class="pr-card">
      <img v-if="blockProps.image" class="pr-img" :src="blockProps.image" :alt="blockProps.alt" />
      <div v-else class="pr-img pr-img--empty" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>
      </div>
      <p class="pr-name">{{ blockProps.name || "Product name" }}</p>
      <p class="pr-price">{{ blockProps.price || "$0.00" }}</p>
      <span class="pr-btn">{{ blockProps.buttonLabel || "Shop now" }}</span>
    </div>
  </div>

  <!-- INSPECT -->
  <div v-else class="pr-inspect">
    <label class="ins-row">
      <span class="ins-label">Image URL</span>
      <input type="url" class="ins-input" placeholder="https://…" :value="blockProps.image" @input="patch('image', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="ins-row">
      <span class="ins-label">Alt text</span>
      <input type="text" class="ins-input" placeholder="Describe the image" :value="blockProps.alt" @input="patch('alt', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="ins-row">
      <span class="ins-label">Product name</span>
      <input type="text" class="ins-input" placeholder="Heavyweight tee" :value="blockProps.name" @input="patch('name', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="ins-row">
      <span class="ins-label">Price</span>
      <input type="text" class="ins-input" placeholder="$48.00" :value="blockProps.price" @input="patch('price', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="ins-row">
      <span class="ins-label">Button label</span>
      <input type="text" class="ins-input" placeholder="Shop now" :value="blockProps.buttonLabel" @input="patch('buttonLabel', ($event.target as HTMLInputElement).value)" />
    </label>
    <label class="ins-row">
      <span class="ins-label">Button link</span>
      <input type="url" class="ins-input" placeholder="https://…" :value="blockProps.buttonHref" @input="patch('buttonHref', ($event.target as HTMLInputElement).value)" />
    </label>
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
.pr-card { display: inline-block; max-width: 280px; }
.pr-img { display: block; width: 100%; height: auto; border-radius: var(--radius-sm); }
.pr-img--empty {
  display: flex; align-items: center; justify-content: center; aspect-ratio: 1/1;
  background: var(--color-surface-sunk); border: 1.5px dashed var(--color-rule-strong); color: var(--color-ink-dim);
}
.pr-name { margin: var(--space-3) 0 var(--space-1); font-family: var(--font-display); font-weight: 700; font-size: var(--text-md); color: var(--color-ink); }
.pr-price { margin: 0 0 var(--space-3); font-family: var(--font-body); font-weight: 600; color: var(--color-pop-deep); }
.pr-btn {
  display: inline-block; padding: var(--space-2) var(--space-4); border-radius: var(--radius-md);
  background: var(--color-pop); color: var(--color-ink-on-pop); font-weight: 600; font-size: var(--text-sm);
}
.pr-inspect { display: grid; gap: var(--space-4); }
</style>
