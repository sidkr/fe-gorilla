# Editor.md — Email composer architecture

The email composer is the most product-defining surface in Gorilla. When a marketer thinks "Gorilla", they should think this screen. It takes raw user input (text, image URLs, button labels, links) and produces email that renders correctly across the major clients (Gmail web, Apple Mail, Outlook desktop, iOS Mail, Android Gmail). The hard problem is *rendering correctness across clients*, not editor UX.

This doc is the build plan. See `Architecture.md` for the broader send pipeline; this doc covers the editor surface itself.

## 1. Architectural commitments (already decided in Architecture.md)

- **Block-based JSON → MJML → HTML, in-house.** Not raw HTML editing. Not GrapesJS/Unlayer. We own the JSON schema.
- **Compiled at save time, not send time.** Cloud-code `beforeSave` on `Template` and `Campaign` runs the compiler. Send workers do field-merge only — no MJML pass in the hot path.
- **Compilation lives server-side.** The client never produces final HTML. Server-side compile prevents tampering and gives us one place to sanitize.

These are non-negotiable inputs to the editor design.

## 2. MVP scope

### In MVP
- Subject + preheader fields
- Six block types: **Heading**, **Paragraph**, **Image**, **Button**, **Divider**, **Spacer**
- Drag-from-library-to-canvas
- Click-to-select block
- Inspector panel with per-block controls
- Vertical reorder (drag handle)
- Delete block (keyboard, or trash icon on selection)
- Live in-canvas preview at ~600px width
- Autosave (debounced 1.5s) + manual "Save draft"
- Test send (one email to the editing user)

### Out of MVP — deliberately cut
- **Columns / multi-column layouts** — doubles the schema and the drop-zone logic
- **Custom HTML block** — sanitization is a deep hole
- **Merge tags** (`{{firstName}}`, etc.) — schema reserved; substitution lands in v1.1 alongside the send worker
- **A/B test variants** — a feature in itself
- **Undo/redo** — needs a command pattern; defer
- **Inline text editing** — contenteditable + paste sanitization is multi-week
- **Image upload** — v1 uses image URLs (paste a CDN link); upload pipeline lands later
- **Mobile preview toggle** — render at 360px width; cheap to add later
- **Block templates / preset block groups**
- **Multi-language / localization**

Cutting Columns is the single highest-impact decision. Adding Columns later is additive (new block type, new MJML fragment) — its absence does not paint us into a corner.

## 3. Data model

### `Template`
A reusable email design. Tenant-scoped.

| Field | Type | Notes |
|---|---|---|
| `name` | String | "Spring sale 2026" |
| `subject` | String | default subject; campaign can override |
| `preheader` | String | default preheader |
| `body` | Object | the block JSON tree (schema below) |
| `compiledMjml` | String | written by `beforeSave` |
| `compiledHtml` | String | written by `beforeSave` |
| `organization` | Pointer→Organization | tenant boundary |
| `createdBy` | Pointer→_User | author |

### `Campaign`
A planned/sent send. Forks from a `Template` at creation; once forked, the Campaign owns its body. Changes to the source template do not propagate.

| Field | Type | Notes |
|---|---|---|
| `name` | String | "Spring Sale 2026 — Early Access" |
| `subject` | String | actual subject for this send |
| `preheader` | String | |
| `body` | Object | the block JSON tree (forked from `template.body` at create) |
| `compiledMjml` | String | written by `beforeSave` |
| `compiledHtml` | String | written by `beforeSave` |
| `template` | Pointer→Template | source template; nullable for blank-start campaigns |
| `audience` | Pointer→List \| Segment | recipient set; set later in the flow |
| `status` | String | `draft` / `scheduled` / `sending` / `sent` |
| `organization` | Pointer→Organization | |

### Why `body` lives on both classes
Templates are reusable designs. Campaigns are single-use. We could store `templateId + overrides`, but the overrides path forces every edit to think about "is this an override or a template change?" — bad UX. Fork-on-create + full ownership is simpler at modest storage cost.

## 4. Block JSON schema

