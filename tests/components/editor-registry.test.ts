// @vitest-environment happy-dom
// Editor pure-logic + component coverage from docs/testing/campaigns-editor.md.
//
// Two layers in one file:
//   1. registry.ts pure module (Layer U) — CB-18 (per-block compileMjml stub
//      shape + escapeAttr behavior) and makeDefaultBody / makeBlockId
//      invariants. The server hook is the canonical renderer (covered in
//      tests/server/*); these pin the client stub contract.
//   2. EditorShell.vue normalize/footer-last behavior (Layer C) — ED-01
//      (normalizeBody keeps only known block types + merges defaults), ED-02
//      (falls back to makeDefaultBody on garbage), ED-03 (footer forced last
//      on load). We mount the REAL EditorShell with a fake Parse campaign and
//      a recording stub for EditorCanvas, then read the normalized body it
//      receives.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  blockTypesInOrder,
  makeBlockId,
  makeDefaultBody,
  registry,
  type BlockType,
} from "../../components/app/editor/blocks/registry";

// ── 1. registry pure module ───────────────────────────────────────────────

describe("registry compileMjml stubs (client debug contract)", () => {
  it("every block type's compileMjml returns its expected <mj-*> fragment", () => {
    const heading = registry.heading.compileMjml({
      text: "Hi",
      level: 1,
      align: "center",
      color: "#111111",
    });
    expect(heading).toContain("<mj-text");
    expect(heading).toContain("<h1>");
    expect(heading).toContain("Hi");
    expect(heading).toContain("font-size=\"28px\"");

    const para = registry.paragraph.compileMjml({
      html: "Body text",
      align: "left",
      color: "#222222",
    });
    expect(para).toContain("<mj-text");
    expect(para).toContain("Body text");

    const image = registry.image.compileMjml({
      src: "https://x/y.png",
      alt: "a",
      width: 600,
      align: "center",
      linkHref: "https://x/go",
    });
    expect(image).toContain("<mj-image");
    expect(image).toContain("https://x/y.png");
    expect(image).toContain('href="https://x/go"');

    const button = registry.button.compileMjml({
      label: "Go",
      href: "https://x",
      bg: "#FF0000",
      fg: "#FFFFFF",
      align: "center",
      radius: 8,
    });
    expect(button).toContain("<mj-button");
    expect(button).toContain("Go");
    expect(button).toContain("border-radius=\"8px\"");

    const divider = registry.divider.compileMjml({ color: "#EEE", thickness: 2 });
    expect(divider).toContain("<mj-divider");
    expect(divider).toContain("border-width=\"2px\"");

    const spacer = registry.spacer.compileMjml({ height: 30 });
    expect(spacer).toContain("<mj-spacer");
    expect(spacer).toContain("height=\"30px\"");

    const footer = registry.footer.compileMjml({
      businessAddress: "1 Main St",
      showUnsubscribe: true,
      showWebVersion: false,
    });
    expect(footer).toContain("1 Main St");
    expect(footer).toContain("{{unsubscribeUrl}}");
    expect(footer).not.toContain("{{webVersionUrl}}");
  });

  it("compileMjml escapes &\"<> in user-controlled props (no injection)", () => {
    const out = registry.heading.compileMjml({
      text: '<script>"&"</script>',
      level: 1,
      align: "left",
      color: "#000",
    });
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&quot;");
    expect(out).toContain("&amp;");
    expect(out).not.toContain('<script>"&"</script>');
  });

  it("image with linkHref absent emits no href attribute", () => {
    const out = registry.image.compileMjml({
      src: "https://x/y.png",
      alt: "",
      width: 600,
      align: "center",
      linkHref: "",
    });
    expect(out).not.toContain("href=");
  });

  it("footer web-version link only appears when showWebVersion is true", () => {
    const on = registry.footer.compileMjml({
      businessAddress: "addr",
      showUnsubscribe: true,
      showWebVersion: true,
    });
    expect(on).toContain("{{webVersionUrl}}");
  });
});

describe("makeDefaultBody / makeBlockId / registry shape", () => {
  it("makeDefaultBody is a 4-block CAN-SPAM-ready body ending in a footer", () => {
    const body = makeDefaultBody();
    expect(body.version).toBe(1);
    const types = body.blocks.map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "button", "footer"]);
    // Footer is last and defaults unsubscribe on.
    expect(body.blocks[body.blocks.length - 1].type).toBe("footer");
    expect((body.blocks[3].props as any).showUnsubscribe).toBe(true);
    // Every block has a unique id.
    const ids = body.blocks.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("makeBlockId returns a b_-prefixed id and is reasonably unique", () => {
    const a = makeBlockId();
    const b = makeBlockId();
    expect(a).toMatch(/^b_/);
    expect(a).not.toBe(b);
  });

  it("blockTypesInOrder lists the palette types and excludes footer", () => {
    expect(blockTypesInOrder).not.toContain("footer");
    expect(blockTypesInOrder[0]).toBe("heading");
    for (const t of blockTypesInOrder) {
      expect(registry[t as BlockType]).toBeDefined();
    }
  });
});

