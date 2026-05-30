# Testing Plan — Reports

Test plan for the `/app/reports` surface: demo mode (sample data + tutorial onboarding), the four reporting widgets, the demo→real flip, and the three report cloud functions (`getCampaignReport`, `getCampaignLinkBreakdown`, `getCampaignRecipients`).

Stack: **Vitest** (default `environment: "node"`; component tests opt into `happy-dom` via a `// @vitest-environment happy-dom` file header) + **Playwright** for E2E (DECISIONS #7). Node 20. Server tests boot a real Parse Server against an in-memory Mongo per file (`tests/setup/parseServer.ts`, `pool: "forks"`). Multi-tenant model: `signUpWithOrg` → `{ sessionToken, userId, orgId }`; act as a user by passing `{ sessionToken }` to every query / save / cloud-run (`Parse.User.become()` is blocked server-side).

---

## 1. Scope & routes

| Surface | File(s) | What it does |
|---|---|---|
| Reports page | `pages/app/reports/index.vue` | Orchestrates demo vs real, builds real-mode slices from `campaignReports`, feeds each widget its slice + a `demo` flag. CSR-only (`/app/*` is `ssr: false`), `layout: "app"`, `middleware: "auth-required"`. |
| Demo detection / sample data | `composables/app/useReportsSample.ts` | Static deterministic `SAMPLE` object + `isDismissed()` / `dismiss()` / `resetDismiss()` backed by `localStorage["reports_demo_dismissed"]`. |
| Real-data loader | `composables/app/useReports.ts` | `loadSentCampaignReports()` queries `Campaign` where `status ∈ [sent, sending]`, descending `createdAt`, then fan-runs `getCampaignReport` per id. Also `loadReportsFor`, `loadReport`, `loadLinkBreakdown`, `loadRecipients`. |
| KPI strip | `components/app/ReportsKpiStrip.vue` | 6 cards: sent, delivered, open rate, click rate, bounce rate, unsub rate. Tone hints + "Sample" pill in demo. |
| Trend | `components/app/ReportsTrend.vue` | Inline-SVG opens/clicks two-series chart from `TrendPoint[]`; empty state when `data.length === 0`; "Sample" pill in demo. |
| Engagement funnel | `components/app/ReportsEngagement.vue` | Delivered→Opened→Clicked bars + Bounced/Unsub chips; empty state when all-zero; "Sample" pill in demo. |
| Per-campaign table | `components/app/ReportsTable.vue` | `TableShell` of campaign rows; skeleton when `loading`; empty state only when `!demo && !data.length`; rows clickable only in real mode; "Sample" pill in demo. |
| Onboarding overlay | `components/app/ReportsOnboarding.vue` | Tutorial card, only rendered while `demo`. Emits `dismiss`; "Create a campaign" link to `/app/campaigns/new`. |
| Cloud functions | `server/cloud/reports.js` | `getCampaignReport`, `getCampaignLinkBreakdown`, `getCampaignRecipients` (plus `getDashboardMetrics`, `getOnboardingState`, already covered). |

**Demo-mode contract (from `index.vue`):**
- `hasRealData = campaignReports.length > 0`
- `demo = !loading && !hasRealData && !dismissed` — demo is held OFF while the first load is in flight (avoids a flash), then resolves once `loading` settles.
- Sample shows when: fresh org (no sent/sending campaign) AND not dismissed.
- Flips to real when `loadSentCampaignReports` returns ≥1 report (a campaign reaches `sent`/`sending`).
- Counters are denormalized on `Campaign` by the send pipeline (`sentCount`, `deliveredCount`, `openCount`, `clickCount`, `bounceCount`, `unsubscribeCount`).

---

## 2. Test matrix

| Area | Server (node + real Parse) | Component (happy-dom + @vue/test-utils) | Composable (node, mock seam) | E2E (Playwright) |
|---|---|---|---|---|
| `getCampaignReport` rate math | ✅ primary | — | — | — |
| `getCampaignLinkBreakdown` | ✅ primary | — | — | — |
| `getCampaignRecipients` pagination + filters | ✅ primary | — | — | — |
| Tenant isolation (reports) | ✅ primary | — | — | — |
| Demo detection / dismiss persistence | — | — | ✅ `useReportsSample` (localStorage) | ✅ flow |
| `loadSentCampaignReports` query + fan-out | — | — | ✅ `useReports` (mock `runCloud` + Parse query) | indirectly |
| Real-mode slice math (`agg`/`realKpis`/`realEngagement`/`realCampaigns`) | — | ✅ page-level, or pure unit | — | — |
| KPI strip render (sample / real / empty) | — | ✅ primary | — | — |
| Trend render (sample / real / empty) | — | ✅ primary | — | — |
| Engagement render (sample / real / empty) | — | ✅ primary | — | — |
| Table render (sample / real / empty / loading) | — | ✅ primary | — | — |
| Onboarding render + dismiss emit | — | ✅ primary | — | — |
| "Sample" badge only in demo | — | ✅ per widget | — | ✅ flow |
| Demo→real auto-vanish after first send | — | ✅ page-level | — | ✅ primary |

The seam for component tests: widgets are pure-props (`data`, `demo`, `loading`) so they can be mounted directly with `mountWithPinia` from `tests/setup/vueTest.ts`. The page wires Parse + cloud, so the cleanest unit boundary is to test the widgets directly and the page's slice/demo logic either by mocking `useReports`/`useReportsSample` or by extracting the computeds — and to cover the full demo→real flip in E2E.

---

## 3. Detailed test cases

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| **Demo-mode detection & persistence** |||||||
| RPT-D01 | Composable | Fresh: nothing dismissed | New happy-dom env, empty `localStorage`; call `isDismissed()` | Returns `false` | P0 |
| RPT-D02 | Composable | `dismiss()` persists | Call `dismiss()`; then `isDismissed()` | `localStorage["reports_demo_dismissed"] === "1"`; `isDismissed()` returns `true` | P0 |
| RPT-D03 | Composable | `resetDismiss()` clears | `dismiss()` → `resetDismiss()` → `isDismissed()` | Key removed; returns `false` | P1 |
| RPT-D04 | Composable | No `localStorage` (SSR/node) | Stub `globalThis.localStorage = undefined`; call `isDismissed()` / `dismiss()` | `isDismissed()` returns `false`, `dismiss()` is a no-op (no throw) | P1 |
| RPT-D05 | Composable | Sample is deterministic | Read `SAMPLE` twice; deep-compare | Identical object, no RNG; `kpis.deliveredRate === 12106/12480`, `openRate === 5447/12106` | P2 |
| RPT-D06 | Page | Fresh org → demo shown | Mock `useReports` so `loadSentCampaignReports` resolves `[]`, `loading→false`; `isDismissed()→false`; mount page; await load | `demo === true`; `AppReportsOnboarding` rendered; each widget receives its `sample.*` slice + `:demo="true"` | P0 |
| RPT-D07 | Page | No flash while loading | Mock `useReports` with `loading=true` initially; mount; assert before load settles | `demo === false` while `loading` (onboarding not yet shown), then flips to `true` once `loading→false` with empty reports | P1 |
| RPT-D08 | Page | Dismiss hides sample | From demo state, click "Dismiss sample data" (emit `dismiss`) | `dismiss()` called; `dismissed.value === true`; `demo === false`; onboarding unmounts; widgets now get real (empty) slices; trend `data=[]`, table empty state | P0 |
| RPT-D09 | Page | Dismiss persists across reload | RPT-D08, then re-mount page (same `localStorage`) with still-empty reports | `dismissed` initializes `true` from `isDismissed()`; `demo === false` on first paint; no onboarding | P0 |
| **Demo → real auto-vanish (the flip)** |||||||
| RPT-F01 | Page | First send flips out of demo | Mock `loadSentCampaignReports` to resolve 1 `CampaignReport`; not dismissed; mount | `hasRealData === true` ⇒ `demo === false` even though never dismissed; onboarding NOT rendered; widgets get real slices | P0 |
| RPT-F02 | Page | Real numbers replace sample | RPT-F01 with a report `counts={sent:1000,delivered:950,opens:380,clicks:95,bounces:50,unsubscribes:19}` | `realKpis.sent===1000`, `openRate===380/950`, `clickRate===95/950`, `bounceRate===50/1000`; KPI strip shows these, not 12,480 | P0 |
| RPT-F03 | Page | `agg` sums multiple campaigns | 2 reports; mount | `agg` adds each `counts.*`; rates use summed delivered/sent; `realCampaigns` has 2 rows in input order | P1 |
| RPT-F04 | Page | Untitled campaign label | report with `name===""` | `realCampaigns[0].name === "(untitled)"` | P2 |
| RPT-F05 | E2E | Full demo→real journey | Fresh user (no campaigns) opens `/app/reports`; observe demo; create+send a campaign (or seed `status:"sent"` + counters via API); revisit `/app/reports` | First visit: onboarding + "Sample" pills visible. After send: no onboarding, no "Sample" pills, real campaign row present | P0 |
| RPT-F06 | E2E | Dismiss then no resurrection | Fresh user; dismiss sample; reload `/app/reports` | Onboarding stays gone; widgets show real (empty) states, not sample | P1 |
| **`loadSentCampaignReports` (useReports)** |||||||
| RPT-L01 | Composable | Queries sent+sending only | Mock Parse `Query.find` to return 2 rows; spy `containedIn`; mock `runCloud` | `containedIn("status",["sent","sending"])` called; `descending("createdAt")`; `limit(50)` default; `runCloud("getCampaignReport",{campaignId})` once per row | P1 |
| RPT-L02 | Composable | Org pointer applied when present | `useOrg().orgPointer()` returns a pointer | `equalTo("organization", org)` called before find | P2 |
| RPT-L03 | Composable | Fresh org returns `[]` | `find` resolves `[]` | `reports.value === []`; `loading` toggles true→false; no `runCloud` calls | P1 |
| RPT-L04 | Composable | Error surfaces + clears loading | `find` rejects with `Error("boom")` | `error.value === "boom"`; `loading.value === false`; `reports` unchanged | P1 |
| RPT-L05 | Composable | Parallel fan-out preserves order | 3 ids; `runCloud` resolves out of order | `reports.value` matches input id order (Promise.all guarantees) | P2 |
| **`getCampaignReport` rate math (server)** |||||||
| RPT-R01 | Server | Zeros for unsent draft | Sign up; create `Campaign{status:"draft"}`; run `getCampaignReport` | `counts.sent===0`, `delivered===0`, all rates `0` (no NaN); `name` echoed; `status==="draft"` | P0 |
| RPT-R02 | Server | Denormalized counters used | Campaign `sentCount:1000,deliveredCount:950,openCount:380,clickCount:95,bounceCount:50,unsubscribeCount:19` | `open===380/950≈0.4`, `click===95/950≈0.1`, `bounce===50/1000===0.05`, `unsubscribe===19/950` (`toBeCloseTo`) | P0 |
| RPT-R03 | Server | Open/click weighted by **delivered** | `deliveredCount:190, openCount:95` | `rates.open === 95/190 === 0.5` (denominator is delivered, not sent) | P0 |
| RPT-R04 | Server | Bounce weighted by **sent** | `sentCount:1000, bounceCount:50` | `rates.bounce === 50/1000` (denominator is sent) | P0 |
| RPT-R05 | Server | Delivered fallback = sent − bounces | Campaign with NO `deliveredCount`; `sentCount` absent so `sent` falls back to CampaignSend count (0 pre-pipeline); `bounceCount:0` | `delivered === max(sent-bounces,0)`; with no sends `delivered===0` | P1 |
| RPT-R06 | Server | Sent fallback via CampaignSend count | No `sentCount`; create N `CampaignSend{organization, campaign}` rows for it | `counts.sent === N` (counts CampaignSend when counter missing) | P1 |
| RPT-R07 | Server | `delivered=max(sent-bounces,0)` never negative | `bounceCount > sent`, no deliveredCount | `delivered === 0`, not negative | P2 |
| RPT-R08 | Server | `sentAt` ISO serialization | Campaign `sentAt:` a Date | `sentAt` is an ISO string; `null` when unset | P2 |
| RPT-R09 | Server | Missing campaignId rejected | run with `{}` | Throws (pin actual code: `OTHER_CAUSE` "campaignId is required" vs `OBJECT_NOT_FOUND`) | P1 |
| RPT-R10 | Server | Unknown id rejected | `campaignId:"doesNotExist"` | Throws `Parse.Error.OBJECT_NOT_FOUND` | P0 |
| RPT-R11 | Server | Unauthenticated rejected | run with no session | Throws `INVALID_SESSION_TOKEN` | P0 |
| **`getCampaignLinkBreakdown` (server)** |||||||
| RPT-B01 | Server | Empty pre-pipeline | sent campaign, no EmailEvents | `{ links:[], delivered:0, campaignId }` | P0 |
| RPT-B02 | Server | Unique clicks per URL | Seed `EmailEvent{type:"click", url:A, contact:c1}`×2 (same contact), `url:A contact:c2`, `url:B contact:c1`; `deliveredCount:100` | url A `uniqueClicks===2` (distinct contacts), url B `===1`; sorted desc by `uniqueClicks`; `clickRate === uniqueClicks/100` | P0 |
| RPT-B03 | Server | Events without url bucketed `(unknown)` | click event with no `url` | A `"(unknown)"` bucket appears, not dropped | P1 |
| RPT-B04 | Server | Event with no contact falls back to event id | click with `url:A`, no contact | Counts as 1 unique (keyed by event id) | P2 |
| RPT-B05 | Server | Non-click events ignored | seed `type:"open"` events | `links` empty (only `type:"click"` aggregated) | P1 |
| RPT-B06 | Server | clickRate 0 when delivered 0 | clicks present, `deliveredCount` absent | `clickRate === 0` (guard, no divide-by-zero) | P1 |
| RPT-B07 | Server | Unknown id / unauth | as RPT-R10/R11 | `OBJECT_NOT_FOUND` / `INVALID_SESSION_TOKEN` | P1 |
| **`getCampaignRecipients` pagination + filters (server)** |||||||
| RPT-P01 | Server | Empty pre-pipeline | sent campaign, no CampaignSend | `{ rows:[], total:0, page:1, perPage:50, totalPages:1 }` | P0 |
| RPT-P02 | Server | Pagination math | Seed 120 `CampaignSend`; request `page:2, perPage:50` | `total===120`, `totalPages===3`, `page===2`, `rows.length===50`; skip = `(2-1)*50` | P0 |
| RPT-P03 | Server | `perPage` clamped to MAX (100) | request `perPage:5000` | `perPage===100` (MAX_RECIPIENTS_PER_PAGE) | P1 |
| RPT-P04 | Server | `perPage` floored at 1 | request `perPage:0` / negative | `0`→default 50 (via `||`); negative→clamped to 1 — pin exact behavior | P1 |
| RPT-P05 | Server | `page` floored at 1 | request `page:0` / negative / NaN | `page===1` | P1 |
| RPT-P06 | Server | Default perPage | omit `perPage` | `perPage===50` (DEFAULT_RECIPIENTS_PER_PAGE) | P2 |
| RPT-P07 | Server | filter `opened` | Seed sends with mix of `opened:true/false`; `filter:"opened"` | only `opened===true` rows; `total` reflects filtered count | P0 |
| RPT-P08 | Server | filter `clicked` | `filter:"clicked"` | only `clicked===true` rows | P1 |
| RPT-P09 | Server | filter `bounced` | sends with `status:"bounced"`; `filter:"bounced"` | only `status==="bounced"` rows | P1 |
| RPT-P10 | Server | filter `unsubscribed` | `filter:"unsubscribed"` | only `status==="unsubscribed"` rows | P1 |
| RPT-P11 | Server | filter `notOpened` | mix; `filter:"notOpened"` | rows where `opened !== true` (includes missing) | P1 |
| RPT-P12 | Server | filter `all` / unknown → no constraint | `filter:"all"` and `filter:"xyzzy"` | all rows returned for both (default branch) | P2 |
| RPT-P13 | Server | Row shape + contact include | send with contact firstName/lastName/email | row carries `email` (send.email or contact.email), `firstName`, `lastName`, `status`(default "sent"), `opened`/`clicked` booleans, `openedAt`/`lastClickedAt` ISO-or-null, `bounceReason` or null | P1 |
| RPT-P14 | Server | Email fallback chain | send with no `email` but contact has email; and a send with neither | falls to `contact.email`; `""` when both absent | P2 |
| RPT-P15 | Server | Ordering | several sends with staggered createdAt | `descending("createdAt")` — newest first | P2 |
| RPT-P16 | Server | Unknown id / unauth | as above | `OBJECT_NOT_FOUND` / `INVALID_SESSION_TOKEN` | P1 |
| **Tenant isolation** |||||||
| RPT-T01 | Server | getCampaignReport cross-org blocked | Org A creates campaign; Org B runs `getCampaignReport` with A's campaignId | Org B gets `OBJECT_NOT_FOUND` (ACL isolates) | P0 |
| RPT-T02 | Server | Link breakdown cross-org blocked | A's campaign id, B's session | `OBJECT_NOT_FOUND` | P1 |
| RPT-T03 | Server | Recipients cross-org blocked | A's campaign id, B's session | `OBJECT_NOT_FOUND` | P1 |
| RPT-T04 | Server | Recipients don't leak across orgs | A & B each have a sent campaign with CampaignSend rows | each org's recipients query returns only its own rows / totals | P0 |
| RPT-T05 | E2E | Sample isolation per browser | Two fresh orgs in demo; dismissing in A's session doesn't affect B | localStorage key is per-browser; independent demo state | P2 |
| **KPI strip widget** |||||||
| RPT-K01 | Component | Renders sample slice | mount `ReportsKpiStrip` with `:data="SAMPLE.kpis" :demo="true"` | 6 cards; "Emails sent" shows `12,480` (toLocaleString); open rate `45.0%` (one decimal); "Sample" pill present | P0 |
| RPT-K02 | Component | Renders real slice | `:data="realKpis"` with sent=1000…, `:demo="false"` | values reflect real numbers; NO "Sample" pill | P0 |
| RPT-K03 | Component | Empty/degrade | `:data="{}"` | all cards render `0` / `0.0%`, no NaN, no throw | P0 |
| RPT-K04 | Component | Tone thresholds | openRate 0.31→good, 0.2→neutral, 0.1→warn; bounceRate 0.05→warn, 0.01→good | `.rep-kpi-sub` carries `is-good`/`is-neutral`/`is-warn` per `aboveTone`/`belowTone` | P1 |
| RPT-K05 | Component | Sub-line content | sample data | delivered sub = "97.0% delivery rate"; open sub = "5,447 opens" | P2 |
| **Trend widget** |||||||
| RPT-TR01 | Component | Renders sample series | `:data="SAMPLE.trend" :demo="true"` | SVG rendered (`hasData`), legend Opens/Clicks, "Sample" pill, ≤6 x-axis ticks | P0 |
| RPT-TR02 | Component | Empty state when `data=[]` | `:data="[]" :demo="false"` | `EmptyState` shown ("charts here as events roll in"); no SVG paths; no "Sample" pill | P0 |
| RPT-TR03 | Component | Single point | `:data=[{label,opens,clicks}]` | no divide-by-zero; `x(0)===PAD_X`; one tick; renders | P1 |
| RPT-TR04 | Component | Path math sanity | known 2-point series | `linePath("opens")` starts `M`, second cmd `L`; range floors at 0 | P2 |
| RPT-TR05 | Component | Real-mode placeholder | page passes `trendData=[]` in real mode | empty state (real time-series not built yet); confirms intended behavior | P1 |
| **Engagement widget** |||||||
| RPT-E01 | Component | Renders sample funnel | `:data="SAMPLE.engagement" :demo="true"` | 3 funnel bars (Delivered/Opened/Clicked) + Bounced/Unsub chips; pct of delivered; "Sample" pill | P0 |
| RPT-E02 | Component | Empty state all-zero | `:data={delivered:0,opened:0,clicked:0,bounced:0,unsubscribed:0}` | "No engagement yet" empty state; no bars | P0 |
| RPT-E03 | Component | Real slice | `realEngagement` from a sent campaign | bars sized by `count/delivered`; percentages correct | P0 |
| RPT-E04 | Component | pct guard | `delivered:0` but `bounced:5` | not empty (secondary non-zero); `pctOf` returns 0 → "0%", no NaN | P1 |
| RPT-E05 | Component | Min sliver width | a stage with tiny non-zero count | bar `width >= 4%` so it's visible; zero stays 0 | P2 |
| RPT-E06 | Component | fmtPct trailing-zero drop | pct 100 → "100%", 48.1 → "48.1%" | integer pct drops ".0" | P2 |
| **Per-campaign table** |||||||
| RPT-C01 | Component | Renders sample rows | `:data="SAMPLE.campaigns" :demo="true" :loading="false"` | 6 rows; "Sample" pill; rows NOT `.is-link` (non-clickable); names truncated >36 chars | P0 |
| RPT-C02 | Component | Real rows clickable | `:data="realCampaigns" :demo="false"` | rows have `.is-link`; click triggers `navigateTo("/app/campaigns/{id}")` (stub `navigateTo`); no "Sample" pill | P0 |
| RPT-C03 | Component | Loading skeleton | `:loading="true"` | `TableShell aria-busy="true"` with 5 skeleton rows; no empty state, no data rows | P0 |
| RPT-C04 | Component | Real empty state | `:demo="false" :data="[]" :loading="false"` | "No campaign reports yet" empty state | P0 |
| RPT-C05 | Component | Demo empty NOT shown | `:demo="true" :data="[]"` | empty state suppressed (empty only when `!demo && !data.length`); renders populated branch | P1 |
| RPT-C06 | Component | Open-rate tinting | openRate 0.55→success pill, 0.45→plain text (neutral), 0.3→warn pill | per `openRateTone` policy | P1 |
| RPT-C07 | Component | Date / number formatting | row with ISO sentAt + null sentAt | `fmtDate` → "May 12, 2026"; null → "—"; recipients toLocaleString | P2 |
| **Onboarding overlay** |||||||
| RPT-O01 | Component | Renders 4 steps | mount `ReportsOnboarding` | badge "Preview · sample data", title, 4 numbered steps (KPIs/trend/funnel/table), auto-dismiss note | P1 |
| RPT-O02 | Component | Dismiss emits | click "Dismiss sample data" | emits `dismiss` once | P0 |
| RPT-O03 | Component | Create-campaign link | inspect ghost CTA | `NuxtLink to="/app/campaigns/new"` (stub `NuxtLink`) | P2 |
| RPT-O04 | Page | Only rendered in demo | mount page in real mode | `AppReportsOnboarding` absent (guarded by `v-if="demo"`) | P0 |
| **Auth / route guard** |||||||
| RPT-G01 | E2E | Anonymous redirected | hit `/app/reports` logged out | redirected to `/login?next=/app/reports` (auth-required middleware) | P1 |
| RPT-G02 | E2E | noindex on /app | inspect head | app layout applies `noindex` meta | P2 |

---

## 4. Acceptance criteria

1. **Cloud rate math is exact and weighted correctly:** open/click/unsub rates over **delivered**; bounce rate over **sent**; every rate guarded so a zero denominator yields `0`, never `NaN`. (RPT-R02–R04, RPT-B06.)
2. **Graceful zeros pre-pipeline:** all three cloud fns return honest zeros / empty arrays for a campaign with no sends, with full result shape intact. (RPT-R01, RPT-B01, RPT-P01.)
3. **Pagination + filters correct:** `page`/`perPage` clamped (≥1, ≤100), `totalPages` math right, each filter (`opened`/`clicked`/`bounced`/`unsubscribed`/`notOpened`/`all`) constrains count and rows consistently. (RPT-P02–P12.)
4. **Tenant isolation:** no org can read another org's report, link breakdown, or recipients; cross-org id → `OBJECT_NOT_FOUND`. (RPT-T01–T04.)
5. **Demo mode shows for a fresh, non-dismissed org** and disappears (a) on dismiss (persisted across reloads) and (b) automatically once the first campaign is sent — without the user dismissing. (RPT-D06/08/09, RPT-F01/F05.)
6. **No demo flash during initial load:** `demo` stays false while `loading`. (RPT-D07.)
7. **Every widget renders sample, real, and empty** without throwing, with correct formatting (toLocaleString, one-decimal %). (RPT-K/TR/E/C series.)
8. **"Sample" badges appear in demo only** and never in real mode, across all four widgets. (RPT-K01/K02, RPT-TR01/TR02, RPT-E01, RPT-C01/C02.)
9. **Table behavior by mode:** skeleton while loading; empty state only for a real loaded-empty dataset; rows clickable only in real mode. (RPT-C02–C05.)
10. **Auth guard** redirects anonymous users away from `/app/reports`. (RPT-G01.)

---

## 5. Current coverage → gaps

### Mapped to `tests/server/reports.test.ts` (existing)

| Existing test (line) | Covers | Plan IDs satisfied |
|---|---|---|
| `requires authentication` (79) | getDashboardMetrics auth | pattern reused for RPT-R11 |
| `getCampaignReport returns zeros for a campaign with no sends` (203) | unsent draft → zeros | RPT-R01 |
| `getCampaignReport uses denormalized counters when present` (225) | counters + `open===95/190===0.5` | RPT-R02 (partial), RPT-R03 |
| `getCampaignReport rejects an unknown campaign id` (249) | unknown id | RPT-R10 |
| `getCampaignLinkBreakdown returns an empty list pre-pipeline` (260) | empty links + delivered 0 | RPT-B01 |
| `getCampaignRecipients returns an empty page pre-pipeline` (279) | empty page shape | RPT-P01 |
| `isolates dashboard metrics per org` (187) / onboarding iso (432) | dashboard isolation pattern | template for RPT-T01–T04 |

**Server-side report fns are partially covered** — empty/zero paths and the basic denormalized-counter path exist. The bulk of the rate-math, link-aggregation, pagination, filter, populated-data, and report-specific tenant-isolation cases (RPT-R03–R09, all RPT-B0x with events, all RPT-P0x with sends, RPT-T01–T04) are **NOT yet covered** and require seeding `CampaignSend` / `EmailEvent` rows — which no existing test does.

### GAPS (call-outs)

- **The 5 Reports widget components have ZERO tests.** `ReportsKpiStrip`, `ReportsTrend`, `ReportsEngagement`, `ReportsTable`, and `ReportsOnboarding` have no spec anywhere under `tests/components/**`. All of sections RPT-K / RPT-TR / RPT-E / RPT-C / RPT-O is greenfield. The harness exists (`tests/setup/vueTest.ts` `mountWithPinia`, happy-dom via file header) and is proven by `tests/components/useSending.test.ts` — but no one has pointed it at Reports.
- **No demo-flow E2E.** No Playwright spec exercises `/app/reports` at all (`tests/e2e/` has only `_example.spec.ts`). The end-to-end demo→real flip (RPT-F05), dismiss persistence (RPT-F06), and auth guard (RPT-G01) are entirely uncovered.
- **`useReportsSample` / `useReports` composables are untested.** Demo detection, dismiss persistence, and the `loadSentCampaignReports` query construction + fan-out (RPT-D01–D05, RPT-L01–L05) have no specs. `useReports` can follow the `useSending.test.ts` pattern (mock `useCloud`'s `runCloud`); the Parse `Query` for `loadSentCampaignReports` additionally needs the Parse query surface mocked.
- **Page-level demo/real slice logic (`agg`, `realKpis`, `realEngagement`, `realCampaigns`, `demo`) is untested.** Consider extracting these computeds into a small pure helper so they're unit-testable without mounting the full Nuxt page (the page itself best validated in E2E).

---

## 6. Test data & fixtures

### Server (Vitest node)

- **Harness:** `startTestParseServer()` from `tests/setup/parseServer.ts` in `beforeAll`, `ctx.stop()` in `afterAll`. One Parse Server + in-memory Mongo per file (`pool: "forks"`). Default cloud bundle (`server/cloud/main.js`) registers the report fns.
- **Tenancy helper:** copy the `signUp(company, email)` wrapper from `reports.test.ts` (calls `signUpWithOrg` → `{ sessionToken, userId, orgId }`). Act as the user by passing `{ sessionToken }` to every `save` / `Query` / `Cloud.run`; never `Parse.User.become()`.
- **Seeding a "sent" campaign with counters** (real-mode path):
  ```js
  const Campaign = Parse.Object.extend("Campaign");
  const c = new Campaign();
  c.set({ name: "Sent", status: "sent", sentCount: 1000, deliveredCount: 950,
          openCount: 380, clickCount: 95, bounceCount: 50, unsubscribeCount: 19,
          sentAt: new Date() });
  await c.save(null, { sessionToken: st });
  ```
- **Seeding `CampaignSend` rows** (recipients + sent-fallback): create N `Parse.Object.extend("CampaignSend")` with `{ campaign: c, organization, email, contact, status, opened, clicked, openedAt, lastClickedAt, bounceReason }`. The tenancy hook stamps `organization` + ACL on save as the user (mirror how `List`/`Contact` are created in existing tests). Mix `opened`/`clicked`/`status` to exercise filters. For pagination loop 120 saves (or batch via `Parse.Object.saveAll`).
- **Seeding `EmailEvent` rows** (link breakdown): `{ campaign: c, organization, type: "click", url, contact }`. Vary `url`, repeat `contact` to test unique-clicker dedup, include a no-`url` and a no-`contact` event, and a `type:"open"` event to confirm it's ignored.
- **Cross-tenant fixtures:** two `signUp`s (A, B); seed under A's token; assert B's session sees `OBJECT_NOT_FOUND` / zero rows.
- **Rate assertions:** use `toBeCloseTo(x, 5)` for fractions (matches existing style).

### Component (Vitest happy-dom)

- File header `// @vitest-environment happy-dom`; mount via `mountWithPinia(Component, { props, global: { stubs } })` from `tests/setup/vueTest.ts`.
- **Shared/auto-imported components** used inside widgets (`Card`, `Pill`, `EmptyState`, `SectionEyebrow`, `TableShell`, `Button`, `Icon`, `NuxtLink`) are NOT auto-imported under raw `@vue/test-utils` — provide stubs (e.g. `global: { stubs: { Card: { template: '<div><slot/></div>' }, Pill: { template: '<span class="pill"><slot/></span>' }, NuxtLink: { template: '<a><slot/></a>' } } }`). Assert on stub presence for the "Sample" pill (e.g. count rendered `Pill` stubs / a marker class).
- **`navigateTo`** (used by `ReportsTable` row click): stub on `globalThis` (`vi.stubGlobal("navigateTo", vi.fn())`) and assert call args.
- **Sample data fixture:** import `SAMPLE` from `composables/app/useReportsSample.ts` directly — it's exported and deterministic, so it doubles as the canonical demo fixture.
- **Real-data fixtures:** hand-build `CampaignReport[]` matching the `useReports.ts` interface, or the page's derived slices (`realKpis`, `realEngagement`, `realCampaigns`) as plain objects.

### Composable (Vitest, mocked seams)

- `useReportsSample`: happy-dom env for real `localStorage`; reset between tests with `resetDismiss()` / `localStorage.clear()` in `afterEach`. One case stubs `localStorage` undefined to cover the SSR guard.
- `useReports`: mock `~/composables/app/useCloud` to inject a `runCloud` spy (per `useSending.test.ts`). For `loadSentCampaignReports`, also mock the Parse `Query` (`vi.mock("parse", ...)`) so `find()` returns canned rows and the `equalTo`/`containedIn`/`descending`/`limit` calls are spy-asserted; mock `~/composables/app/useOrg` to control `orgPointer()`.

### E2E (Playwright)

- Use the `freshUser` fixture (`tests/setup/playwrightFixtures.ts`) — note it creates a bare Parse user via REST. For org-scoped report flows you need a user **with an org**: either drive `signUpWithOrg` via `request.post(.../functions/signUpWithOrg)` or extend the fixture. Capture the `sessionToken` and inject it into `localStorage` (the Parse session key) before navigating so the CSR app boots authenticated.
- For RPT-F05/F06, seed a `sent` campaign (+ counters, optionally CampaignSend/EmailEvent) via the REST/master-key path between the two page visits, rather than driving the full send UI, to keep the spec fast and isolated.
- Assert on the onboarding card, the "Sample" pills, and the real campaign row by visible text / role.
