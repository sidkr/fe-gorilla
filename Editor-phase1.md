# Editor-phase1.md — closing the credibility gap

Phase 1 of the editor roadmap (see chat with the principal for full competitive analysis). Eight features that take the editor from "tech demo" to "credible enough to send a real campaign." Builds on `Editor.md`.

## Scope (this doc)

| # | Feature | Why |
|---|---|---|
| 1 | Campaign setup chrome | subject, preheader, From name, From email, Reply-to — cannot send without sender metadata |
| 2 | Audience selector (stubbed) | cannot send without recipients; wired to mock data until Audiences ships |
| 3 | Inline text editing (Heading + Paragraph) | THE biggest UX gap — clicking in the canvas to edit text is what every email tool does |
| 4 | Block hover toolbar | duplicate / delete / move ↑↓ without switching to the inspector |
| 5 | Undo / Redo | non-negotiable; Cmd+Z must work |
| 6 | Footer block (auto) | CAN-SPAM legal requirement: every email needs unsubscribe + business address |
| 7 | Mobile preview toggle | desktop ↔ mobile canvas render width |
| 8 | Pre-flight checklist | gate the Send button on required fields + Footer presence |

## Out of scope (deferred to Phase 2+)

- Columns / nested blocks
- Rich-text formatting (bold / italic / links / color)
- Merge tags substitution
- Image upload (URL-only continues)
- In-place image editing
- Global email styles
- Save-as-template
- Schedule send (date/time picker)
- Real Audiences integration (stub continues)
- Domain verification for From email (free-text + RFC validation only)
- Real test send / real send (still stubbed)

## 1. Campaign setup chrome

### Fields
| Field | Type | Required | Validation |
|---|---|---|---|
| `subject` | String | yes (for send) | non-empty, ≤150 chars, 1-char character counter |
| `preheader` | String | no | ≤120 chars, character counter |
| `fromName` | String | yes (for send) | non-empty, ≤80 chars |
| `fromEmail` | String | yes (for send) | RFC 5322 email (regex check) |
| `replyTo` | String | no | RFC 5322 if set; defaults to `fromEmail` |

All five live on the `Campaign` Parse class.

### UI placement

A **`<EditorSetup />` popover** anchored to a "Setup" button in the top bar. Click → drops a panel below the bar (~480px wide × auto height). Click outside or Escape closes.

Why a popover, not a separate tab/route:
- Editing setup happens once per campaign, then the user lives in the canvas. A persistent tab steals screen real estate.
- A separate route forces context-switch + autosave races.
- The popover doubles as the pre-flight "Click here to fix" anchor target.

The popover header shows the campaign name as an editable input (replaces the top-bar inline campaign name field — better real estate, room for char counters). Below: vertical stack of the five fields.

### Persistence

