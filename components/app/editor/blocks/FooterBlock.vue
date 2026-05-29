<script setup lang="ts">
// FooterBlock — CAN-SPAM compliance: every email needs the sender's
// physical postal address + an opt-out link. The unsubscribe link
// itself is server-side substituted at send time (signed token); in
// the canvas it renders as a placeholder underlined "Unsubscribe".
//
// The footer cannot be deleted or duplicated by the user — see the
// BlockHoverToolbar and EditorShell.deleteBlock guards. The editor
// also auto-keeps the footer last (EditorShell.normalizeFooterPosition).
import { computed } from "vue";

interface Props {
  mode: "render" | "inspect";
  blockProps: {
    businessAddress: string;
    showUnsubscribe: boolean;
    showWebVersion: boolean;
  };
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "update", patch: Partial<Props["blockProps"]>): void;
}>();

function patch(k: keyof Props["blockProps"], v: unknown) {
  emit("update", { [k]: v } as Partial<Props["blockProps"]>);
}

// The placeholder reads as a real instruction; an unfilled placeholder
// should look like "you need to fill this", not like content.
const addressIsPlaceholder = computed(() => {
  const a = (props.blockProps.businessAddress ?? "").trim();
  return a.length === 0 || a.startsWith("{{") || a.startsWith("[");
});
</script>

<template>
  <!-- RENDER -->
  <div v-if="mode === 'render'" class="footer-render">
    <p
      :class="['footer-address', { 'footer-address--placeholder': addressIsPlaceholder }]"
    >
      {{ blockProps.businessAddress || "[Your business address — required by law]" }}
    </p>
    <p class="footer-links">
      <a v-if="blockProps.showWebVersion" class="footer-link" href="#" @click.prevent>
        View in browser
      </a>
      <span v-if="blockProps.showWebVersion && blockProps.showUnsubscribe" class="footer-sep">·</span>
      <a v-if="blockProps.showUnsubscribe" class="footer-link" href="#" @click.prevent>
        Unsubscribe
      </a>
    </p>
  </div>

  <!-- INSPECT -->
  <div v-else class="footer-inspect">
    <label class="ins-row">
      <span class="ins-label">Business address</span>
      <TextArea
        :rows="3"
        :model-value="blockProps.businessAddress"
        placeholder="Your business · Street, City, State ZIP, Country"
        @update:model-value="patch('businessAddress', $event)"
      />
      <span class="footer-helper">
        CAN-SPAM requires a physical postal address in every commercial email.
      </span>
    </label>

    <Checkbox class="ins-checkrow" :model-value="blockProps.showUnsubscribe" disabled>
      <span class="ins-checktext">
        <span class="ins-checklabel">Show "Unsubscribe" link</span>
        <span class="footer-helper">Required by CAN-SPAM. Cannot be turned off.</span>
      </span>
    </Checkbox>

    <Checkbox
      class="ins-checkrow"
      :model-value="blockProps.showWebVersion"
      @update:model-value="patch('showWebVersion', $event)"
    >
      <span class="ins-checktext">
        <span class="ins-checklabel">Show "View in browser" link</span>
        <span class="footer-helper">Optional. Helps recipients whose client mangles your layout.</span>
      </span>
    </Checkbox>
  </div>
</template>

<style scoped>
/* RENDER ---------------------------------------------------------------- */
.footer-render {
  text-align: center;
  padding: var(--space-3) 0;
}
.footer-address {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-style: italic;
  color: var(--color-ink-dim);
  line-height: var(--leading-snug);
}
.footer-address--placeholder {
  color: var(--color-ink-dim);
  font-style: italic;
}
.footer-links {
  margin: var(--space-2) 0 0;
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  line-height: var(--leading-snug);
}
.footer-link {
  color: var(--color-ink-dim);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.footer-link:hover {
  color: var(--color-ink-soft);
}
.footer-sep {
  display: inline-block;
  margin: 0 var(--space-1-5);
  color: var(--color-ink-dim);
}

/* INSPECT --------------------------------------------------------------- */
.footer-inspect { display: grid; gap: var(--space-4); }

.footer-helper {
  display: block;
  margin-top: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-ink-dim);
  font-weight: 400;
  text-transform: none;
  letter-spacing: var(--tracking-normal);
  line-height: var(--leading-snug);
}

/* Override the shared Checkbox's centered alignment so the box sits at the
   top of the multi-line label + helper stack. */
.ins-checkrow {
  align-items: flex-start;
}
.ins-checktext {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.ins-checklabel {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-ink);
}
</style>
