<script setup>
// AppTemplatePreview — a presentational, NON-interactive miniature email.
//
// Renders a Template/Campaign `body.blocks` array (see
// components/app/editor/blocks/registry.ts → Body) as a realistic mini email:
// a white ~600px-wide email card with each block mapped to styled HTML. It is
// laid out at full email width (600px) then scaled down with `transform:
// scale(...)` to fill its container, anchored to the TOP, so it sits inside a
// card thumbnail showing the top of the email — like a real client preview.
//
// Pure CSS/HTML (no iframe) so ~49 of these on one page stay cheap. Text is
// escaped before insertion to avoid any injection from template content.
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  // The email content width we render at before scaling. 600px is the email
  // de-facto standard and matches the block schema's image defaults.
  contentWidth: { type: Number, default: 600 },
});

// ── Scale-to-fit ─────────────────────────────────────────────────────────────
// We render the email at `contentWidth` and scale the whole sheet so its width
// matches the wrapper. transform-origin top center keeps the email's top edge
// pinned; the wrapper clips the overflow (the rest of the email below the fold).
const wrap = ref(null);
const scale = ref(0.25);
let ro = null;

function measure() {
  const el = wrap.value;
  if (!el) return;
  const w = el.clientWidth;
  if (w > 0) scale.value = w / props.contentWidth;
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(measure);
    ro.observe(wrap.value);
  }
});
onBeforeUnmount(() => {
  if (ro) ro.disconnect();
});

// ── Escaping ─────────────────────────────────────────────────────────────────
// Block text (heading.text, paragraph.html) is PLAIN text, not real HTML, so we
// escape it. Paragraph keeps newlines as <br> for plain-text-style emails.
function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphHtml(text) {
  return esc(text).replace(/\n/g, "<br>");
}

// ── Per-block style helpers ──────────────────────────────────────────────────
function alignOf(p) {
  const a = p && p.align;
  return a === "center" || a === "right" ? a : "left";
}

function headingStyle(p) {
  const level = Number(p && p.level) || 1;
  const size = level === 1 ? 30 : level === 2 ? 23 : 18;
  return {
    margin: "0",
    padding: "8px 0",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontWeight: "700",
    lineHeight: "1.25",
    fontSize: `${size}px`,
    textAlign: alignOf(p),
    color: (p && p.color) || "#1A1A1A",
  };
}

function paragraphStyle(p) {
  return {
    margin: "0",
    padding: "6px 0",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: "15px",
    lineHeight: "1.6",
    textAlign: alignOf(p),
    color: (p && p.color) || "#1A1A1A",
  };
}

function imageWrapStyle(p) {
  const a = alignOf(p);
  return {
    padding: "8px 0",
    textAlign: a,
  };
}

function imageStyle(p) {
  const w = Number(p && p.width) || 600;
  const max = Math.min(w, props.contentWidth);
  return {
    display: "inline-block",
    width: `${max}px`,
    maxWidth: "100%",
    height: "auto",
    border: "0",
    verticalAlign: "top",
  };
}

function buttonRowStyle(p) {
  return {
    padding: "10px 0",
    textAlign: alignOf(p),
  };
}

function buttonStyle(p) {
  return {
    display: "inline-block",
    padding: "12px 24px",
    fontFamily: "Helvetica, Arial, sans-serif",
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "1",
    background: (p && p.bg) || "#FF4E4E",
    color: (p && p.fg) || "#FFFFFF",
    borderRadius: `${Number(p && p.radius) || 0}px`,
  };
}

function dividerStyle(p) {
  return {
    border: "none",
    borderTop: `${Number(p && p.thickness) || 1}px solid ${(p && p.color) || "#E5E5E7"}`,
    margin: "12px 0",
  };
}

function spacerStyle(p) {
  return { height: `${Number(p && p.height) || 0}px`, lineHeight: "0" };
}

function footerLinks(p) {
  const links = [];
  if (p && p.showWebVersion) links.push("View in browser");
  if (p && p.showUnsubscribe) links.push("Unsubscribe");
  return links.join(" · ");
}
</script>

<template>
  <div ref="wrap" class="tpre-wrap" aria-hidden="true">
    <div
      class="tpre-sheet"
      :style="{ width: contentWidth + 'px', transform: `scale(${scale})` }"
    >
      <div class="tpre-email">
        <template v-for="(b, i) in blocks" :key="b && b.id ? b.id : i">
          <h2
            v-if="b && b.type === 'heading'"
            :style="headingStyle(b.props || {})"
            v-html="esc((b.props || {}).text)"
          />
          <p
            v-else-if="b && b.type === 'paragraph'"
            :style="paragraphStyle(b.props || {})"
            v-html="paragraphHtml((b.props || {}).html)"
          />
          <div v-else-if="b && b.type === 'image'" :style="imageWrapStyle(b.props || {})">
            <img
              :src="(b.props || {}).src"
              :alt="''"
              :style="imageStyle(b.props || {})"
              loading="lazy"
            />
          </div>
          <div v-else-if="b && b.type === 'button'" :style="buttonRowStyle(b.props || {})">
            <span :style="buttonStyle(b.props || {})">{{ (b.props || {}).label }}</span>
          </div>
          <hr v-else-if="b && b.type === 'divider'" :style="dividerStyle(b.props || {})" />
          <div v-else-if="b && b.type === 'spacer'" :style="spacerStyle(b.props || {})" />
          <div v-else-if="b && b.type === 'footer'" class="tpre-footer">
            <div class="tpre-footer-addr">{{ (b.props || {}).businessAddress }}</div>
            <div v-if="footerLinks(b.props || {})" class="tpre-footer-links">
              {{ footerLinks(b.props || {}) }}
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* The wrapper fills the card thumbnail area and clips the scaled email to the
   top. pointer-events:none makes the whole preview non-interactive. */
.tpre-wrap {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f3f3f4;
  pointer-events: none;
  user-select: none;
}

/* Rendered at full email width, then scaled to fill the wrapper. Scale is
   clientWidth / contentWidth, so the scaled sheet width equals the wrapper
   width exactly — anchoring the top-LEFT corner makes it fill edge-to-edge
   (i.e. perfectly centered). `margin: 0 auto` does NOT center an element wider
   than its container, which left the scaled preview shifted right. */
.tpre-sheet {
  transform-origin: top left;
}

/* The white "email" card — ~600px content with comfortable padding. */
.tpre-email {
  box-sizing: border-box;
  width: 100%;
  padding: 28px 32px;
  background: #ffffff;
}

.tpre-footer {
  padding: 16px 0 4px;
  text-align: center;
  font-family: Helvetica, Arial, sans-serif;
  color: #8e8e93;
}
.tpre-footer-addr {
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
}
.tpre-footer-links {
  margin-top: 6px;
  font-size: 12px;
  text-decoration: underline;
}
</style>
