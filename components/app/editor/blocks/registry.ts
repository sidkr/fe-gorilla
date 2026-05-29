// Block registry — the single source of truth for which block types exist
// and how each one renders / inspects / compiles. Adding a new block type
// (e.g. Columns later) is one entry here plus one .vue file.
//
// The registry is intentionally simple: a plain object keyed by BlockType.
// EditorCanvas, EditorInspector and the (future) compiler all index into it
// instead of switching on the type string.
//
// `compileMjml` ships in both client and server bundles — it's a pure
// function with no I/O. The security boundary is server-side beforeSave;
// the client copy is just here so future client-side dry-runs / debug
// affordances can use it. For MVP it's a stub that returns a small MJML
// fragment with the props inlined; the cloud-code real compiler will
// replace this contract later.

import type { Component } from "vue";

import HeadingBlock from "./HeadingBlock.vue";
import ParagraphBlock from "./ParagraphBlock.vue";
import ImageBlock from "./ImageBlock.vue";
import ButtonBlock from "./ButtonBlock.vue";
import DividerBlock from "./DividerBlock.vue";
import SpacerBlock from "./SpacerBlock.vue";
import FooterBlock from "./FooterBlock.vue";

export type BlockType =
  | "heading"
  | "paragraph"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "footer";

export interface Block<P = Record<string, unknown>> {
  id: string;
  type: BlockType;
  props: P;
}

export interface Body {
  version: 1;
  blocks: Block[];
}

export interface BlockDefinition<P = Record<string, unknown>> {
  type: BlockType;
  label: string;
  description: string;
  // Tiny inline SVG path (24x24 viewBox). The library tile renders the
  // wrapping <svg> and just slots this <path /> in.
  iconPath: string;
  default(): P;
  Render: Component;
  Inspect: Component;
  compileMjml(props: P): string;
}

// Helpers ------------------------------------------------------------------

