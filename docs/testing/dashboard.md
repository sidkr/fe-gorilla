# Testing Plan — Dashboard

> Surface under test: the authed Dashboard at `/app/dashboard` — KPI strip,
> onboarding checklist (real org-state steps), audience-growth + engagement
> charts, the campaign funnel, empty states, and quick-action navigation.
>
> Code in scope:
> - `pages/app/dashboard.vue` — page composition, derived view-models, onboarding step list, quick actions.
> - `composables/app/useDashboard.ts` — `load()`, `metrics`/`loading`/`error`, `showOnboarding`, dismissal + localStorage.
> - `composables/app/useCloud.ts` — `runCloud` wrapper (error normalization, 209 → `sessionExpired`).
> - `server/cloud/reports.js` — `getDashboardMetrics` + `getOnboardingState` (+ shared helpers `counter`, `rate`, `countWhere`, `computeOnboardingState`).
> - Chart/widget components under `components/app/`: `KpiCard.vue`, `AudienceGrowthChart.vue`, `EngagementDonut.vue`, `CampaignFunnel.vue`, `QuickActions.vue`, plus the empty-state renderers `RecentCampaignsTable.vue`, `ActivityFeed.vue`, `TopPerformingCampaigns.vue`.
>
> Stack (DECISIONS #7): **Vitest** (node pool for server/integration; happy-dom for component/DOM) + **Playwright** for E2E. Node 20. Multi-tenant model: `signUpWithOrg` → `{ sessionToken, userId, orgId }`; act as a user by passing `{ sessionToken }` to every query/save/cloud-run (`Parse.User.become()` is blocked server-side). Integration boots a real Parse Server + in-memory Mongo via `startTestParseServer` (`tests/setup/parseServer.ts`).

---

## 1. Scope & routes

| Item | Detail |
|---|---|
| Route | `/app/dashboard` |
| Render mode | CSR only (`ssr: false`, inherited from the `/app/**` route rules). The page boots in the browser; `onMounted(load)` fires the cloud call. |
| Layout / guard | `definePageMeta({ layout: "app", middleware: "auth-required" })`. Anonymous users are redirected to `/login?next=/app/dashboard` by `middleware/auth-required.ts`. Layout `app.vue` applies `noindex`. |
| Data source | `getDashboardMetrics` cloud function (one call on mount), via `useDashboard().load()` → `useCloud().runCloud`. |
| Server scope | Every query is org-scoped through `getUserOrg` + an `organization` equality filter; ACLs already isolate, the org filter is for locality/explicitness. |
| Out of scope (explicit) | The send pipeline does not exist yet. `CampaignSend` / `EmailEvent` are empty and engagement counters on `Campaign` are usually absent, so engagement totals/rates and recent-campaign/activity/top-performer feeds are expected to be **zeros / empty** in all current tests. `getCampaignReport` / `getCampaignLinkBreakdown` / `getCampaignRecipients` live in the same file but belong to the **Reports** page plan — only touched here where they share helpers. |

**Routes referenced by the page (must remain valid):**
`/app/campaigns/new`, `/app/audiences`, `/app/segments/new`, `/app/templates`, `/app/settings`.

---

## 2. Test matrix

| Layer | Applies? | What it covers here | Tooling |
|---|---|---|---|
| **Unit (pure, node)** | Yes | Server helpers `rate()`/`counter()` edge cases; page-local view-model derivations extracted/exercised as pure logic: KPI `active = sending + scheduled`, funnel `pctOfSent` (0% at zero `sent`), engagement `other = max(total - subscribed, 0)` + `pct` rounding, `onboardingSteps`/`onboardingDoneCount` mapping. Formatters `fmtNum`/`fmtPct`. | Vitest (node) |
| **Component (happy-dom)** | Yes | KpiCard delta tone/glyph; CampaignFunnel `barHeight` floor + `stepRates`; EngagementDonut dasharray/legend; AudienceGrowthChart flat-line/`x`/`y` mapping at constant series; QuickActions renders one `NuxtLink`-equivalent per action with correct `to`; onboarding checklist render/dismiss (see note). | Vitest (happy-dom) + `@vue/test-utils` via `mountWithPinia` |
| **Integration (real Parse + Mongo)** | Yes — primary value | `getDashboardMetrics` + `getOnboardingState` correctness: auth gate, all-zero fresh org, counts moving as List/Contact/Campaign appear, status bucketing, denormalized-counter summation + rate math, `complete` flip, embedded onboarding block parity, tenant isolation. | Vitest (node) + `startTestParseServer` |
| **E2E (browser)** | Yes — thin | Auth redirect for anonymous; authed user sees KPI strip; fresh user sees the checklist and it disappears after Dismiss (persists across reload); quick-action tiles navigate to the right routes. | Playwright + `freshUser` fixture |

**Component-test caveat (load-bearing):** the Vitest config does **not** register `@vitejs/plugin-vue`, so real `.vue` SFCs cannot be compiled in component tests today (documented in `tests/components/mergeTagPicker.test.ts` and `tests/components/_example.test.ts`). Two honest options, pick per case:
1. **Recommended now:** extract the page's pure view-model math (the `computed`s in `dashboard.vue`) into a small composable/helper module (e.g. `composables/app/useDashboardViewModels.ts`) and unit-test it directly — no SFC compile needed. This is the same pattern `mergeTagPicker.test.ts` uses (test the data layer, not the SFC).
2. **If/when `@vitejs/plugin-vue` is added** to the Vitest config: mount the SFCs with `mountWithPinia` (`tests/setup/vueTest.ts`) and assert rendered DOM. Component-layer cases below are written assuming this is enabled; until then treat them as the unit-extraction in option 1.

---

## 3. Detailed test cases

> Conventions: `st` = a user session token from `signUpWithOrg`. Integration helpers mirror the existing file: `signUp(company,email)`, `dashboard(st)`, `onboarding(st)`, `setDefaultFromEmail(orgId,email)`. Objects are saved with `{ sessionToken: st }` so the tenancy hook stamps `organization` + ACL. "Fresh org" = immediately after `signUpWithOrg` with no further writes.

### 3a. Server — `getDashboardMetrics` / `getOnboardingState` correctness

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-S01 | Integration | Auth required (metrics) | `Parse.Cloud.run("getDashboardMetrics", {})` with no session | Rejects, `code === Parse.Error.INVALID_SESSION_TOKEN` (209) | P0 |
| D-S02 | Integration | Auth required (onboarding) | `getOnboardingState` with no session | Rejects 209 | P0 |
| D-S03 | Integration | All-zero metrics for a fresh org | `signUp` → `dashboard(st)` | `audiences:0`; `contacts:{total:0,subscribed:0}`; `campaigns.total:0`; every `byStatus[*]` is `0`; `totals` all `0`; `rates` all `0` (no NaN) | P0 |
| D-S04 | Integration | Fresh org → all onboarding steps false | `signUp` → `onboarding(st)` | `steps` all `false`; `complete:false` | P0 |
| D-S05 | Integration | Audience/contact counts move on List + Contact create | Create 1 List; 3 contacts `status:"subscribed"`; 1 `status:"unsubscribed"`; `dashboard(st)` | `audiences:1`; `contacts.total:4`; `contacts.subscribed:3`; `totals.sent:0` | P0 |
| D-S06 | Integration | Onboarding audience+contact flip true | Before: `onboarding` shows both false. Create List + 1 Contact; re-read | `steps.audience:true`, `steps.contact:true`, `complete:false` | P0 |
| D-S07 | Integration | senderIdentity flips on `defaultFromEmail` | `senderIdentity:false`; `setDefaultFromEmail(orgId, "hi@x.com")`; re-read | `steps.senderIdentity:true` | P0 |
| D-S08 | Integration | senderIdentity is whitespace-sensitive | Set `defaultFromEmail` to `"   "` (spaces only) via master key; read onboarding | `steps.senderIdentity:false` (server uses `.trim().length > 0`) | P1 |
| D-S09 | Integration | campaign flips on any draft; sent only on a `sent` campaign | Create campaign `status:"draft"` → `steps.campaign:true`, `steps.sent:false`. Create campaign `status:"sent"` → `steps.sent:true` | As stated | P0 |
| D-S10 | Integration | Campaigns bucketed by status + total | Create campaigns `["draft","draft","sending","sent"]`; `dashboard(st)` | `campaigns.total:4`; `byStatus.draft:2`, `byStatus.sending:1`, `byStatus.sent:1`, `byStatus.scheduled:0` | P0 |
| D-S11 | Integration | Unknown status still counts toward total | Create one campaign `status:"queued"` (not in `CAMPAIGN_STATUSES`); `dashboard(st)` | `campaigns.total:1`; no `byStatus.queued` key; all known buckets `0` | P1 |
| D-S12 | Integration | Denormalized counters → lifetime totals + rates | Create `sent` campaign: `sentCount:1000, deliveredCount:950, openCount:380, clickCount:95, bounceCount:50, unsubscribeCount:19`; `dashboard(st)` | `totals.sent:1000`, `delivered:950`, `opens:380`, `clicks:95`; `rates.open≈0.4` (380/950), `rates.click≈0.1` (95/950), `rates.bounce≈0.05` (50/1000) | P0 |
| D-S13 | Integration | Unsubscribe rate uses delivered denominator | Same fixture as D-S12; assert `rates.unsubscribe ≈ 19/950 ≈ 0.02` | Matches `rate(unsubscribes, delivered)` | P1 |
| D-S14 | Integration | Totals sum across multiple campaigns | Two `sent` campaigns with counters (e.g. 100/95/... and 200/180/...); `dashboard(st)` | `totals.sent:300`, `delivered:275`, etc. (additive) | P1 |
| D-S15 | Integration | Missing counter fields treated as 0 (not NaN) | Create `sent` campaign with **no** count fields set; `dashboard(st)` | `totals` all `0`; `rates` all `0`; no NaN (`counter()` guards non-numeric) | P0 |
| D-S16 | Integration | Non-numeric counter coerced to 0 | Create campaign with `sentCount:"oops"` (string) via master key; `dashboard(st)` | `totals.sent:0` (`counter` requires `typeof === number && isFinite`) | P2 |
| D-S17 | Integration | Archived List excluded from audiences + onboarding | Create List; set `archived:true`; `dashboard(st)` + `onboarding(st)` | `audiences:0`; `steps.audience:false` (`notEqualTo("archived", true)`) | P1 |
| D-S18 | Integration | Deleted Contact excluded from totals + onboarding | Create Contact; set `deleted:true`; read both | `contacts.total:0`; `steps.contact:false` | P1 |
| D-S19 | Integration | Subscribed count requires exact status string | Create contacts with statuses `subscribed`, `pending`, `cleaned`; `dashboard(st)` | `contacts.total:3`; `contacts.subscribed:1` (only `status === "subscribed"`) | P1 |
| D-S20 | Integration | `complete:true` once every step satisfied | Set fromEmail + List + Contact + `sent` campaign; `onboarding(st)` | `steps` all `true`; `complete:true` | P0 |
| D-S21 | Integration | `complete:false` while any single step missing | Satisfy 4 of 5 (omit `sent`); `onboarding(st)` | `complete:false` | P1 |
| D-S22 | Integration | Embedded onboarding block matches standalone | Fresh org: `dashboard(st).onboarding.complete === false` and `.steps.audience === false`. Create List; `dashboard(st).onboarding.steps.audience === true` | Embedded block tracks the same logic as `getOnboardingState` | P0 |
| D-S23 | Integration | Tenant isolation — metrics | Org A creates a List; `dashboard(A)` vs `dashboard(B)` | `mA.audiences:1`, `mB.audiences:0` | P0 |
| D-S24 | Integration | Tenant isolation — onboarding | Org A creates a List; `onboarding(A).steps.audience:true`, `onboarding(B).steps.audience:false` | Isolated | P0 |
| D-S25 | Integration | Tenant isolation — campaigns + counters don't bleed | Org A creates a `sent` campaign with counters; `dashboard(B)` | `mB.campaigns.total:0`, `mB.totals.sent:0` | P1 |
| D-S26 | Unit | `rate()` guards zero/negative denominator | Call `rate(5,0)`, `rate(5,-1)`, `rate(0,10)`, `rate(5,10)` | `0`, `0`, `0`, `0.5` — never NaN/Infinity | P1 |
| D-S27 | Unit | `counter()` defaulting | `counter` over `{}`, `{x:NaN}`, `{x:Infinity}`, `{x:3}` | `0,0,0,3` | P2 |

### 3b. Page view-models (unit — extract pure logic from `dashboard.vue`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-V01 | Unit | KPI: active campaigns = sending + scheduled | view-model over `byStatus:{sending:2,scheduled:3,draft:9}` | Active KPI value renders `"5"` | P0 |
| D-V02 | Unit | KPI: subscribers + totals labels | metrics `contacts:{total:40,subscribed:30}` | Subscribers value `"30"`, delta `"40 contacts"` | P1 |
| D-V03 | Unit | KPI: open/click rate formatting | `rates:{open:0.4,click:0.1234}` | `fmtPct` → `"40.0%"`, `"12.3%"` | P1 |
| D-V04 | Unit | KPI: graceful zeros when `metrics` is null | view-model with `metrics.value === null` | Active `"0"`, Subscribers `"0"`, open/click `"0.0%"` (no throw) | P0 |
| D-V05 | Unit | `fmtNum` thousands separators | `fmtNum(12847)`, `fmtNum(null)`, `fmtNum(undefined)` | `"12,847"`, `"0"`, `"0"` | P1 |
| D-V06 | Unit | Funnel `pctOfSent` is "0%" at zero sent | totals all 0 | every stage `pct === "0%"`, counts `0` (no divide-by-zero) | P0 |
| D-V07 | Unit | Funnel pct of real totals | totals `{sent:1000,delivered:950,opens:380,clicks:95}` | Delivered `"95.0%"`, Opened `"38.0%"`, Clicked `"9.5%"` | P1 |
| D-V08 | Unit | Engagement slices split + rounding | `contacts:{total:4,subscribed:3}` | Subscribed `{count:3,pct:75}`, Other `{count:1,pct:25}` | P0 |
| D-V09 | Unit | Engagement `other` never negative | `contacts:{total:2,subscribed:5}` (defensive) | Other count `0` (`Math.max(total-subscribed,0)`) | P1 |
| D-V10 | Unit | Engagement at zero total → 0% slices, no NaN | `contacts:{total:0,subscribed:0}` | both slices `pct:0`, total label `"0"` | P0 |
| D-V11 | Unit | Audience-growth points are a flat 30-length series | `contacts.subscribed:30` | `Array(30).fill(30)`; length 30; all equal | P1 |
| D-V12 | Unit | `onboardingSteps` maps booleans onto the 5 static steps | metrics `steps:{senderIdentity:true,audience:true,contact:false,campaign:false,sent:false}` | 5 entries in fixed order `[senderIdentity,audience,contact,campaign,sent]`; `done` flags match; each has `to`/`cta` | P0 |
| D-V13 | Unit | `onboardingDoneCount` counts done steps | same as D-V12 | `2` | P1 |
| D-V14 | Unit | onboarding view tolerates missing `steps` | metrics `{onboarding: undefined}` (or `{}`) | all 5 `done:false`, count `0` (uses `?? {}` / `!!steps[key]`) | P1 |

### 3c. `useDashboard` composable (component/DOM — happy-dom)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-C01 | Component | `load()` populates `metrics`, toggles `loading` | Mock `useCloud().runCloud` to resolve a metrics object; `await load()` | `metrics.value` set; `loading` false after; `error` null | P0 |
| D-C02 | Component | `load()` failure surfaces message, keeps page alive | `runCloud` rejects `new Error("boom")`; `await load()` | `error.value === "boom"`; `metrics.value` stays `null`; `loading` false | P0 |
| D-C03 | Component | `load()` failure with no message → fallback | `runCloud` rejects `{}`; `await load()` | `error.value === "Failed to load dashboard."` | P2 |
| D-C04 | Component | `showOnboarding` true when data present, incomplete, not dismissed | set `metrics` with `onboarding.complete:false`, `onboardingDismissed:false` | `showOnboarding === true` | P0 |
| D-C05 | Component | `showOnboarding` false before data loads | `metrics.value === null` | `false` (guards the `v-if`; no flash with empty steps) | P1 |
| D-C06 | Component | `showOnboarding` auto-hides when complete | `metrics.onboarding.complete:true`, not dismissed | `false` | P0 |
| D-C07 | Component | `dismissOnboarding()` hides + persists | call `dismissOnboarding()` | `onboardingDismissed.value:true`; `showOnboarding:false`; `localStorage["gorilla.onboarding.dismissed"] === "1"` | P0 |
| D-C08 | Component | Prior dismissal read on init | seed `localStorage["gorilla.onboarding.dismissed"]="1"` before constructing; load incomplete metrics | `showOnboarding === false` | P1 |
| D-C09 | Component | localStorage unavailable degrades gracefully | stub `localStorage.getItem`/`setItem` to throw | construction + `dismissOnboarding()` do not throw; treated as not dismissed | P2 |
| D-C10 | Component | 209 from cloud triggers `sessionExpired` | `runCloud` path: have `$parse.Cloud.run` reject `{code:209}`; assert `useAuthStore().sessionExpired` called and a normalized `Error` with `.code===209` rethrown | session boot-out wired (covers `useCloud` integration with dashboard load) | P1 |

### 3d. Widget components (component — happy-dom, assumes plugin-vue or via extracted logic)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-W01 | Component | KpiCard renders label/value/delta | mount with `label,value,delta` | text present; delta pill shown only when `delta` non-empty | P1 |
| D-W02 | Component | KpiCard delta tone/glyph by direction | mount with `deltaDirection` ∈ up/down/neutral | tone `success`/`danger`/`neutral`; up/down/flat glyph path selected | P2 |
| D-W03 | Component | CampaignFunnel `barHeight` floor at all-zero | stages all `count:0` | every bar height `=== 15` (MIN_BAR_HEIGHT_PCT), renders without error | P0 |
| D-W04 | Component | CampaignFunnel proportional heights | stages `[1000,950,380,95]` | tallest `100%`, others scaled; all `>= 15%` | P1 |
| D-W05 | Component | CampaignFunnel `stepRates` + "—" on zero prev | stages with a zero `prev` count | step shows `"—"`; normal gaps show `"NN.N%"`; length = stages-1 | P1 |
| D-W06 | Component | EngagementDonut dasharray segments + legend | slices `[{pct:75,kind:'pop'},{pct:25,kind:'soft'}]` | two legend rows with counts/pcts; dashoffset accumulates; total text rendered | P2 |
| D-W07 | Component | AudienceGrowthChart flat line at constant series | `points:Array(30).fill(30)` | renders; `linePath` defined (no NaN despite zero span — `span=max(...,1)`); 7 tick labels | P1 |
| D-W08 | Component | AudienceGrowthChart single-point safety | `points:[5]` | `x(0)===PAD_X`; no crash | P2 |
| D-W09 | Component | QuickActions renders one link per action with correct `to` | mount with the page's 5 quickActions | 5 tiles; `to` values: `/app/campaigns/new`, `/app/audiences`, `/app/audiences`, `/app/segments/new`, `/app/templates`; labels match | P0 |
| D-W10 | Component | Onboarding checklist render — done vs not | mount page (or extracted list) with mixed `done` steps | done rows show check + "Done" tag, no CTA; not-done rows show CTA link to `step.to` with `step.cta` text | P0 |
| D-W11 | Component | Onboarding progress copy | 2 of 5 done | header reads "2 of 5 steps done" | P2 |
| D-W12 | Component | Empty states render when feeds are empty | recent/activity/top arrays empty (current default) | "No campaigns sent yet…", "No recent activity…" copy shown; no table/feed rendered | P1 |

### 3e. E2E (Playwright + `freshUser`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| D-E01 | E2E | Anonymous redirect | `page.goto("/app/dashboard")` with no session | redirected to `/login?next=/app/dashboard` | P0 |
| D-E02 | E2E | Authed dashboard loads with KPI strip | establish session (set Parse session in `localStorage`, or sign in); goto dashboard | KPI labels "Active campaigns","Subscribers","Avg open rate","Avg click rate" visible; values render (zeros for fresh user) | P0 |
| D-E03 | E2E | Fresh user sees onboarding checklist | freshUser → dashboard | "Finish setting up Gorilla" card visible; 5 steps listed; "0 of 5 steps done" | P0 |
| D-E04 | E2E | Dismiss persists across reload | click the dismiss (×) button; `page.reload()` | checklist gone before and after reload; `localStorage["gorilla.onboarding.dismissed"]==="1"` | P0 |
| D-E05 | E2E | Quick action navigates to compose | click "New campaign" tile | URL becomes `/app/campaigns/new` | P1 |
| D-E06 | E2E | Quick actions point at valid routes | click each of the 5 tiles | each lands on its `to` route without a 404 / app error | P1 |
| D-E07 | E2E | Onboarding CTA navigates to the step's route | click an incomplete step CTA (e.g. "Create audience") | URL becomes `/app/audiences` | P2 |
| D-E08 | E2E | Cloud error banner is non-fatal | force `getDashboardMetrics` to fail (e.g. expire token mid-load via route intercept) | error banner text shown; KPI strip + quick actions still render their zero/empty states | P2 |

---

## 4. Acceptance criteria (testable)

1. **Auth.** Both cloud functions reject unauthenticated calls with code 209 (D-S01/S02). Anonymous browser hits redirect to `/login?next=/app/dashboard` (D-E01).
2. **Fresh org is all-zero, never NaN.** `getDashboardMetrics` for a new org returns `audiences:0`, `contacts:{0,0}`, `campaigns.total:0`, every `byStatus` bucket `0`, `totals` all `0`, `rates` all `0` (D-S03, D-S15). Onboarding steps all `false`, `complete:false` (D-S04).
3. **Counts track real org state.** Audiences/contacts/campaign-by-status/total move correctly as Lists, Contacts, and Campaigns are created, honoring `archived`/`deleted`/`status` filters (D-S05, D-S10, D-S11, D-S17, D-S18, D-S19).
4. **Onboarding flips per step and only completes when all five are true.** `senderIdentity` (non-blank `defaultFromEmail`), `audience`, `contact`, `campaign` (any), `sent` (a `sent` campaign) each flip independently; `complete` is the AND (D-S06–S09, D-S20, D-S21). The embedded block in `getDashboardMetrics` matches `getOnboardingState` (D-S22).
5. **Engagement math is correct where data exists.** Denormalized counters sum into lifetime totals; rates use the documented denominators (`open`/`click`/`unsubscribe` over delivered, `bounce` over sent) and are additive across campaigns (D-S12–S14).
6. **Tenant isolation.** One org never sees another org's audiences, onboarding state, campaigns, or counters (D-S23–S25).
7. **Graceful empty UI.** With no send data, the funnel renders at its `15%` floor, engagement/growth render zero states without NaN, and recent-campaigns / activity / top-performers show their empty-state copy rather than fabricated rows (D-V06, D-V10, D-W03, D-W12).
8. **Onboarding UX.** Checklist shows only when data is loaded, incomplete, and not dismissed; auto-hides on completion; Dismiss persists per-browser via `localStorage` and survives reload (D-C04–C08, D-E03, D-E04).
9. **Quick actions + CTAs navigate to existing routes.** All five quick-action `to`s and the onboarding step CTAs resolve to real `/app/*` routes (D-W09, D-E05–E07).
10. **Load failures are non-fatal.** A failed `getDashboardMetrics` sets `error` and shows the banner while widgets still render zero states; a 209 boots the session out via `sessionExpired` (D-C02, D-C10, D-E08).

---

## 5. Current coverage → mapping & gaps

### Already covered in `tests/server/reports.test.ts`

| Existing test (paraphrased) | Maps to | 
|---|---|
| "requires authentication" (metrics) | D-S01 |
| "getOnboardingState requires authentication" | D-S02 |
| "returns all-zero metrics for a freshly-signed-up org" | D-S03 |
| "returns all-false onboarding steps for a fresh org" | D-S04 |
| "counts move when a List + Contacts are created" | D-S05 (also asserts subscribed split) |
| "flips audience/contact true after creating a List + Contact" | D-S06 |
| "flips senderIdentity true once defaultFromEmail is set" | D-S07 |
| "flips campaign true on draft, and sent only on a sent campaign" | D-S09 |
| "buckets campaigns by status" | D-S10 |
| "sums denormalized Campaign counters into lifetime totals + rates" | D-S12 (open/click/bounce asserted) |
| "reports complete=true once every step is satisfied" | D-S20 |
| "getDashboardMetrics carries the same onboarding block" | D-S22 |
| "isolates dashboard metrics per org" | D-S23 |
| "isolates onboarding state per org" | D-S24 |

The campaign report/link/recipient tests in the same file (`getCampaignReport returns zeros…`, `…uses denormalized counters…`, `…rejects an unknown campaign id`, `getCampaignLinkBreakdown returns empty…`, `getCampaignRecipients returns empty page…`) belong to the **Reports** page; they exercise shared helpers but are not Dashboard cases.

### GAPS (specific, ordered by value)

**Server gaps (the file is otherwise strong — these are the untested branches):**
- **G1 — `complete:false` with a single missing step.** Existing tests cover all-false and all-true; the "4 of 5" partial is never asserted. → D-S21. (P1)
- **G2 — `senderIdentity` whitespace handling.** `org.defaultFromEmail = "   "` should be `false` via `.trim()`. Untested. → D-S08. (P1)
- **G3 — Archived List / deleted Contact exclusion.** The `notEqualTo("archived",true)` / `notEqualTo("deleted",true)` filters are never exercised; a regression here would silently inflate audiences/contacts and onboarding flags. → D-S17, D-S18. (P1)
- **G4 — Subscribed status exactness.** Only `subscribed`/`unsubscribed` are used in fixtures; statuses like `pending`/`cleaned` are never tested against the `subscribed` count. → D-S19. (P1)
- **G5 — Unknown status counts toward total but not buckets.** The comment promises this; no test. → D-S11. (P1)
- **G6 — Missing/non-numeric counters → 0 (not NaN).** `counter()`'s defensive guard is never hit by a test (every counter fixture sets real numbers). A `sent` campaign with no counters, or a string counter, should yield zero totals/rates. → D-S15, D-S16. (P0/P2)
- **G7 — `rates.unsubscribe` and multi-campaign summation.** D-S12 asserts open/click/bounce but not unsubscribe; no test sums counters across >1 campaign. → D-S13, D-S14. (P1)
- **G8 — `rate()`/`counter()` unit edges.** No direct unit tests for the helpers (divide-by-zero, negative denominator, Infinity). → D-S26, D-S27. (P2)
- **G9 — Counter/campaign isolation across orgs.** Audience and onboarding isolation are tested; engagement counters and campaign totals crossing tenants are not. → D-S25. (P1)

**Frontend gaps (NOTHING exists today — no Dashboard page, composable, or component tests at all):**
- **G10 — `useDashboard` composable is completely untested.** `load()` success/failure, `error` fallback message, `showOnboarding` gating, `dismissOnboarding` + localStorage persistence, prior-dismissal read, localStorage-unavailable path, and the 209 → `sessionExpired` wiring through `useCloud`. → D-C01–C10. (multiple P0)
- **G11 — Page view-model math is untested.** KPI `active = sending + scheduled`, funnel `pctOfSent` zero-guard, engagement `other`/`pct` and negative-clamp, flat growth series, onboarding step mapping/count, `fmtNum`/`fmtPct`. These are pure and easily unit-tested **today** if extracted from the SFC. → D-V01–V14. (several P0)
- **G12 — Widget components untested** (funnel floor, donut geometry, growth-chart flat-line NaN-safety, QuickActions `to` targets, onboarding render/dismiss DOM). Blocked on `@vitejs/plugin-vue` not being in the Vitest config — see §2 caveat; until then test via extracted logic. → D-W01–W12. (some P0)
- **G13 — No E2E for the dashboard.** Only `_example.spec.ts` exists. The auth redirect, KPI render, checklist visibility/dismissal persistence, and quick-action navigation are unverified end-to-end. → D-E01–E08. (several P0)

**Biggest gap:** the entire **frontend** side of the dashboard is untested — most critically `useDashboard` (`load`/`error`/`showOnboarding`/`dismissOnboarding` + localStorage, D-C01–C09) and the page view-model derivations (D-V*). The server `getDashboardMetrics`/`getOnboardingState` are well covered; the UI that consumes them — onboarding show/dismiss/auto-hide, the zero-state math, and quick-action routing — has zero coverage today.

---

## 6. Test data & fixtures

**Harness.**
- Integration: `startTestParseServer()` from `tests/setup/parseServer.ts` — boots Parse Server v7 + `mongodb-memory-server`, loads `server/cloud/main.js`, returns `{ Parse, baseURL, stop }`. Boot in `beforeAll`, `await ctx.stop()` in `afterAll`. One server per file (forks pool; schema mutations leak across describe blocks — do not share).
- Component/DOM: `// @vitest-environment happy-dom` header + `mountWithPinia` from `tests/setup/vueTest.ts`. (See §2 caveat re: `@vitejs/plugin-vue`.)
- E2E: `freshUser` fixture from `tests/setup/playwrightFixtures.ts` (creates a Parse user via `POST /api/users`, deletes on teardown). Requires the dev server + Parse on :8080. Note the fixture creates a bare user, not a full org — for org-scoped dashboard assertions either run `signUpWithOrg` over REST in a fixture variant, or assert the fresh-user zero/checklist state (which holds for a userless-org just as well).

**Acting as a tenant (integration).** `Parse.User.become()` is blocked server-side. Always pass `{ sessionToken }`:
```js
async function signUp(company, email) {
  return Parse.Cloud.run("signUpWithOrg", {
    username: email, password: "hunter2hunter2", email, company,
  }); // → { sessionToken, userId, orgId }
}
const dashboard  = (st) => Parse.Cloud.run("getDashboardMetrics", {}, { sessionToken: st });
const onboarding = (st) => Parse.Cloud.run("getOnboardingState", {}, { sessionToken: st });
```
Saving domain objects with `{ sessionToken: st }` lets the tenancy hook stamp `organization` + ACL automatically (do not set `organization` by hand).

**Org-state fixture builders (integration).**
- `defaultFromEmail` (no UI yet for the cloud fn under test): set via master key on the org —
  ```js
  function setDefaultFromEmail(orgId, email) {
    const Org = Parse.Object.extend("Organization");
    const org = Org.createWithoutData(orgId);
    org.set("defaultFromEmail", email);
    return org.save(null, { useMasterKey: true });
  }
  ```
- **List (audience):** `new List(); set("name", …)` — `set("archived", true)` for exclusion cases.
- **Contact:** `set("email", …); set("status", "subscribed"|"unsubscribed"|"pending"|"cleaned")` — `set("deleted", true)` for exclusion.
- **Campaign by status:** `set("status", "draft"|"scheduled"|"sending"|"sent"|"paused"|"failed"|"queued")`.
- **Campaign with engagement counters** (simulates the future pipeline): set numeric `sentCount`, `deliveredCount`, `openCount`, `clickCount`, `bounceCount`, `unsubscribeCount`. For the non-numeric guard test (D-S16), set `sentCount:"oops"` via master key.

**Canonical metrics object (frontend mocks for `useDashboard`/view-model tests).**
```js
const ZERO = {
  audiences: 0,
  contacts: { total: 0, subscribed: 0 },
  campaigns: { total: 0, byStatus: { draft:0, scheduled:0, sending:0, sent:0, paused:0, failed:0 } },
  totals: { sent:0, delivered:0, opens:0, clicks:0, bounces:0, unsubscribes:0 },
  rates: { open:0, click:0, bounce:0, unsubscribe:0 },
  onboarding: { steps: { senderIdentity:false, audience:false, contact:false, campaign:false, sent:false }, complete:false },
};
const POPULATED = {
  audiences: 2,
  contacts: { total: 40, subscribed: 30 },
  campaigns: { total: 5, byStatus: { draft:1, scheduled:1, sending:1, sent:2, paused:0, failed:0 } },
  totals: { sent:1000, delivered:950, opens:380, clicks:95, bounces:50, unsubscribes:19 },
  rates: { open:0.4, click:0.1, bounce:0.05, unsubscribe:0.02 },
  onboarding: { steps: { senderIdentity:true, audience:true, contact:false, campaign:false, sent:false }, complete:false },
};
```
Use `ZERO` for empty-state/NaN-guard cases, `POPULATED` for formatting/derivation cases. To drive `useDashboard`, stub `useCloud().runCloud` to resolve these (success) or reject (`new Error("boom")` / `{}` / `{code:209}`) for D-C01–C03, D-C10.

**localStorage key (frontend):** `gorilla.onboarding.dismissed` — value `"1"` means dismissed. Clear between tests (`localStorage.clear()` in `beforeEach`) so dismissal state doesn't leak.

**Cleanup / isolation notes.**
- Integration: a unique company/email per test (already the file's convention) keeps orgs disjoint; rely on per-file Mongo for a clean slate, not cross-test cleanup.
- Component: `setActivePinia` is handled by `mountWithPinia`; reset `localStorage` and any module-level refs per test.
- E2E: `freshUser` self-tears-down; for navigation specs prefer asserting URL over deep page state to stay resilient while feature pages are in flux.