// ── 2. EditorShell normalize / footer-last (real SFC) ──────────────────────

// useRouter / navigateTo are Nuxt auto-imports — provide globals so the SFC's
// setup() doesn't throw. We only need useRouter() to return something with the
// methods the shell may call.
const routerPush = vi.fn();
(globalThis as any).useRouter = () => ({ push: routerPush, replace: vi.fn() });
(globalThis as any).navigateTo = vi.fn();

// Mock the composables the shell reaches for at setup/mount time.
vi.mock("~/composables/app/useAudiences", () => ({
  useAudiences: () => ({ listAudiences: vi.fn().mockResolvedValue([]) }),
}));
vi.mock("~/composables/app/useSending", () => ({
  useSending: () => ({
    scheduleSend: vi.fn(),
    sendTestEmail: vi.fn(),
    cancelScheduledSend: vi.fn(),
  }),
}));
const toastPush = vi.fn();
vi.mock("~/composables/shared/useToast", () => ({
  useToast: () => ({ push: toastPush }),
}));

// A fake Parse.Object exposing only what EditorShell reads off props.campaign.
function fakeCampaign(over: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = {
    name: "Untitled campaign",
    status: "draft",
    ...over,
  };
  return {
    id: "camp_test",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    get: (k: string) => data[k],
    set: (k: string, v: unknown) => {
      data[k] = v;
    },
    save: vi.fn().mockResolvedValue(undefined),
  };
}

// Recording stub for EditorCanvas — captures the `body` prop the shell passes,
// which is the normalized body we want to assert on.
let capturedBody: any = null;
const CanvasStub = {
  name: "EditorCanvas",
  props: ["body", "selectedBlockId", "dragging", "previewWidth", "setupValues"],
  setup(props: any) {
    capturedBody = props.body;
    return () => null;
  },
};

async function mountShell(bodyValue: unknown) {
  // Import lazily so the vi.mock + globals above are installed first.
  const { mount } = await import("@vue/test-utils");
  const { createPinia, setActivePinia } = await import("pinia");
  const EditorShell = (
    await import("../../components/app/editor/EditorShell.vue")
  ).default;
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(EditorShell, {
    props: { campaign: fakeCampaign({ body: bodyValue }) },
    global: {
      plugins: [pinia],
      stubs: {
        EditorCanvas: CanvasStub,
        // Everything else the shell renders is irrelevant to normalize logic.
        BlockLibrary: true,
        EditorInspector: true,
        EditorSetup: true,
        EditorTestSendPopover: true,
        EditorTopBar: true,
        EditorPreview: true,
        PreflightChecklist: true,
      },
    },
  });
}

describe("EditorShell normalizeBody + footer-last (real SFC)", () => {
  beforeEach(() => {
    capturedBody = null;
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("ED-01: keeps only known block types and merges props over registry defaults", async () => {
    await mountShell({
      version: 1,
      blocks: [
        { id: "k1", type: "heading", props: { text: "Known" } },
        { id: "u1", type: "mystery", props: { text: "Unknown" } },
      ],
    });
    expect(capturedBody).toBeTruthy();
    const types = capturedBody.blocks.map((b: any) => b.type);
    expect(types).toContain("heading");
    expect(types).not.toContain("mystery");
    const heading = capturedBody.blocks.find((b: any) => b.id === "k1");
    expect(heading.props.text).toBe("Known"); // provided prop wins
    expect(heading.props.level).toBe(1); // registry default merged in
  });

  it("ED-02: falls back to makeDefaultBody on a null/garbage body", async () => {
    await mountShell(null);
    const types = capturedBody.blocks.map((b: any) => b.type);
    expect(types).toEqual(["heading", "paragraph", "button", "footer"]);
  });

  it("ED-03: forces the footer to be last on load", async () => {
    await mountShell({
      version: 1,
      blocks: [
        { id: "ft", type: "footer", props: {} },
        { id: "h1", type: "heading", props: { text: "After footer in source" } },
        { id: "p1", type: "paragraph", props: { html: "x" } },
      ],
    });
    const types = capturedBody.blocks.map((b: any) => b.type);
    expect(types[types.length - 1]).toBe("footer");
    expect(types).toEqual(["heading", "paragraph", "footer"]);
  });
});
