# Gorilla Testing — Index, Strategy & Consolidated Findings

This directory holds the test plans for every surface of Gorilla plus the
cross-page journeys. The plans are **documentation** — they enumerate what to
test, at which layer, and map it onto the existing harness. This README is the
entry point: the map, the strategy, the coverage matrix, the cross-cutting
findings, and the remediation roadmap.

Stack (DECISIONS #7): **Vitest** (unit / integration / component) + **Playwright**
(browser E2E). Node 20. See `e2e.md` §6 for run commands.

---

## 1. The plans

| Doc | Surface | One-liner |
|---|---|---|
| [auth-marketing.md](auth-marketing.md) | `/`, `/login`, `/signup` + auth spine | Signup→org provisioning, login/logout/session lifecycle, the two route guards, org hydration, Parse SDK bootstrap. |
| [dashboard.md](dashboard.md) | `/app/dashboard` | KPI strip, onboarding checklist (real org-state), charts/funnel, empty states, quick-action routing; `getDashboardMetrics`/`getOnboardingState`. |
| [audiences-contacts.md](audiences-contacts.md) | `/app/audiences/*` | List/Contact/CustomField CRUD, dedupe, soft/GDPR delete, bulk tag/delete, filters, dynamic registry-driven form, `validateCustomFields` coercion. |
| [segments.md](segments.md) | `/app/segments/*` | Rule DSL → `Parse.Query`, operator/field matrix, static-vs-dynamic semantics, live preview, the rule builder emit contract, CRUD + duplicate. |
| [campaigns-editor.md](campaigns-editor.md) | `/app/campaigns/*` + block editor | `compileBlocks` per-block MJML, full status-guard matrix, duplicate/archive/rename/delete, editor block-ops/undo/autosave, merge tags, preflight + send wiring. |
| [templates.md](templates.md) | `/app/templates` | 49 seeded system templates, idempotent upsert seeding, gallery tabs, "Use this" fork, save-as/delete, `TemplatePreview` render + XSS escaping. |
| [reports.md](reports.md) | `/app/reports` | Demo mode + tutorial, the four widgets, demo→real flip, `getCampaignReport`/`getCampaignLinkBreakdown`/`getCampaignRecipients` rate math, pagination, filters. |
| [settings.md](settings.md) | `/app/settings/*` | Org general settings, sender identities (create/verify-stub/delete), `useSettings` contract, per-org uniqueness, cross-tenant isolation. |
| [send-pipeline.md](send-pipeline.md) | scheduleSend → fanout → send-email → tracking → webhook | The riskiest surface: HMAC tokens, suppression, atomic counters, SES mock adapter, tracking routes, SNS webhook, bounce/complaint ingest. |
| [e2e.md](e2e.md) | cross-page journeys | The flows that span pages: golden path signup→send→reports→suppression, lifecycle guards, demo dismiss, bounce/complaint loop, cross-tenant walk. |

---

## 2. Test-pyramid strategy

Four layers, each with a clear owner. Push correctness down to the cheapest
layer that can prove it; reserve the expensive layers for what only they catch.

| Layer | Runner / env | Boots | Owns |
|---|---|---|---|
| **Unit / lib** | Vitest, `node` (or Parse for persisting libs) | nothing (or in-mem Parse) | Pure functions: `validateCustomFields`/`coerceValue`/`slugifyKey`, `resolveMergeTags`/`buildMergeTags`, segment `compileRules`, `rate()`/`counter()`, tracking-token sign/verify, suppression/`bumpCounter` logic, report rate math helpers, view-model derivations extracted from SFCs. |
| **Integration** | Vitest, `node` + `startTestParseServer` | real Parse Server v7 + `mongodb-memory-server`, per file (`pool: forks`) | Cloud functions + worker job `handle()`s end-to-end against real Parse state: CRUD, status guards, tenant ACL isolation, denormalized counters, suppression side-effects, fanout/send/webhook seams. **This is where ~all current coverage lives.** |
| **Component** | Vitest, `happy-dom` + `mountWithPinia` | mounted Vue, mocked composables | SFC render + interaction: form validation, modal/drawer state, debounce/reset, the rule builder emit contract, widget geometry, `TemplatePreview` escaping, preflight gating, editor block-ops. **Currently blocked — see finding #1.** |
| **E2E** | Playwright | full dev stack + dev Mongo | User-visible cross-page journeys, redirects, optimistic UI, the demo→real flip in the DOM. Plus **wired-integration E2E** (Vitest) for the send/track/suppress data span. **Currently ~0 — see findings #2, #6.** |

### Current test inventory

**22 test files, ~233 tests — almost entirely server integration.**

| Dir | Files | What |
|---|---|---|
| `tests/server/` | **16** | The whole substance of the suite: `tenancy`, `audiences`, `contacts`, `customFields`, `segments`, `campaigns`, `templates`, `settings`, `reports`, `sendFoundation`, `fanout`, `sendEmail`, `webhookIngest`, `tracking`, `sending`, `_example`. Real Parse + in-mem Mongo. |
| `tests/components/` | **4** | `mergeTags.resolve` (pure resolver), `mergeTagPicker` (`insertAtCursor` + picker data, NOT the SFC), `useSending` (composable wrapper), `_example`. **No real `.vue` SFC is mounted anywhere.** |
| `tests/unit/` | **1** | `smoke` — proves the unit layer runs. |
| `tests/e2e/` | **1** | `_example.spec.ts` — proves `freshUser` + dev server boot; asserts `/` title. **No real journey.** |

Takeaway: the **server/cloud layer is genuinely strong** (happy paths + primary
failure branches across every feature). The **frontend (composables, components,
pages) and all real E2E are ~0**. The pyramid is currently an inverted "T".

---

## 3. Cross-page coverage matrix

Synthesized from each plan's coverage section. **Covered** = real tests exist;
**Partial** = some branches tested, notable holes; **None** = no tests.

| Surface | Unit | Integration | Component | E2E |
|---|---|---|---|---|
| Auth & marketing | None | **Covered** (tenancy spine: user+org+role, norm, dup→202, cross-org ACL) | None (no login/signup/store/guard/plugin tests) | None |
| Dashboard | None (view-models extractable) | **Covered** (metrics + onboarding, isolation) | None (`useDashboard`, widgets) | None |
| Audiences & contacts | Partial (`validateCustomFields` partly) | **Covered** (CRUD, dedupe, bulk, filters, GDPR, isolation) | None | None |
| Segments | Partial (`compileRules` extractable, untested) | **Covered** (operator matrix, CRUD, isolation) — Partial on static/dynamic divergence, preview side-effects, kind-switch | None (rule builder, editor, list pages) | None |
| Campaigns & editor | Partial (merge tags + `useSending` done; editor logic none) | Partial (compile breadth + status-guard holes) | None (EditorShell, preflight, preview, test-send) | None |
| Templates | Partial (data-file integrity untested) | **Covered** (seed, fork, save-as, delete, isolation) — Partial on ordering/reconcile/count | None (`TemplatePreview` — the big XSS/render unit) | None |
| Reports | None (`useReports`/`useReportsSample`) | Partial (zeros + basic counters; **no `CampaignSend`/`EmailEvent` seeding** → links/recipients/filters untested) | None (5 widgets) | None |
| Settings | None (`useSettings` wrapper) | **Covered** (org + senders + isolation) — minor validation holes | None (both pages) | None |
| Send pipeline | **Covered** (tokens, render, suppression, counters) | **Covered** (fanout, send-email, webhook-ingest, tracking routes, cloud fns) | n/a | None (no wired full-send E2E; no Playwright golden path) |
| Cross-page (e2e.md) | — | None (wired send span not built) | — | None |

Pattern: **Integration column is the only one with green; Component and E2E
columns are essentially empty across the entire app.**

---

## 4. Consolidated cross-cutting findings & blockers

The page agents independently surfaced the same handful of issues. Deduped and
ranked by severity (security + infra blockers first):

1. **`vitest.config.ts` does NOT register `@vitejs/plugin-vue` → the entire
   component-test layer is blocked.** Real `.vue` SFCs cannot compile, so no
   component test mounts an actual page or widget. Every plan's component section
   is gated on this. **#1 prerequisite** — without it, the high-logic UI units
   (TemplatePreview escaping, SegmentRuleBuilder emit contract, EditorShell
   invariants, Reports widgets) stay unverifiable except by extracting pure
   helpers. (Surfaced by dashboard, audiences, segments, campaigns, templates,
   reports, settings plans.)

2. **Playwright `freshUser` fixture creates an ORG-LESS user → all authed E2E is
   blocked.** Every authed cloud fn calls `getUserOrg`, which rejects a user with
   no Organization. So any browser journey touching tenant data fails at the
   first cloud call. **An org-provisioning fixture** (POST `signUpWithOrg` over
   REST → `{sessionToken, orgId}`, seed `localStorage`) must land before the
   golden path or any authed spec. (Surfaced by every authed-surface plan.)

3. **SECURITY — SES webhook SNS signature verification is a `TODO(real)` stub.**
   `routes/webhooks.js#isAuthentic` only checks that SNS fields exist and the
   `SigningCertURL` host ends in `amazonaws.com`; the cryptographic verify
   (canonical string-to-sign + RSA against the fetched cert) is **not
   implemented**. Anyone who can craft a payload with a plausible host can inject
   fake delivery/bounce/complaint events — poisoning suppression and deliverability
   for every tenant on the shared domain. Must land before real SES. (Send plan,
   gap #1 — flagged as the highest-severity item.)

4. **SECURITY — `signup.vue` open-redirect.** `login.vue` guards
   `route.query.next` with `startsWith("/")`; `signup.vue` passes `next` straight
   to `navigateTo` with **no guard**. A `next=https://evil.com` on `/signup`
   becomes an open redirect after signup. (Auth plan, GAP-3.)

5. **No test seeds `CampaignSend` / `EmailEvent` → all report aggregation is
   untested.** The report cloud fns' link-breakdown, recipients pagination/
   filters, and populated rate math have no coverage because no existing test
   creates the rows they read. The wired send E2E (e2e.md §1b) is the natural
   place to generate this data. (Reports plan + dashboard plan.)

6. **Frontend + E2E coverage is ~0 across the app.** No composable (`useDashboard`,
   `useReports`, `useReportsSample`, `useSettings`, `useSegments` duplicate, etc.),
   no page/SFC test mounts a real component, and the only E2E is the boot smoke.
   This is the single largest body of test debt — it is the consequence of #1 and
   #2 plus simply not yet written. (Every plan.)

Lower-severity recurring holes (tracked per-plan, not blockers): status-guard
matrix gaps in campaigns; static-vs-dynamic divergence + preview side-effects in
segments; template ordering/reconcile/exact-count; settings validation edges;
fanout DUPLICATE_VALUE backstop + >1000 pagination; real-SES command-shape unit
test; scheduler-firing.

---

## 5. Prioritized remediation roadmap

### P0 — unblock infra + close the security holes (do first)

- **[#1] Add `@vitejs/plugin-vue` to `vitest.config.ts`** (a `plugins: [vue()]`
  on the test config, or a dedicated `tests/components` project). Unblocks the
  entire component layer in one change. Note `EditorShell`/pages use `parse`,
  `useRouter`/`navigateTo`/`useToast` — stub them in the harness.
- **[#2] Add an org-provisioning Playwright fixture** (`signUpWithOrg` over REST,
  seed the Parse session into `localStorage`). Unblocks every authed browser
  journey, including the golden path.
- **[#3] Implement real SNS signature verification** in `routes/webhooks.js`,
  then add the route-auth tests (WHK-4/5/6 + a valid/invalid signature pair).
  Security fix, not just coverage.
- **[#4] Add the `startsWith("/")` open-redirect guard to `signup.vue`** (mirror
  `login.vue`); add the negative component + E2E case. Small, real bug.

### P1 — the high-value tests the unblocking enables

- **Component tests for the high-logic units** (now that #1 is done):
  `TemplatePreview` (XSS escaping + all 7 block types), `SegmentRuleBuilder`
  (field/operator/value reset-and-coerce emit contract), `EditorShell`
  (footer-last invariant, undo/redo, inline-edit collapse, autosave debounce +
  Cmd+S flush, save-then-send ordering), the four Reports widgets +
  `PreflightChecklist`.
- **The golden-path E2E** (e2e.md §1) — the flagship signup→send→reports journey,
  plus its hermetic **wired-integration sibling §1b** (which also produces the
  `CampaignSend`/`EmailEvent` data that closes finding #5).
- **Webhook HTTP route tests** (WHK-1..10) and the **wired full-send +
  bounce/complaint** journeys (e2e.md §1b/§2) — the send seams nobody composes
  today.
- **Composable tests** for `useDashboard`, `useReports`/`useReportsSample`,
  `useSettings`, `useCampaigns` (mock the `useCloud` seam, per the existing
  `useSending.test.ts` pattern).

### P2 — fill the remaining gaps

- Report aggregation with seeded `CampaignSend`/`EmailEvent` (links, recipients
  pagination + every filter, populated rate math, report tenant isolation).
- Status-guard matrix completion (campaigns), static/dynamic divergence +
  preview side-effects + kind-switch (segments), template
  ordering/reconcile/exact-49-count + per-def data-file integrity.
- Settings validation edges; fanout DUPLICATE_VALUE backstop + >1000 pagination;
  real-SES `SendEmailCommand` shape (mock `@aws-sdk/client-sesv2`); scheduler
  firing.
- The cross-tenant browser walk (e2e.md §5) and the secondary journeys
  (lifecycle guards, demo dismiss/auto-vanish).
- Auth-store / guards / Parse-plugin unit tests; marketing homepage boundary
  test (no `stores/` import).

---

## 6. Conventions every plan shares

- **Node 20 only** — `nvm use 20` before any `npm`/`npx` (system Node 14 breaks
  installs + the Parse SDK silently).
- **Integration:** boot `startTestParseServer()` in `beforeAll`, `stop()` in
  `afterAll`; one Parse+Mongo per file (`pool: forks`); never share across
  describe blocks (schema cache leaks).
- **Act as a tenant:** pass `{ sessionToken }` (from `signUpWithOrg`) to every
  `save`/`Query`/`Cloud.run`. **`Parse.User.become()` is blocked server-side** —
  it is legal only in the browser (covered by E2E). Read back with
  `{ useMasterKey: true }` to assert persisted state regardless of ACL.
- **Component:** `// @vitest-environment happy-dom` file header; mount via
  `mountWithPinia` (`tests/setup/vueTest.ts`); mock the composable/data seam, not
  Parse. Import modules by relative path (Vitest doesn't resolve `~`), except
  inside `vi.mock(...)` which matches the import specifier.
- **E2E:** import `test, expect` from `tests/setup/playwrightFixtures`; mock SES
  (`AWS_SES_MODE` unset); namespace + clean up any rows created in a spec.
