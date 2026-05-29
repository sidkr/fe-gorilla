# Testing Plan — Audiences & Contacts

Status: planning doc only. Defines what to test, at which layer, and how the
cases map onto the existing harness. No test code is written here.

This plan covers the Audiences feature surface: the `List` (a.k.a. "Audience"),
`Contact`, and `CustomField` (per-org data-point registry) Parse classes, their
cloud functions, the shared `validateCustomFields` coercion contract, and the
three Nuxt pages that drive them.

## 1. Scope & routes

### Routes under test

| Route | File | What it does |
|---|---|---|
| `/app/audiences` | `pages/app/audiences/index.vue` | Audience list (card grid), KPI strip, create modal, rename modal, guarded delete |
| `/app/audiences/[id]` | `pages/app/audiences/[id].vue` | Contact table for one List: add/edit/remove contact, bulk select/tag/delete, search + status + tag filters, dynamic custom-field form, contact detail drawer (details/activity tabs), pager |
| `/app/audiences/fields` | `pages/app/audiences/fields.vue` | Custom-field registry CRUD: list, create, edit (label/required/enumValues, type+key locked), delete |

All three are `layout: "app"`, `middleware: "auth-required"`, CSR-only
(`/app/**` is `ssr: false`). They never reach Parse directly — every call goes
through a domain composable.

### Composables under test

| Composable | Cloud functions wrapped |
|---|---|
| `composables/app/useAudiences.ts` | `listAudiences`, `getAudience`, `createAudience`, `updateAudience`, `archiveAudience`, `deleteAudience`, `resolveAudienceRecipients` |
| `composables/app/useContacts.ts` | `listContacts`, `addContact`, `addContactsBulk`, `updateContact`, `deleteContact`, `bulkDeleteContacts`, `bulkTagContacts`, `deleteContactData` |
| `composables/app/useCustomFields.ts` | `listCustomFields`, `createCustomField`, `updateCustomField`, `deleteCustomField`; exports `FIELD_TYPES`, `CustomField` type |

### Server under test

| File | Surface |
|---|---|
| `server/cloud/audiences.js` | `List` CRUD + archive + delete guard + `resolveAudienceRecipients` |
| `server/cloud/contacts.js` | `Contact` CRUD/bulk + dedupe + Suppression on unsubscribe + GDPR hard-delete + `List.contactCount` afterSave/afterDelete maintenance |
| `server/cloud/customFields.js` | `CustomField` registry CRUD, slugified key, immutable key/type |
| `server/cloud/lib/customFields.js` | Pure: `FIELD_TYPES`, `slugifyKey`, `coerceValue`, `validateCustomFields` |

### Data model (canonical class names, DECISIONS #9)

- **List** — `name` (≤80), `description`, `contactCount` (denormalized), `archived`, `organization` (pointer, stamped by tenancy hook), role ACL.
- **Contact** — `email` (lowercased, unique per `(organization, email)`), `firstName`, `lastName`, `status` ∈ {subscribed, unsubscribed, cleaned, pending}, rich strings `company/phone/city/country/timezone`, `tags` (string[]), `consent` (object|null), `customFields` (map cleaned vs registry), `lists` (string[] of List ids), `deleted` (soft-delete flag), `organization`, role ACL.
- **CustomField** — `key` (slug, immutable), `label` (≤80), `type` ∈ FIELD_TYPES, `enumValues` (string[]), `required` (bool), `order` (int), `organization`. Unique `(organization, key)`.
- **Suppression** — `email` (lowercased), `reason` ("manual"/"gdpr"/…), per org. Written by `updateContact` unsubscribe and `deleteContactData`.

### Out of scope

`importContactsCsv` (stub → NOT_IMPLEMENTED; one smoke case only). Send
pipeline, segments, reports. Engagement/last-sent KPIs that "degrade to
placeholders" until sends ship (assert the placeholder, not a real value).

## 2. Test matrix

