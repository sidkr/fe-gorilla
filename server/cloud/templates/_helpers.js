// ─────────────────────────────────────────────────────────────────────────────
// Shared block builders for system email templates. CommonJS.
//
// Every per-category template file (newsletters.js, promotions.js, …) imports
// these so the whole library produces blocks in the ONE shape the editor +
// server compiler understand. The block schema is defined in
// components/app/editor/blocks/registry.ts — keep these in sync with it.
//
// Block prop contracts (use EXACTLY these prop names — the editor + MJML
// compiler read them):
//   heading   { text, level: 1|2|3, align: "left"|"center"|"right", color: "#hex" }
//   paragraph { html: "<plain text>", align, color }   // plain text; HTML is escaped
//   image     { src, alt, width: <number px>, align, linkHref }
//   button    { label, href, bg: "#hex", fg: "#hex", align, radius: <number px> }
//   divider   { color: "#hex", thickness: 1|2|4 }
//   spacer    { height: 8|16|24|32|48 }
//   footer    { businessAddress, showUnsubscribe: bool, showWebVersion: bool }
// ─────────────────────────────────────────────────────────────────────────────

// Short stable block id (b_ + 5 base62 chars). Mirrors registry.makeBlockId().
function blockId() {
  return `b_${Math.random().toString(36).slice(2, 7)}`;
}

function block(type, props) {
  return { id: blockId(), type, props };
}

// CAN-SPAM footer — every template ends with one so a forked campaign is
// send-ready. Pass an address line; defaults to the legal placeholder.
function footerBlock(businessAddress) {
  return block("footer", {
    businessAddress: businessAddress || "[Your business address — required by law]",
    showUnsubscribe: true,
    showWebVersion: true,
  });
}

// Wrap an array of blocks in the canonical Body envelope.
function body(blocks) {
  return { version: 1, blocks };
}

module.exports = { blockId, block, footerBlock, body };
