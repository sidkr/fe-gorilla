# Testing Plan — Settings

Test plan for the Settings surface: the org general-settings page, the sender-identities page, the `useSettings` composable, and the six backing cloud functions. Documentation only — no tests are added by this plan; section 5 maps what already exists and names the gaps to close.

Stack (DECISIONS #7): **Vitest** for unit/integration + cloud-function tests, **Playwright** for E2E. Node 20 (`nvm use 20` before any npm/node/npx). Server tests boot a hermetic in-memory Mongo + Parse Server per file (`tests/setup/parseServer.ts`); component tests mount with `@vue/test-utils` + happy-dom (`tests/setup/vueTest.ts`); E2E creates users over REST via the `freshUser` fixture (`tests/setup/playwrightFixtures.ts`).

---

## 1. Scope & routes

### Routes (both CSR under `/app/*`, layout `app`, middleware `auth-required`)

| Route | Page file | Purpose |
|---|---|---|
| `/app/settings` | `pages/app/settings/index.vue` | Org general settings: name, default from-name/email, reply-to, timezone, CAN-SPAM mailing address. Plan shown read-only. |
| `/app/settings/senders` | `pages/app/settings/senders.vue` | Sender identities: list with status badge, create (modal), verify (stub), delete (confirm). |

Both pages render a sub-nav (`General` / `Sender identities`) and a top-nav `Settings` entry lives in `layouts/app.vue`.

### Frontend contract

`composables/app/useSettings.ts` — typed wrappers over `useCloud().runCloud`. Exports `OrgSettings`, `OrgSettingsPatch`, `SenderIdentity`, `SenderStatus`, `CreateSenderInput` and the six functions:

| Function | Cloud fn | Params sent |
|---|---|---|
| `getOrgSettings()` | `getOrgSettings` | `{}` |
| `updateOrgSettings(patch)` | `updateOrgSettings` | `{ patch }` |
| `listSenderIdentities()` | `listSenderIdentities` | `{}` |
| `createSenderIdentity(input)` | `createSenderIdentity` | `{ fromName, fromEmail }` (spread, **not** nested) |
| `verifySenderIdentity(id)` | `verifySenderIdentity` | `{ id }` |
| `deleteSenderIdentity(id)` | `deleteSenderIdentity` | `{ id }` |

### Backend (`server/cloud/settings.js`, CommonJS)

- **Org profile** — the caller's `Organization` (not a per-tenant class; bespoke ACL set at signup). Read/written with the **master key** but always pinned to the caller's own org via `getUserOrg(user, MK)`. Email format check is `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/`; `MAX_NAME_LEN = 120`.
- **Sender identities** — `SenderIdentity` is **per-tenant** (PER_TENANT_CLASSES). Created *as the user* so the tenancy `beforeSave` hook stamps `organization` + a role ACL; isolation is enforced by that row-level ACL. Uniqueness of `fromEmail` is **per-org**, enforced explicitly in `createSenderIdentity` (the schema index is not unique).

### Out of scope

- Real email/domain verification — `verifySenderIdentity` is an MVP stub that only flips `status` to `verified`. Real verification ships with the send pipeline.
- Plan/billing changes, `monthlySendCap`/`monthlySendCount` mutation (read-only here).
- The `signUpWithOrg` / tenancy spine itself (covered by its own tests); this plan consumes it.

---

## 2. Test matrix

| Area | Server (Vitest + Parse) | Component (Vitest + happy-dom) | E2E (Playwright) |
|---|---|---|---|
| `getOrgSettings` shape | ✅ exists | — | covered via page load |
| `updateOrgSettings` patch / validation / immutables | ✅ exists | error rendering | save → toast/banner |
| Email lowercasing & clearing | ✅ exists (lowercase) | — | — |
| Sender create / validate / dup / per-org unique | ✅ exists | modal validation | add-sender flow |
| Sender verify stub | ✅ exists | badge flip | verify row → badge |
| Sender delete | ✅ exists | confirm gate | remove row |
| Cross-tenant isolation (`OBJECT_NOT_FOUND`) | ✅ exists | — | — |
| Auth required (no session) | ✅ exists | middleware redirect | unauth → `/login` |
| `useSettings` wrapper contract (name + params) | — | ❌ **gap** | — |
| Nav presence (top-nav + sub-nav links) | — | ❌ **gap** | ❌ **gap** |
| Page states: loading / load-error / retry / empty | — | ❌ **gap** | partial |

Legend: ✅ exists in `tests/server/settings.test.ts`; ❌ gap = recommended, not yet written.

---

## 3. Detailed test cases

Priority: **P0** = must pass to ship / data-integrity / tenancy; **P1** = important UX correctness; **P2** = nice-to-have / edge.

Layer key: **SRV** = cloud-function (Vitest, real Parse); **CMP** = component (Vitest, happy-dom, mocked `useSettings`/`useCloud`); **CMP-W** = composable wrapper (Vitest, mocked `useCloud`); **E2E** = Playwright.

### 3.1 Org general settings — `getOrgSettings` / `updateOrgSettings`

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| OS-01 | SRV | `getOrgSettings` returns full profile | signUpWithOrg → run `getOrgSettings` as session | Returns `{ id, name, slug, plan, defaultFromName, defaultFromEmail, replyTo, timezone, address, monthlySendCap, monthlySendCount }`; `id===orgId`, `slug` truthy, `plan==="free"`, `timezone==="UTC"`, `address===""`, `monthlySendCap` is a number | P0 |
| OS-02 | SRV | Shape defaults are typed, never undefined | fresh org, inspect every field | Strings default to `""` / `"UTC"` / `"free"`; counters default to `0` (number), never `undefined`/`null` | P1 |
| OS-03 | SRV | `updateOrgSettings` patches all editable fields | run with patch {name, defaultFromName, defaultFromEmail, replyTo, timezone, address} | Returns updated values; **emails lowercased** (`Hello@Patch.com`→`hello@patch.com`); `name` trimmed | P0 |
| OS-04 | SRV | Patch persists across reads | OS-03, then re-run `getOrgSettings` | Re-read reflects patched `name` + `address` | P0 |
| OS-05 | SRV | Reject empty / whitespace name | patch `{ name: "   " }` | Rejects (`OTHER_CAUSE`, "cannot be empty"); org unchanged | P0 |
| OS-06 | SRV | Reject name over 120 chars | patch `{ name: "x".repeat(121) }` | Rejects (`OTHER_CAUSE`, length message) | P1 |
| OS-07 | SRV | Reject invalid default from-email | patch `{ defaultFromEmail: "not-an-email" }` | Rejects (`OTHER_CAUSE`); also covers `nope`, `a@b` (no dot), `a b@c.com` (space) | P0 |
| OS-08 | SRV | Reject invalid reply-to | patch `{ replyTo: "bad" }` | Rejects (`OTHER_CAUSE`) | P1 |
| OS-09 | SRV | Allow clearing default from-email | patch `{ defaultFromEmail: "" }` after a value was set | Accepted; field becomes `""` (empty bypasses validation) | P1 |
| OS-10 | SRV | Allow clearing reply-to | patch `{ replyTo: "" }` | Accepted; field becomes `""` | P2 |
| OS-11 | SRV | Empty timezone falls back to UTC | patch `{ timezone: "   " }` | Stored as `"UTC"` | P2 |
| OS-12 | SRV | Ignore non-editable `slug` | patch `{ name: "Renamed", slug: "hacked" }` | `slug` unchanged from pre-patch value | P0 |
| OS-13 | SRV | Ignore non-editable `plan` | patch `{ plan: "enterprise" }` | `plan` stays `"free"` | P0 |
| OS-14 | SRV | Ignore send counters | patch `{ monthlySendCap: 99, monthlySendCount: 99 }` | Counters unchanged (not written by this fn) | P1 |
| OS-15 | SRV | Partial patch leaves omitted fields intact | set all fields, then patch only `{ address }` | Only `address` changes; name/email/timezone retained | P1 |
| OS-16 | SRV | `address` not trimmed (multiline preserved) | patch `{ address: "Line 1\nLine 2" }` | Stored verbatim incl. newline (no `.trim()` on address) | P2 |
| OS-17 | SRV | Tenant isolation — patch only touches caller's org | orgA + orgB, A patches name | B's `getOrgSettings` name unchanged | P0 |
| OS-18 | SRV | No session rejected | run `getOrgSettings` / `updateOrgSettings` with no session token | Rejects (`INVALID_SESSION_TOKEN`, "must be signed in") | P0 |

### 3.2 Sender identities — create / list / verify / delete

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| SI-01 | SRV | Create defaults status `pending`, lowercases email | create `{ fromName:"Acme Team", fromEmail:"Hello@Acme.com" }` | Returns `{ id, fromName:"Acme Team", fromEmail:"hello@acme.com", status:"pending", createdAt }`; `createdAt` ISO string | P0 |
| SI-02 | SRV | Reject invalid from-email | create `{ fromName:"Bad", fromEmail:"nope" }` | Rejects (`OTHER_CAUSE`) | P0 |
| SI-03 | SRV | Reject empty from-name | create `{ fromName:"", fromEmail:"ok@acme.com" }` | Rejects (`OTHER_CAUSE`, "from-name is required") | P0 |
| SI-04 | SRV | Reject from-name over 120 chars | create `{ fromName:"x".repeat(121), fromEmail:"ok@acme.com" }` | Rejects (`OTHER_CAUSE`, length message) | P2 |
| SI-05 | SRV | Per-org duplicate email rejected | create `dup@acme.com` twice in same org | Second rejects with `code === DUPLICATE_VALUE` | P0 |
| SI-06 | SRV | Duplicate check is case-insensitive | create `dup@acme.com` then `DUP@Acme.com` | Second rejects (`DUPLICATE_VALUE`) because both lowercase to same value | P1 |
| SI-07 | SRV | `listSenderIdentities` returns org senders | create 2, list | Both present; emails match created set | P0 |
| SI-08 | SRV | List ordered newest-first | create A then B, list | B (newer `createdAt`) before A | P2 |
| SI-09 | SRV | Empty list for a new org | signUpWithOrg, list immediately | Returns `[]` | P1 |
| SI-10 | SRV | `verifySenderIdentity` flips to verified | create (pending) → verify by id | Returns `status:"verified"`; persists on re-list | P0 |
| SI-11 | SRV | Verify missing id rejected | verify `{}` (no id) | Rejects (`OTHER_CAUSE`, "id is required") | P1 |
| SI-12 | SRV | Verify non-existent id rejected | verify with a bogus objectId | Rejects (`OBJECT_NOT_FOUND`, "not found") | P1 |
| SI-13 | SRV | `deleteSenderIdentity` removes row | create → delete by id | Returns `{ ok:true }`; row absent from subsequent list | P0 |
| SI-14 | SRV | Delete missing id rejected | delete `{}` | Rejects (`OTHER_CAUSE`, "id is required") | P1 |
| SI-15 | SRV | Delete non-existent id rejected | delete bogus id | Rejects (`OBJECT_NOT_FOUND`) | P2 |
| SI-16 | SRV | No session on any sender fn rejected | run list/create/verify/delete with no session | Rejects (`INVALID_SESSION_TOKEN`) | P0 |

### 3.3 Cross-tenant isolation (sender identities)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| TEN-01 | SRV | B cannot see A's sender in list | A creates `only@a.com`; B lists | B's list excludes `only@a.com` (ACL hides it) | P0 |
| TEN-02 | SRV | B cannot verify A's sender | B runs `verifySenderIdentity` with A's id | Rejects `OBJECT_NOT_FOUND` (ACL → invisible → not found, **not** a permission leak) | P0 |
| TEN-03 | SRV | B cannot delete A's sender | B runs `deleteSenderIdentity` with A's id | Rejects `OBJECT_NOT_FOUND` | P0 |
| TEN-04 | SRV | Email uniqueness is per-org, not global | A has `only@a.com`; B creates same email | B succeeds — `fromEmail:"only@a.com"` returned | P0 |
| TEN-05 | SRV | A's verify/delete unaffected after B's failed attempts | after TEN-02/03, A verifies + deletes own | A's ops succeed | P1 |

### 3.4 `useSettings` composable wrapper contract (GAP)

Mock `~/composables/app/useCloud` (`runCloud` spy), import `useSettings`, assert each wrapper forwards the right cloud-fn name + params. Mirrors `tests/components/useSending.test.ts`.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| WR-01 | CMP-W | `getOrgSettings` call shape | call wrapper | `runCloud("getOrgSettings")` (one arg, no params) | P1 |
| WR-02 | CMP-W | `updateOrgSettings` nests patch | call with `{ name:"X" }` | `runCloud("updateOrgSettings", { patch: { name:"X" } })` | P1 |
| WR-03 | CMP-W | `listSenderIdentities` call shape | call wrapper | `runCloud("listSenderIdentities")` | P1 |
| WR-04 | CMP-W | `createSenderIdentity` spreads input (not nested) | call `{ fromName:"A", fromEmail:"a@b.co" }` | `runCloud("createSenderIdentity", { fromName:"A", fromEmail:"a@b.co" })` — **no** `input` wrapper | P1 |
| WR-05 | CMP-W | `verifySenderIdentity` wraps id | call `"abc"` | `runCloud("verifySenderIdentity", { id:"abc" })` | P1 |
| WR-06 | CMP-W | `deleteSenderIdentity` wraps id | call `"abc"` | `runCloud("deleteSenderIdentity", { id:"abc" })` | P1 |
| WR-07 | CMP-W | Wrapper rejects propagate | `runCloud` rejects | wrapper promise rejects with same error | P2 |

### 3.5 General-settings page component (`pages/app/settings/index.vue`) (GAP)

Mount with stubbed `useSettings`. Stub `getOrgSettings`/`updateOrgSettings`; stub auto-imported `FormField`/`TextInput`/`SelectInput`/`TextArea`/`Button`/`NuxtLink` as needed.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| GP-01 | CMP | Loading state on mount | mount with pending `getOrgSettings` | "Loading settings…" shown; form hidden | P1 |
| GP-02 | CMP | Form fills from loaded settings | resolve `getOrgSettings` with a profile | Inputs reflect name/from-name/from-email/reply-to/timezone/address; missing timezone defaults `"UTC"` | P1 |
| GP-03 | CMP | Plan shown read-only | loaded profile `plan:"pro"` | "pro" rendered in the read-only field; no editable control | P1 |
| GP-04 | CMP | Load error + retry | reject `getOrgSettings` | Error banner shown; clicking **Retry** re-invokes `getOrgSettings` | P1 |
| GP-05 | CMP | Empty-name client guard | clear name, submit | "Organization name is required."; `updateOrgSettings` **not** called | P0 |
| GP-06 | CMP | Submit trims + sends patch | fill fields w/ surrounding spaces, submit | `updateOrgSettings` called once with trimmed name/from-name/from-email/reply-to; address sent raw | P1 |
| GP-07 | CMP | Success message after save | resolve `updateOrgSettings` | "Settings saved." shown; form re-filled from returned settings | P1 |
| GP-08 | CMP | Server error surfaced | reject `updateOrgSettings` (e.g. invalid email) | Error message from `err.message` rendered; no success state | P1 |
| GP-09 | CMP | Saving disables button | in-flight save | Button shows "Saving…" + disabled | P2 |
| GP-10 | CMP | Sub-nav links present | mount loaded | `NuxtLink` to `/app/settings` ("General") and `/app/settings/senders` ("Sender identities") rendered; inline link to senders in Email-defaults section | P1 |

### 3.6 Sender-identities page component (`pages/app/settings/senders.vue`) (GAP)

Mount with stubbed `useSettings` + stubbed `useToast` (`push` spy). Stub `Modal`/`TableShell`/`Pill`/`Button`. Stub `window.confirm`.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| SP-01 | CMP | Loading state | pending `listSenderIdentities` | "Loading senders…" shown | P1 |
| SP-02 | CMP | Empty state | resolve `[]` | Empty-state card "No sender identities yet" + Add-sender CTA | P1 |
| SP-03 | CMP | List renders rows + status pills | resolve [pending, verified] | Each row shows fromName/fromEmail; pill "Pending" (neutral) / "Verified" (success) | P1 |
| SP-04 | CMP | Verify action only on pending | resolve mixed list | "Verify" button present on pending row, absent on verified row | P1 |
| SP-05 | CMP | Open create modal | click "Add sender" | Modal opens; fields cleared; prior error cleared | P1 |
| SP-06 | CMP | Create requires from-name | submit modal empty | "A from-name is required."; `createSenderIdentity` not called | P0 |
| SP-07 | CMP | Create requires from-email | name only, submit | "A from-email is required."; not called | P0 |
| SP-08 | CMP | Successful create | fill + submit, resolve | `createSenderIdentity({fromName,fromEmail})` (trimmed); modal closes; toast "Sender identity added." (success); list reloaded | P1 |
| SP-09 | CMP | Create error stays in modal | reject create (e.g. duplicate) | Error message rendered in modal; modal stays open; no toast | P1 |
| SP-10 | CMP | Modal cannot dismiss mid-save | in-flight create, trigger close | `showForm` stays true (closeForm re-asserts open while saving) | P2 |
| SP-11 | CMP | Verify flips badge | click Verify, resolve | `verifySenderIdentity(id)`; list reloaded; row now "Verified" | P1 |
| SP-12 | CMP | Verify error surfaced | reject verify | `loadError` banner shown | P2 |
| SP-13 | CMP | Delete confirm gate — cancel | `confirm` returns false | `deleteSenderIdentity` not called | P1 |
| SP-14 | CMP | Delete confirm gate — accept | `confirm` true, resolve delete | `deleteSenderIdentity(id)`; list reloaded; row gone | P1 |
| SP-15 | CMP | Row buttons disabled while busy | in-flight verify/delete on a row | That row's Verify/Remove disabled; "Verifying…" label on verify | P2 |
| SP-16 | CMP | Sub-nav links present | mount | `NuxtLink` General + Sender identities rendered | P2 |

### 3.7 Navigation presence (GAP)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| NAV-01 | CMP | App top-nav has Settings entry | mount `layouts/app.vue` (or its nav) | `NuxtLink to="/app/settings"` with label "Settings" present | P1 |
| NAV-02 | E2E | Settings reachable from nav | sign in, click nav "Settings" | Lands on `/app/settings`; General tab active | P1 |
| NAV-03 | E2E | Sub-nav switches surfaces | on `/app/settings`, click "Sender identities" | URL `/app/settings/senders`; senders page renders | P1 |
| NAV-04 | E2E | Active tab styling | navigate each tab | `router-link-exact-active` on the current tab | P2 |

### 3.8 E2E happy paths (GAP, Playwright + `freshUser`)

> Note: `freshUser` creates a plain Parse user over REST. Settings cloud fns require an **org** (`getUserOrg`). E2E specs must either drive the org-creating signup UI once or add an org-provisioning helper/fixture (see §6). Until then these are blocked.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| E2E-01 | E2E | Unauthed redirect | visit `/app/settings` logged out | Redirected to `/login?next=...` | P0 |
| E2E-02 | E2E | Edit + save org profile | sign in → settings → change name + address → Save | "Settings saved." banner; reload shows persisted values | P1 |
| E2E-03 | E2E | Invalid email blocked at save | enter `bad` as default from-email → Save | Server error surfaced; no success banner | P1 |
| E2E-04 | E2E | Add sender end-to-end | senders → Add sender → fill → submit | Toast "Sender identity added."; row appears with "Pending" pill | P1 |
| E2E-05 | E2E | Verify sender | click Verify on pending row | Pill becomes "Verified"; Verify button gone | P1 |
| E2E-06 | E2E | Duplicate sender blocked | add same email twice | Modal shows duplicate error; row not doubled | P2 |
| E2E-07 | E2E | Delete sender | Remove row → accept confirm | Row removed from table | P2 |

---

## 4. Acceptance criteria

Settings is considered tested-to-ship when:

1. **All P0 cases pass.** Specifically: org shape (OS-01), patch + persistence (OS-03/04), empty-name + invalid-email rejection (OS-05/07), immutables ignored (OS-12/13), no-session rejection (OS-18/SI-16), sender create defaults + email validation (SI-01/02/03), per-org duplicate guard (SI-05), verify stub (SI-10), delete (SI-13), full cross-tenant isolation (TEN-01..04), client-side empty-name + required-field guards (GP-05, SP-06/07), unauthed redirect (E2E-01).
2. **No cross-tenant leak:** a user can never read, verify, or delete another org's sender identity, and another org's settings are never mutated by a caller (TEN-*, OS-17). Cross-tenant access returns `OBJECT_NOT_FOUND`, never a permission-denied that confirms existence.
3. **Email normalization is consistent:** every stored `defaultFromEmail` / `replyTo` / `fromEmail` is lowercased and `EMAIL_RE`-validated when non-empty; empty is allowed only for the two optional org fields.
4. **Non-editable fields are inert:** `slug`, `plan`, `monthlySendCap`, `monthlySendCount` cannot be changed through `updateOrgSettings`.
5. **The frontend contract matches the server:** `useSettings` forwards the exact cloud-fn names + param shapes (WR-*), and the `OrgSettings`/`SenderIdentity` TS interfaces match `orgToJSON`/`senderToJSON` field-for-field.
6. **Page behavior is correct:** loading / error+retry / empty / success states render; client-side validation blocks bad submits before the network; the create modal cannot be dismissed mid-save.
7. Suite runs green on **Node 20** under `vitest run` and `playwright test` with no leaked Parse/Mongo state between files.

---

## 5. Current coverage → gaps

### What `tests/server/settings.test.ts` already covers (10 tests)

| Existing test (line) | Maps to plan IDs |
|---|---|
| `getOrgSettings returns the full org profile…` (57) | OS-01 (partial OS-02) |
| `updateOrgSettings patches editable fields and persists` (68) | OS-03, OS-04 (incl. email lowercasing) |
| `updateOrgSettings rejects an invalid default from-email` (98) | OS-07 |
| `updateOrgSettings rejects an empty name` (109) | OS-05 |
| `updateOrgSettings does not change slug or plan` (120) | OS-12, OS-13 |
| `createSenderIdentity defaults status to pending and validates email` (134) | SI-01, SI-02, SI-03 |
| `createSenderIdentity rejects a duplicate email in the same org` (162) | SI-05 |
| `listSenderIdentities returns the org's senders` (178) | SI-07 |
| `verifySenderIdentity flips status to verified (MVP stub)` (195) | SI-10 |
| `deleteSenderIdentity removes the row` (211) | SI-13 |
| `isolates sender identities across orgs` (228) | TEN-01, TEN-02, TEN-03, TEN-04 |
| `requires a session for settings calls` (257) | OS-18 / SI-16 (partial — only `getOrgSettings` + `listSenderIdentities`) |

### Gaps to close

**A. Server (Vitest) — extend `tests/server/settings.test.ts`:**
- OS-06 (name > 120), OS-08 (invalid reply-to), OS-09/10 (clearing optional emails), OS-11 (blank tz → UTC), OS-14 (counters inert), OS-15 (partial patch), OS-16 (address verbatim/multiline), OS-17 (settings tenant isolation — *update* not just sender list).
- SI-04 (long from-name), SI-06 (case-insensitive dup), SI-08 (newest-first order), SI-09 (empty list), SI-11/12 (verify missing/bogus id), SI-14/15 (delete missing/bogus id).
- TEN-05 (A unaffected after B's failed attempts).
- Broaden OS-18/SI-16 to also assert no-session rejection for `updateOrgSettings`, `createSenderIdentity`, `verifySenderIdentity`, `deleteSenderIdentity`.

**B. Composable wrapper (Vitest, new `tests/components/useSettings.test.ts`)** — WR-01..07. None exist; pattern is `tests/components/useSending.test.ts` (mock `useCloud`). Highest value vs. effort: pins WR-02 (patch nesting) and WR-04 (spread, not nested) which are easy to regress.

**C. Settings pages component tests (Vitest + happy-dom)** — **the single biggest gap.** There is **zero** component coverage for either settings page. GP-01..10 and SP-01..16 are all unwritten. All client-side validation (empty name, required sender fields), state machines (loading/error/retry/empty), the toast on create, the confirm gate on delete, and the mid-save modal lock are currently untested.

**D. Navigation (Vitest + E2E)** — NAV-01..04 unwritten.

**E. E2E (Playwright)** — only `tests/e2e/_example.spec.ts` exists; no settings spec. E2E-01..07 unwritten, and most are **blocked** until an org-provisioning fixture exists (the `freshUser` fixture makes an org-less user, which the settings cloud fns reject — see §6).

---

## 6. Test data & fixtures

### Server tests (`tests/setup/parseServer.ts`)
- `startTestParseServer()` boots a fresh in-memory Mongo + Parse Server per file (loads `server/cloud/main.js`). Tear down in `afterAll`; **do not** share a server across describe blocks (schema cache leaks).
- **Org/user fixture:** the existing `signUp(company)` helper calls `signUpWithOrg` (username `set-<n>@example.com`, password `hunter2hunter2`) and returns `{ sessionToken, orgId }`. Reuse it. `as(token)` returns `{ sessionToken }` for the third `Parse.Cloud.run` arg. Use a unique company per test to keep orgs isolated.
- **No-session calls:** `Parse.Cloud.run("fn", {})` with no third arg → expect `INVALID_SESSION_TOKEN`.
- **IDs for negative cases:** for SI-12/15 use a syntactically valid but non-existent objectId (e.g. `"doesNotExist01"`); cross-tenant cases (TEN-02/03) use the *real* id created by org A but run as org B → expect `OBJECT_NOT_FOUND`.
- **Sample patch** for OS-03: `{ name:"Patched Co", defaultFromName:"Patch Team", defaultFromEmail:"Hello@Patch.com", replyTo:"reply@patch.com", timezone:"America/New_York", address:"1 Patch Way, Springfield" }`.
- **Invalid-email corpus** (OS-07/SI-02): `"not-an-email"`, `"nope"`, `"a@b"` (no dot), `"a b@c.com"` (space), `"@nodomain.com"`, `"missing@.com"`.

### Component tests (`tests/setup/vueTest.ts`)
- Header `// @vitest-environment happy-dom`. Mount via `mountWithPinia(Component, { global: { stubs: {...} } })`.
- **Mock the data seam, not Parse:** `vi.mock("~/composables/app/useSettings", () => ({ useSettings: () => ({ getOrgSettings, updateOrgSettings, listSenderIdentities, createSenderIdentity, verifySenderIdentity, deleteSenderIdentity }) }))` where each is a `vi.fn()`. For the senders page also `vi.mock("~/composables/shared/useToast")` returning `{ push: vi.fn() }`.
- **Auto-imported components** (`FormField`, `TextInput`, `SelectInput`, `TextArea`, `Button`, `Pill`, `Modal`, `TableShell`, `NuxtLink`) aren't registered without Nuxt — pass them as `global.stubs` (e.g. `Modal: { template: '<div><slot/><slot name="footer"/></div>' }`, `NuxtLink: { props:['to'], template:'<a :href="to"><slot/></a>' }`, `TableShell` exposing `head`/`body` slots).
- **Sample `OrgSettings` fixture:** `{ id:"org1", name:"Acme", slug:"acme", plan:"pro", defaultFromName:"Acme", defaultFromEmail:"hi@acme.com", replyTo:"", timezone:"Europe/London", address:"1 St", monthlySendCap:10000, monthlySendCount:0 }`.
- **Sample sender list:** `[{ id:"s1", fromName:"A", fromEmail:"a@acme.com", status:"pending", createdAt:"2026-05-01T00:00:00.000Z" }, { id:"s2", fromName:"B", fromEmail:"b@acme.com", status:"verified", createdAt:"2026-05-02T00:00:00.000Z" }]`.
- **`window.confirm`** (SP-13/14): stub via `vi.spyOn(window, "confirm").mockReturnValue(true|false)`.

### Composable wrapper tests
- Mock `~/composables/app/useCloud` → `{ useCloud: () => ({ runCloud }) }` with a `runCloud = vi.fn()` spy; assert `toHaveBeenCalledWith(...)`. Exactly the shape of `tests/components/useSending.test.ts`.

### E2E (`tests/setup/playwrightFixtures.ts`)
- `freshUser` creates a plain user over REST and tears it down with the master key. **Limitation:** it does not create an Organization, so the settings cloud fns (which call `getUserOrg`) will reject. To unblock E2E-02..07, add one of:
  1. an **org-provisioning fixture** that POSTs `signUpWithOrg` over REST (returns `{ sessionToken, orgId }`), seeding `localStorage` for the SPA before navigating; or
  2. drive the org-creating signup UI once in a setup project.
- Auth: settings pages are CSR and read the Parse session from `localStorage`. Specs should seed the session token into `localStorage` (matching `plugins/parse.client.ts`'s key) before visiting `/app/settings`, or perform a UI login.
- E2E-01 (unauthed redirect) needs **no** org and can run today.
- Clean up any `SenderIdentity` / `Organization` rows created during a spec in teardown (master key) to keep runs idempotent.