```json
{
  "version": 1,
  "blocks": [
    { "id": "b_aBcD2", "type": "heading",   "props": { "text": "Spring sale starts today", "level": 1, "align": "left", "color": "#1A1A1A" } },
    { "id": "b_Xy91k", "type": "paragraph", "props": { "html": "Members get first crack at 20% off.", "align": "left", "color": "#1A1A1A" } },
    { "id": "b_pQ4nM", "type": "image",     "props": { "src": "https://cdn.example.com/hero.jpg", "alt": "Spring collection", "width": 600, "align": "center" } },
    { "id": "b_rT8vL", "type": "button",    "props": { "label": "Shop the sale", "href": "https://example.com/sale", "bg": "#FF4E4E", "fg": "#FFFFFF", "align": "center", "radius": 10 } },
    { "id": "b_kJ3wQ", "type": "divider",   "props": { "color": "#E5E5E7", "thickness": 1 } },
    { "id": "b_mN7xT", "type": "spacer",    "props": { "height": 24 } }
  ]
}
```

Per-block props:

| Block | Props |
|---|---|
| `heading` | `text` (string), `level` (1\|2\|3), `align` (left\|center\|right), `color` (hex) |
| `paragraph` | `html` (string — narrow subset: `<b>`, `<i>`, `<a>`, sanitized server-side), `align`, `color` |
| `image` | `src` (URL), `alt` (string), `width` (px, 100–600), `align`, `linkHref` (optional URL) |
| `button` | `label`, `href`, `bg` (hex), `fg` (hex), `align`, `radius` (px, 0–24) |
| `divider` | `color`, `thickness` (1–8 px) |
| `spacer` | `height` (px, 4–96) |

### Block IDs
Short prefix-id strings (`b_` + 5 base62 chars). Client-generated at insertion time. **Not** Parse Object IDs — they're addresses within the body tree, stable across saves so undo/redo (later) and selection state (now) survive re-renders.

### Why a flat block list, no nesting (yet)
A flat list keeps the schema small and the drop-zone logic obvious (between blocks). Columns introduce nesting (a column block contains child blocks); we'll switch to a recursive renderer at that point. Designing for nesting now would pessimize the simple case.

## 5. Component architecture

```
pages/app/campaigns/[id]/edit.vue            ← route (resolves campaign by :id; new draft is a fresh ID)
└── components/app/editor/
    ├── EditorShell.vue                       ← orchestrator: 3-pane layout + topbar
    ├── EditorTopBar.vue                      ← campaign name (editable inline), save status, Test send, Preview, Send
    ├── BlockLibrary.vue                      ← draggable block tiles (left rail)
    ├── EditorCanvas.vue                      ← renders body, hosts drop zones, owns selection
    ├── EditorInspector.vue                   ← per-block control panel (right rail)
    ├── EditorPreview.vue                     ← modal for "Preview" — iframe with compiled HTML
    ├── EditorTestSendPopover.vue             ← small inline UI for Test send
    └── blocks/
        ├── registry.ts                       ← BlockType → { Render, Inspect, default, compileMjml }
        ├── HeadingBlock.vue                  ← exports Render + Inspect
        ├── ParagraphBlock.vue
        ├── ImageBlock.vue
        ├── ButtonBlock.vue
        ├── DividerBlock.vue
        └── SpacerBlock.vue
```

### Block definition contract

Every block component exposes a uniform interface so `EditorCanvas`, `EditorInspector`, and the compiler treat blocks generically. Adding a new block (Columns later) is a single registry entry.

```ts
// components/app/editor/blocks/registry.ts
import type { Component } from "vue";

export type BlockType = "heading" | "paragraph" | "image" | "button" | "divider" | "spacer";

export interface BlockDefinition<P = Record<string, unknown>> {
  type: BlockType;
  label: string;              // shown in BlockLibrary tile
  icon: Component;            // inline SVG component
  default(): P;               // initial props when dropped
  Render: Component;          // <Render :props="props" />
  Inspect: Component;         // <Inspect v-model:props="props" />
  compileMjml(props: P): string;  // returns an MJML fragment
}

export const registry: Record<BlockType, BlockDefinition>;
```