All five fields are part of the same `body`-save autosave debounce. No separate save action. Field-level validation surfaces inline; save proceeds regardless (we don't block writing to Parse on validation errors — pre-flight does that gating).

## 2. Audience selector (stubbed)

### UI

Dropdown sits inside `<EditorSetup />` as the sixth field, labeled "Send to". Renders as a custom select with the audience name + count.

### Mock audiences (stubbed in code until Audiences ships)

```js
const MOCK_AUDIENCES = [
  { id: "a_all",      name: "All subscribers",      count: 12847 },
  { id: "a_engaged",  name: "Engaged subscribers",  count: 8234 },
  { id: "a_newsletter", name: "Newsletter list",    count: 3201 },
];
```

### Persistence

Selected audience stored on Campaign as `audienceId: string`. Single-audience-per-campaign for Phase 1. Multi-segment / dynamic targeting is later.

When the real Audiences feature lands, this field's contract is unchanged — only the lookup source switches from `MOCK_AUDIENCES` to `new Parse.Query("List")`.

## 3. Inline text editing

Affects `HeadingBlock` and `ParagraphBlock` only. Other blocks (Image, Button, Divider, Spacer) are not text-editable in-place; they continue to use the inspector for label/alt/etc.

### Mechanics

In the **Render** mode of HeadingBlock and ParagraphBlock, the rendered text element becomes `contenteditable="plaintext-only"` when the block is selected.

```vue
<!-- HeadingBlock.vue (Render mode) -->
<component :is="tag"
  class="block-heading"
  :contenteditable="selected ? 'plaintext-only' : 'false'"
  @input="onInput"
  @blur="onBlur"
  v-text="props.text"
/>
```

- `plaintext-only` strips pasted formatting (no fancy paste handling needed).
- `@input` updates a local ref; on `@blur` (or after a 500ms debounce) commits the value back to `body.blocks[i].props.text` via the standard `update:props` event.
- The inspector's text field shows the same value and continues to work as an alternative path.

### Selection state

Clicking a block selects it AND focuses it for editing (cursor lands at the end of existing text). Clicking elsewhere blurs the contenteditable, commits the value, and deselects.

### Don't ship

- Rich text (bold / italic / links / color) — Phase 2
- Inline link inserter — Phase 2
- Paste sanitization beyond `plaintext-only` — Phase 2 (when rich text comes, DOMPurify on server)
- Newlines: Paragraph allows them (becomes `\n` in `html` prop); Heading does not (single line, `Enter` is preventDefault'd)

## 4. Block hover toolbar

A small floating toolbar to the right of each block. Visible on hover; persistent when the block is selected.

### Buttons (left to right)

| Icon | Action | Notes |
|---|---|---|
| ⇡ | Move up | disabled when block is first |
| ⇣ | Move down | disabled when block is last |
| ⧉ | Duplicate | inserts a deep clone immediately after this block; auto-selects the clone |
| ✕ | Delete | hard delete; no confirm (Undo brings it back) |

### Visuals

- Absolute-positioned right of the block, centered vertically.
- Stack of 4 24×24 buttons in a vertical pill (white surface, `var(--color-rule)` border, `var(--shadow-sm)`).
- Hover any button → it gets `var(--color-pop)` tint. Active block sets the whole toolbar visible permanently with a 1px coral outline.

### Footer block exception

Footer cannot be deleted or duplicated; show the move buttons only. Trying to delete shows a toast: "Removing the footer means your email won't have an unsubscribe link. Required by CAN-SPAM."

## 5. Undo / Redo

### Model

A simple **whole-body snapshot stack** in `EditorShell.vue`:

```ts
const undoStack = ref<Body[]>([]);
const redoStack = ref<Body[]>([]);
const MAX_HISTORY = 50;

function pushHistory(prev: Body) {
  undoStack.value.push(structuredClone(prev));
  if (undoStack.value.length > MAX_HISTORY) undoStack.value.shift();
  redoStack.value = []; // any new mutation clears redo
}

function undo() {
  const prev = undoStack.value.pop();
  if (!prev) return;
  redoStack.value.push(structuredClone(body.value));
  body.value = prev;
}

function redo() {
  const next = redoStack.value.pop();
  if (!next) return;
  undoStack.value.push(structuredClone(body.value));
  body.value = next;
}
```

Every mutation in `EditorShell` (setBlockProps, insertBlock, moveBlock, deleteBlock, duplicateBlock) calls `pushHistory(structuredClone(body.value))` *before* mutating.

### Throttling consecutive text edits

Inline typing fires `@input` every keystroke. We don't want a 50-character word to create 50 undo steps. Solution: for `setBlockProps` calls coming from inline editing, the editor calls `pushHistory` **only** on the first input within a 500ms window (per-block). Subsequent inputs to the same block within the window collapse into the same undo entry.

### Keyboard

- `Cmd/Ctrl+Z` → undo
- `Cmd/Ctrl+Shift+Z` AND `Cmd/Ctrl+Y` → redo
- Bind in `EditorShell.vue` via a single global `keydown` listener (only when no input/textarea is focused — let the browser handle native undo in form fields)

### Memory

Body sizes top out at a few KB for the MVP. 50 snapshots ≈ a few hundred KB max. Acceptable. Memory pressure becomes a concern at Columns or huge bodies — at which point we switch to a diff-based history.

## 6. Footer block

### Why
CAN-SPAM Act requires every commercial email to include (a) the sender's physical postal address and (b) a way to opt out. Without a Footer, the email is non-compliant.

### Block schema

```js
{ type: "footer", props: {
  businessAddress: "Folkways · 1234 Market St, San Francisco, CA 94103, USA",
  showUnsubscribe: true,    // visible toggle in inspector; defaults true; can't be turned off
  showWebVersion: false,    // optional "view in browser" link
} }
```

The `unsubscribe` link itself is a server-side substitution — the compiled HTML at send time injects a signed token (per Architecture.md). In-canvas preview shows a placeholder underlined "Unsubscribe" text.

### Inspector

- Business address: textarea
- "Show 'View in browser' link" checkbox
- (No way to remove unsubscribe — checkbox is disabled/checked with helper text "Required by CAN-SPAM.")

### Default insertion

New campaigns get Footer pre-inserted at the bottom of the starter body:

```js
[
  { id: ..., type: "heading",   props: { text: "Your headline goes here", level: 1, align: "left" } },
  { id: ..., type: "paragraph", props: { html: "Add a short intro…", align: "left" } },
  { id: ..., type: "button",    props: { label: "Click here", href: "https://example.com" } },
  { id: ..., type: "footer",    props: { businessAddress: "{{your business address}}", showUnsubscribe: true } },
]
```

The placeholder address `{{your business address}}` will eventually pull from the Organization in cloud code — for Phase 1 we leave it as a literal placeholder; the user can edit it.

### Drag-drop constraint

Footer cannot be dragged ABOVE any non-footer block. The drop zone logic skips zones above existing non-footer blocks when the dragged block is Footer. If the user moves another block below the footer, the footer auto-shifts to remain last (the editor enforces "footer is always last" on every body mutation).

## 7. Mobile preview toggle

### UI

Top-bar segmented toggle, two buttons:

```
[ Desktop  Mobile ]
```

Active button gets the `var(--color-pop-bg)` tint + ink text.

### Behavior

- Default: Desktop (canvas at ~600px width)
- Mobile: canvas at 360px width
- Width swap is animated (200ms ease) so the transition reads as a visible state change
- Selection state survives the toggle
- Preference persists in `localStorage` under `gorilla_editor_preview_width` (per-browser, not per-user)

### What changes

Only the canvas's `max-width` and the bounding-rect of every block's measured layout. Block rendering itself is unchanged — the same Vue components render at narrower width. No mobile-specific block variants (those land in Phase 3 as "per-block mobile overrides").

## 8. Pre-flight checklist

### UI

Click "Send" → opens a modal titled "Ready to send?" with a checklist instead of the current "Are you sure?" stub.

### Checks

| Check | Pass condition | Fix link |
|---|---|---|
| Subject set | `campaign.subject?.trim().length > 0` | Opens setup popover, focuses subject |
| From name set | `campaign.fromName?.trim().length > 0` | Opens setup popover, focuses fromName |
| From email valid | non-empty + RFC regex | Opens setup popover, focuses fromEmail |
| Audience selected | `campaign.audienceId` non-empty | Opens setup popover, focuses audience selector |
| Email has content | `body.blocks` contains at least one non-footer block | (n/a — implicit) |
| Footer present | `body.blocks` includes a `footer` block | (n/a — auto-inserted, so this almost always passes; surfaces if user manually deleted) |

Each row:
- Icon: ✓ (success, `--color-ok`), ⚠ (warning, `--color-warn`), ✗ (fail, `--color-danger`)
- Label
- Description (one line)
- "Edit →" link on failing checks (focuses the relevant control)

### Send button gating

- If all checks pass: primary "Send to {{audience-count}} recipients" CTA enabled
- If any fail: CTA disabled with text "{N} item{s} need attention"
- Below the CTA: "Send a test first" link → opens the existing test-send popover

### Schedule

Out of Phase 1 — leave a placeholder ghost button "Schedule for later" that toasts "Scheduling lands in the next iteration."

## Data model changes

`Campaign` Parse class gains the following fields. All optional in storage (a draft can have partial setup); the pre-flight checklist enforces send-readiness.

```js
campaign.set("subject",     string | null);
campaign.set("preheader",   string | null);
campaign.set("fromName",    string | null);
campaign.set("fromEmail",   string | null);
campaign.set("replyTo",     string | null);
campaign.set("audienceId",  string | null);
// existing: name, body, status, createdBy
```

These are written by the editor on autosave alongside `body`. No schema migration needed (Parse auto-extends on first save with new fields, per the `allowClientClassCreation` setting).

## File layout

```
components/app/editor/
  EditorShell.vue                  ← + setup state, audience state, undo/redo stacks, mobile-width state
  EditorTopBar.vue                 ← + Setup button (popover trigger), Preview toggle (Desktop/Mobile), Send replaces with pre-flight modal
  EditorSetup.vue                  ← NEW. The popover: subject/preheader/from/replyTo + audience selector
  AudienceSelector.vue             ← NEW. Custom dropdown with mock data
  BlockHoverToolbar.vue            ← NEW. Floating per-block toolbar
  PreflightChecklist.vue           ← NEW. The send-modal replacement
  EditorCanvas.vue                 ← + hover toolbar slot, inline-editing wiring on selected block, mobile-width prop
  blocks/
    HeadingBlock.vue               ← + contenteditable on render
    ParagraphBlock.vue             ← + contenteditable on render
    FooterBlock.vue                ← NEW. Render + Inspect modes
    registry.ts                    ← + footer registration; default-body update (Heading + Paragraph + Button + Footer)
```

## Key interaction sequences

### Send flow (post Phase 1)

```
user clicks "Send"
  → PreflightChecklist modal opens
  → runs all checks against current campaign + body
  → if any fail: rows show with "Edit →" links
    user clicks "Edit →" on subject
    → modal closes, setup popover opens, subject input focused
  → if all pass: primary CTA "Send to 12,847 recipients" is enabled
    user clicks → currently still STUBBED (toast "Send pipeline lands in next iteration")
```

### Inline edit + undo

```
user clicks Heading "Your headline goes here"
  → block selected, contenteditable activates, cursor at end
user types "Spring sale is here"
  → @input fires repeatedly
  → setBlockProps called with the new text on each keystroke
  → first @input within the 500ms window pushes pre-edit body to undoStack
  → subsequent within window collapse into same undo entry
user presses Cmd+Z
  → undoStack pops; body becomes previous; redoStack receives the post-edit body
  → Heading reverts to "Your headline goes here"
user presses Cmd+Shift+Z
  → redoStack pops; body becomes the typed version
```

## Open questions (flag if hit during implementation)

1. **Footer's business address placeholder** — render the literal string `{{your business address}}` in canvas, or replace with a real placeholder ("[Your business address — required by law]")? Lean: real placeholder, more obvious it needs to be filled.
2. **Inline edit on Button label** — Button has a label that's clearly text; should it also be inline-editable? Lean: defer to Phase 2 (the label is shorter and edit-in-inspector is fine; doesn't have the keystroke pain of long paragraphs).
3. **Undo throttle window** — 500ms feels right; might be too short on slow typists. Revisit if user feedback indicates.
4. **Pre-flight Audience-count display** — "Send to {{12,847}} recipients" requires the count from the audience. Use the mock count in MOCK_AUDIENCES; verify it stays in sync when Audiences ships.
