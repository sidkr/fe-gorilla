# Testing Plan — Campaigns & Editor

Scope: the Campaigns surface (`/app/campaigns`) and the block-based Email Editor
(`/app/campaigns/[id]/edit`), plus the cloud functions and pure modules they
lean on. This document is the test contract for that feature group. It maps what
already exists, what's missing, and exactly which cases to add and at which
layer.

Stack (per DECISIONS #7):

- **Unit / integration:** Vitest. Default env `node`; component tests opt into
  `happy-dom` via a `// @vitest-environment happy-dom` file header. `pool: forks`
  (one process per file so Parse SDK + Agenda singletons reset). Node 20.
- **Server integration:** real Parse Server v7 + in-memory Mongo booted per file
  via `tests/setup/parseServer.ts → startTestParseServer()`. Cloud code under
  test is `server/cloud/main.js`.
- **E2E:** Playwright (`playwright.config.ts`, `tests/e2e/**`, excluded from the
  Vitest run). Fixtures in `tests/setup/playwrightFixtures.ts`.
- **Component mounting:** `tests/setup/vueTest.ts → mountWithPinia()` (@vue/test-utils
  + Pinia, no @nuxt/test-utils).

Hard constraint that shapes the plan: **the Vitest config does not register
`@vitejs/plugin-vue`**, so real `.vue` SFCs cannot be compiled in unit tests
today (see `tests/components/_example.test.ts` and the note atop
`mergeTagPicker.test.ts`). All current "component" tests exercise the pure /
DOM-glue logic the SFC wraps, not the SFC itself. This is the single biggest
coverage gap and is called out throughout §5.

Multi-tenancy facts used by every server case:

- A tenant is created with `Parse.Cloud.run("signUpWithOrg", { username, password,
  company })` → `{ sessionToken, userId, orgId }`.
- `Parse.User.become()` is blocked server-side; act as a user by passing
  `{ sessionToken }` to every `save` / `query` / `Cloud.run`.
- `compileBlocks` runs as a `registerBeforeSave("Campaign", …)` extension (from
  `tenantHooks`, NOT `Parse.Cloud.beforeSave` — the tenancy stamp owns that).
- `Campaign.body = { version: 1, blocks: [{ id, type, props }] }`; block types:
  `heading | paragraph | image | button | divider | spacer | footer`.
- `audienceId` is a **String** List id (not a pointer); `compiledHtml` is the
  compiled output String.

---

## 1. Scope & routes

| Route / module | Type | Under test |
|---|---|---|
| `/app/campaigns` (`pages/app/campaigns/index.vue`) | CSR page | list load, KPI strip, filter tabs, per-row kebab actions, status-guard gating of menu items, rename modal, delete/archive confirm dialogs, optimistic updates, error banners |
| `/app/campaigns/new` (`pages/app/campaigns/new.vue`) | CSR bootstrapper | creates a `draft` Campaign with `makeDefaultBody()` + null setup fields, redirects (`replace:true`) to the editor, error surface on failure |
| `/app/campaigns/[id]/edit` (`pages/app/campaigns/[id]/edit.vue`) | CSR page | loads Campaign by id, mounts `EditorShell`, not-found / loading surfaces |
| `EditorShell.vue` | component | the orchestrator: body state, selection, block ops, undo/redo, autosave debounce + flush, dirty/beforeunload guard, keyboard, setup popover wiring, preflight checks computation, send wiring, preview-width persistence, footer-last invariant |
| `blocks/registry.ts` | pure module | block defaults, `makeBlockId`, `makeDefaultBody`, `blockTypesInOrder`, client `compileMjml` stubs, `escapeAttr` |
| `MergeTagPicker.vue` | component | grouped dropdown (Standard / Custom), lazy load on open, emits `insert(formatTag(token))`, dismissal |
| `EditorPreview.vue` | component | iframe srcdoc render of live body, sample-data toggle → `resolveMergeTags`, per-block HTML, escaping |
| `PreflightChecklist.vue` | component | presenter of pre-computed checks, `canSend` gating, CTA copy, send-stage panels (idle/sending/sent/error), edit deep-links |
| `EditorTestSendPopover.vue` | component | save-then-`sendTestEmail` flow, stage machine, click-outside dismissal/reset |
| `composables/app/useCampaigns.ts` | composable | typed wrappers over campaign cloud fns via `runCloud` |
| `composables/app/useMergeTags.ts` | pure + composable | `resolveMergeTags`, `buildMergeTags`, `formatTag`, `insertAtCursor`, `sampleValueForField`, `loadTags` |
| `composables/app/useSending.ts` | composable | typed wrappers over `scheduleSend` / `sendTestEmail` / `cancelScheduledSend` |
| `server/cloud/campaigns.js` | cloud code | `compileBlocks` beforeSave, `listCampaigns`, `getCampaign`, `duplicateCampaign`, `archiveCampaign`, `renameCampaign`, `updateCampaign`, `deleteCampaign` + the full status-guard matrix + tenant isolation |

Out of scope here (own plans): the send pipeline internals (`scheduleSend`,
fanout, SES adapter, tracking, webhooks), Audiences/Segments/Contacts CRUD,
Reports, and the editor sub-components not listed above (`EditorCanvas`,
`EditorInspector`, `EditorSetup`, `EditorTopBar`, `AudienceSelector`,
`BlockLibrary`, the individual `blocks/*.vue` Render/Inspect SFCs) except where
the Shell drives them.

---

## 2. Test matrix

Layers: **U** = pure unit (node), **C** = component (happy-dom), **S** = server
integration (Parse + Mongo), **E** = Playwright E2E.

| Area | U | C | S | E |
|---|:--:|:--:|:--:|:--:|
| `compileBlocks` (per-block MJML, recompile-on-dirty, graceful empty/partial) | ◐ (registry stubs) | — | ●●● | — |
| Campaign CRUD + status-guard matrix | — | — | ●●● | ◐ |
| `duplicateCampaign` clones body/meta into draft | — | — | ●● | — |
| `listCampaigns` rows + KPIs + audience-name resolution | — | — | ●● | ◐ |
| Campaigns list UI (tabs, kebab gating, modals, optimistic) | — | ●● | — | ●● |
| `/campaigns/new` bootstrap → editor redirect | — | ◐ | ◐ | ● |
| Editor block ops (add/move/delete/duplicate, footer-last) | ● (logic extract) | ● | — | ● |
| Undo / redo (incl. inline-edit collapse window) | ● | ● | — | ◐ |
| Autosave debounce + flush + dirty/beforeunload | ● | ● | ◐ | — |
| Pre-flight checks computation + gating | ● (checks fn) | ● | — | ● |
| Merge-tag insert + `resolveMergeTags` (token/default/missing) | ●●● | ● | — | — |
| Sample-data preview render | — | ● | — | ◐ |
| Test-send + Send wiring (`useSending`) | ●● | ● | ●● | ● |
| Tenant isolation (campaigns cross-org) | — | — | ●●● | — |

● = should exist / planned, ◐ = partial or nice-to-have, — = not applicable.
Bold counts are an effort hint, not a literal test count.

---

## 3. Detailed test cases

`PRIORITY`: **P0** = release-blocking (data integrity, money/send, tenant
isolation, status guards), **P1** = core UX correctness, **P2** = polish /
robustness.

### 3.1 `compileBlocks` (Layer S — `server/cloud/campaigns.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CB-01 | S | Heading compiles | signUp; save Campaign with one `heading` block (`text`, `level:1`, `align:center`, `color`) | `compiledHtml` is a non-empty string, contains `<table` (MJML scaffold) and the heading text; `font-size:28px` for level 1 | P0 |
| CB-02 | S | Heading level → size map | save headings with `level` 1/2/3 and an out-of-range level (e.g. 5) | sizes 28/22/18px respectively; out-of-range falls back to `h1`/28px (server clamps `level` to 1–3, else 1) | P1 |
| CB-03 | S | Paragraph escapes as plain text | save `paragraph` with `html` containing `<script>` / `&` / `<>` | output escapes the markup (`&lt;script&gt;`), never emits a live tag — proves the injection guard | P0 |
| CB-04 | S | Image renders + optional link | save `image` with `src`, `alt`, `width`, `linkHref` | `<mj-image>` present with src/alt/width; wrapped in `href` when `linkHref` set | P1 |
| CB-05 | S | Image with no `src` skipped | save `image` with empty `src` among other blocks | that block emits nothing; other blocks still render; no throw | P1 |
| CB-06 | S | Button renders | save `button` with `label`/`href`/`bg`/`fg`/`radius` | `<mj-button>` with bg/fg/href/border-radius; label text present | P1 |
| CB-07 | S | Divider + spacer render | save `divider` (`color`,`thickness`) and `spacer` (`height`) | `<mj-divider border-width>` and `<mj-spacer height>` present with numbers | P2 |
| CB-08 | S | Footer unsubscribe default-on | save `footer` with `showUnsubscribe` absent | output contains `{{unsubscribeUrl}}` link (server defaults unsubscribe ON when prop absent — CAN-SPAM) | P0 |
| CB-09 | S | Footer web-version optional | footer with `showWebVersion:true` vs default false | `{{webVersionUrl}}` present only when true; `{{unsubscribeUrl}}` always preserved verbatim (server owns substitution) | P1 |
| CB-10 | S | Footer unsubscribe explicit-off | footer with `showUnsubscribe:false` | no `{{unsubscribeUrl}}` link emitted (explicit opt-out honored) | P1 |
| CB-11 | S | bodyBg validation | save with valid hex `bodyBg` and with garbage (`"red"`, `"<x>"`) | valid hex used as `<mj-body background-color>`; invalid falls back to `#F2F2F7`; no injection | P1 |
| CB-12 | S | Empty / blockless body | save `{ version:1, blocks:[] }` | no throw; `compiledHtml` is a string containing `<table` and the "no content yet" placeholder text | P0 |
| CB-13 | S | Partial / malformed block degrades | body with a block missing `type`, a block of unknown type, and a block whose props are absent | unknown/typeless blocks skipped; valid blocks still render; no throw; `compiledHtml` non-empty | P0 |
| CB-14 | S | Recompile only when body dirty | save with body → capture `compiledHtml`; then `set("status","scheduled")` + save (body untouched) | second fetch's `compiledHtml` is byte-identical to first (counter-only update does not pay MJML cost) | P0 |
| CB-15 | S | Recompile when body changes | save body; change a block's text; save | `compiledHtml` reflects the new text and no longer contains the old text | P0 |
| CB-16 | S | Compile when compiledHtml missing | save body, then null out `compiledHtml` via master key, then save a non-body field | `needsCompile` triggers because `compiledHtml` is falsy → recompiled (covers the `|| !object.get("compiledHtml")` branch) | P1 |
| CB-17 | S | No body at all → no-op | new Campaign with `name` only, no `body` | save succeeds; `compiledHtml` left unset (hook returns early); no throw | P1 |
| CB-18 | U | Client `compileMjml` stubs match contract shape | call `registry[type].compileMjml(props)` for each type | returns the expected `<mj-*>` fragment; `escapeAttr` escapes `&"<>`; documents that the server is canonical and the client stub is debug-only | P2 |

> Note CB-18 is the only `compileBlocks`-adjacent **unit** coverage; the
> authoritative renderer is the server hook (Layer S). Keep the two in sync — a
> divergence test (CB-DIV, P2) could assert client-stub and server output agree
> on a fixed body, but is optional given the server is the security boundary.

### 3.2 Campaign CRUD + status-guard matrix (Layer S)

Status domain: `draft | scheduled | sending | sent | paused | archived`.

**Guard matrix being verified** (mirror of the `campaigns.js` header):

| Op | draft | scheduled | paused | sending | sent | archived |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| rename / update | ✅ | ✅ | ✅ | ❌ FORBIDDEN | ❌ FORBIDDEN | ❌ FORBIDDEN |
| archive | ✅ | ✅ | ✅ | ❌ FORBIDDEN | ✅ | ✅ (no-op) |
| delete | hard | hard | hard | ❌ FORBIDDEN | soft→archived | hard |
| duplicate | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CR-01 | S | `listCampaigns` org-scoped rows | signUp; create draft+sent+archived | returns 2 rows (archived excluded); names match; correct `status`/`date`/`relative` | P0 |
| CR-02 | S | `listCampaigns` audience name resolution | create a `List`, set `audienceId` to its id on a campaign | row `audience` equals the List name; List query is org-scoped | P1 |
| CR-03 | S | `listCampaigns` audience id with no matching List | `audienceId` set to a bogus id | row `audience` is `null` (resolves missing id gracefully) | P2 |
| CR-04 | S | `listCampaigns` KPIs | mix of draft/sent/scheduled with `openRate` on sent | `kpis.total/drafts/sent/scheduled` correct; `avgOpenRate` is the formatted mean over sent-with-numeric-openRate | P1 |
| CR-05 | S | `avgOpenRate` null when no sends | only drafts | `kpis.avgOpenRate` is `null` | P1 |
| CR-06 | S | `getCampaign` returns body + compiledHtml | save campaign, run `getCampaign` | returns plain object with `body.blocks`, `compiledHtml`, all setup fields, ISO timestamps | P1 |
| CR-07 | S | `getCampaign` cross-org isolation | A saves; B runs `getCampaign({id})` | B rejects (ACL → OBJECT_NOT_FOUND) | P0 |
| CR-08 | S | `getCampaign` missing id | run with no `id` | rejects OBJECT_NOT_FOUND | P2 |
| CR-09 | S | `getCampaign` unauth | run with no session | rejects INVALID_SESSION_TOKEN | P1 |
| CR-10 | S | `duplicateCampaign` clones body+meta into draft | source `sent` with subject/audienceId/body | new object: name `"<name> (copy)"`, `status:"draft"`, subject/audienceId copied, body cloned (5 blocks), `compiledHtml` recompiled, same org | P0 |
| CR-11 | S | `duplicate` deep-clones body (no shared refs) | duplicate, then mutate source body | dupe body unchanged (JSON deep clone) | P1 |
| CR-12 | S | `duplicate` drops sent-only stats/schedule | source with `openRate`/`sentAt`/`scheduledAt` | dupe has none of these carried over | P1 |
| CR-13 | S | `duplicate` allowed from any status | duplicate a `sending` and a `sent` source | both succeed → fresh draft | P1 |
| CR-14 | S | `duplicate` cross-org isolation | B duplicates A's campaign | rejects (ACL) | P0 |
| CR-15 | S | `archiveCampaign` flips to archived + hidden | draft → archive | `status:"archived"`; absent from subsequent `listCampaigns` | P0 |
| CR-16 | S | `archive` rejected while sending | status `sending` → archive | rejects OPERATION_FORBIDDEN; status unchanged | P0 |
| CR-17 | S | `archive` of already-archived is a no-op | archive an archived campaign | succeeds `{ok:true}`; stays archived | P2 |
| CR-18 | S | `renameCampaign` trims + saves | draft, rename `"  X  "` | returns `name:"X"`; persisted trimmed | P1 |
| CR-19 | S | `rename` rejects empty | rename to `"   "` | rejects VALIDATION_ERROR | P1 |
| CR-20 | S | `rename` rejected on sent | sent → rename | rejects OPERATION_FORBIDDEN | P0 |
| CR-21 | S | `rename` rejected on sending/archived | each status → rename | rejects OPERATION_FORBIDDEN | P0 |
| CR-22 | S | `updateCampaign` patches editable + ignores unknown keys | draft, patch subject/preheader/fromEmail/scheduledAt + status/compiledHtml/body | patchable fields applied; status/compiledHtml/body unchanged (non-patchable ignored) | P0 |
| CR-23 | S | `update` clears string with `""` and unsets `scheduledAt` with `null` | scheduled w/ subject+scheduledAt → patch `{subject:"", scheduledAt:null}` | subject `null`; `scheduledAt` unset | P1 |
| CR-24 | S | `update` scheduledAt accepts ISO/epoch/Date | patch each form | stored as the equivalent Date | P2 |
| CR-25 | S | `update` scheduledAt invalid date rejects | patch `scheduledAt:"not-a-date"` | rejects INVALID_JSON | P2 |
| CR-26 | S | `update` name empty rejects | patch `{name:""}` | rejects VALIDATION_ERROR | P1 |
| CR-27 | S | `update` patch not an object rejects | patch is an array / string | rejects INVALID_JSON | P2 |
| CR-28 | S | `update` rejected on sent / sending / archived | each → patch | rejects OPERATION_FORBIDDEN | P0 |
| CR-29 | S | `update` allowed on paused | paused → patch subject | succeeds; persisted | P1 |
| CR-30 | S | `update` no-op when no patchable keys applied | patch only unknown keys | `{ok:true}`; no save side-effects (e.g. `updatedAt` semantics documented) | P2 |
| CR-31 | S | `deleteCampaign` hard-destroys draft | draft → delete | `{ok:true, deleted:true}`; object gone | P0 |
| CR-32 | S | `delete` hard-destroys scheduled/paused/archived | each → delete | `deleted:true`; object gone | P1 |
| CR-33 | S | `delete` soft-archives sent | sent → delete | `{ok:true, deleted:false}`; `status:"archived"`; object still present | P0 |
| CR-34 | S | `delete` rejected while sending | sending → delete | rejects OPERATION_FORBIDDEN; still present + still sending | P0 |
| CR-35 | S | `delete` cross-org isolation | B deletes A's | rejects | P0 |
| CR-36 | S | Mutations isolate across orgs (rename/update/delete) | B targets A's id for each | all reject | P0 |
| CR-37 | S | Unauth mutation rejects | call each mutation with no session | rejects INVALID_SESSION_TOKEN (via `loadOwned`) | P1 |

### 3.3 Composable wrappers (Layer U — mock `useCloud`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CM-01 | U | `useCampaigns` wrappers call correct cloud fn + params | mock `runCloud`; call each (list/get/duplicate/archive/rename/update/delete) | each calls `runCloud("<fn>", <expected params>)`; return value passed through | P1 |
| CM-02 | U | `useCampaigns` propagates errors | `runCloud` rejects | wrapper rejects with same error | P2 |
| CM-03 | U | `useSending.scheduleSend` defaults `when:"now"` | already covered | calls `runCloud("scheduleSend",{campaignId,when:"now"})` | P0 |
| CM-04 | U | `useSending.scheduleSend` passes explicit `when` | covered | ISO timestamp forwarded | P1 |
| CM-05 | U | `useSending` propagates send errors | covered | rejection surfaces to caller | P0 |
| CM-06 | U | `useSending.sendTestEmail` forwards recipients (array + string) | covered | params forwarded unchanged | P1 |
| CM-07 | U | `useSending.cancelScheduledSend` | covered | calls with `{campaignId}` | P2 |

### 3.4 Merge tags & resolution (Layer U / C — `useMergeTags.ts`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| MT-01 | U | Resolve known standard field | `resolveMergeTags("Hi {{firstName}}",{firstName:"Sam"})` | `"Hi Sam"` | P1 |
| MT-02 | U | Multiple tags in one string | `{{firstName}} @ {{company}}` | both substituted | P1 |
| MT-03 | U | Whitespace inside braces tolerated | `{{  firstName  }}` | resolves | P2 |
| MT-04 | U | Default sample contact when none passed | `resolveMergeTags("Hi {{firstName}}")` | uses `SAMPLE_CONTACT.firstName` | P2 |
| MT-05 | U | Inline default used when value missing | `{{firstName\|there}}` on `{}` | `"there"` | P1 |
| MT-06 | U | Contact value beats inline default | `{{firstName\|there}}` w/ firstName | contact value wins | P1 |
| MT-07 | U | Missing + no default → `[token]` placeholder | `{{firstName}}` on `{}` | `"[firstName]"` | P1 |
| MT-08 | U | `missing:"empty"` strategy | same, opts `{missing:"empty"}` | `""` | P1 |
| MT-09 | U | Empty-string value treated as missing | firstName `""` w/ default | default used | P2 |
| MT-10 | U | Custom field from contact.customFields | `{{custom.plan}}` w/ `{plan:"Pro"}` | `"Pro"` | P1 |
| MT-11 | U | Custom field typed sample fallback | `{{custom.plan}}` enum def, no value | first enum value | P1 |
| MT-12 | U | Unknown custom key, no def → placeholder | `{{custom.unknown}}` | `"[custom.unknown]"` | P2 |
| MT-13 | U | Footer link tokens NOT special-cased | `{{unsubscribeUrl}}` | `"[unsubscribeUrl]"` (resolver leaves server tokens alone) | P1 |
| MT-14 | U | Stray single braces untouched | `"a { b } c"` | unchanged | P2 |
| MT-15 | U | Empty input returns `""` | `""` | `""` | P2 |
| MT-16 | U | `buildMergeTags` standard-only with no custom | `buildMergeTags([])` | equals `STANDARD_MERGE_TAGS` | P1 |
| MT-17 | U | `buildMergeTags` appends one custom tag per field | one field | `custom.<key>` tag with label + type | P1 |
| MT-18 | U | `formatTag` wraps token | `firstName` / `custom.plan` | `{{firstName}}` / `{{custom.plan}}` | P2 |
| MT-19 | U | `sampleValueForField` per type | number/boolean/enum/date/text | type-appropriate samples | P2 |
| MT-20 | U(DOM) | `insertAtCursor` splices at caret | input value + caret | spliced; caret after token | P1 |
| MT-21 | U(DOM) | `insertAtCursor` replaces selection | selected range | range replaced | P1 |
| MT-22 | U(DOM) | `insertAtCursor` fires native `input` event | listener | event fires with new value (v-model path) | P1 |
| MT-23 | U(DOM) | `insertAtCursor` null element safe | `insertAtCursor(null,…)` | returns `""` | P2 |
| MT-24 | C | `MergeTagPicker` groups Standard/Custom + lazy load | mount, open | `loadTags` called once on first open; standard group rendered; custom group only when custom fields exist; empty-state copy when none | P1 |
| MT-25 | C | `MergeTagPicker` emits `insert(formatTag(token))` | click a tag | emits formatted token; closes menu | P1 |
| MT-26 | C | `MergeTagPicker` dismissal | mousedown outside / Escape | menu closes | P2 |

### 3.5 Editor — block ops, undo/redo, autosave (Layer C/U — `EditorShell.vue`)

These need either an SFC-capable harness (see §5 gap) or extraction of the
pure mutation logic into a testable module. Cases are written as behaviors.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| ED-01 | C | `normalizeBody` keeps only known block types | load body with an unknown-type block + a valid one | unknown dropped; valid kept; props merged over registry defaults | P1 |
| ED-02 | C | `normalizeBody` falls back to default body | load `null`/garbage body | `makeDefaultBody()` (heading, paragraph, button, footer) | P1 |
| ED-03 | C | Footer forced last on load | body with footer in the middle | footer moved to end | P0 |
| ED-04 | C | `insertBlock` adds + selects + footer-last | insert `paragraph` at index past footer | block inserted, becomes selected, footer still last | P1 |
| ED-05 | C | `insertBlock` clamps index | insert at index -5 / 999 | clamped to [0, len] | P2 |
| ED-06 | C | `moveBlock` reorders + re-normalizes footer | move a block below footer | order changes but footer ends last | P1 |
| ED-07 | C | `moveBlockBy` up/down respects footer boundary | move non-footer down past footer; move footer up | both no-op at the boundary | P1 |
| ED-08 | C | `duplicateBlock` clones props + selects clone | duplicate a button | clone inserted after source, new id, selected | P1 |
| ED-09 | C | `duplicateBlock` footer blocked | duplicate footer | no-op; toast "Only one footer per email." | P1 |
| ED-10 | C | `deleteBlock` removes + clears selection | delete selected block | removed; `selectedBlockId` cleared | P1 |
| ED-11 | C | `deleteBlock` footer blocked | delete footer | no-op; CAN-SPAM toast | P0 |
| ED-12 | C | Keyboard Delete/Backspace deletes selected | select block, press Delete | block deleted (unless in text field) | P1 |
| ED-13 | C | Keyboard Arrow moves selection | select, ArrowUp/Down | selection moves to neighbor, clamped | P2 |
| ED-14 | C | Escape clears selection | press Escape | `selectedBlockId` null | P2 |
| ED-15 | C/U | Undo restores pre-mutation body | insert then Cmd+Z | body returns to prior state; redo available | P0 |
| ED-16 | C/U | Redo re-applies | undo then Cmd+Shift+Z (or Cmd+Y) | mutation re-applied | P1 |
| ED-17 | C/U | New mutation clears redo stack | undo, then new edit | `canRedo` false | P1 |
| ED-18 | C/U | Inline-edit collapses within 500ms window | several `onInlineInput` to same block <500ms apart | single undo entry (one `pushHistory`) | P1 |
| ED-19 | C/U | Inline-edit new group after window / block switch | input >500ms later or different block | new undo entry | P1 |
| ED-20 | C/U | Undo history capped at MAX_HISTORY (50) | 60 mutations | stack length ≤ 50 (oldest dropped) | P2 |
| ED-21 | C/U | Undo inside form field defers to native | Cmd+Z while focus in `<input>`/`<textarea>` | shell does NOT intercept (native undo) | P2 |
| ED-22 | C/U | Autosave debounces 1.5s | mutate, advance fake timers 1.5s | `campaign.save()` called once | P1 |
| ED-23 | C/U | Rapid mutations debounce to one save | several mutations within window | a single save at the end | P1 |
| ED-24 | C/U | Cmd/Ctrl+S flushes immediately + cancels pending | mutate then Cmd+S | save fires now; pending timer cleared; no double save | P1 |
| ED-25 | C/U | Save serializes name+body+setup fields, clears dirty | save | `campaign.set` called for name/body/subject/preheader/fromName/fromEmail/replyTo/audienceId/bodyBg; empty strings → null; `dirty=false`; `lastSavedAt` updated | P0 |
| ED-26 | C/U | Save re-entrancy guard | call save while saving | second call no-ops (`saving` guard) | P1 |
| ED-27 | C/U | Save failure keeps changes + toasts | mock `campaign.save` reject | error toast; `dirty` stays true | P0 |
| ED-28 | C/U | beforeunload guard when dirty | dirty=true, dispatch beforeunload | `preventDefault` called (browser prompt) | P1 |
| ED-29 | C/U | Preview-width persists to localStorage | set mobile | `localStorage[gorilla_editor_preview_width]="mobile"`; restored on mount | P2 |
| ED-30 | C | Setup popover toggle + focus field | open setup, then preflight "Edit" deep-link | popover opens anchored; `focusField` set to the requested field | P2 |

### 3.6 Pre-flight checklist + gating (Layer C/U)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| PF-01 | C/U | All checks pass when ready | subject + fromName + valid fromEmail + audience + content + footer | 6 checks `ok`; `canSend` true | P0 |
| PF-02 | C/U | Missing subject fails | blank subject | subject check `fail` with fixField `subject`; `canSend` false | P1 |
| PF-03 | C/U | Invalid fromEmail fails | `from` = `"nope"` | fromEmail check `fail` (regex) | P1 |
| PF-04 | C/U | No audience fails | `audienceId` not in loaded audiences | audience check `fail` | P1 |
| PF-05 | C/U | No content is a WARN not a fail | only footer block | content check `warn`; does NOT block send (warn ≠ fail) | P1 |
| PF-06 | C/U | Missing footer fails | footer removed (edge) | footer check `fail` | P1 |
| PF-07 | C | CTA copy reflects recipient count | passing + recipientCount=1234 | "Send to 1,234 recipients" | P2 |
| PF-08 | C | CTA copy when failing | 2 fails | "2 items need attention"; Send disabled | P1 |
| PF-09 | C | `PreflightChecklist` send-stage panels | set stage idle/sending/sent/error | correct panel; close disabled while sending; error shows `sendError`; sent shows recipient count | P1 |
| PF-10 | C | Edit deep-link emits field | click a failing row's Edit | emits `edit(fixField)` | P2 |
| PF-11 | C | "Schedule for later" toasts placeholder | click | emits toast "Scheduling lands in the next iteration." | P2 |

### 3.7 Test-send + Send wiring (Layer C / S)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| TS-01 | C | Test-send saves before sending | open popover, click Send test | `saveFn()` awaited, THEN `sendTestEmail(campaignId,[email])` (compiledHtml fresh) | P0 |
| TS-02 | C | Test-send success panel | resolve with messageId/sentTo | stage `sent`; shows recipient + messageId | P1 |
| TS-03 | C | Test-send error panel + retry | reject | stage `error`; error message; button reads "Try again" | P1 |
| TS-04 | C | Test-send disabled with empty email / while sending | empty input / mid-send | Send button disabled | P2 |
| TS-05 | C | Test-send click-outside closes + resets | mousedown outside popover | closes; state reset to idle | P2 |
| TS-06 | C/U | Pre-flight Send flushes save then scheduleSend | `onPreflightSend` | `save()` awaited then `scheduleSend(id,"now")`; on success stage `sent`, recipient count set | P0 |
| TS-07 | C/U | Pre-flight Send error surfaces inline | `scheduleSend` rejects ("no verified recipients") | stage `error`; `sendError` = message; can dismiss back to checklist | P0 |
| TS-08 | C/U | Send re-entrancy guard | `onPreflightSend` while in flight | second call no-ops | P1 |
| TS-09 | C/U | Send success → route to campaigns | `onSendSuccessDone` | preflight closed, stage reset, router pushes `/app/campaigns` | P2 |
| TS-10 | C/U | Cannot close pre-flight mid-send | `onPreflightClose` while `sendInFlight` | no-op (stays open) | P1 |

### 3.8 Campaigns list UI (Layer C / E)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| LS-01 | C | Tabs filter by status | rows of mixed status, click Drafts | only `draft` rows shown; counts correct; "All" shows everything | P1 |
| LS-02 | C | Kebab menu gates by status | render `sent` / `sending` / `draft` rows | `sent`: no Edit/Rename, has Duplicate + Delete (soft) + Archive; `sending`: only Duplicate (no edit/archive/delete); `draft`: all actions | P0 |
| LS-03 | C | Row href: draft→edit, else detail | inspect `rowHref` | draft → `/edit`, others → detail route | P2 |
| LS-04 | C | Rename modal validates empty | open rename, blank, confirm | inline error "Name can't be empty."; no cloud call | P1 |
| LS-05 | C | Rename optimistic update | confirm rename | row name updates locally; `renameCampaign` called | P1 |
| LS-06 | C | Delete confirm copy differs for sent | open delete on sent vs draft | sent → "Archive this campaign?" soft copy; draft → permanent-delete copy | P1 |
| LS-07 | C | Archive optimistic removal | archive a row | row removed immediately; `archiveCampaign` called; reload | P1 |
| LS-08 | C | Action error banner on failure | mock duplicate/archive/delete reject | banner shows message; dismissable | P1 |
| LS-09 | C | Load error state | `listCampaigns` rejects | error state rendered; empty table | P2 |
| LS-10 | C | Busy row disables kebab | mid-action | kebab disabled; row dimmed | P2 |
| LS-11 | E | Full list happy path | seeded org, visit `/app/campaigns` | KPIs + rows render; tab switch works | P1 |

### 3.9 `/campaigns/new` + editor load (Layer C / S / E)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| NW-01 | S | New draft shape is CAN-SPAM-ready | replicate `new.vue` save (default body, status draft, null setup fields) | saved Campaign has 4-block body incl. footer; `compiledHtml` has `{{unsubscribeUrl}}` | P0 |
| NW-02 | C | `new.vue` redirects to editor (replace) | mock Parse save | `navigateTo("/app/campaigns/<id>/edit",{replace:true})` | P1 |
| NW-03 | C | `new.vue` error surface | save rejects | error message rendered; "Back to dashboard" link | P2 |
| NW-04 | C | `[id]/edit.vue` not-found surface | `Query.get` rejects | "Campaign not found" + back link | P2 |
| NW-05 | E | Create → edit → autosave → back to list | click New campaign, edit a block, wait, back | new row appears with edits persisted | P1 |

### 3.10 Sample-data preview (Layer C — `EditorPreview.vue`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| PV-01 | C | srcdoc renders each block type | body w/ all types, open preview | iframe srcdoc contains heading/paragraph/image/button/divider/spacer markup | P2 |
| PV-02 | C | Sample-data toggle resolves merge tags | text `"Hi {{firstName}}"`, toggle on | renders "Hi Avery" (SAMPLE_CONTACT); off → raw token | P1 |
| PV-03 | C | Unknown tag shows `[token]` in sample mode | `{{custom.unknown}}` | `[custom.unknown]` | P2 |
| PV-04 | C | Block content HTML-escaped | block text with `<b>` | escaped in srcdoc (no live tag) | P1 |
| PV-05 | C | Custom-field defs loaded lazily on open | open preview | `loadTags` called once | P2 |

### 3.11 Tenant isolation (Layer S) — cross-cutting, P0

Covered by CR-07, CR-14, CR-35, CR-36 above, plus:

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| TN-01 | S | `listCampaigns` only returns caller's org | A + B each create campaigns | A's list excludes B's; B's excludes A's | P0 |
| TN-02 | S | Audience name resolution is org-scoped | A's campaign references a List id that exists only in B's org | `audience` resolves to `null` (List query filtered by A's org) | P0 |

---

## 4. Acceptance criteria

The Campaigns + Editor feature group is "tested" when:

1. **Every P0 case in §3 has an automated test that passes**, at the layer
   specified. No P0 is satisfied by manual verification alone.
2. **The full status-guard matrix (§3.2 table) is exhaustively asserted** at the
   server layer: every (op × status) cell that should reject does reject with
   the documented `Parse.Error` code, and every cell that should succeed does.
3. **`compileBlocks` is verified for all seven block types** plus the
   recompile-only-on-dirty rule (CB-14), the missing-`compiledHtml` recompile
   branch (CB-16), and graceful degradation on empty/partial/malformed bodies
   (CB-12, CB-13) — all without ever throwing out of `beforeSave`.
4. **Tenant isolation is proven** for read (getCampaign, listCampaigns),
   duplicate, and all mutations: a second org can neither read nor mutate the
   first org's campaigns, and audience-name resolution never crosses orgs.
5. **The send paths are wired correctly**: test-send and pre-flight Send each
   flush a save before invoking the send cloud fn, and both surface cloud
   validation errors to the user without losing editor state.
6. **`resolveMergeTags` precedence is locked** (contact value → inline default →
   missing strategy) for standard tags, custom tags, and footer/server tokens.
7. **Editor mutation invariants hold**: footer is always last after every body
   mutation; undo/redo round-trips; inline edits collapse within the 500ms
   window; autosave debounces and Cmd+S flushes; a save failure preserves the
   dirty buffer.
8. **CI is green on Node 20** with `pool: forks`; server tests boot/teardown
   their own Parse+Mongo per file; no test leaks schema or singleton state into
   another file.
9. At least one **E2E smoke** covers create-draft → edit → autosave → return to
   list with the change persisted (NW-05) and the list filter/menu gating
   (LS-11, LS-02).

---

## 5. Current coverage → file map, and gaps

### What exists today

| Test file | Layer | Covers (mapped to §3 IDs) |
|---|---|---|
| `tests/server/campaigns.test.ts` | S | CB-01 (compile renders content + scaffold), CB-12 (empty body), CB-14 (no recompile on counter-only), CB-15 (recompile on body change); CR-01/02/04/05 (list rows + KPIs + audience name), CR-06/07 (getCampaign + cross-org), CR-10 (duplicate clones), CR-15 (archive hides), CR-16 (archive rejects sending), CR-18/19/20 (rename trim/empty/sent), CR-22/23 (update patch + clears), CR-28 (update rejects sent + sending), CR-29 (update allows paused), CR-31/33/34 (delete draft/sent-soft/sending-reject), CR-36 (cross-org mutation isolation). Footer `{{unsubscribeUrl}}` preservation asserted inside CB-01. |
| `tests/components/mergeTags.resolve.test.ts` | U | MT-01..MT-19 (the full pure resolver/builder/sample-value surface) |
| `tests/components/mergeTagPicker.test.ts` | U (happy-dom) | MT-20..MT-23 (`insertAtCursor`), MT-24/25 partial (the **data** the picker renders — `buildMergeTags`/`formatTag`/grouping — NOT the SFC) |
| `tests/components/useSending.test.ts` | U | CM-03..CM-07 (all `useSending` wrappers + error propagation) |

### Gaps — prioritized

**P0 / P1 gaps that are pure server or pure logic and cheap to add now:**

- **`compileBlocks` per-block-type breadth.** Current coverage compiles one
  multi-block body and one empty body. Missing: paragraph escaping/injection
  (CB-03, P0), image skip-when-no-src (CB-05), footer unsubscribe default-on /
  explicit-off / web-version (CB-08/09/10), bodyBg validation+injection (CB-11),
  malformed/partial/unknown-block degradation (CB-13, P0), missing-`compiledHtml`
  recompile branch (CB-16), and no-body no-op (CB-17).
- **Status-guard matrix holes.** Missing explicit cases: rename on
  sending/archived (CR-21), update rejects archived (CR-28 covers sent+sending
  only), delete of scheduled/paused/archived hard-destroy (CR-32), archive of
  already-archived no-op (CR-17), update invalid/edge inputs (CR-24..27, CR-30),
  unauth mutation (CR-37), duplicate from any status + deep-clone + drops stats
  (CR-11/12/13), duplicate cross-org (CR-14), delete cross-org (CR-35),
  getCampaign missing-id/unauth (CR-08/09).
- **Org-scoped audience resolution edges.** CR-03 (bogus id → null) and TN-02
  (id belongs to another org → null) are not asserted.
- **`useCampaigns` wrapper contract (CM-01/02)** — no test pins the cloud-fn
  names/params for the campaign composable (the parallel `useSending` test
  exists; mirror it).
- **New-draft shape (NW-01, P0)** — nothing asserts that a freshly-created draft
  is CAN-SPAM-ready (default body incl. footer → `{{unsubscribeUrl}}`). Easy
  server test replicating `new.vue`'s save.

**The big one — editor component + E2E coverage is essentially zero.**

> There is **no test that mounts `EditorShell`, `PreflightChecklist`,
> `EditorPreview`, `EditorTestSendPopover`, `MergeTagPicker`, or any
> `blocks/*.vue` SFC**, and **no Playwright spec for Campaigns or the editor**
> (only `tests/e2e/_example.spec.ts` exists). This means none of the editor's
> core behaviors — block add/move/delete/duplicate, the **footer-last
> invariant**, **undo/redo** and the **inline-edit 500ms collapse**, **autosave
> debounce + Cmd+S flush**, the **dirty/beforeunload guard**, **pre-flight
> gating**, the **save-then-send** ordering, and the **sample-data preview** —
> have any automated coverage. Everything in §3.5, §3.6, §3.7 (component rows),
> §3.8, §3.10 is currently unverified.

Root cause: **Vitest has no `@vitejs/plugin-vue`**, so `.vue` SFCs don't compile
in unit tests (documented in `mergeTagPicker.test.ts`). Two ways to close it,
ranked:

1. **Add the Vue plugin to `vitest.config.ts`** (a `test`-side `plugins:
   [vue()]`) so the §3.5–§3.10 component cases (ED-*, PF-*, TS-*, LS-*, PV-*,
   MT-24/25/26) can mount real SFCs with `mountWithPinia`. This is the highest-
   leverage single change. Note `EditorShell` imports `parse` and uses
   `useRouter`/`navigateTo`/`useToast` — those need stubbing/mocking in the
   harness.
2. **Where mounting is heavy (the whole `EditorShell`), extract the pure
   mutation/undo/autosave logic** (insert/move/delete/duplicate/normalizeFooter,
   the undo stack, the inline-edit window, the preflight `checks` builder) into a
   plain composable/module and unit-test it at Layer U (ED-*/PF-* marked
   `C/U`). This de-risks the most important invariants without a DOM at all and
   is worth doing regardless.
3. **Add Playwright specs** for the journeys in §3.8/§3.9 (LS-11, LS-02, NW-05)
   using the existing `playwrightFixtures.ts`. These are the only thing that
   exercises the real Parse-backed drag/drop + autosave end to end.

Until (1)/(2) land, treat the editor as **manually verified only** — that is the
project's largest test-debt item for this feature group.

---

## 6. Test data & fixtures

### Server (Layer S) — `tests/setup/parseServer.ts`

- Boot with `startTestParseServer()` in `beforeAll`, `ctx.stop()` in `afterAll`.
  Cloud bundle defaults to `server/cloud/main.js`. One Parse+Mongo per file
  (`pool: forks`); never share schema state across describe blocks within a file.
- **Tenant helper** (copy from `campaigns.test.ts`):
  ```ts
  async function signUp(company: string) {
    const username = `${company.toLowerCase()}-${Math.random().toString(36).slice(2,8)}@example.com`;
    return Parse.Cloud.run("signUpWithOrg", { username, password: "hunter2hunter2", company });
  }
  ```
  Returns `{ sessionToken, userId, orgId }`. Use a **distinct company per test**
  so orgs don't collide.
- **Acting as a user:** pass `{ sessionToken }` to every `save`/`Query.get`/
  `Cloud.run`. `Parse.User.become()` is blocked. Read back with
  `{ useMasterKey: true }` to assert persisted state regardless of ACL.
- **`sampleBody()` fixture** (reuse the one in `campaigns.test.ts`): a 5-block
  body — heading, paragraph, button, divider, footer — with stable block ids
  (`b_h1`, `b_p1`, …). For new compile cases add focused single-block fixtures
  (image-no-src, footer-variants, malformed/unknown-type block, garbage bodyBg).
- **List fixture** for audience resolution: save a `List` with a `name` as the
  same session, then set `campaign.set("audienceId", list.id)` (String id, not a
  pointer). For TN-02, create the List in a *different* org and assert resolution
  yields `null`.
- **Status fixtures:** set `status` directly on a Campaign before save to stage
  each guard case (`draft`/`scheduled`/`paused`/`sending`/`sent`/`archived`).
  Setting `status` does not require the send pipeline.
- **Assert error codes** with
  `rejects.toMatchObject({ code: Parse.Error.OPERATION_FORBIDDEN })` (and
  `VALIDATION_ERROR` / `INVALID_JSON` / `INVALID_SESSION_TOKEN` / `OBJECT_NOT_FOUND`).

### Pure / composable (Layer U)

- Import modules by **relative path** — Vitest does not resolve the `~` alias
  (`../../composables/app/useMergeTags`).
- **Mock `useCloud`** for composable contract tests:
  ```ts
  const runCloud = vi.fn();
  vi.mock("~/composables/app/useCloud", () => ({ useCloud: () => ({ runCloud }) }));
  ```
  (`vi.mock` matches the import specifier, so the `~` form works here even though
  bare imports don't.) `afterEach(() => runCloud.mockReset())`.
- **Merge-tag fixtures:** a `customField(over)` factory (see
  `mergeTags.resolve.test.ts`) and `SAMPLE_CONTACT` from the module. Build
  contacts inline as partial `SampleContact` objects.
- **Block/body fixtures:** use `makeDefaultBody()` and `registry[type].default()`
  from `blocks/registry.ts` to build valid blocks; `makeBlockId()` for ids.

### Component (Layer C) — requires the Vue plugin (see §5 gap)

- Mount with `mountWithPinia(Component, { props, global: { stubs } })` from
  `tests/setup/vueTest.ts`. File header `// @vitest-environment happy-dom`.
- **`EditorShell` deps to stub/mock:** `parse` (`Parse.User.current`,
  `new Parse.Object`/Query in the page, but the Shell only reads
  `props.campaign` — pass a fake object exposing `get(key)`, `set(key,val)`,
  `save()`, `updatedAt`, `id`); `useRouter` (spy on `push`); `navigateTo`;
  `useToast` (`push` spy); `useAudiences().listAudiences` (resolve a fixture
  array of `{ id, name, contactCount }`); `useSending` (`scheduleSend`/
  `sendTestEmail` spies). Auto-imported shared components (`Button`, `Modal`,
  `TextInput`, `Checkbox`, `Icon`) need `global.stubs` or global registration.
- **Fake timers** (`vi.useFakeTimers()`) for autosave debounce (advance 1500ms)
  and the inline-edit 500ms window.
- **`PreflightChecklist`** is a pure presenter — feed a `checks` array fixture
  (mix of `ok`/`warn`/`fail` with `fixField`) and a `sendStage` prop; assert
  emitted events. No Parse needed.
- **`EditorPreview`** — pass a `body` fixture and toggle `useSampleData`; assert
  on the computed `srcdoc` string (no need to render the iframe content).

### E2E (Layer E) — `tests/setup/playwrightFixtures.ts`

- Use the existing fixtures to authenticate a seeded org (a `signUpWithOrg`
  tenant) and land on `/app/campaigns`. Seed a couple of campaigns of differing
  status via cloud calls in a setup step so LS-02 menu-gating and tab filtering
  have data. For NW-05, drive the real UI: New campaign → edit a block →
  wait out autosave (or trigger Cmd+S) → navigate back → assert the row reflects
  the edit.
- Keep E2E to journeys that genuinely need the browser (drag/drop, real
  autosave, redirect-on-create); push everything else down to Layer C/U/S.
