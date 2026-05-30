# Testing Plan — Templates

Feature: Templates (F-13 system starters / F-14 save-as-template). Covers the
`/app/templates` gallery, the system-vs-org tabs, full miniature email previews,
"Use this" forking into a campaign draft, save-as-template, delete, the 49 seeded
system templates + per-category data files, idempotent upsert seeding, and
`AppTemplatePreview` rendering.

Stack: **Vitest** (unit + Parse integration) + **Playwright** (E2E) per
DECISIONS #7. Node 20 (`nvm use 20` before any npm/node/npx — system Node 14
breaks installs silently). Multi-tenant model: `signUpWithOrg` → `sessionToken`;
system templates are global (`isSystem:true`, `organization:null`, public-read
ACL); org templates are per-tenant (ACL-isolated). Seeding is idempotent
upsert — re-running converges to a stable count and reconciles bodies/copy from
code. `listTemplates` returns each template's `body` (blocks) so the gallery can
render the mini preview.

Files under test:
- `pages/app/templates/index.vue` — gallery page, tabs, actions.
- `components/app/TemplatePreview.vue` (`<AppTemplatePreview>`) — mini email render + scale-to-fit.
- `composables/app/useTemplates.ts` — cloud wrappers.
- `server/cloud/templates.js` — `listTemplates`, `useTemplate`, `saveAsTemplate`, `deleteTemplate`, `seedSystemTemplatesOnce`.
- `server/cloud/templates/*` — `_helpers.js` + 8 category files.
- Existing coverage: `tests/server/templates.test.ts`.

---

## 1. Scope & routes

| Route / surface | Type | Behavior under test |
|---|---|---|
| `/app/templates` | CSR (`/app/*` group), `auth-required` | Gallery: header, segmented tabs (All / Saved by me / Standard), loading/error/empty states, card grid with mini previews + actions. |
| `/app/templates/new` | CSR | "New template" button target (out of scope here except link presence). |
| `/app/templates/:id/edit` | CSR | "Edit" target for org templates (link presence only; editor lands later phase). |
| `/app/campaigns/:id/edit` | CSR | Navigation target after "Use this" forks a template. |
| Cloud `listTemplates()` | Parse cloud | `{ system, org }`; seeds first; system dedup by `seedKey`; ordering. |
| Cloud `useTemplate({id})` | Parse cloud | Forks `body.blocks` → new draft `Campaign`; cross-tenant guard. |
| Cloud `saveAsTemplate({campaignId,name})` | Parse cloud | Org template from a campaign body; name validation. |
| Cloud `deleteTemplate({id})` | Parse cloud | Org templates only; system rejected; tenant-isolated. |
| Cloud `seedSystemTemplates()` | Parse cloud | Idempotent upsert; reconciles bodies; single-flight gate. |

In scope: cloud functions, seeding/data-file integrity, the preview component's
render logic, the gallery page behavior, and a golden-path E2E.
Out of scope: the template editor route, MJML compilation/send (covered by
campaigns/sending plans), and the `New template` creation flow.

---

## 2. Test matrix

| Area | Vitest (server / Parse) | Vitest (unit / DOM) | Playwright (E2E) |
|---|---|---|---|
| Seeding idempotency + upsert | ✅ primary | — | — |
| Category-file data integrity | ✅ primary | ✅ (pure require of modules) | — |
| `listTemplates` buckets + ordering | ✅ primary | — | — |
| `useTemplate` fork | ✅ primary | — | ✅ golden path |
| `saveAsTemplate` round-trip | ✅ primary | — | ✅ optional |
| `deleteTemplate` (org / system) | ✅ primary | — | ✅ optional |
| Tenant isolation | ✅ primary | — | — |
| `TemplatePreview` block rendering | — | ✅ primary (GAP) | — (visual fallback) |
| `TemplatePreview` scale-to-fit | — | ✅ (GAP) | — |
| `useTemplates` composable wrappers | — | ✅ (thin; lower priority) | — |
| Gallery page (tabs, states, actions) | — | ⚠️ partial (SFC mount blocked) | ✅ primary (GAP) |