function escapeAttr(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Block ID generation — short prefix-id strings (b_ + 5 base62 chars).
// Stable within a body so selection state survives re-renders; not Parse
// object ids. Collision risk at MVP block counts is negligible.
export function makeBlockId(): string {
  return `b_${Math.random().toString(36).slice(2, 7)}`;
}

// Registry -----------------------------------------------------------------

export const registry: Record<BlockType, BlockDefinition> = {
  heading: {
    type: "heading",
    label: "Heading",
    description: "Section title",
    iconPath:
      "M5 4v16M5 12h14M19 4v16",
    default: () => ({
      text: "Your headline goes here",
      level: 1,
      align: "left",
      color: "#1A1A1A",
    }),
    Render: HeadingBlock,
    Inspect: HeadingBlock,
    compileMjml(props: any) {
      const tag = `h${props.level ?? 1}`;
      return `<mj-text align="${escapeAttr(props.align)}" color="${escapeAttr(
        props.color,
      )}" font-size="${props.level === 1 ? 28 : props.level === 2 ? 22 : 18}px" font-weight="700"><${tag}>${escapeAttr(
        props.text,
      )}</${tag}></mj-text>`;
    },
  },

  paragraph: {
    type: "paragraph",
    label: "Paragraph",
    description: "Body text",
    iconPath:
      "M4 6h16M4 12h16M4 18h10",
    default: () => ({
      html: "Add a short paragraph for your readers.",
      align: "left",
      color: "#1A1A1A",
    }),
    Render: ParagraphBlock,
    Inspect: ParagraphBlock,
    compileMjml(props: any) {
      return `<mj-text align="${escapeAttr(props.align)}" color="${escapeAttr(
        props.color,
      )}" font-size="15px" line-height="1.6">${escapeAttr(props.html)}</mj-text>`;
    },
  },

  image: {
    type: "image",
    label: "Image",
    description: "Photo or graphic",
    iconPath:
      "M4 5h16v14H4zM4 16l4-4 4 4 3-3 5 5",
    default: () => ({
      src: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=600&q=80&auto=format&fit=crop",
      alt: "",
      width: 600,
      align: "center",
      linkHref: "",
    }),
    Render: ImageBlock,
    Inspect: ImageBlock,
    compileMjml(props: any) {
      const href = props.linkHref ? ` href="${escapeAttr(props.linkHref)}"` : "";
      return `<mj-image src="${escapeAttr(props.src)}" alt="${escapeAttr(
        props.alt,
      )}" width="${props.width}px" align="${escapeAttr(props.align)}"${href} />`;
    },
  },

  button: {
    type: "button",
    label: "Button",
    description: "Call to action",
    iconPath:
      "M3 9h18v6H3zM7 12h10",
    default: () => ({
      label: "Click here",
      href: "https://example.com",
      bg: "#FF4E4E",
      fg: "#FFFFFF",
      align: "center",
      radius: 10,
    }),
    Render: ButtonBlock,
    Inspect: ButtonBlock,
    compileMjml(props: any) {
      return `<mj-button background-color="${escapeAttr(
        props.bg,
      )}" color="${escapeAttr(props.fg)}" href="${escapeAttr(
        props.href,
      )}" align="${escapeAttr(props.align)}" border-radius="${
        props.radius
      }px">${escapeAttr(props.label)}</mj-button>`;
    },
  },

  divider: {
    type: "divider",
    label: "Divider",
    description: "Horizontal rule",
    iconPath:
      "M3 12h18",
    default: () => ({
      color: "#E5E5E7",
      thickness: 1,
    }),
    Render: DividerBlock,
    Inspect: DividerBlock,
    compileMjml(props: any) {
      return `<mj-divider border-color="${escapeAttr(
        props.color,
      )}" border-width="${props.thickness}px" />`;
    },
  },

  spacer: {
    type: "spacer",
    label: "Spacer",
    description: "Vertical gap",
    iconPath:
      "M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4",
    default: () => ({
      height: 24,
    }),
    Render: SpacerBlock,
    Inspect: SpacerBlock,
    compileMjml(props: any) {
      return `<mj-spacer height="${props.height}px" />`;
    },
  },

  // Footer is auto-inserted in the default body; not in the library palette
  // (it can't be added a second time — see blockTypesInOrder).
  footer: {
    type: "footer",
    label: "Footer",
    description: "Unsubscribe + address",
    iconPath:
      "M4 6h16M4 12h16M7 18h10",
    default: () => ({
      businessAddress: "[Your business address — required by law]",
      showUnsubscribe: true,
      showWebVersion: false,
    }),
    Render: FooterBlock,
    Inspect: FooterBlock,
    compileMjml(props: any) {
      const parts: string[] = [];
      parts.push(
        `<mj-text align="center" color="#8E8E93" font-size="12px" font-style="italic">${escapeAttr(
          props.businessAddress,
        )}</mj-text>`,
      );
      const links: string[] = [];
      if (props.showWebVersion) {
        links.push('<a href="{{webVersionUrl}}" style="color:#8E8E93;text-decoration:underline">View in browser</a>');
      }
      if (props.showUnsubscribe) {
        links.push('<a href="{{unsubscribeUrl}}" style="color:#8E8E93;text-decoration:underline">Unsubscribe</a>');
      }
      if (links.length) {
        parts.push(
          `<mj-text align="center" color="#8E8E93" font-size="12px">${links.join(" &middot; ")}</mj-text>`,
        );
      }
      return parts.join("");
    },
  },
};

// Ordered list — drives BlockLibrary rendering. Order is the order tiles
// appear in the left rail. Heading first, layout primitives last. Footer
// is NOT in this list — it's auto-inserted on new campaigns and there can
// only be one per body.
export const blockTypesInOrder: BlockType[] = [
  "heading",
  "paragraph",
  "image",
  "button",
  "divider",
  "spacer",
];

// Default starter body — see Editor.md §12 + Editor-phase1.md §6. Four
// blocks: heading, paragraph, button, footer. The footer is auto-inserted
// for CAN-SPAM compliance — every draft must have an unsubscribe path
// from the first save onward.
export function makeDefaultBody(): Body {
  return {
    version: 1,
    blocks: [
      {
        id: makeBlockId(),
        type: "heading",
        props: {
          text: "Your headline goes here",
          level: 1,
          align: "center",
          color: "#1A1A1A",
        },
      },
      {
        id: makeBlockId(),
        type: "paragraph",
        props: {
          html: "Add a short intro paragraph for your readers. Drag blocks from the left rail to keep building.",
          align: "center",
          color: "#1A1A1A",
        },
      },
      {
        id: makeBlockId(),
        type: "button",
        props: {
          label: "Click here",
          href: "https://example.com",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 10,
        },
      },
      {
        id: makeBlockId(),
        type: "footer",
        props: {
          businessAddress: "[Your business address — required by law]",
          showUnsubscribe: true,
          showWebVersion: false,
        },
      },
    ],
  };
}
