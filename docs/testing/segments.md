# Testing Plan — Segments

Test plan for the Segments feature: the list view, the rule-builder editor with
live preview, the rule DSL compiler, static-vs-dynamic semantics, and CRUD.
Stack is **Vitest + Playwright** (DECISIONS #7), Node 20. Server integration runs
against a real Parse Server on in-memory Mongo via `startTestParseServer`
(`tests/setup/parseServer.ts`); the cloud module under test is
`server/cloud/segments.js` loaded through `server/cloud/main.js`.

Source under test:

- `pages/app/segments/index.vue` — list, summarize-rules column, duplicate, delete.
- `pages/app/segments/[id].vue` — create/edit form, type radio, debounced preview.
- `components/app/SegmentRuleBuilder.vue` — AND/OR group, per-type operator + value inputs.
- `composables/app/useSegments.ts` — typed cloud wrappers + client-side `duplicateSegment`.
- `server/cloud/segments.js` — rule DSL → `Parse.Query("Contact")`, evaluate/CRUD, tenancy.
- Existing coverage: `tests/server/segments.test.ts`.

---

## 1. Scope & routes

| Route | Rendering | Surface under test |
|---|---|---|
| `/app/segments` | CSR (`ssr:false`, `auth-required`) | list table, rule summary column, Edit/Duplicate/Delete actions, empty/loading/error states |
| `/app/segments/new` | CSR | create form: name, type (dynamic/static), rule builder, live preview, Create |
| `/app/segments/[id]` | CSR | edit form: prefilled from `getSegment`, live preview, Save, Cancel |

Cloud functions in scope: `createSegment`, `listSegments`, `getSegment`,
`evaluateSegment`, `updateSegment`, `deleteSegment`. Note `duplicateSegment` is
**client-composed** (`useSegments.ts`) over `createSegment` — there is no server
function; it always produces a **dynamic** copy named `"<name> (copy)"`.

Out of scope (documented as such): nested rule groups (server-tolerated via
`compileGroup`, but the MVP builder UI only edits a single top-level group);
sending a segment (covered by the send pipeline plan); list-pointer selection UI
(the editor never sets `list` — `list` scoping is server/API-only today).

### Layers

- **Server integration** (Vitest, `tests/server/segments.test.ts`) — real Parse +
  Mongo, exercises the compiler + cloud functions end to end. This is the primary
  layer for the operator/field matrix because it asserts real Mongo counts.
- **Component** (Vitest + happy-dom + `@vue/test-utils`, `mountWithPinia` from
  `tests/setup/vueTest.ts`) — `SegmentRuleBuilder` emit contract; editor preview
  debounce/guard logic with `evaluateSegment` stubbed.
- **E2E** (Playwright, `freshUser` fixture from `tests/setup/playwrightFixtures.ts`) —
  golden path: create → preview → save → see in list → duplicate → delete.

---

## 2. Test matrix

Field type × operator coverage. Each cell is a single leaf condition asserted at
the **server-integration** layer (real count). The builder-component layer
asserts the same cells produce the right emitted condition shape and value type.

| Field type | Operators to cover | Notes |
|---|---|---|
| text (std: email, status, firstName, company, phone, city, country, timezone) | eq, neq, contains, starts_with, ends_with, is_empty, is_not_empty, in, not_in | `contains`/`starts_with`/`ends_with` are case-insensitive regex with metachars escaped |
| number (customFields.score) | eq, neq, gt, gte, lt, lte, in, not_in | value coerced to Number by builder; `in`/`not_in` parse numeric list |
| date (std subscribedAt/unsubscribedAt/createdAt; custom renews_at) | before, after, between, last_n_days | custom date stored as ISO string → operands coerced to ISO; std date → JS Date |
| boolean (customFields.vip) | eq | only operator; builder renders True/False select |
| enum (customFields.tier) | eq, neq, in, not_in, is_empty, is_not_empty | enum values sourced from registry `enumValues`; builder renders a select |
| tags | contains, not_contains, is_empty, is_not_empty | array membership; is_empty→`doesNotExist`, is_not_empty→`exists` |

Combinators: AND (narrows), OR (widens), repeated same-field tags AND (intersection).

Custom-field registry behavior: unknown key rejected; operator/type mismatch
rejected; type resolved from registry not value-inference.

Kinds: dynamic (stores rules, recomputes), static (snapshots ids at save, eval
returns snapshot). CRUD: create / get / update (recount + kind-switch
snapshot/unset) / duplicate / delete. Guards: empty rules, missing name, bad op,
disallowed field. Tenancy: caller's org only.

---

## 3. Detailed test cases

`L` column: **S** = server integration, **C** = component, **E** = E2E.
Counts reference the fixture dataset in §6 (4 contacts: Ann, Bob, Cara, d@).

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| **Text operators** |
| TX-01 | S | text contains | rule `email contains "@gmail.com"` | count 3 (Ann, Bob, d@) | P0 |
| TX-02 | S | text eq | `status eq "subscribed"` | count 3 | P0 |
| TX-03 | S | text neq | `status neq "subscribed"` | count 1 (Cara) | P1 |
| TX-04 | S | text starts_with | `timezone starts_with "America/"` | count 1 (Ann) | P1 |
| TX-05 | S | text ends_with | `email ends_with "@yahoo.com"` | count 1 (Cara) | P1 |
| TX-06 | S | text is_empty | `firstName is_empty` | count 1 (d@ has no firstName) | P0 |
| TX-07 | S | text is_not_empty | `phone is_not_empty` | count 2 (Ann, Bob) | P1 |
| TX-08 | S | text in | `country in [US]` | count 3 (Ann, Cara, d@) | P1 |
| TX-09 | S | text not_in | `country not_in [US]` | count 1 (Bob/GB) | P1 |
| TX-10 | S | contains escapes regex metachars | `email contains "a@gmail.com"` then `"."`-bearing value | literal match only, no regex blow-up | P1 |
| TX-11 | S | contains is case-insensitive | `city contains "york"` | count 1 (matches "New York") | P2 |
| **Number operators** |
| NU-01 | S | number gte | `customFields.score gte 80` | count 2 (Ann 80, d@ 95) | P0 |
| NU-02 | S | number gt | `score gt 80` | count 1 (d@ 95) | P1 |
| NU-03 | S | number lt / lte | `score lt 50` → 1 (Bob 10); `lte 50` → 2 | as stated | P1 |
| NU-04 | S | number eq / neq | `score eq 10` → 1; `neq 10` → 3 | as stated | P2 |
| NU-05 | S | number in | `score in [10,50]` | count 2 (Bob, Cara) | P1 |
| NU-06 | S | number not_in | `score not_in [10,50]` | count 2 (Ann, d@) | P2 |
| **Date operators** |
| DT-01 | S | date last_n_days → absolute gte | `subscribedAt last_n_days 7` | count 3 (Ann -2d, Cara -5d, d@ -1d); Bob -100d excluded | P0 |
| DT-02 | S | last_n_days computes a stable absolute cutoff | evaluate twice within test; assert same count, and that compiled query carries a fixed timestamp (no relative "now") | count stable; operand is an absolute Date/ISO | P0 |
| DT-03 | S | date after | `subscribedAt after (now-50d)` | count 3 | P1 |
| DT-04 | S | date before | `subscribedAt before (now-50d)` | count 1 (Bob) | P1 |
| DT-05 | S | date between | `subscribedAt between [now-6d, now-1d]` | count 2 (Ann -2d, Cara -5d) | P1 |
| DT-06 | S | date between rejects non-pair | `between` with `[x]` | throws INVALID_QUERY ("[start, end] pair") | P1 |
| DT-07 | S | last_n_days rejects non-positive | `last_n_days 0` / `-5` / `"x"` | throws INVALID_QUERY ("positive number of days") | P1 |
| DT-08 | S | invalid date operand | `after "not-a-date"` | throws ("expects a valid date") | P2 |
| DT-09 | S | custom ISO date last_n_days | `customFields.renews_at last_n_days 7` | count 2 (Ann -3d, d@ -1d); operand coerced to ISO string | P0 |
| DT-10 | S | custom ISO date after | `customFields.renews_at after (now-50d ISO)` | count 2 | P1 |
| **Boolean** |
| BO-01 | S | boolean eq true | `customFields.vip eq true` | count 2 (Ann, d@) | P0 |
| BO-02 | S | boolean eq false | `customFields.vip eq false` | count 1 (Bob; Cara/d@ unset are not `false`) — assert documented MVP semantics | P1 |
| **Enum custom field** |
| EN-01 | S | enum eq | `customFields.tier eq "gold"` | count 2 (Ann, Cara) | P0 |
| EN-02 | S | enum in | `tier in ["gold","silver"]` | count 3 | P1 |
| EN-03 | S | enum neq | `tier neq "gold"` | count 1 (Bob/silver) | P2 |
| EN-04 | S | enum is_empty | `tier is_empty` | count 1 (d@ has no tier) | P2 |
| **Tags (array membership)** |
| TG-01 | S | tags contains | `tags contains "vip"` | count 2 (Ann, d@) | P0 |
| TG-02 | S | tags contains other | `tags contains "beta"` | count 2 (Ann, Bob) | P1 |
| TG-03 | S | tags AND intersection | `tags contains "vip" AND tags contains "beta"` | count 1 (Ann) | P0 |
| TG-04 | S | tags not_contains | `tags not_contains "vip" AND status eq "subscribed"` | count 1 (Bob) | P1 |
| TG-05 | S | tags is_empty | `tags is_empty` (doesNotExist) | count 1 (Cara) | P1 |
| TG-06 | S | tags is_not_empty | `tags is_not_empty` (exists) | count 3 (Ann, Bob, d@) | P2 |
| **Combinators** |
| CB-01 | S | AND narrows | `email contains "@gmail.com" AND status eq "subscribed"` | count 3 | P0 |
| CB-02 | S | OR widens | `email ends_with "@yahoo.com" OR status eq "unsubscribed"` | count 1 (Cara, both same row) | P0 |
| CB-03 | S | OR across distinct rows | `country eq "GB" OR tags contains "vip"` | count 3 (Bob, Ann, d@) | P1 |
| CB-04 | S | mixed-type AND | `score gte 80 AND tags contains "vip"` | count 2 (Ann, d@) | P1 |
| **Custom-field typing + registry** |
| RG-01 | S | unknown custom key rejected | `customFields.bogus eq "x"` | throws ("not defined in this org's registry") | P0 |
| RG-02 | S | operator/type mismatch rejected | `customFields.tier gt 1` (gt invalid for enum) | throws ("not valid for enum field") | P0 |
| RG-03 | S | registry type wins over value-inference | `customFields.score eq "80"` (string value, registry says number) | resolves via registry as number; operator-set is number's; behaves as number field | P1 |
| RG-04 | S | invalid custom path | `customFields.a.b eq 1` (nested key) | throws ("Invalid custom field path") | P2 |
| RG-05 | S | disallowed std field | `password eq "x"` | throws ("not allowed in a segment rule") | P0 |
| RG-06 | S | bad operator for std type | `email gt 1` | throws ("not valid for text field") | P0 |
| **Preview / evaluate** |
| PV-01 | S | ad-hoc preview returns count + sample | `evaluateSegment({ rules })` | `{ count, sample }`, sample ≤ 10, fields email/firstName/lastName/status only | P0 |
| PV-02 | S | preview does NOT mutate any saved segment | evaluate ad-hoc rules with `preview:true` | no DB write; no Segment touched | P1 |
| PV-03 | S | evaluate saved dynamic refreshes cache when not preview | `evaluateSegment({ id })` on dynamic | `lastCount`/`lastEvaluatedAt` updated on the row | P1 |
| PV-04 | S | evaluate saved dynamic with preview skips cache write | `evaluateSegment({ id, preview:true })` | `lastEvaluatedAt` unchanged | P1 |
| PV-05 | S | evaluate requires rules or id | `evaluateSegment({})` | throws ("requires either rules or id") | P1 |
| PV-06 | S | sample accuracy | rule matching 2 contacts | `count===2 && sample.length===2`, emails match expected set | P1 |
| **Static vs dynamic** |
| SD-01 | S | create static snapshots ids | create static `vip eq true` | `staticContacts.length===2`, `lastCount===2` | P0 |
| SD-02 | S | static eval returns snapshot, ignores later contacts | create static; add a new matching contact; `evaluateSegment({id})` | count still 2 (snapshot frozen) | P0 |
| SD-03 | S | dynamic re-evaluates against current data | create dynamic `status eq subscribed` (3); add a subscribed contact; `evaluateSegment({id})` | count 4 | P0 |
| SD-04 | S | update dynamic→static snapshots + sets staticContacts | update kind to static | `staticContacts` populated, `lastCount` from snapshot | P1 |
| SD-05 | S | update static→dynamic unsets staticContacts | update kind to dynamic | `staticContacts` unset; `lastCount` recomputed live | P1 |
| SD-06 | S | static sample drawn from snapshot ids only | static seg eval | sample rows all in snapshot, org-scoped | P2 |
| **List scoping** (API-level; no editor UI) |
| LS-01 | S | create scoped to list counts members only | create `email contains "@gmail.com"`, `list: listId` | count 2 (a@, d@ in Newsletter), not 3 | P1 |
| LS-02 | S | saved list-scoped dynamic eval keeps list filter | `evaluateSegment({id})` | count 2 | P2 |
| **CRUD** |
| CR-01 | S | create dynamic persists rules + caches count | create gmail+subscribed | id truthy, kind dynamic, lastCount 3, rules persisted | P0 |
| CR-02 | S | create requires name | create with no name | throws ("name is required") | P0 |
| CR-03 | S | create rejects bad kind | `kind:"weekly"` | throws (`kind must be "dynamic" or "static"`) | P1 |
| CR-04 | S | create validates rules before persist | create with `password eq x` | throws; nothing saved (listSegments unchanged) | P1 |
| CR-05 | S | listSegments returns org segments newest-first, with listName | create 3; list | all returned, `listName` set when list present, descending createdAt | P0 |
| CR-06 | S | getSegment returns one with rules | create then get | id/name match, `rules.conditions` intact | P0 |
| CR-07 | S | getSegment requires id | `getSegment({})` | throws ("requires an id") | P2 |
| CR-08 | S | updateSegment recomputes count | create subscribed (3) → update to unsubscribed | lastCount 1 | P0 |
| CR-09 | S | updateSegment partial (name only) keeps rules | update name only | rules unchanged, count recomputed from existing rules | P1 |
| CR-10 | S | deleteSegment removes it | create → delete → eval by id | `{ok:true}`; subsequent `evaluateSegment({id})` rejects | P0 |
| CR-11 | S | duplicate composes create as dynamic copy | (composable) duplicate a static seg | new seg name `"<name> (copy)"`, kind **dynamic**, same rules | P1 |
| **Empty-rules guard** |
| EM-01 | S | empty conditions compiles to org-scoped match | `evaluateSegment({ rules:{op:"and",conditions:[]} })` | count = all org contacts (4); no throw | P1 |
| EM-02 | S | bad op rejected | `{op:"xor",conditions:[]}` | throws (`op must be "and" or "or"`) | P1 |
| EM-03 | S | non-object rules rejected | `evaluateSegment({ rules: 5 })` | throws ("rules must be an object") | P2 |
| EM-04 | S | conditions not array rejected | `{op:"and",conditions:{}}` | throws ("conditions must be an array") | P2 |
| EM-05 | S | create static with empty rules snapshots whole org | create static, no conditions | snapshot = all org contacts; count 4 | P2 |
| **Tenant isolation** |
| TI-01 | S | other org sees zero on same rule | OtherCo evaluates gmail rule | count 0 (no contacts in its org) | P0 |
| TI-02 | S | listSegments scoped to caller org | OtherCo lists | 0 segments (SegCo's hidden) | P0 |
| TI-03 | S | other org cannot get/eval foreign segment by id | OtherCo `getSegment`/`evaluateSegment` with SegCo id | throws / object-not-found (ACL) | P1 |
| TI-04 | S | other org cannot update/delete foreign segment | OtherCo update/delete SegCo id | throws; SegCo segment intact | P1 |
| TI-05 | S | static eval sample is org-scoped | OtherCo cannot read SegCo snapshot contacts | empty / no cross-org rows | P2 |
| **Rule builder component** (`SegmentRuleBuilder.vue`) |
| RB-01 | C | toggling ALL/ANY emits op | click ANY | emits `update:modelValue` with `op:"or"` | P0 |
| RB-02 | C | add condition emits default leaf | click Add condition | emits a fresh object, conditions has `{field:"email",operator:"contains",value:""}` | P0 |
| RB-03 | C | remove condition splices by index | two conditions, remove idx 0 | emits conditions of length 1 (the second) | P1 |
| RB-04 | C | changing field resets operator+value to type default | change field to `customFields.score` (number) | operator becomes first number op (`eq`), value `null` | P0 |
| RB-05 | C | changing field to boolean defaults value true | field → `customFields.vip` | value `true`, operator `eq` | P1 |
| RB-06 | C | changing operator to unary clears value | operator → `is_empty` | value `undefined`; renders the `—` no-value placeholder | P0 |
| RB-07 | C | changing operator to between sets `["",""]` | date field, op → `between` | value is two-element array; two date inputs render | P1 |
| RB-08 | C | changing operator to list sets `[]` | text field, op → `in` | value `[]`; comma textbox renders | P1 |
| RB-09 | C | comma list parses to array (text) | type "a, b ,c" into `in` box | emits `value:["a","b","c"]` (trimmed, blanks dropped) | P1 |
| RB-10 | C | comma list parses to numbers (number field) | `score in` "10, 50" | emits `value:[10,50]` (Number-coerced) | P1 |
| RB-11 | C | number input coerces to Number | text into number value box | emitted value is `number`, not string | P1 |
| RB-12 | C | last_n_days renders number input + coerces | op `last_n_days`, type 7 | value `7` (number) | P1 |
| RB-13 | C | operator options adapt to field type | switch field through each type | operator `<option>`s equal `OPERATORS_BY_TYPE[type]` | P0 |
| RB-14 | C | enum field renders select of registry values | `customFields.tier` | options = `["gold","silver","bronze"]` from `customFields` prop | P1 |
| RB-15 | C | custom fields group only shows when prop non-empty | mount with `customFields:[]` | no "Custom fields" optgroup | P2 |
| RB-16 | C | empty conditions shows match-all hint | modelValue conditions `[]` | renders "matches every contact" hint, WHERE joiner absent | P1 |
| RB-17 | C | joiner reflects op (WHERE/AND/OR) | two conditions, op `or` | first row "WHERE", second "OR" | P2 |
| **Editor page preview logic** (`[id].vue`) |
| ED-01 | C | preview is debounced ~400ms | mutate rules rapidly | `evaluateSegment` stub called once after debounce window | P1 |
| ED-02 | C | preview error surfaces, clears count | stub rejects | `previewError` shown, count renders "—" | P1 |
| ED-03 | C | initial preview runs on mount | mount new | `evaluateSegment({rules,preview:true})` called once | P1 |
| ED-04 | C | save disabled until name non-blank | empty name | Create button disabled; blank name → saveError "Give your segment a name first." | P0 |
| ED-05 | C | create navigates to saved id | stub createSegment → `{id:"abc"}` | `router.replace("/app/segments/abc")` | P1 |
| ED-06 | C | edit prefills from getSegment | stub getSegment | name/kind/rules populated; null rules → `{op:"and",conditions:[]}` | P1 |
| ED-07 | C | debounce timer cleared on unmount | unmount mid-debounce | no post-unmount `evaluateSegment` call | P2 |
| **List page** (`index.vue`) |
| LI-01 | C | summarizeRules renders compact string | rows with rules | `email contains "@gmail.com"` style; nested group wrapped in parens | P1 |
| LI-02 | C | empty/null rules → "all contacts" | seg with no conditions | rule column shows "all contacts" | P2 |
| LI-03 | C | last_n_days summary special-cased | rule with last_n_days | "field in last N days" | P2 |
| LI-04 | C | kind pill tone | dynamic vs static | dynamic → brand pill, static → neutral | P2 |
| LI-05 | C | delete confirms then calls deleteSegment + reload | click Delete, confirm | `deleteSegment(id)` then `listSegments` re-fetched | P1 |
| LI-06 | C | delete cancel does nothing | click Delete, dismiss confirm | no cloud call | P2 |
| LI-07 | C | duplicate calls duplicateSegment + reload, shows new row | click Duplicate | composable invoked; list reloads | P1 |
| LI-08 | C | action error surfaces | duplicate/delete rejects | `actionError` text shown; busyId cleared | P2 |
| LI-09 | C | empty state when no segments | listSegments → [] | EmptyState rendered | P2 |
| LI-10 | C | load error state | listSegments rejects | error message shown, not table | P2 |
| **E2E golden path** |
| E2E-01 | E | create → preview → save | login as freshUser (seed a few contacts via REST), open `/app/segments/new`, add `email contains "@gmail.com"`, see live count update, name it, Create | redirected to `/app/segments/<id>`; preview count > 0 matches saved lastCount | P0 |
| E2E-02 | E | new segment appears in list | after E2E-01, go to `/app/segments` | row present with name, dynamic pill, rule summary, count | P0 |
| E2E-03 | E | edit changes count | open the segment, change a condition, Save | list shows updated count | P1 |
| E2E-04 | E | duplicate creates a copy | click Duplicate on a row | "<name> (copy)" row appears, dynamic | P1 |
| E2E-05 | E | delete removes row | Delete + confirm | row gone after reload | P1 |
| E2E-06 | E | static vs dynamic radio persists | create as static, reopen | static radio selected | P2 |
| E2E-07 | E | auth guard | hit `/app/segments` anonymous | redirected to `/login?next=...` | P1 |

---

## 4. Acceptance criteria

The feature is considered tested when:

1. **Operator/field matrix is exhaustive at the server layer.** Every cell in §2
   (each operator for each of text/number/date/boolean/enum/tags) has at least one
   integration test asserting a concrete count against the §6 fixture. All P0 rows
   in §3 pass.
2. **The compiler's invariants hold:** `last_n_days` compiles to an absolute
   timestamp (DT-01/DT-02); custom-field types are resolved from the registry, not
   inferred (RG-03); unknown keys and operator/type mismatches are rejected
   (RG-01/RG-02/RG-05/RG-06).
3. **Static vs dynamic semantics are proven divergent:** a static segment's count
   is frozen at snapshot time (SD-02) while a dynamic one reflects current data
   (SD-03); kind switches snapshot/unset correctly (SD-04/SD-05).
4. **Preview is accurate and side-effect-free:** counts/samples match `find` results
   (PV-01/PV-06); ad-hoc and `preview:true` paths never write the cache
   (PV-02/PV-04).
5. **CRUD round-trips** (create/get/list/update/delete/duplicate) all pass, including
   the empty-rules guard and the name/kind/op validation guards.
6. **Tenant isolation is enforced:** a second org sees zero counts and zero
   segments and cannot read/mutate the first org's segments (TI-01..TI-04).
7. **The builder emit contract is correct:** field/operator changes reset value to
   the right typed default, and value inputs coerce to the right JS type (RB-04..RB-12)
   — i.e. what the builder emits is exactly what the server compiler accepts.
8. **One E2E golden path is green** (E2E-01/E2E-02) plus the auth guard.

---

## 5. Current coverage → gaps

### Mapping to `tests/server/segments.test.ts`

The existing file is solid server-integration coverage. Mapping of its `it(...)`
blocks to the IDs above:

| Existing test (paraphrased) | Covers |
|---|---|
| "text: contains compiles + counts (3 gmail)" | TX-01 |
| "text: eq on status (3 subscribed)" | TX-02, PV-01 (sample non-empty) |
| "text: is_empty on firstName" | TX-06 |
| "AND of two conditions narrows" | CB-01 |
| "OR widens" | CB-02 |
| "number: gte on customFields.score" | NU-01 |
| "number: in on customFields.score" | NU-05 |
| "boolean: eq on customFields.vip (true)" | BO-01 |
| "date: last_n_days compiles to absolute gte" | DT-01 (partial — see gap) |
| "date: after" | DT-03 |
| "std text: eq on company" / "eq on country" | TX-02-family, TX-08 data |
| "std text: contains city + starts_with timezone" | TX-04, TX-11, CB-04 |
| "std text: is_not_empty on phone" | TX-07 |
| "tags: contains vip / beta" | TG-01, TG-02 |
| "tags: contains vip AND beta" | TG-03 |
| "tags: not_contains vip + subscribed" | TG-04 |
| "tags: is_empty" | TG-05 |
| "enum custom field: tier eq gold" | EN-01 |
| "enum: tier in [gold, silver]" | EN-02 |
| "date custom field: renews_at last_n_days 7" | DT-09 |
| "date custom field: renews_at after" | DT-10 |
| "rejects custom field not in registry" | RG-01 |
| "rejects operator not valid for registry type (gt on enum)" | RG-02 |
| "createSegment persists tags + custom-field rule, caches count" | CR-01-family |
| "rejects a disallowed field" | RG-05 |
| "rejects operator that doesn't match field type" | RG-06 |
| "createSegment (dynamic) persists + caches" | CR-01 |
| "createSegment (static) snapshots ids" + eval | SD-01 (eval-snapshot part of SD-02) |
| "createSegment scoped to a list" + eval | LS-01, LS-02 |
| "listSegments returns org segments" | CR-05 (partial) |
| "getSegment returns one with rules" | CR-06 |
| "updateSegment recompiles count" | CR-08 |
| "deleteSegment removes it" | CR-10 |
| "a different org … sees zero / no segments" | TI-01, TI-02 |

### GAPS

**Server-integration gaps (extend the existing file):**

- **DT-02 — `last_n_days` determinism not directly asserted.** The current test
  proves the count but not that the compiled operand is an *absolute* timestamp
  (the whole point of the §5.3 design — eval and send-time must agree). Add a test
  that inspects the compiled query (the module exports `compileRules`) or evaluates
  twice and asserts stability.
- **SD-02 / SD-03 — static-frozen vs dynamic-live divergence.** The existing static
  test only checks the snapshot count equals creation count. Nothing adds a new
  contact and re-evaluates to prove static stays frozen *and* dynamic moves. This is
  the headline semantic of the feature and is **untested**.
- **SD-04 / SD-05 — kind switch on update.** `updateSegment` has dedicated
  snapshot/`unset("staticContacts")` branches; neither is exercised.
- **PV-02 / PV-03 / PV-04 — preview cache side effects.** No test asserts that
  `preview:true` skips the `lastEvaluatedAt` write, or that a non-preview saved eval
  refreshes it. The `preview` flag's behavior is currently unverified.
- **CR-11 — `duplicateSegment`.** This is *client* logic in `useSegments.ts`
  (forces dynamic, appends " (copy)"). No test anywhere. Cover as a composable unit
  test or fold into the E2E (E2E-04).
- **EM-01 / EM-05 — empty-rules guard.** No test for the empty-conditions path
  (matches whole org for dynamic; snapshots whole org for static). Add both, plus
  EM-02/03/04 for the `op`/object/array validation branches.
- **Text operator holes:** `neq` (TX-03), `not_in` (TX-09), `ends_with`
  (TX-05 — only used inside an OR), regex-escape (TX-10). Number `gt/lt/lte/eq/neq`
  (NU-02/03/04), `not_in` (NU-06). Date `before` (DT-04), `between` (DT-05) and its
  guards (DT-06/07/08). Enum `neq`/`is_empty` (EN-03/EN-04). Tags `is_not_empty`
  (TG-06). Boolean `eq false` semantics (BO-02).
- **TI-03 / TI-04 — cross-org get/update/delete.** Tenancy test only covers eval +
  list returning zero; it does not attempt to read or mutate a *specific* foreign
  segment id, which is the ACL boundary that matters most.
- **CR-02/03/04/07/09 — create/get/update validation guards** (missing name, bad
  kind, validate-before-persist, missing id, partial update) are untested.

**Component-layer gaps — ENTIRELY MISSING.** There is no test file for
`SegmentRuleBuilder.vue` or the editor/list pages. The harness exists
(`tests/setup/vueTest.ts` `mountWithPinia`, happy-dom). Every `RB-*`, `ED-*`,
`LI-*` case above is a gap. Highest value: the builder's field/operator/value
reset-and-coerce logic (RB-04..RB-12, RB-13) — this is the contract that guarantees
the builder emits rules the server compiler will accept, and it is pure
emit-assertion testing with no backend.

**E2E-layer gaps — ENTIRELY MISSING.** Only `_example.spec.ts` exists. No
segments spec. The `freshUser` fixture is ready; add `tests/e2e/segments.spec.ts`
covering E2E-01..E2E-07.

---

## 6. Test data & fixtures

### Server integration (reuse / extend `tests/server/segments.test.ts`)

Boot once per file: `ctx = await startTestParseServer()` in `beforeAll`,
`ctx.stop()` in `afterAll` (in-memory Mongo, OS-assigned port; `pool:'forks'`
isolates files). Acting "as a user" is done by passing
`{ sessionToken }` to every `Parse.Cloud.run` / save (`Parse.User.become()` is
blocked server-side — see `tenancy.test.ts`).

**Org + session:** `signUpWithOrg({ username, password, company })` →
`{ sessionToken }`. A second `signUpWithOrg` (OtherCo) for tenant-isolation tests.

**List:** one `List` named "Newsletter" (`listId`) for list-scoping cases.

**Custom-field registry** (created via `createCustomField` so the registry
resolves types): `plan` (text), `score` (number), `vip` (boolean),
`tier` (enum: gold/silver/bronze), `renews_at` (date).

**Contacts** (4, created with `{ sessionToken }` so org + ACL auto-stamp; `now`
fixed at `beforeAll`, `day = 86400000`):

| # | email | status | firstName | company | phone | city/country/tz | tags | subscribedAt | customFields | in list |
|---|---|---|---|---|---|---|---|---|---|---|
| Ann | a@gmail.com | subscribed | Ann | Acme | +1-555-0100 | New York / US / America/New_York | vip, beta | now-2d | plan=pro, score=80, vip=true, tier=gold, renews_at=now-3d | yes |
| Bob | b@gmail.com | subscribed | Bob | Globex | +44-20-0000 | London / GB / Europe/London | beta | now-100d | plan=free, score=10, vip=false, tier=silver, renews_at=now-200d | no |
| Cara | c@yahoo.com | unsubscribed | Cara | Acme | — | New York / US / — | (none) | now-5d | plan=pro, score=50, tier=gold | no |
| d@ | d@gmail.com | subscribed | (none) | — | — | — / US / — | vip | now-1d | plan=free, score=95, vip=true, renews_at=now-1d | yes |

Reference counts baked into §3: gmail=3, subscribed=3, US=3, Acme=2, vip-tag=2,
beta-tag=2, no-tags=1, score≥80=2, tier=gold=2, no-firstName=1, phone-present=2.

**Mutating tests (SD-02/SD-03) must not pollute shared counts.** Either add the
new contact inside an `it` that only asserts its own segment, or scope additive
contacts to their own org/list so the shared §3 counts stay valid. Prefer a
dedicated `describe` with its own `startTestParseServer` for the
"add-a-contact-then-re-evaluate" cases to avoid cross-test count drift.

**Compiler unit option (no Parse Server):** `server/cloud/segments.js` exports
`{ compileRules, applyLeaf }`. The DT-02 absolute-timestamp assertion and any
pure operator-mapping checks can be done by compiling with a fake `org` pointer
and inspecting `query.toJSON()` — faster than booting Mongo, and the cleanest way
to assert "operand is absolute, not relative".

### Component (Vitest + happy-dom)

Header each file `// @vitest-environment happy-dom`. Mount via `mountWithPinia`
(`tests/setup/vueTest.ts`). `SegmentRuleBuilder` needs no backend — pass
`modelValue` + a `customFields` array and assert `update:modelValue` payloads.
Editor/list page tests stub `useSegments`/`useCustomFields` (mock the composable
module) so `evaluateSegment`/`listSegments`/`deleteSegment` are spies; use fake
timers (`vi.useFakeTimers`) for the 400ms debounce (ED-01/ED-07). Stub
`router`, `route`, and `window.confirm` for LI-05/LI-06.

### E2E (Playwright)

Use the `freshUser` fixture (`tests/setup/playwrightFixtures.ts`) — creates a
Parse user via REST and tears down with the master key. The fixture creates a
*user* but not an org/contacts; the spec must seed a handful of contacts (and the
org, if `signUpWithOrg` is the org-creating path) via REST or a cloud call before
driving the UI, so the live preview has something to count. Run against the dev
server (`npm run dev`, Node 20) per `playwright.config.ts`.