Notes on layer choice:
- The vitest config **does not register `@vitejs/plugin-vue`** (see
  `tests/components/mergeTagPicker.test.ts` header and `tests/components/_example.test.ts`),
  so real `.vue` SFCs cannot be compiled/mounted today. Two options for the
  preview + gallery component tests, in preference order:
  1. **Register `@vitejs/plugin-vue` in `vitest.config.ts`** (or a dedicated
     `tests/components` project) and mount the SFC via `tests/setup/vueTest.ts`
     `mountWithPinia`. Recommended — `TemplatePreview` is logic-heavy.
  2. If plugin registration is undesirable, **extract the pure helpers**
     (`esc`, `paragraphHtml`, `headingStyle`, `imageStyle`, `buttonStyle`,
     `dividerStyle`, `spacerStyle`, `footerLinks`, the scale math) into a
     `.ts` module and unit-test them directly, mounting only an inline harness
     component — the pattern the merge-tag tests already use.
- Server tests boot a real Parse Server on in-memory Mongo via
  `startTestParseServer()` (`tests/setup/parseServer.ts`), `pool: 'forks'`,
  one server per file. `Parse.User.become()` is blocked — act as a user by
  passing `{ sessionToken }` to every `Cloud.run` / `Query`.

---

## 3. Detailed test cases

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| **Seeding** |
| TPL-S01 | Server | Seed creates the full library on a fresh DB | Boot server; `Cloud.run("seedSystemTemplates")`; count `Template` where `isSystem=true` w/ master key | `total === 49`; returned `seeded === 49`, `updated === 0` on first run | P0 |
| TPL-S02 | Server | Re-seed is idempotent (stable count, no dupes) | Run seed a 2nd and 3rd time; recount | 2nd run `seeded === 0`, `total === 49`; count stays 49 after 3rd run; `updated === 49` on re-runs (every def reconciled) | P0 |
| TPL-S03 | Server | Upsert reconciles an edited body | After seed, fetch a system template by `seedKey` (master key), mutate `name`/`body.blocks`/`category` in DB, save; re-run seed; refetch | Row's `name`, `subject`, `previewText`, `category`, `body` match the code definition again; `seedKey`/`isSystem`/ACL unchanged; total still 49 | P0 |
| TPL-S04 | Server | Reconcile preserves identity (no new row) | Capture `objectId` of a `seedKey` before; mutate + re-seed | Same `objectId` after reconciliation (upsert in place, not delete+create); count unchanged | P1 |
| TPL-S05 | Server | Single-flight gate dedupes overlapping seeds | Fire `seedSystemTemplatesOnce()` ×3 concurrently (no await between) before any resolves | Total converges to 49; no duplicate `seedKey` rows; promise gate cleared afterward (a later seed re-checks DB → `seeded:0`) | P1 |
| TPL-S06 | Server | Boot-time `setImmediate` seed populates without explicit call | Boot server; without calling seed, run `listTemplates` (which lazily seeds) | `system.length === 49` | P1 |
| TPL-S07 | Server | System rows are global + public-read | After seed, fetch all `isSystem=true`; inspect each | `organization` falsy; ACL `getPublicReadAccess() === true`, `getPublicWriteAccess() === false` | P0 |
| **Category data-file integrity** (pure module require; no Parse needed) |
| TPL-D01 | Unit | All 8 category files load + export arrays | `require` `templates.js` (exports `SYSTEM_TEMPLATES`) | `SYSTEM_TEMPLATES` is an array of length 49 (6 starters + 5+5+5+6+5+6+5+6) | P0 |
| TPL-D02 | Unit | Per-file counts match | Require each category module directly | newsletters 5, product-launch 5, welcome-onboarding 5, promotions 6, events-webinars 5, ecommerce 6, reengagement 5, seasonal 6 | P1 |
| TPL-D03 | Unit | Unique seedKeys across the whole library | Map `SYSTEM_TEMPLATES` → `seedKey`; build a Set | No duplicates; Set size === 49; all 6 STARTER_KEYS present | P0 |
| TPL-D04 | Unit | Every def builds valid blocks | For each def call `def.body()` | Returns `{version:1, blocks:[...]}`; `blocks.length > 0`; every block has `id` (matches `b_` + 5 chars), a `type` in {heading,paragraph,image,button,divider,spacer,footer}, and a `props` object | P0 |
| TPL-D05 | Unit | Footer is last and present exactly once | For each def's blocks | Last block `type === "footer"`; exactly one footer per template (CAN-SPAM); footer props include `businessAddress`, `showUnsubscribe:true`, `showWebVersion:true` | P0 |
| TPL-D06 | Unit | Every def has required metadata | Inspect each def | Non-empty `name`; `seedKey` starts `system/`; `category` is one of the 10 known categories; `subject`/`previewText` are string-or-null | P1 |
| TPL-D07 | Unit | Block prop contracts hold | Validate props by type against `_helpers.js` contract | heading.level ∈ {1,2,3}; align ∈ {left,center,right}; colors `#hex`; image.width numeric; button has label/href/bg/fg; divider.thickness numeric; spacer.height numeric | P1 |
| TPL-D08 | Unit | `block()` / `blockId()` produce fresh unique ids | Call `block(...)` repeatedly | Each `id` unique within a generated body; format `b_xxxxx` | P2 |
| **listTemplates** |
| TPL-L01 | Server | Returns system library + empty org for a new tenant | Sign up; `Cloud.run("listTemplates", {}, {sessionToken})` | `system.length === 49`, every `isSystem===true`; `org.length === 0` | P0 |
| TPL-L02 | Server | System payload carries body blocks for preview | Inspect a system entry | `body.blocks` is a non-empty array; entry has `name`, `seedKey`, `category`, `subject`, `previewText`, `thumbUrl` (or null) | P0 |
| TPL-L03 | Server | Ordering — Basics first, Blank leads | Map `system` → `seedKey`/`category` in order | `system[0].seedKey === "system/blank"`; the `Basics` category sorts before all others; remaining categories follow `CAT_ORDER` (Newsletters, Announcements, Product launches, …, Seasonal & holiday) | P0 |
| TPL-L04 | Server | System dedups by seedKey | Force a duplicate row (insert a 2nd row with an existing `seedKey` via master key); `listTemplates` | Only one entry per `seedKey` returned; length stays 49 | P1 |
| TPL-L05 | Server | Org bucket lists only the caller's org templates, newest first | Create 2 org templates (saveAsTemplate) at different times | `org.length === 2`; ordered by `updatedAt` desc; none have `isSystem===true` | P1 |
| TPL-L06 | Server | listTemplates self-seeds on a fresh DB | Fresh server, no explicit seed, run listTemplates | `system.length === 49` (lazy seed succeeded) | P1 |
| **useTemplate (fork)** |
| TPL-U01 | Server | Forks a system template's blocks into a new draft Campaign | `useTemplate({id: newsletter})` | Returns `{campaignId}`; campaign is session-readable, `status==="draft"`, `organization` stamped; `body.version===1`; `body.blocks` types/length equal the source template's | P0 |
| TPL-U02 | Server | Fork gets fresh block ids (deep clone) | Compare forked block ids to source | No forked id is in the source id set; props deep-equal but are distinct objects (mutating one doesn't affect the other) | P0 |
| TPL-U03 | Server | Fork copies subject/preheader + names the copy | Inspect campaign | `name === "<template name> copy"`; `subject === template.subject`; `preheader === template.previewText`; `status==="draft"`; from/audience fields null | P1 |
| TPL-U04 | Server | Forking the Blank template yields a footer-only draft | `useTemplate({id: blank})` | `body.blocks.length === 1`, that block `type==="footer"` | P2 |
| TPL-U05 | Server | Missing/invalid id rejected | `useTemplate({})` and `useTemplate({id:"nope"})` | Rejects (`OTHER_CAUSE` for missing, `OBJECT_NOT_FOUND` for unknown) | P1 |
| TPL-U06 | Server | Forking an org template the caller owns works | Owner forks their own saved template | New campaign created with org template's blocks | P1 |
| **saveAsTemplate (round-trip)** |
| TPL-A01 | Server | Round-trips a campaign body into an org template | Fork basic → campaign; `saveAsTemplate({campaignId, name})` | Returns `{id}`; appears in `org` bucket (`isSystem===false`), `organization` stamped; `body.blocks` types equal the campaign's | P0 |
| TPL-A02 | Server | Saved template gets fresh block ids (independent of campaign) | Compare saved-template block ids to campaign's | Disjoint id sets; editing campaign later doesn't change the template | P1 |
| TPL-A03 | Server | Name validation — required | `saveAsTemplate({campaignId, name:"  "})` and name omitted | Rejects with "Template name is required." (`OTHER_CAUSE`) | P1 |
| TPL-A04 | Server | Name validation — max length | name of 81 chars | Rejects "must be 80 characters or fewer." | P2 |
| TPL-A05 | Server | Name trimmed | name `"  My layout  "` | Stored as `"My layout"` | P2 |
| TPL-A06 | Server | Missing campaignId rejected | `saveAsTemplate({name:"x"})` | Rejects "campaignId is required." | P1 |
| TPL-A07 | Server | Cannot save-as from another tenant's campaign | Other tenant calls saveAsTemplate with owner's campaignId | Rejects `OBJECT_NOT_FOUND` (ACL hides the campaign) | P1 |
| **deleteTemplate** |
| TPL-X01 | Server | Deletes an org template | Create org template; `deleteTemplate({id})` | `{ok:true}`; subsequent `listTemplates.org` no longer contains it | P0 |
| TPL-X02 | Server | Rejects deleting a system template | `deleteTemplate({id: anySystemId})` | Rejects (`OPERATION_FORBIDDEN`, "System templates cannot be deleted."); system count stays 49 | P0 |
| TPL-X03 | Server | Missing id rejected | `deleteTemplate({})` | Rejects "Template id is required." | P2 |
| TPL-X04 | Server | Cannot delete another tenant's org template | Other tenant calls delete with owner's template id | Rejects `OBJECT_NOT_FOUND` (ACL); template still present for owner | P0 |
| **Tenant isolation** |
| TPL-T01 | Server | Org templates are tenant-private | Owner saves a template; other tenant runs `listTemplates` | Other tenant's `org.length === 0`; cannot see owner's template | P0 |
| TPL-T02 | Server | System library shared by all tenants | Other tenant `listTemplates` | `system.length === 49`, same `seedKey` set as owner sees | P0 |
| TPL-T03 | Server | Cross-tenant fork blocked | Other tenant `useTemplate({id: owner's org template})` | Rejects `OBJECT_NOT_FOUND` (explicit org guard in `useTemplate`) | P0 |
| TPL-T04 | Server | Any tenant can fork a system template | Other tenant `useTemplate({id: system})` | Succeeds; campaign stamped with the *other* tenant's org | P1 |
| **TemplatePreview component** (GAP — see §5) |
| TPL-P01 | Unit/DOM | Renders heading block | Mount `<AppTemplatePreview :blocks="[heading]">` (level 1/2/3) | `<h2>` rendered; font-size 30/23/18 px by level; align + color from props; text HTML-escaped | P0 |
| TPL-P02 | Unit/DOM | Renders paragraph block with `\n` → `<br>` | paragraph with embedded newline | `<p>` with `<br>` for each newline; text escaped | P0 |
| TPL-P03 | Unit/DOM | Renders image block | image with src/width/align | `<img src=...>`; width clamped to `min(props.width, contentWidth)`; wrapper text-align matches | P1 |
| TPL-P04 | Unit/DOM | Renders button block | button with label/bg/fg/radius | `<span>` with label, background/color/border-radius from props; row align applied | P1 |
| TPL-P05 | Unit/DOM | Renders divider block | divider color/thickness | `<hr>` with `border-top` = `<thickness>px solid <color>` | P2 |
| TPL-P06 | Unit/DOM | Renders spacer block | spacer height 24 | `<div>` height 24px, line-height 0 | P2 |
| TPL-P07 | Unit/DOM | Renders footer block (links toggle) | footer with showUnsubscribe/showWebVersion combinations | Address shown; links = "View in browser · Unsubscribe" when both on; only the enabled ones; links row absent when both off | P1 |
| TPL-P08 | Unit/DOM | Escapes injection in text props | heading text `"<img src=x onerror=alert(1)>"` | Rendered as escaped text, not a live element; `<`/`>`/`&`/`"` escaped | P0 |
| TPL-P09 | Unit/DOM | Renders all 7 block types in one body without error | Mount with one of each block type | All 7 nodes present in DOM, in order | P0 |
| TPL-P10 | Unit/DOM | Tolerates missing/empty props and unknown types | blocks with `props` undefined; an unknown `type` | No throw; known blocks render with defaults; unknown type renders nothing | P1 |
| TPL-P11 | Unit/DOM | Scale-to-fit math | Set wrapper `clientWidth` and `contentWidth=600`; trigger `measure()` | `scale === clientWidth/600`; sheet style `transform: scale(<scale>)`, width 600px; defaults to 0.25 before measure | P1 |
| TPL-P12 | Unit/DOM | Non-interactive / a11y | Mount any body | Root has `aria-hidden="true"`; `pointer-events:none` via class; no interactive handlers | P2 |
| TPL-P13 | Unit/DOM | Real seeded body renders | Feed an actual `SYSTEM_TEMPLATES[i].body()` block tree | Renders without error; node count ≥ block count | P1 |
| **useTemplates composable** |
| TPL-C01 | Unit | Wrappers call the right cloud fn with params | Stub `useCloud().runCloud`; call each wrapper | `listTemplates`→`runCloud("listTemplates")`; `useTemplate(id)`→`("useTemplate",{id})`; `saveAsTemplate(cid,name)`→`("saveAsTemplate",{campaignId:cid,name})`; `deleteTemplate(id)`→`("deleteTemplate",{id})` | P2 |
| **Gallery page** (GAP — E2E primary; see §5) |
| TPL-G01 | E2E | Gallery loads with system templates | Log in (freshUser fixture); visit `/app/templates` | Cards render; `Standard (49)` tab count; each card shows a mini preview, name, category chip, "Use this" | P0 |
| TPL-G02 | E2E | Tabs filter correctly | Click "All", "Saved by me", "Standard" | All = system+org; Standard = 49 system; Saved = org only; counts in labels match | P1 |
| TPL-G03 | E2E | "Use this" forks → opens campaign editor | Click "Use this" on a system card | Navigates to `/app/campaigns/:id/edit`; editor shows the template's blocks | P0 |
| TPL-G04 | E2E | Empty "Saved by me" state | New tenant, click "Saved by me" | `EmptyState` "No saved templates yet" with the save-as hint | P1 |
| TPL-G05 | E2E | Save-as → appears under Saved → delete (with confirm) | From editor save-as-template; return to gallery; delete via confirm | New card under "Saved by me" with Edit/Delete; confirm dialog; after delete it's gone | P1 |
| TPL-G06 | E2E | System cards expose no Edit/Delete | Inspect a Standard card | Only "Use this"; no Edit/Delete buttons | P1 |
| TPL-G07 | E2E | Anonymous user redirected | Hit `/app/templates` logged out | Redirect to `/login?next=/app/templates` (auth-required middleware) | P1 |
| TPL-G08 | E2E | Load error surfaces | Force `listTemplates` failure (intercept/route abort) | `role="alert"` error banner shown; no crash | P2 |

---

## 4. Acceptance criteria

- **Seeding:** A fresh DB seeds exactly **49** system templates. Re-running
  `seedSystemTemplates` any number of times keeps the count at 49 (`seeded:0`
  on subsequent runs) and reconciles each row's name/subject/previewText/
  category/body from code (TPL-S01–S04). System rows are global with a
  public-read, no-write ACL (TPL-S07).
- **Data files:** All 8 category files load; the combined library is 49 defs
  with **unique** seedKeys; every def builds a valid block tree whose **last**
  block is a single footer; every block conforms to the `_helpers.js` prop
  contract (TPL-D01–D07).
- **listTemplates:** Returns `{system, org}` with `body.blocks` present for
  preview; system bucket dedups by seedKey and orders **Basics first (Blank
  leading)** then by `CAT_ORDER`; org bucket is the caller's templates only,
  newest first (TPL-L01–L06).
- **useTemplate:** Forks any readable template's blocks into a **new draft
  Campaign** with fresh block ids and copied subject/preheader; cross-tenant
  forks are blocked (TPL-U01–U06, TPL-T03).
- **saveAsTemplate:** Round-trips a campaign body into an org template (fresh
  ids, `isSystem:false`, org-stamped); name required, trimmed, ≤80 chars
  (TPL-A01–A07).
- **deleteTemplate:** Deletes org templates; **rejects system templates** and
  cross-tenant deletes (TPL-X01–X04).
- **Tenant isolation:** Org templates are private to their tenant; system
  library is shared by all (TPL-T01–T04).
- **TemplatePreview:** Renders all 7 block types correctly, escapes text
  (no injection), computes scale = wrapperWidth/contentWidth, and is
  non-interactive (`aria-hidden`, no pointer events) (TPL-P01–P13).
- **Gallery:** Loads system templates, tabs filter with live counts, "Use
  this" navigates to the campaign editor, save-as/delete round-trip works,
  system cards never expose Edit/Delete, anonymous users are redirected
  (TPL-G01–G08).

A change is shippable when all P0 cases pass and no P1 regresses.

---

## 5. Current coverage → mapping & gaps

### Mapped to `tests/server/templates.test.ts` (existing)

| Existing test (line) | Covers test IDs | Notes |
|---|---|---|
| "seeds the system library and is idempotent" (L64) | TPL-S01 (partial), TPL-S02 | Asserts stable count + `seeded:0` on re-run. Uses captured `systemCount`, not a hard 49. |
| "seeded system templates are global … valid blocks" (L83) | TPL-S07, TPL-D04 (partial), TPL-D05 (footer-last only) | Checks ACL, global org, non-empty blocks, last block is footer — but only on persisted rows, not per-def. |
| "listTemplates returns the system library and (initially) no org" (L102) | TPL-L01, TPL-D03 (partial — STARTER_KEYS subset) | Asserts all starter keys present; does not assert ordering. |
| "useTemplate forks a system template's blocks" (L116) | TPL-U01, TPL-U02 | Block types equal + fresh ids. |
| "saveAsTemplate round-trips … then lists + deletes" (L152) | TPL-A01, TPL-X01 | Round-trip + delete in one test. |
| "rejects deleting a system template" (L209) | TPL-X02 | |
| "isolates org templates across tenants and blocks cross-tenant useTemplate" (L224) | TPL-T01, TPL-T02, TPL-T03 | |

### GAPS (not covered today)

**Biggest gap — `TemplatePreview.vue` has ZERO tests.** It is the most
logic-heavy untested unit: 7 block-type render branches, per-type style maps,
HTML-escaping (the only XSS guard for template content via `v-html`), and the
scale-to-fit ResizeObserver math. None of TPL-P01–P13 exist. This is blocked
by the vitest config not registering `@vitejs/plugin-vue` — pick option 1
(register the plugin + mount via `mountWithPinia`) or option 2 (extract pure
helpers to `.ts` and test directly). Prioritize TPL-P08 (escaping) and
TPL-P09 (all block types) at minimum.

**Second gap — no E2E for the gallery page.** `pages/app/templates/index.vue`
(tabs, counts, loading/error/empty states, "Use this" navigation, save-as,
delete confirm, system-vs-org action affordances) is exercised only by manual
QA today. `tests/e2e/` has just `_example.spec.ts`; add `templates.spec.ts`
using the `freshUser` fixture (`tests/setup/playwrightFixtures.ts`). TPL-G01,
TPL-G03, TPL-G07 are P0/P1.

**Other untested gaps:**
- **Exact count = 49** is never asserted (existing tests use a captured live
  count to stay growth-proof). Add TPL-D01/TPL-S01 to lock the current 49 (or
  assert per-file counts) so an accidental drop/dup in a data file is caught.
- **Per-def data integrity** (TPL-D01–D08): the existing block/footer checks
  run on *persisted* rows after seeding, not on every `def.body()`. A def that
  is dropped from the concat, or has a duplicate seedKey, or a non-footer last
  block, may slip through. Test `SYSTEM_TEMPLATES` directly (import from
  `server/cloud/templates.js`'s exports) — fast, no Parse needed.
- **Upsert reconciliation** (TPL-S03/S04): existing tests prove count
  stability but **not** that editing a body in the DB is reverted to the code
  definition on re-seed, nor that the row identity (`objectId`) is preserved.
- **Ordering** (TPL-L03): Basics-first / Blank-leading / `CAT_ORDER` is
  completely untested.
- **System dedup path** (TPL-L04): the `seen`-Set dedup in `listTemplates` is
  untested (no duplicate row is ever forced).
- **saveAsTemplate validation** (TPL-A03–A07): name required/trim/max-length
  and missing-campaignId branches; cross-tenant campaign read.
- **deleteTemplate cross-tenant** (TPL-X04) and **cross-tenant save-as**
  (TPL-A07).
- **useTemplate error paths** (TPL-U05) and Blank-fork shape (TPL-U04).
- **useTemplates composable wrappers** (TPL-C01) — thin, low priority.

---

## 6. Test data & fixtures

**Server / Parse integration** (`tests/server/templates.test.ts` + new cases):
- Boot with `startTestParseServer()` (`tests/setup/parseServer.ts`) — real
  Parse Server + in-memory Mongo, one forked process per file. Cloud dir is
  `server/cloud/main.js`, so `templates.js` registers its functions and the
  `setImmediate` boot seed fires.
- Create tenants via `Cloud.run("signUpWithOrg", {username, password, company})`
  → `{sessionToken, userId, orgId}`. Use **two** tenants for isolation cases
  (`tpl-owner@example.com` / `TemplateCo` and `other-tenant@example.com` /
  `OtherCo`).
- Act as a user by passing `{ sessionToken }` to every `Cloud.run`/`Query`
  (`Parse.User.become()` is blocked). Use `{ useMasterKey: true }` only for
  setup/assertions that must bypass ACLs (seeding, forcing a duplicate row,
  counting system rows).
- Library size: assert the concrete **49** (`SYSTEM_TEMPLATES.length` and the
  seeded count) and/or per-file counts (5/5/5/6/5/6/5/6 + 6 starters). Keep the
  existing growth-proof `systemCount` capture too, but add the hard number so
  data-file drift is caught.
- Helper to find a system template by `seedKey` from a `listTemplates` result
  (`system.find(t => t.seedKey === "system/newsletter")`).

**Data-file unit tests** (no Parse — fast):
- Import `{ SYSTEM_TEMPLATES }` from `server/cloud/templates.js` and the
  builders from `server/cloud/templates/_helpers.js`. These are CommonJS under
  `server/` (`"type":"commonjs"`); `require()` them from the test (vitest
  transforms both). Iterate defs, call `def.body()`, assert structure.
- Known categories set: `Basics, Newsletters, Announcements, Product launches,
  Welcome & onboarding, Promotions & sales, Events & webinars, E-commerce,
  Re-engagement & surveys, Seasonal & holiday`.
- `STARTER_KEYS` (6): `system/basic, system/blank, system/newsletter,
  system/plain-text, system/product-announcement, system/welcome`.

**Component tests** (`tests/components/templatePreview.test.ts` — new):
- Header `// @vitest-environment happy-dom`.
- Either register `@vitejs/plugin-vue` and `import TemplatePreview from
  "components/app/TemplatePreview.vue"`, mounting via `mountWithPinia`
  (`tests/setup/vueTest.ts`); or extract helpers to a `.ts` and test directly
  (see §2). For TPL-P11, stub `clientWidth` on the wrapper element (happy-dom
  returns 0 by default) and invoke `measure`.
- Block fixtures — one of each type with realistic props:
  ```
  heading   { text:"Hi <b>", level:1, align:"center", color:"#1A1A1A" }
  paragraph { html:"line one\nline two", align:"left", color:"#1A1A1A" }
  image     { src:"https://x/y.jpg", alt:"", width:600, align:"center" }
  button    { label:"Go", href:"#", bg:"#FF4E4E", fg:"#FFFFFF", radius:10, align:"center" }
  divider   { color:"#E5E5E7", thickness:2 }
  spacer    { height:24 }
  footer    { businessAddress:"123 St", showUnsubscribe:true, showWebVersion:true }
  ```
- Injection fixture for TPL-P08: `heading.text = '<img src=x onerror=alert(1)>'`.
- Reuse a real seeded body for TPL-P13: `SYSTEM_TEMPLATES[0].body().blocks`.

**E2E** (`tests/e2e/templates.spec.ts` — new):
- Import `test, expect` from `tests/setup/playwrightFixtures.ts`; use the
  `freshUser` fixture (creates a Parse user + sessionToken, dev server up).
  Establish the browser session (set the Parse session token in localStorage
  the way the app expects, or log in through the UI) before visiting
  `/app/templates`.
- Selectors: tab labels carry live counts (`Standard (49)`, `Saved by me (N)`);
  cards are `article.tpl-card`; primary action button text is `Use this`
  (`Working…` while busy); org cards add `Edit` + `.tpl-act-delete`. Delete
  uses `window.confirm` — handle the Playwright `dialog` event.
- For TPL-G03 assert URL matches `/app/campaigns/<id>/edit` after "Use this".
- For TPL-G08 use Playwright route interception to abort the `listTemplates`
  request and assert the `role="alert"` banner.
