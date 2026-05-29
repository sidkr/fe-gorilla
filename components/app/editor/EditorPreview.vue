<script setup lang="ts">
// EditorPreview — modal containing an iframe with a quick HTML mirror of
// the current canvas. The *real* send-rendered preview is rendered from
// server-compiled HTML (Editor.md §8 → Send-rendered preview); that lands
// with the send pipeline. For MVP we generate a minimal HTML snapshot
// from the live body so the user can at least eyeball how their email
// will read at full width in isolation from the editing chrome.
//
// This is explicitly NOT the production rendering pipeline; a banner
// inside the modal flags it.
import { computed, ref, watch } from "vue";
import { type Body } from "./blocks/registry";
import {
  SAMPLE_CONTACT,
  resolveMergeTags,
  useMergeTags,
} from "~/composables/app/useMergeTags";

interface Props {
  open: boolean;
  body: Body;
  campaignName: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "close"): void }>();

// ── Sample-data preview ──────────────────────────────────────────────────
// When on, merge tags ({{firstName}} etc.) are resolved against a sample
// contact so the user sees what a real recipient would. CLIENT-SIDE only —
// the actual per-recipient substitution happens server-side at send time.
const useSampleData = ref(false);
const { customFields, loaded, loadTags } = useMergeTags();

// Load the custom-field defs once so {{custom.<key>}} tags resolve to a
// typed sample value rather than a bracket placeholder. Lazy on first open.
watch(
  () => props.open,
  (open) => {
    if (open && !loaded.value) void loadTags();
  },
  { immediate: true },
);

// Resolve merge tags in a string when the sample-data toggle is on; pass
// the value through untouched otherwise. Custom-field defs feed typed
// sample values; missing/unknown tokens show as "[token]".
function maybeResolve(s: unknown): string {
  const text = String(s ?? "");
  if (!useSampleData.value) return text;
  return resolveMergeTags(text, SAMPLE_CONTACT, {
    customFields: customFields.value,
    missing: "placeholder",
  });
}

function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderBlock(b: Body["blocks"][number]): string {
  const p = b.props as any;
  switch (b.type) {
    case "heading": {
      const tag = `h${p.level ?? 1}`;
      return `<${tag} style="margin:0;font-family:Manrope,sans-serif;font-weight:800;text-align:${escape(
        p.align,
      )};color:${escape(p.color)};">${escape(maybeResolve(p.text))}</${tag}>`;
    }
    case "paragraph": {
      return `<p style="margin:0;font-family:Inter,sans-serif;font-size:15px;line-height:1.6;text-align:${escape(
        p.align,
      )};color:${escape(p.color)};white-space:pre-wrap;">${escape(maybeResolve(p.html))}</p>`;
    }
    case "image": {
      const align =
        p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center";
      const inner = `<img src="${escape(p.src)}" alt="${escape(
        p.alt,
      )}" width="${p.width}" style="display:block;max-width:100%;height:auto;" />`;
      const wrapped = p.linkHref
        ? `<a href="${escape(p.linkHref)}">${inner}</a>`
        : inner;
      return `<div style="display:flex;justify-content:${align};">${wrapped}</div>`;
    }
    case "button": {
      const align =
        p.align === "left" ? "flex-start" : p.align === "right" ? "flex-end" : "center";
      return `<div style="display:flex;justify-content:${align};"><a href="${escape(
        p.href,
      )}" style="display:inline-block;padding:12px 24px;background:${escape(
        p.bg,
      )};color:${escape(p.fg)};border-radius:${
        p.radius
      }px;font-family:Manrope,sans-serif;font-weight:600;text-decoration:none;font-size:15px;">${escape(
        maybeResolve(p.label),
      )}</a></div>`;
    }
    case "divider": {
      return `<hr style="border:0;height:${p.thickness}px;background:${escape(
        p.color,
      )};margin:0;" />`;
    }
    case "spacer": {
      return `<div style="height:${p.height}px;"></div>`;
    }
    default:
      return "";
  }
}

const srcdoc = computed(() => {
  const inner = props.body.blocks.map(renderBlock).join('<div style="height:16px;"></div>');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#FBF8F7;font-family:Inter,system-ui,sans-serif;color:#18181B}
    .wrap{max-width:600px;margin:32px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #E5E5E7}
  </style></head><body><div class="wrap">${inner}</div></body></html>`;
});

function onBackdrop(e: MouseEvent) {
  if ((e.target as HTMLElement).classList.contains("pv-backdrop")) emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pv-backdrop" @click="onBackdrop">
      <div class="pv-modal" role="dialog" aria-label="Email preview">
        <header class="pv-head">
          <div>
            <span class="pv-eyebrow">Preview</span>
            <h2 class="pv-title">{{ campaignName || "Untitled campaign" }}</h2>
          </div>
          <div class="pv-head-actions">
            <Checkbox v-model="useSampleData">Preview with sample data</Checkbox>
            <Button variant="subtle" size="sm" aria-label="Close" @click="emit('close')">
              <Icon name="x" :size="18" />
            </Button>
          </div>
        </header>
        <p class="pv-note">
          <template v-if="useSampleData">
            Showing a <strong>sample contact</strong> ({{ SAMPLE_CONTACT.firstName }} {{ SAMPLE_CONTACT.lastName }}). Merge tags fill in per-recipient at send time; unknown tags show as <code>[tag]</code>.
          </template>
          <template v-else>
            Approximate preview rendered from the live canvas. Toggle "Preview with sample data" to resolve merge tags. Final cross-client rendering uses the server-side MJML compiler.
          </template>
        </p>
        <div class="pv-frame-wrap">
          <iframe
            class="pv-frame"
            :srcdoc="srcdoc"
            sandbox=""
            title="Email preview"
          ></iframe>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pv-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(24, 24, 27, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 900;
  padding: var(--space-5);
}
.pv-modal {
  width: 100%;
  max-width: 720px;
  height: min(90vh, 800px);
  background: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--color-rule);
}
.pv-eyebrow {
  display: block;
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--color-ink-dim);
}
.pv-title {
  margin: var(--space-1) 0 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 700;
}
.pv-head-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.pv-note {
  margin: 0;
  padding: var(--space-3) var(--space-5);
  font-size: var(--text-xs);
  color: var(--color-ink-soft);
  background: var(--color-surface-2);
  border-bottom: 1px solid var(--color-rule);
  line-height: var(--leading-snug);
}
.pv-note code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  color: var(--color-ink);
}

.pv-frame-wrap {
  flex: 1;
  background: var(--color-surface-sunk);
  overflow: hidden;
}
.pv-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--color-surface-2);
}
</style>