The compiler is the *only* shared knowledge between client and server — `compileMjml` ships in both bundles (it's a pure function). This is acceptable because it has no I/O; the security boundary is the server-side `beforeSave` running it as authoritative.

## 6. State

Editor state is **local component state**, not Pinia.

```ts
// inside EditorShell.vue setup()
const campaign = ref<Campaign | null>(null);  // loaded from Parse on mount
const body     = ref<Body>({ version: 1, blocks: [] });
const selectedBlockId = ref<string | null>(null);
const dirty    = ref(false);
const saving   = ref(false);
const lastSavedAt = ref<Date | null>(null);
```

Editor state is irrelevant outside the route. Lifting it to Pinia adds friction without benefit. Pinia stays for cross-route concerns (auth, network, future ones like global notifications).

## 7. Interaction model

| Action | Trigger |
|---|---|
| **Add a block** | Drag library tile → drop on a drop-zone (between blocks, or at the end) |
| **Select** | Click on a block. Visual: 1.5px coral outline + corner handles |
| **Edit props** | Inspector panel reflects selection; changes write back to `body` immediately |
| **Reorder** | Drag the left-edge handle of a selected block to a new drop-zone |
| **Delete** | Trash icon on the selection chrome, or Delete/Backspace key when selected |
| **Deselect** | Click outside any block, or Escape key |

### Drag-and-drop
**HTML5 native DnD, no library.**

- Block library tiles: `draggable="true"`, set `dataTransfer.setData("application/x-gorilla-block", type)`.
- Drop zones: listen `dragover` (preventDefault to enable drop), `drop` (read type, insert at index).
- Reorder uses the same channel: `setData("application/x-gorilla-move", blockId)`. On drop, splice from old index, insert at new.

A library would buy nicer animations and touch support. MVP is desktop-first; we'll revisit when we hit a real DnD pain point.

### Keyboard
- `Delete` / `Backspace` (when block selected, not in an input): remove block
- `Escape`: deselect
- `↑` / `↓` (when block selected): move selection to prev/next block
- `Cmd/Ctrl+S`: save

## 8. Compilation pipeline

Two contexts:

### Live canvas preview (Vue)
The canvas renders block components in normal browser DOM. Constrained to ~600px width to match email-canvas conventions. This is a *Vue approximation* of the final email — not the actual MJML/HTML output. Close enough for editing; the real cross-client correctness comes from MJML at send time.

We do not render compiled HTML in the canvas in real time. Doing so would require an iframe + per-keystroke server round-trip (or shipping MJML to the client — a heavyweight dep we want to avoid in the bundle).

### Send-rendered preview (modal)
The "Preview" button in the top bar opens a modal with an iframe containing the **compiled** HTML. Calls `Parse.Cloud.run("renderCampaignPreview", { campaignId })` which reads the current `compiledHtml` and returns it. This is the source-of-truth render — what the recipient will see.

### Save → compile

```
client                                    server
─────────                                  ─────────
EditorShell.save(body)
  → Parse.Object("Campaign").save({...})
                              ─────────►   Parse.Cloud.beforeSave("Campaign")
                                           → compileBlocks(body) → { mjml, html }
                                           → set("compiledMjml", mjml)
                                           → set("compiledHtml", html)
                                           → save proceeds
  ◄─────────                                returns saved object
update dirty/saving/lastSavedAt
```

The compiler (`server/cloud/compileBlocks.js`) is a pure function:

```js
compileBlocks(body) → { mjml: string, html: string }
```

It uses `mjml` from npm. Cloud code imports it. ~50ms per render at MVP block counts — acceptable inside `beforeSave`.

## 9. Save semantics

| Trigger | Behavior |
|---|---|
| Manual save (button) | Sends body → Parse, awaits response, updates `saving` / `dirty` / `lastSavedAt` |
| Autosave (1.5s debounce after last edit) | Same as manual save; skipped if a manual save is in flight |
| Tab close with `dirty === true` | `beforeunload` confirm prompt |

Versioning is out of MVP. Save overwrites in place. `updatedAt` drives the "Saved 12s ago" indicator. If a user wants to roll back, they re-edit (or we add versioning later — additive change).

## 10. Routes and page structure

```
/app/campaigns                          ← list (built later)
/app/campaigns/new                      ← creates a fresh draft, redirects to /app/campaigns/:id/edit
/app/campaigns/:id/edit                 ← the editor — THIS DOC
/app/campaigns/:id                      ← report (built later)
/app/templates                          ← template list (built later)
/app/templates/:id/edit                 ← same EditorShell with mode="template"
```

The same `EditorShell` powers both `Campaign` and `Template` editing. The diff is which class is being saved and which top-bar actions are available (Templates have no "Send"). A `mode` prop on `EditorShell` switches behavior.

## 11. Server-side bits the editor depends on

These are NOT built by the editor agent. They're listed so we know the interface to honor:

- **Cloud function: `compileBlocks(body)`** — pure JSON → `{ mjml, html }`. Lives in `server/cloud/compileBlocks.js`. Called from `beforeSave` on Campaign and Template.
- **`beforeSave("Campaign")` and `beforeSave("Template")`** — call `compileBlocks` on the new body, set `compiledMjml` and `compiledHtml` on the object before save proceeds.
- **Cloud function: `sendTestEmail({ campaignId, to })`** — re-reads `compiledHtml` from the saved Campaign, dispatches one email to `to` via the ESP. Stub in MVP (logs to console; real ESP integration lands with the send pipeline).
- **Cloud function: `renderCampaignPreview({ campaignId })`** — returns `compiledHtml` for the iframe modal. Trivial — just a read.

For the first editor MVP, the test-send and preview server functions can be stubbed (they read `compiledHtml`; the ESP integration is a separate work stream).

## 12. Default empty state

A new campaign starts with three blocks already in the canvas:

```js
[
  { id: "b_open1", type: "heading",   props: { text: "Your headline goes here", level: 1, align: "left", color: "#1A1A1A" } },
  { id: "b_open2", type: "paragraph", props: { html: "Add a short intro paragraph for your readers. Drag blocks from the left rail to keep building.", align: "left", color: "#1A1A1A" } },
  { id: "b_open3", type: "button",    props: { label: "Click here", href: "https://example.com", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 } },
]
```

The user has something to react to immediately. Empty canvas with "drag a block to start" is hostile.

## 13. Sanitization

The `paragraph` block accepts limited HTML (`<b>`, `<i>`, `<a href>`). Server-side `beforeSave` runs the body through a sanitizer (DOMPurify equivalent in Node) before compile. Anything outside the allowed tags is stripped. Client-side sanitization is *not* trusted.

## 14. Visual design

Pop direction. Use tokens from `assets/css/tokens.css`. The editor's chrome should feel *quiet* — the user's email is the center of attention. Coral appears only on:
- Primary CTA in the top bar ("Send")
- The selected-block outline + corner handles
- The active drop-zone indicator (dashed coral line)

Block library tiles, inspector controls, and surfaces are monochrome on cream/white.

## 15. Out-of-MVP, listed so reviewers stop suggesting

- Columns / nested blocks (next biggest feature)
- Inline editing (contenteditable on Heading/Paragraph text in canvas)
- Image upload (currently URL-only)
- Mobile preview width toggle
- Undo/redo
- Block templates (preset block groups: "newsletter intro", "sale CTA stack")
- A/B variant testing
- Merge tags (schema reserved; substitution lands with the send worker)
- Code view (raw MJML / HTML inspect for power users)
- Block-level analytics ("which block did people click most?")
- Multi-user simultaneous editing (LiveQuery-driven CRDT — large project)

## 16. Open questions

1. **`compileBlocks` location** — `server/cloud/compileBlocks.js` (Node-side, called by beforeSave) OR shared module that both client preview and server compile import? Decision lean: server-only. The client preview is a Vue approximation that doesn't need MJML.
2. **Bundle size** — MJML's footprint is ~200KB minified. Out-of-bundle on the client; only in cloud code. Verify before merging.
3. **MJML version pin** — pin `mjml@5.x` exactly; minor MJML versions can change output bytes-per-byte (problematic for diff-based debugging).
4. **Test-send rate limit** — the user can test-send infinitely from the editor. Add a per-user-per-campaign limit (5/min) at the cloud-function layer to avoid spam loops.
