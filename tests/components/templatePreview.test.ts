// @vitest-environment happy-dom
//
// Component tests for components/app/TemplatePreview.vue (<AppTemplatePreview>).
//
// TemplatePreview is a presentational, NON-interactive miniature email renderer.
// It maps a Template/Campaign `body.blocks` array to styled HTML and is the ONLY
// XSS guard on template/campaign content: heading.text and paragraph.html are
// PLAIN text inserted via `v-html`, so the component MUST escape them. These
// tests prioritise that escaping guard (TPL-P08) and the all-block-types render
// path (TPL-P09), then cover each block type, missing/empty props, the
// scale-to-fit math, a11y, and a real seeded body.
//
// Real .vue SFC compilation is enabled in vitest.config.ts via @vitejs/plugin-vue;
// the component imports only from "vue" (no Nuxt auto-imports) so it mounts with
// no stubs. We mount via mountWithPinia for parity with the other SFC tests.
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import TemplatePreview from "../../components/app/TemplatePreview.vue";
import { mountWithPinia } from "../setup/vueTest";

// Require REAL seeded template bodies for TPL-P13. We deliberately do NOT import
// server/cloud/templates.js here: that module calls Parse.Cloud.define at load
// (only valid inside the Parse Server runtime) AND fires a setImmediate boot
// seed — requiring it from a component test would both need a Parse.Cloud stub
// and poison the CommonJS module cache for any server test sharing this worker
// process (forks pool can batch files), corrupting the seeded-template count.
// The per-category data files import only ./_helpers (no Parse, no seeding), so
// we build representative real bodies from them instead.
import { createRequire } from "node:module";
const requireCjs = createRequire(import.meta.url);
const newsletters = requireCjs("../../server/cloud/templates/newsletters") as Array<{
  seedKey: string;
  body: () => any;
}>;
const seasonal = requireCjs("../../server/cloud/templates/seasonal") as Array<{
  seedKey: string;
  body: () => any;
}>;
// A handful of real, varied category bodies — enough to exercise the renderer on
// genuine seeded block trees without loading the seed-firing aggregator module.
const REAL_BODIES: Array<{ seedKey: string; body: () => any }> = [...newsletters, ...seasonal];

// ── Block fixtures (one of each type, realistic props) ───────────────────────
let _n = 0;
const id = () => `b_fix${_n++}`;
const mk = (type: string, props: Record<string, unknown>) => ({ id: id(), type, props });

const fixtures = {
  heading: () => mk("heading", { text: "Hello world", level: 1, align: "center", color: "#1A1A1A" }),
  paragraph: () => mk("paragraph", { html: "line one\nline two", align: "left", color: "#1A1A1A" }),
  image: () => mk("image", { src: "https://x/y.jpg", alt: "", width: 600, align: "center" }),
  button: () => mk("button", { label: "Go", href: "#", bg: "#FF4E4E", fg: "#FFFFFF", radius: 10, align: "center" }),
  divider: () => mk("divider", { color: "#E5E5E7", thickness: 2 }),
  spacer: () => mk("spacer", { height: 24 }),
  footer: () => mk("footer", { businessAddress: "123 St", showUnsubscribe: true, showWebVersion: true }),
};

function mountBlocks(blocks: any[], props: Record<string, unknown> = {}) {
  return mountWithPinia(TemplatePreview, { props: { blocks, ...props } });
}