Three layers (per DECISIONS #7: Vitest node + happy-dom, Playwright E2E):

| Layer | Tool / env | Boots | What it proves | Where |
|---|---|---|---|---|
| **L1 Unit (pure)** | Vitest `node` | nothing | `slugifyKey`, `coerceValue`, `validateCustomFields`; composable payload shaping; page-local pure helpers extracted | `tests/server/customFields.test.ts` (lib block); new `tests/components/*` for composable/helper logic |
| **L2 Integration (cloud)** | Vitest `node` + `startTestParseServer` (in-mem Mongo) | real Parse Server + cloud | every cloud function, multi-tenant isolation, denormalized count maintenance, Suppression side-effects | `tests/server/audiences.test.ts`, `contacts.test.ts`, `customFields.test.ts` |
| **L3 Component** | Vitest `happy-dom` + `mountWithPinia` | mounted Vue, mocked composables | form rendering / validation / state transitions in the three pages | new `tests/components/*` (see §5 caveat — SFCs may need extraction) |
| **L4 E2E** | Playwright (`tests/e2e/`), real `npm run dev` + dev Mongo, `freshUser` fixture | full stack in a browser | the user-visible flows end to end across the boundary | new `tests/e2e/audiences.spec.ts` |

Coverage emphasis by feature:

| Feature area | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| Audience CRUD + delete guard | — | ✅ primary | ✅ modal logic | ✅ happy path |
| Contact add / dedupe / edit / soft-delete | — | ✅ primary | ✅ form logic | ✅ happy path |
| Bulk tag / bulk delete | — | ✅ primary | ✅ selection logic | ✅ smoke |
| Status + tag filters, search, pager | — | ✅ primary | ✅ debounce/reset | ✅ smoke |
| Custom-field CRUD + immutable key/type | — | ✅ primary | ✅ form/disabled type | ✅ smoke |
| `validateCustomFields` coercion/cleaning | ✅ primary | ✅ via contacts | — | — |
| Dynamic contact form from registry | — | — | ✅ primary | ✅ verify rendered |
| contactCount maintenance | — | ✅ primary | — | — |
| Consent capture | — | ✅ primary | ✅ payload | — |
| Tenant isolation | — | ✅ primary | — | — |

## 3. Detailed test cases

Priority: **P0** = must pass before ship / blocks release; **P1** = important,
ship-soon; **P2** = nice-to-have / regression hardening.

Conventions for L2 steps: `signUp(company)` → `{ sessionToken, orgId }`;
`as(token)` → `{ sessionToken }`; `run(fn, params, as(token))` =
`Parse.Cloud.run`. Org A / org B are two distinct `signUpWithOrg` tenants.

### 3a. Audience CRUD + delete guard (`audiences.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| A-01 | L2 | Create audience | `createAudience({name:"Newsletter", description:"Weekly"})` | `{id, name:"Newsletter", description:"Weekly", contactCount:0, archived:false}`; `List.organization.id === orgId` (tenancy stamp) | P0 |
| A-02 | L2 | Create trims name | `createAudience({name:"  Spaced  "})` | stored name `"Spaced"` | P1 |
| A-03 | L2 | Reject empty name | `createAudience({name:"   "})` | rejects (OTHER_CAUSE "name is required") | P0 |
| A-04 | L2 | Reject >80-char name | `createAudience({name:"x".repeat(81)})` | rejects | P1 |
| A-05 | L2 | List returns only caller's non-archived lists | org A creates A-one/A-two, org B creates B-one; `listAudiences()` as each | A sees `[A-one,A-two]` (newest-first), B sees `[B-one]` | P0 |
| A-06 | L2 | List excludes archived by default; `includeArchived:true` includes | create + `archiveAudience`; list both ways | default omits it; `{includeArchived:true}` returns it with `archived:true` | P1 |
| A-07 | L2 | getAudience by id | create then `getAudience({id})` | returns that list's JSON | P1 |
| A-08 | L2 | getAudience unknown id → not found | `getAudience({id:"bogus"})` | rejects OBJECT_NOT_FOUND | P1 |
| A-09 | L2 | Rename + edit description | `updateAudience({id, patch:{name:"New", description:"Edited"}})` | name/description updated | P0 |
| A-10 | L2 | Rename validates name | `updateAudience({id, patch:{name:"   "}})` | rejects | P1 |
| A-11 | L2 | Delete empty list succeeds | create empty, `deleteAudience({id})`, then `getAudience` | `{ok:true}`; subsequent get rejects (gone) | P0 |
| A-12 | L2 | Delete guard refuses non-empty list | create list, `addContact`, `deleteAudience({id})` | rejects OTHER_CAUSE ("still has contacts"); list still exists | P0 |
| A-13 | L2 | Delete guard recomputes live count (ignores stale denorm) | add contact then **soft-delete** it (live count 0 though it once had members), `deleteAudience` | succeeds — guard counts `deleted != true` rows, not the denormalized field | P1 |
| A-14 | L2 | archiveAudience is soft | `archiveAudience({id})` then read row | `archived === true`, row not destroyed | P1 |
| A-15 | L2 | Cross-org: B cannot get/rename/delete A's list | A creates list, B calls `getAudience`/`updateAudience`/`deleteAudience` with A's id | each rejects OBJECT_NOT_FOUND (ACL hides it) | P0 |
| A-16 | L2 | resolveAudienceRecipients = subscribed minus suppressed | add 2 subscribed + 1 pending; resolve; then unsubscribe one; resolve again | first call returns both subscribed; pending excluded; after unsubscribe only the remaining subscribed (suppressed dropped) | P1 |

### 3b. Contact add / dedupe / edit / soft-delete (`contacts.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| C-01 | L2 | Add contact lowercases email + joins list | `addContact({audienceId, email:"Person@Example.com", firstName:"Pat"})` | `email:"person@example.com"`, `lists` contains listId; `List.contactCount === 1` | P0 |
| C-02 | L2 | Add rejects invalid email | `addContact({audienceId, email:"not-an-email"})` | rejects OTHER_CAUSE | P0 |
| C-03 | L2 | Add rejects missing email | `addContact({audienceId, email:""})` | rejects | P1 |
| C-04 | L2 | Duplicate email → DUPLICATE_VALUE w/ contactId | add `dup@x.com`, add again | rejects `{code:137, contactId: firstId}` (UI "open contact") | P0 |
| C-05 | L2 | Add to nonexistent / other-org list → not found | `addContact({audienceId:"bogus", ...})`; and B adds to A's list id | rejects OBJECT_NOT_FOUND | P0 |
| C-06 | L2 | Revive soft-deleted contact instead of erroring | add, soft-delete, add same email again | succeeds (no 137); `deleted:false`; back on list | P1 |
| C-07 | L2 | Rich std fields persist + round-trip | add with company/phone/city/country/timezone | all stored; reappear via `listContacts` | P1 |
| C-08 | L2 | Tags normalize (trim + dedupe) | add with `tags:["vip","vip"," beta "]` | stored `["vip","beta"]` (order-insensitive) | P1 |
| C-09 | L2 | Consent object captured | add with `consent:{source:"signup-form", capturedAt:"…"}` | `consent.source === "signup-form"` round-trips | P1 |
| C-10 | L2 | Consent cleared with null | update with `consent:null` | consent unset (null) | P2 |
| C-11 | L2 | Status defaults to subscribed; invalid status falls back | add with no status, and with `status:"weird"` | both stored as `subscribed` | P1 |
| C-12 | L2 | Edit names/std fields/tags | `updateContact({id, patch:{firstName:"New", company:"Globex", tags:["lead"]}})` | fields updated | P0 |
| C-13 | L2 | Edit email re-checks uniqueness | two contacts; update one's email to the other's | rejects `{code:137}` | P0 |
| C-14 | L2 | Edit to a free email succeeds | update mover to unused email | email changed | P1 |
| C-15 | L2 | Unsubscribe writes a Suppression (manual) | `updateContact({id, patch:{status:"unsubscribed"}})` | status updated; `Suppression(email).reason === "manual"` exists | P0 |
| C-16 | L2 | Unsubscribe Suppression is idempotent | unsubscribe twice | exactly one Suppression row for the email | P2 |
| C-17 | L2 | Invalid status on update rejected | `updateContact({id, patch:{status:"bogus"}})` | rejects OTHER_CAUSE | P1 |
| C-18 | L2 | Edit list membership via `patch.lists` | update with `lists:[listA,listB]` (dedup) | membership replaced + deduped; counts on both lists reconcile | P2 |
| C-19 | L2 | Soft-delete hides + decrements count | `deleteContact({id})` then `listContacts` | row excluded from list; total + `contactCount` drop | P0 |
| C-20 | L2 | deleteContact unknown id → not found | `deleteContact({id:"bogus"})` | rejects OBJECT_NOT_FOUND | P2 |
| C-21 | L2 | GDPR hard-delete + suppression | add then `deleteContactData({email:"Forget@Example.com"})` | `{ok, removed:1}`; zero Contact rows for email; `Suppression.reason === "gdpr"`; `contactCount` back to 0 | P0 |
| C-22 | L2 | addContactsBulk: add/update/skip/collapse | bulk with new1, new2, existing(update), new2 dupe, "garbage" | `{added:2, updated:1, skipped:1}`; `contactCount === 3` | P1 |
| C-23 | L2 | Bulk merges custom fields (not clobber) on existing | existing contact with cf set; bulk row updates a different cf key | both cf keys present (merge mode) | P2 |
| C-24 | L2 | importContactsCsv stub | `importContactsCsv({...})` | rejects COMMAND_UNAVAILABLE | P2 |

### 3c. Bulk select / tag / delete (`contacts.js` + `[id].vue`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| B-01 | L2 | bulkDeleteContacts soft-deletes many + reconciles count | add 3, `bulkDeleteContacts({ids:[0,1]})` | `{deleted:2}`; `contactCount === 1` | P0 |
| B-02 | L2 | bulkDelete empty ids rejected | `bulkDeleteContacts({ids:[]})` | rejects OTHER_CAUSE | P2 |
| B-03 | L2 | bulkDelete skips ids outside org (ACL) | A's ids passed by B | B's call deletes 0 (rows hidden by ACL) | P1 |
| B-04 | L2 | bulkTagContacts add | `bulkTagContacts({ids, tag:"promo"})` | `{updated:2}`; filter by tag `promo` → 2 | P0 |
| B-05 | L2 | bulkTagContacts remove | then `{ids, tag:"promo", action:"remove"}` | `{updated:2}`; filter `promo` → 0 | P0 |
| B-06 | L2 | bulkTag only counts actually-changed rows | tag one contact already carrying `promo`, then bulk-add `promo` to both | `updated` counts only the row that changed | P2 |
| B-07 | L2 | bulkTag requires non-empty tag | `bulkTagContacts({ids, tag:"  "})` | rejects OTHER_CAUSE | P2 |
| B-08 | L3 | Select-all-on-page toggles every visible row | mount table w/ N rows, click header checkbox | `selected` set = all visible ids; `allOnPageSelected` true; click again → empty | P1 |
| B-09 | L3 | Per-row toggle is additive + clearSelection resets | toggle two rows, then Clear | count tracks toggles; clear → 0 | P1 |
| B-10 | L3 | Bulk bar only shows when `selectedCount > 0` | none selected vs some | bulk bar hidden/shown accordingly | P2 |
| B-11 | L3 | bulkTag prompt cancel is a no-op | stub `window.prompt` → null | `bulkTagContacts` NOT called | P2 |

### 3d. Filters, search, pager (`contacts.js` + `[id].vue`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| F-01 | L2 | Search filters by email prefix | add alpha@, beta@; `listContacts({search:"alpha"})` | total 1, the alpha row | P0 |
| F-02 | L2 | Search is case-insensitive (normEmail) | search `"ALPHA"` | matches alpha@ | P2 |
| F-03 | L2 | Status filter | add subscribed + pending; `listContacts({status:"pending"})` | total 1, the pending row | P0 |
| F-04 | L2 | Tag filter | add vip-tagged + lead-tagged; `listContacts({tag:"vip"})` | total 1 | P0 |
| F-05 | L2 | Pagination total + slicing | add 5, perPage 2; pages 0 and 2 | page0 total 5 / 2 rows; page2 1 row | P0 |
| F-06 | L2 | perPage clamps to [1, 100] | request perPage 0 and 9999 | clamps to 1 and 100 (MAX_PER_PAGE) | P2 |
| F-07 | L2 | Soft-deleted excluded from list/total | add 5, soft-delete 1 | total 4 | P0 |
| F-08 | L2 | Invalid status filter ignored | `listContacts({status:"bogus"})` | filter not applied (returns all) | P2 |
| F-09 | L3 | Search input is debounced + resets to page 0 | type into search, advance timers 350ms | exactly one `loadContacts` after debounce; `page` reset to 0 | P1 |
| F-10 | L3 | Status/tag filter change re-queries immediately + resets page | change `statusFilter` | `loadContacts` called; `page` reset to 0 | P1 |
| F-11 | L3 | Tag filter dropdown only renders when `knownTags` non-empty | rows with/without tags | dropdown hidden when no tags present | P2 |
| F-12 | L3 | Pager Prev disabled on page 0, Next disabled on last page | mount with totalPages computed | buttons disabled at bounds; `goPage` clamps | P1 |

### 3e. Custom-field CRUD + type/immutability (`customFields.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CF-01 | L2 | Create slugifies key + defaults order/required | `createCustomField({label:"Plan Tier", type:"text"})` | `key:"plan_tier"`, `order:0`, `required:false` | P0 |
| CF-02 | L2 | Explicit key is slugified too | `createCustomField({label:"X", key:"Customer-ID #2", type:"text"})` | `key:"customer_id_2"` | P2 |
| CF-03 | L2 | Reject invalid type | `createCustomField({label:"Bad", type:"json"})` | rejects OTHER_CAUSE | P0 |
| CF-04 | L2 | enum requires non-empty enumValues | `createCustomField({label:"Status", type:"enum"})` then with values | first rejects; second returns `enumValues:["active","churned"]` | P0 |
| CF-05 | L2 | Duplicate key in same org rejected | create Region twice | second rejects `{code: DUPLICATE_VALUE}` | P0 |
| CF-06 | L2 | order increments per creation | create 3 fields | orders 0,1,2 (append) | P1 |
| CF-07 | L2 | Label empty / >80 rejected | create with `""` and 81 chars | both reject | P1 |
| CF-08 | L2 | Key with no alphanumerics rejected | `createCustomField({label:"$$$", type:"text"})` | rejects (derived key "") | P2 |
| CF-09 | L2 | List ordered by order then label | create Alpha/Beta/Gamma | rows in `[Alpha,Beta,Gamma]`, orders `[0,1,2]` | P1 |
| CF-10 | L2 | Update label + required allowed | `updateCustomField({id, patch:{label:"LTV", required:true}})` | label/required updated; key unchanged | P0 |
| CF-11 | L2 | Update rejects key change | `patch:{key:"ltv"}` | rejects OTHER_CAUSE (immutable) | P0 |
| CF-12 | L2 | Update rejects type change | `patch:{type:"text"}` | rejects (immutable) | P0 |
| CF-13 | L2 | enum update with empty values rejected | enum field, `patch:{enumValues:[]}` | rejects | P1 |
| CF-14 | L2 | Update label empty/>80 rejected | `patch:{label:"  "}`, 81 chars | reject | P2 |
| CF-15 | L2 | Update unknown id → not found | `updateCustomField({id:"bogus", patch:{}})` | rejects OBJECT_NOT_FOUND | P2 |
| CF-16 | L2 | Delete removes definition (values left) | create, delete, list | not in registry; (note: existing contact values are retained, dropped on next save) | P0 |
| CF-17 | L2 | Delete unknown id → not found | `deleteCustomField({id:"bogus"})` | rejects OBJECT_NOT_FOUND | P2 |

### 3f. validateCustomFields cleaning + coercion (`lib/customFields.js`, pure)

Registry fixture: enum `plan_tier`∈{free,pro}; number `ltv`; boolean `vip`;
date `joined`; text `nickname`.

| ID | Layer | Scenario | Input | Expected | Priority |
|---|---|---|---|---|---|
| V-01 | L1 | slugifyKey transforms | "Plan Tier" / "  Customer-ID #2 " / "$$$" | "plan_tier" / "customer_id_2" / "" | P0 |
| V-02 | L1 | Coerce known + drop unknown | `{plan_tier:"pro", ltv:"1234", vip:"yes", nickname:"Ace", not_a_field:"x"}` | cleaned: plan_tier="pro", ltv=1234 (Number), vip=true (Bool), nickname="Ace"; `not_a_field` dropped + in errors; never throws | P0 |
| V-03 | L1 | Bad-typed known value → error, dropped | `{ltv:"not-a-number", plan_tier:"enterprise"}` | both absent from cleaned; both in errors | P0 |
| V-04 | L1 | Number coercion rejects NaN/non-finite | `ltv:""`, `ltv:"abc"`, `ltv:"3.5"` | "" → null (omitted), "abc" → error, "3.5" → 3.5 | P1 |
| V-05 | L1 | Boolean truthy/falsy sets | true/"true"/1/"1"/"yes" and false/"false"/0/"0"/"no"; "maybe" | each → correct bool; "maybe" → error (no silent coerce) | P1 |
| V-06 | L1 | Date round-trips to ISO; bad date errors | "2026-05-29"; "not-a-date" | first → ISO string starting 2026-05-29; second → error | P1 |
| V-07 | L1 | enum case-sensitive membership | "pro" vs "Pro" | "pro" ok; "Pro" → error | P2 |
| V-08 | L1 | Empty string is "no value" for all types | `""` on text/number/date | `{ok:true, value:null}`; omitted from cleaned | P1 |
| V-09 | L1 | null/undefined obj + null/undefined registry | `validateCustomFields(null, undefined)` | `{cleaned:{}, errors:{}}`, no throw | P2 |
| V-10 | L1 | Unknown type in registry → error | coerceValue("json", "x") | `{ok:false}` error | P2 |
| V-11 | L2 | addContact applies cleaning end-to-end | create enum+number fields; add with `{plan_tier:"pro", seats:"12", bogus:"nope"}` | stored cf: plan_tier="pro", seats=12, bogus absent | P0 |
| V-12 | L2 | addContact drops a coercion failure | number field; add `{seats:"not-a-number"}` | `customFields.seats` undefined; save still succeeds (never throws) | P1 |
| V-13 | L2 | updateContact "set" replaces cf map vs registry | add with cf, update with new cf map incl. junk key | cf replaced; junk dropped | P1 |

### 3g. Dynamic contact form rendering from registry (`[id].vue`, L3)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-01 | L3 | Registry drives the custom-field section | mount with stub `listCustomFields` returning one of each type | one input per field; "Custom fields" subhead present; section hidden when registry empty | P1 |
| D-02 | L3 | Correct control per type | registry: text/number/date/boolean/enum | text→TextInput; number→type=number; date→type=date; boolean→Checkbox; enum→Select with "—" + each enumValue option | P1 |
| D-03 | L3 | `seedCustomForm` on edit hydrates from stored values | open edit on a contact with cf values | boolean coerced to bool, date sliced to YYYY-MM-DD, others stringified | P1 |
| D-04 | L3 | `collectCustomFields` omits empties, keeps booleans | fill some, leave others blank | payload includes booleans (true/false) + non-empty values; blank text/number/date omitted | P1 |
| D-05 | L3 | Required custom field blocks submit client-side | required enum left empty, submit | `formError` = `"<label>" is required.`; `addContact` NOT called | P1 |
| D-06 | L3 | Email required client-side | submit with empty email | `formError` "Email is required."; no cloud call | P0 |
| D-07 | L3 | Tags parsed from comma string | tagsText "vip, beta, " | payload `tags:["vip","beta"]` | P2 |
| D-08 | L3 | Duplicate (137) surfaces "Open contact" affordance | stub `addContact` to reject `{code:137, contactId}` | `dupContactId` set; "Open contact" link shown; clicking opens drawer for that id | P1 |
| D-09 | L3 | Two custom fields shown as extra table columns | registry length ≥3 | `columnFields` = first 2; table renders 2 extra `<th>`/`<td>` | P2 |
| D-10 | L3 | displayCustomValue formats by type | boolean→Yes/No, date→formatted, empty→"—" | matches per-type formatting | P2 |
| D-11 | L3 | Drawer shows registry fields in order + orphaned stored keys | contact cf includes a key no longer in registry | registry fields labeled + ordered; orphan key shown by raw key, nothing vanishes (`drawerCustomFields`) | P2 |

### 3h. Page-level modal / drawer state (`index.vue`, `fields.vue`, L3)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| P-01 | L3 | Audience create modal: blank name blocks submit | open create, submit empty | `createError` "Name is required."; `createAudience` not called | P1 |
| P-02 | L3 | Audience create prepends new card on success | stub `createAudience` → row, submit | new row at head of `audiences`; modal closes | P2 |
| P-03 | L3 | Delete blocked client-side when contactCount > 0 | click delete on a card with `contactCount:5` (stub `window.alert`) | alert shown; `deleteAudience` NOT called | P1 |
| P-04 | L3 | Delete confirm path on empty audience | contactCount 0, stub `confirm`→true | `deleteAudience` called; row removed | P2 |
| P-05 | L3 | KPI strip sums contactCount + placeholder engagement | mount with rows | total subscribers = sum; engagement value is "—" placeholder | P2 |
| P-06 | L3 | Fields page: type Select disabled on edit | openEdit a field | type SelectInput `disabled`; hint "(can't change after creation)" | P1 |
| P-07 | L3 | Fields page: enum choices field only shows for enum | switch type | "Choices" FormField visible iff `type==="enum"` | P2 |
| P-08 | L3 | Fields page: enum w/ no choices blocks submit | type enum, empty choices | `formError` "A choice field needs at least one value."; no cloud call | P1 |
| P-09 | L3 | Empty state renders when no audiences / no fields / no contacts | mount each with empty data | EmptyState with the correct title + New-action button | P2 |

### 3i. Tenant isolation (L2 — the security floor)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| T-01 | L2 | Contacts isolated across orgs | A adds contact to A's list; B `listContacts` on B's list | B sees total 0 | P0 |
| T-02 | L2 | B cannot list contacts on A's list | B `listContacts({audienceId: A-list})` | rejects OBJECT_NOT_FOUND | P0 |
| T-03 | L2 | B cannot add/update/delete A's contact | B calls add/update/delete with A's ids | reject / no effect (ACL) | P0 |
| T-04 | L2 | Registry isolated; same key reusable per org | A creates "OnlyForA"; B lists (absent) then creates same label | B's list excludes A's field; B can reuse key `onlyfora` (unique per-org) | P0 |
| T-05 | L2 | B cannot edit/delete A's custom field | B `updateCustomField`/`deleteCustomField` with A's id | rejects OBJECT_NOT_FOUND | P1 |
| T-06 | L2 | resolveAudienceRecipients scoped to org | B resolves A's list id | rejects OBJECT_NOT_FOUND | P1 |
| T-07 | L2 | Email uniqueness is per-org, not global | A and B both add `same@x.com` | both succeed (independent rows); no 137 across orgs | P1 |

### 3j. End-to-end (L4 — Playwright, `freshUser` fixture)

These run against `npm run dev` + dev Mongo, single worker. Authenticate by
seeding the Parse session token in `localStorage` (the app boots CSR and
hydrates auth from it) rather than driving the login form each time.

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| E-01 | L4 | Create an audience from the grid | visit `/app/audiences`, New audience, fill name, submit | new card appears; navigates list shows it | P0 |
| E-02 | L4 | Add a contact and see it in the table | open audience, Add contact, fill email + name, submit | row appears; header count increments | P0 |
| E-03 | L4 | Duplicate email shows inline error + Open contact | add same email twice | error text + "Open contact" opens the drawer | P1 |
| E-04 | L4 | Filter by status narrows the table | add subscribed + pending, pick Pending | only pending row visible | P1 |
| E-05 | L4 | Bulk tag via the bulk bar | select rows, Add tag, enter tag | tag chips appear on rows | P1 |
| E-06 | L4 | Create a custom field, then it renders on the contact form | `/app/audiences/fields` New field (enum), back to add-contact | the new field appears in the form's Custom fields section | P0 |
| E-07 | L4 | Type Select is locked when editing a field | open edit on a field | type dropdown disabled | P2 |
| E-08 | L4 | Guarded delete: non-empty audience blocked | try delete on an audience with contacts | alert; not deleted. Empty one deletes and disappears | P1 |
| E-09 | L4 | Contact detail drawer opens with details + activity-empty | click a row | drawer shows fields; Activity tab shows empty state | P2 |
| E-10 | L4 | auth gate: anonymous hitting `/app/audiences` redirects to login | clear session, visit | redirected to `/login?next=…` | P1 |

## 4. Acceptance criteria

Ship-gating (all **P0** must be green):

1. **Audience lifecycle.** Create (valid/invalid names), rename, archive, and
   the guarded delete (empty deletes; non-empty refuses; guard recomputes live
   count) all pass at L2. Happy-path create + the delete guard verified at L4.
2. **Contact lifecycle.** Add (lowercased email, list join, count bump),
   duplicate→137-with-contactId, edit (incl. email-clash 137), soft-delete
   (hidden + count down), and GDPR hard-delete (rows gone + suppression +
   count→0) all pass at L2. Add + dedupe verified at L4.
3. **Counts stay correct.** `List.contactCount` reconciles via
   afterSave/afterDelete across add, soft-delete, bulk-delete, and GDPR delete.
4. **Custom-field registry.** Create (slug key, type validation, enum-needs-
   values, dup-key), update (label/required mutable; key/type immutable),
   delete pass at L2. Create→renders-on-form verified at L4.
5. **Coercion contract.** `validateCustomFields` coerces known types, drops
   unknown keys + bad values into `errors`, and **never throws** — proven at L1
   and end-to-end through `addContact`/`updateContact` at L2.
6. **Tenant isolation.** No org can read, list, mutate, or resolve another org's
   List / Contact / CustomField. Email + custom-field-key uniqueness is
   per-org, not global.
7. **Dynamic form.** The contact form renders exactly the registry's fields with
   the correct control per type, blocks submit on missing email and missing
   required custom fields (L3).

Secondary (P1 should be green before calling the feature done): filters/search/
pager behavior, bulk select/tag UI logic, consent capture, modal validation
guards, and the main E2E flows.

Non-functional: L2 suite finishes within the 30s `testTimeout` per file; tests
are hermetic (own in-memory Mongo per file, no shared state); no test depends on
ordering within a file (fresh `signUp` per case — distinct org per test).

## 5. Current coverage → file map and GAPS

### What exists today (all L2 + one L1 block)

**`tests/server/audiences.test.ts`** covers: A-01 (create + tenancy stamp),
A-03/A-04 (name validation), A-05 (list isolation), A-06+A-14 (archive hides),
A-07 (get), A-09/A-10 (rename + validate), A-11/A-12 (delete empty / refuse
non-empty), A-16 (resolveAudienceRecipients incl. suppression).

**`tests/server/contacts.test.ts`** covers: C-01 (lowercase + join + count),
C-07 (rich fields), C-08 (tags), C-09 (consent), V-11/V-12 (cf clean/coerce via
add), C-02 (invalid email), C-04 (dup 137 + contactId), C-22 (bulk
add/update/skip/collapse), F-05+F-07 (paginate + soft-delete exclusion), F-01
(search), C-12+C-15 (edit + unsubscribe→manual Suppression), V-13 (update cf
clean), F-03+F-04 (status + tag filters), B-01 (bulk delete + count), B-04/B-05
(bulk tag add/remove), C-13 (email-clash 137), C-21 (GDPR hard-delete +
suppression + count→0), C-24 (CSV stub), T-01+T-02 (contact isolation).

**`tests/server/customFields.test.ts`** covers: CF-01 (slug + defaults), CF-03
(bad type), CF-04 (enum needs values), CF-05 (dup key), CF-09+CF-06 (list order
+ order increment), CF-10/CF-11/CF-12 (update label; reject key/type),
CF-16 (delete), T-04 (registry isolation + per-org key reuse). Plus the L1 unit
block: V-01 (slugify), V-02 (coerce + drop unknown), V-03 (bad-typed error),
V-06+V-08 (date ISO / empty→null).

### GAPS — ranked

**Biggest gap: there is zero frontend coverage (L3) and zero E2E coverage (L4)
for this entire feature surface.** The `tests/components/` and `tests/e2e/`
dirs exist with only `_example` + merge-tag specs; none of the three audiences
pages — and none of their forms, modals, drawer, filters, pager, bulk bar, or
the registry-driven dynamic form — are exercised in a mounted/browser context.
Every behavior that lives in `.vue` `<script setup>` (client-side required-field
validation, `collectCustomFields`/`seedCustomForm`, the 137 "Open contact"
affordance, debounced search, page-reset-on-filter, select-all, the
contactCount==0 delete guard's client alert, type-locked field edit) is
currently unverified. This is the highest-value place to add tests.

> **L3 caveat (load-bearing):** the vitest config does **not** register
> `@vitejs/plugin-vue` (see the header comment in
> `tests/components/mergeTagPicker.test.ts`), so real `.vue` SFCs cannot be
> compiled/mounted as-is. Two viable paths, pick per case: (a) **extract** the
> pure logic from the three pages into testable helpers (e.g.
> `collectCustomFields`, `seedCustomForm`, `parseTags`, the
> `knownTags`/`columnFields`/`drawerCustomFields` computations, the
> select-all/toggle reducers) and unit-test those directly — cheapest, matches
> the merge-tag precedent; or (b) **add `@vitejs/plugin-vue`** to the vitest
> config so the SFCs mount under happy-dom with `mountWithPinia` + stubbed
> composables — needed for cases that assert *rendered* output (D-01/D-02,
> control-per-type, disabled type select). Recommend (a) for logic-heavy cases
> and (b) (a small config add) for the genuinely render-dependent ones. Note
> this if proposing (b), as it changes the test toolchain.

Other gaps, by area:

- **Audience server (L2):** A-02 (trim), A-08 (get unknown→not-found),
  A-13 (delete guard ignores stale denorm — important edge), A-15 (cross-org
  get/rename/delete), A-16's pending-exclusion assertion exists but the explicit
  T-06 cross-org resolve does not.
- **Contact server (L2):** C-03 (missing email), C-05 (add to other-org list),
  C-06 (revive soft-deleted on re-add — currently untested behavior),
  C-10 (consent clear-to-null), C-11 (status default/fallback),
  C-14 (email change to free address), C-16 (unsubscribe idempotent),
  C-17 (invalid status on update), C-18 (`patch.lists` membership change +
  multi-list count reconcile), C-20 (delete unknown), C-23 (bulk merge vs
  clobber), F-02/F-06/F-08 (search case, perPage clamp, invalid status
  ignored), B-02/B-03/B-06/B-07 (bulk edge cases), T-03/T-07 (cross-org contact
  mutation, per-org email uniqueness).
- **Custom-field server (L2):** CF-02 (explicit key slugified), CF-07/CF-14
  (label length bounds), CF-08 (no-alnum key), CF-13 (enum update empty),
  CF-15/CF-17 (unknown id on update/delete), T-05 (cross-org edit/delete).
- **Pure (L1):** V-04 (number NaN/finite edges), V-05 (full boolean truth
  table + "maybe"), V-07 (enum case-sensitivity), V-09 (null obj/registry),
  V-10 (unknown type) — `coerceValue`/`validateCustomFields` are only partially
  exercised today.
- **E2E (L4):** all of E-01..E-10 missing. Establish an auth-seeding helper
  (localStorage session token via `freshUser`) since the pages are CSR and the
  middleware redirects anonymous users — without it no `/app/*` spec can load.

## 6. Test data & fixtures

### Existing harness (reuse, don't reinvent)

- **`tests/setup/parseServer.ts` → `startTestParseServer()`** — boots a real
  Parse Server on an OS-assigned port against a fresh in-memory Mongo
  (`tests/setup/mongo.ts`), loading the real cloud (`server/cloud/main.js`).
  Returns `{ Parse, baseURL, mongoUri, stop }`. One per file (`beforeAll` /
  `afterAll`); never share across describe blocks (schema cache leaks). `pool:
  "forks"` isolates files.
- **Tenant fixture (L2 pattern, copy from the three existing specs):**
  ```
  signUp(company) → Parse.Cloud.run("signUpWithOrg",
    { username: `<area>-${counter}@example.com`, password: "hunter2hunter2", company })
    → { sessionToken, userId, orgId }
  as(token) → { sessionToken }   // act as the tenant; Parse.User.become() is blocked
  ```
  Use a monotonic `counter` for unique usernames. Each test signs up its **own**
  org so cases are independent and order-free.
- **L2 helpers worth sharing:** `makeList(token, name)` → list id;
  `listCount(token, listId)` → `List.contactCount`; `findContact(token, email)`
  → Contact. These already exist inline in the specs — promote to a small
  `tests/setup/audiencesFixtures.ts` if duplication grows.
- **`tests/setup/vueTest.ts` → `mountWithPinia(component, options)`** — for L3,
  with a fresh Pinia per mount. Stub the domain composables
  (`useAudiences`/`useContacts`/`useCustomFields`) by mocking the module so the
  component logic runs without a server.
- **`tests/setup/playwrightFixtures.ts` → `freshUser`** — creates a Parse user
  via REST (`POST /api/users`) and deletes on teardown. For L4, extend it to
  also seed the session token into `localStorage` before navigating to `/app/*`,
  and optionally create an org (call `signUpWithOrg` over REST or via a tiny
  bootstrap) since audiences require org membership.

### Custom-field registry fixture (shared across L1/L2/L3)

A canonical "one of each type" registry to reuse everywhere:

```
[
  { key: "plan_tier", label: "Plan Tier", type: "enum",    enumValues: ["free","pro","enterprise"] },
  { key: "seats",     label: "Seats",     type: "number" },
  { key: "vip",       label: "VIP",       type: "boolean" },
  { key: "joined",    label: "Joined",    type: "date" },
  { key: "nickname",  label: "Nickname",  type: "text",    required: true },
]
```

- L1 uses it as the plain-object `registry` arg to `validateCustomFields`.
- L2 creates it via `createCustomField` per test (one fresh org each).
- L3 returns it from the stubbed `listCustomFields` to drive the dynamic form.

### Contact fixture shapes

- **Minimal:** `{ audienceId, email }` (status defaults subscribed).
- **Rich:** add `firstName/lastName`, `company/phone/city/country/timezone`,
  `tags:["vip"," beta "]` (assert trim+dedup), `consent:{source, capturedAt}`,
  `customFields:{ plan_tier:"pro", seats:"12", bogus:"x" }` (assert
  coercion + drop).
- **Edge emails:** mixed-case (`Person@Example.com`) for lowercase assertion;
  `not-an-email` / `""` for rejection; same email across two orgs for per-org
  uniqueness (T-07).

### Conventions / gotchas to encode in the tests

- Node 20 only (`nvm use 20`) before running vitest/playwright — system Node 14
  breaks installs.
- Errors are `Parse.Error`; assert with `rejects.toMatchObject({})` for
  generic, or `{ code: 137 }` / `{ code: Parse.Error.DUPLICATE_VALUE }` /
  `{ code: 101 }` (OBJECT_NOT_FOUND) where the code is load-bearing. The
  duplicate-contact error also carries a non-standard `contactId` field — assert
  it.
- `validateCustomFields` **never throws**; bad values are silently dropped from
  the saved map. Assert by absence (`toBeUndefined()`), not by rejection.
- L4 runs single-worker against shared dev Mongo — namespace created audiences
  (e.g. timestamped names) and clean up, or rely on the `freshUser` teardown so
  specs don't collide.