describe("TemplatePreview.vue", () => {
  // ── TPL-P01: heading ───────────────────────────────────────────────────────
  describe("heading (TPL-P01)", () => {
    it("renders an <h2> with the text", () => {
      const w = mountBlocks([fixtures.heading()]);
      const h = w.find("h2");
      expect(h.exists()).toBe(true);
      expect(h.text()).toBe("Hello world");
    });

    it("sizes by level: 1→30px, 2→23px, 3→18px", () => {
      const sizes: Record<number, string> = { 1: "30px", 2: "23px", 3: "18px" };
      for (const level of [1, 2, 3]) {
        const w = mountBlocks([mk("heading", { text: "x", level, align: "left", color: "#1A1A1A" })]);
        expect(w.find("h2").attributes("style")).toContain(`font-size: ${sizes[level]}`);
      }
    });

    it("applies align and color from props", () => {
      const w = mountBlocks([mk("heading", { text: "x", level: 2, align: "right", color: "#FF0000" })]);
      const style = w.find("h2").attributes("style") || "";
      expect(style).toContain("text-align: right");
      expect(style.toLowerCase()).toContain("#ff0000");
    });
  });

  // ── TPL-P02: paragraph + newline → <br> ──────────────────────────────────────
  describe("paragraph (TPL-P02)", () => {
    it("renders a <p> and converts newlines to <br>", () => {
      const w = mountBlocks([fixtures.paragraph()]);
      const p = w.find("p");
      expect(p.exists()).toBe(true);
      expect(p.html()).toContain("<br>");
      // Both text fragments survive.
      expect(p.text()).toContain("line one");
      expect(p.text()).toContain("line two");
    });

    it("escapes HTML in paragraph text (no live markup)", () => {
      const w = mountBlocks([mk("paragraph", { html: "<b>bold</b>", align: "left", color: "#1A1A1A" })]);
      const p = w.find("p");
      expect(p.find("b").exists()).toBe(false); // not parsed as an element
      expect(p.html()).toContain("&lt;b&gt;");
    });
  });

  // ── TPL-P03: image ───────────────────────────────────────────────────────────
  describe("image (TPL-P03)", () => {
    it("renders an <img> with the src", () => {
      const w = mountBlocks([fixtures.image()]);
      const img = w.find("img");
      expect(img.exists()).toBe(true);
      expect(img.attributes("src")).toBe("https://x/y.jpg");
    });

    it("clamps width to min(props.width, contentWidth)", () => {
      const w = mountBlocks([mk("image", { src: "s", width: 1200, align: "center" })], { contentWidth: 600 });
      expect(w.find("img").attributes("style")).toContain("width: 600px");
    });

    it("wrapper text-align matches align prop", () => {
      const w = mountBlocks([mk("image", { src: "s", width: 300, align: "right" })]);
      const wrap = w.find("img").element.parentElement as HTMLElement;
      expect(wrap.getAttribute("style") || "").toContain("text-align: right");
    });
  });

  // ── TPL-P04: button ───────────────────────────────────────────────────────────
  describe("button (TPL-P04)", () => {
    it("renders the label with bg/fg/radius styling", () => {
      const w = mountBlocks([fixtures.button()]);
      const span = w.find("span");
      expect(span.exists()).toBe(true);
      expect(span.text()).toBe("Go");
      const style = (span.attributes("style") || "").toLowerCase();
      expect(style).toContain("#ff4e4e"); // bg
      expect(style).toContain("#ffffff"); // fg
      expect(style).toContain("border-radius: 10px");
    });

    it("applies the row align", () => {
      const w = mountBlocks([mk("button", { label: "Go", align: "center" })]);
      const row = w.find("span").element.parentElement as HTMLElement;
      expect(row.getAttribute("style") || "").toContain("text-align: center");
    });
  });

  // ── TPL-P05: divider ──────────────────────────────────────────────────────────
  it("renders a divider as an <hr> with border-top thickness+color (TPL-P05)", () => {
    const w = mountBlocks([fixtures.divider()]);
    const hr = w.find("hr");
    expect(hr.exists()).toBe(true);
    // happy-dom normalises the `border-top` shorthand into longhand, so assert
    // on the computed pieces rather than the literal shorthand string.
    const el = hr.element as HTMLElement;
    expect(el.style.borderTopWidth).toBe("2px");
    expect(el.style.borderTopStyle).toBe("solid");
    expect(el.style.borderTopColor.toLowerCase()).toBe("#e5e5e7");
  });

  // ── TPL-P06: spacer ───────────────────────────────────────────────────────────
  it("renders a spacer div with height + line-height 0 (TPL-P06)", () => {
    const w = mountBlocks([fixtures.spacer()]);
    // The spacer is the only div with an explicit height style.
    const spacer = w.findAll("div").find((d) => (d.attributes("style") || "").includes("height: 24px"));
    expect(spacer).toBeTruthy();
    expect((spacer!.attributes("style") || "")).toContain("line-height: 0");
  });

  // ── TPL-P07: footer (links toggle) ───────────────────────────────────────────
  describe("footer (TPL-P07)", () => {
    it("shows address and both links when both toggles on", () => {
      const w = mountBlocks([mk("footer", { businessAddress: "123 St", showUnsubscribe: true, showWebVersion: true })]);
      expect(w.find(".tpre-footer-addr").text()).toBe("123 St");
      expect(w.find(".tpre-footer-links").text()).toBe("View in browser · Unsubscribe");
    });

    it("shows only the enabled link", () => {
      const wUnsub = mountBlocks([mk("footer", { businessAddress: "a", showUnsubscribe: true, showWebVersion: false })]);
      expect(wUnsub.find(".tpre-footer-links").text()).toBe("Unsubscribe");
      const wWeb = mountBlocks([mk("footer", { businessAddress: "a", showUnsubscribe: false, showWebVersion: true })]);
      expect(wWeb.find(".tpre-footer-links").text()).toBe("View in browser");
    });

    it("omits the links row when both toggles off", () => {
      const w = mountBlocks([mk("footer", { businessAddress: "a", showUnsubscribe: false, showWebVersion: false })]);
      expect(w.find(".tpre-footer-links").exists()).toBe(false);
      expect(w.find(".tpre-footer-addr").exists()).toBe(true);
    });
  });

  // ── TPL-P08: escaping / injection (THE XSS guard) ────────────────────────────
  describe("escapes injection in text props (TPL-P08)", () => {
    it("does not render a <script> tag from heading text", () => {
      const w = mountBlocks([mk("heading", { text: "<script>alert(1)</script>", level: 1 })]);
      const h = w.find("h2");
      // No live <script> element injected.
      expect(h.element.querySelector("script")).toBeNull();
      // Rendered as escaped text.
      expect(h.html()).toContain("&lt;script&gt;");
      expect(h.html()).not.toContain("<script>");
    });

    it("does not render an <img onerror> from heading text", () => {
      const w = mountBlocks([mk("heading", { text: "<img src=x onerror=alert(1)>", level: 1 })]);
      const h = w.find("h2");
      expect(h.element.querySelector("img")).toBeNull();
      const html = h.html();
      expect(html).toContain("&lt;img");
      expect(html).not.toMatch(/<img\b/);
    });

    it("escapes the markup-significant <, > and & in paragraph text", () => {
      const w = mountBlocks([mk("paragraph", { html: `a < b > c & d "e"` })]);
      const p = w.find("p");
      const html = p.html();
      // < > & are escaped so they cannot form markup. (`"` is escaped to &quot;
      // before insertion, but once parsed into a text node the DOM serialises it
      // back to a bare quote — harmless in text content; what matters is the
      // angle brackets/ampersand below.)
      expect(html).toContain("&lt;");
      expect(html).toContain("&gt;");
      expect(html).toContain("&amp;");
      // No spurious elements were created from the input.
      expect(p.element.children.length).toBe(0);
      // The visible text round-trips intact (quote preserved as a literal char).
      expect(p.text()).toBe(`a < b > c & d "e"`);
    });

    it("escapes injection inside a real seeded-style fork too (defense in depth)", () => {
      const w = mountBlocks([mk("paragraph", { html: `</p><script>x</script>` })]);
      expect(w.find("p").element.querySelector("script")).toBeNull();
    });
  });

  // ── TPL-P09: all 7 block types in one body, in order ─────────────────────────
  it("renders all 7 block types in one body, in DOM order (TPL-P09)", () => {
    const blocks = [
      fixtures.heading(),
      fixtures.paragraph(),
      fixtures.image(),
      fixtures.button(),
      fixtures.divider(),
      fixtures.spacer(),
      fixtures.footer(),
    ];
    const w = mountBlocks(blocks);
    expect(w.find("h2").exists()).toBe(true);
    expect(w.find("p").exists()).toBe(true);
    expect(w.find("img").exists()).toBe(true);
    expect(w.find("span").exists()).toBe(true); // button label
    expect(w.find("hr").exists()).toBe(true);
    expect(w.find(".tpre-footer").exists()).toBe(true);

    // Order: heading before paragraph before image before button before hr before footer.
    const email = w.find(".tpre-email").element;
    const tags = Array.from(email.children).map((c) => (c as HTMLElement).tagName.toLowerCase());
    expect(tags[0]).toBe("h2");
    expect(tags[1]).toBe("p");
    expect(tags.indexOf("hr")).toBeGreaterThan(tags.indexOf("img"));
    expect(tags[tags.length - 1]).toBe("div"); // footer wrapper div
  });

  // ── TPL-P10: missing/empty props + unknown types ─────────────────────────────
  describe("tolerates missing/empty props and unknown types (TPL-P10)", () => {
    it("renders known blocks with defaults when props is undefined", () => {
      const blocks = [
        { id: "b_a", type: "heading" },
        { id: "b_b", type: "paragraph" },
        { id: "b_c", type: "divider" },
        { id: "b_d", type: "footer" },
      ];
      let w: any;
      expect(() => { w = mountBlocks(blocks); }).not.toThrow();
      expect(w.find("h2").exists()).toBe(true);
      expect(w.find("p").exists()).toBe(true);
      expect(w.find("hr").exists()).toBe(true);
      // Default heading size is 30px (level falls back to 1).
      expect(w.find("h2").attributes("style")).toContain("font-size: 30px");
    });

    it("renders nothing for an unknown block type without throwing", () => {
      const w = mountBlocks([{ id: "b_x", type: "totally-unknown", props: {} }, fixtures.footer()]);
      expect(w.find(".tpre-footer").exists()).toBe(true);
      // No stray markup for the unknown type — only the footer wrapper exists.
      expect(w.findAll(".tpre-email > *").length).toBe(1);
    });

    it("renders an empty email for empty blocks array", () => {
      const w = mountBlocks([]);
      expect(w.find(".tpre-email").exists()).toBe(true);
      expect(w.findAll(".tpre-email > *").length).toBe(0);
    });

    it("tolerates a null entry in the blocks array", () => {
      expect(() => mountBlocks([null, fixtures.footer()])).not.toThrow();
    });
  });

  // ── TPL-P11: scale-to-fit math ───────────────────────────────────────────────
  describe("scale-to-fit (TPL-P11)", () => {
    it("defaults to scale(0.25) before measure resolves a width", () => {
      // happy-dom reports clientWidth 0, so onMounted measure() leaves the default.
      const w = mountBlocks([fixtures.footer()], { contentWidth: 600 });
      const sheet = w.find(".tpre-sheet");
      expect(sheet.attributes("style")).toContain("transform: scale(0.25)");
      expect(sheet.attributes("style")).toContain("width: 600px");
    });

    it("scale equals clientWidth/contentWidth when width is set before mount", async () => {
      // Patch clientWidth on every created div BEFORE the component measures by
      // overriding the prototype getter for the duration of this mount.
      const proto = (globalThis as any).HTMLElement?.prototype;
      const orig = proto ? Object.getOwnPropertyDescriptor(proto, "clientWidth") : undefined;
      if (proto) Object.defineProperty(proto, "clientWidth", { configurable: true, get() { return 300; } });
      try {
        const w = mountBlocks([fixtures.footer()], { contentWidth: 600 });
        await nextTick();
        // 300 / 600 = 0.5
        expect(w.find(".tpre-sheet").attributes("style")).toContain("transform: scale(0.5)");
      } finally {
        if (proto) {
          if (orig) Object.defineProperty(proto, "clientWidth", orig);
          else delete (proto as any).clientWidth;
        }
      }
    });
  });

  // ── TPL-P12: non-interactive / a11y ──────────────────────────────────────────
  it("is non-interactive: root is aria-hidden and uses the no-pointer-events class (TPL-P12)", () => {
    const w = mountBlocks([fixtures.heading(), fixtures.footer()]);
    const root = w.find(".tpre-wrap");
    expect(root.attributes("aria-hidden")).toBe("true");
    // pointer-events:none is applied via the .tpre-wrap class (scoped CSS).
    expect(root.classes()).toContain("tpre-wrap");
  });

  // ── TPL-P13: real seeded body renders ────────────────────────────────────────
  describe("real seeded bodies render (TPL-P13)", () => {
    it("renders the first real category template body without error", () => {
      const blocks = REAL_BODIES[0].body().blocks;
      let w: any;
      expect(() => { w = mountBlocks(blocks); }).not.toThrow();
      // Node count equals the block count (each known block → exactly one node).
      expect(w.findAll(".tpre-email > *").length).toBe(blocks.length);
    });

    it("renders every real category template body without throwing", () => {
      expect(REAL_BODIES.length).toBeGreaterThan(0);
      for (const def of REAL_BODIES) {
        const blocks = def.body().blocks;
        expect(() => mountBlocks(blocks)).not.toThrow();
      }
    });
  });
});
