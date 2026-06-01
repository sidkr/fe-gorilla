# Pages

A page-by-page reference for the whole frontend, verified against `main`
(2026-06-01). For each page: its **route**, whether it's **prerendered** (marketing)
or **CSR** (app), its **layout** and **middleware**, where its **data** comes from,
and the **under-the-hood decisions/tradeoffs**. Read [Architecture §3](#/architecture#3-request-routing--the-marketingapp-boundary)
first for the marketing/app boundary.

---

## Frontend architecture context

**Layouts** (`layouts/`)
- `default.vue` — passthrough `<slot/>`. Exists so the lazy `<NuxtLayout>` resolve
  doesn't 500; the signup/login pages ship their own chrome inline.
- `marketing.vue` — shared marketing chrome: `<MarketingSiteNav>` + `<slot>` +
  `<MarketingSiteFooter>`. Opted into via `definePageMeta({ layout: "marketing" })`.
- `app.vue` — the authed shell: a fixed 240px left sidebar (brand lockup, "New
  campaign" CTA, nav links, user + logout), the main content area, and the global
  `<ToastHost>`. Applies `robots: noindex,nofollow` to the entire `/app/*` surface.

**Middleware** (`middleware/`)
- `auth-required.ts` — on `/app/*` (via the app layout); anonymous →
  `/login?next=<fullPath>`. Short-circuits on the server.
- `auth-blocked.ts` — on `/login` + `/signup`; authed users → `/app/dashboard`.
  Other marketing pages deliberately don't use it (a logged-in user can still read
  `/pricing`, legal, etc.). Both only fire after the auth store hydrates in the
  browser.

**State & plugins**
- `stores/auth.js` (`useAuthStore`) — `{ user, organization }`; actions
  `hydrateFromParse` / `hydrateOrg` / `login` / `signup` / `logout` /
  `sessionExpired`.
- `stores/network.js` — online/offline tracking.
- `plugins/parse.client.ts` — client-only; `Parse.initialize` + `serverURL`, then
  `hydrateFromParse()` so the first nav guard runs with a populated store.

**Component buckets** (auto-import prefixes set in `nuxt.config.ts`):
`components/shared/*` → no prefix (`<Button>`, `<Modal>`, `<ToastHost>`…);
`components/marketing/*` → `Marketing*`; `components/app/*` → `App*`. The
`components/app/editor/*` and `components/app/import/*` trees are imported by
relative path, not the prefix.

**The cloud-call convention.** The canonical path is
`useCloud().runCloud(name, params)` (`composables/app/useCloud.ts`): it normalizes
errors to real `Error`s with `.code` and, on Parse error 209 (invalid session),
calls `authStore.sessionExpired()` so the app boots to `/login` uniformly. Almost
every `composables/app/*` wrapper goes through it.

**Two outliers worth knowing:**
- **Direct Parse SDK** (bypassing composables) appears in exactly two pages:
  `campaigns/new.vue` (creates the draft) and `campaigns/[id]/edit.vue` (loads the
  campaign).
- **`useApiKeys.ts` and `useStores.ts`** import a second wrapper,
  `composables/shared/useApi.ts`, which **does not exist on `main`** → the
  `/app/settings/api-keys` and `/app/settings/integrations` pages break when opened
  (see [Architecture · Known gaps](#/architecture#known-gaps)).

---

## Marketing pages

Prerendered to static HTML; layout `marketing` and no middleware unless noted; data
is static (no store) unless noted.

### `/` — `pages/index.vue`
- **Purpose:** homepage — hero, live product demo, feature sections, final CTA.
- **Data/decisions:** mostly static. The one dynamic piece is
  `<MarketingDemoPlayer>` — an onboarding-tour-style player over **real captured app
  screenshots**; it fetches `/demo/manifest.json` client-side, shows a poster frame
  at first paint, autoplays on scroll-into-view, loops, and falls back to manual
  stepping under `prefers-reduced-motion`. Strictly marketing-only (no imports from
  `components/app/*` or `stores/`).

### `/signup` — `pages/signup.vue`
- **Layout:** none (own two-column chrome inline). **Middleware:** `auth-blocked`.
  `robots: index,follow`.
- **Purpose:** account creation (name/email/company/password/terms) with live
  email-validity + password-strength meter.
- **Data:** writes via `useAuthStore().signup()` → `signUpWithOrg` cloud fn (creates
  User + Org + members role) then `Parse.User.become`. On success →
  `safeNextPath(route.query.next)` (open-redirect guard in `utils/safeNext.ts`).

### `/login` — `pages/login.vue`
- **Layout:** none (own chrome). **Middleware:** `auth-blocked`.
- **Purpose:** login. Maps Parse error codes to friendly copy (101 = bad creds,
  219 = too many attempts). Honors `?next=` only if it starts with `/`.

### Product — `/features/*`
All static, `<MarketingPageHeader>` + content sections:
`/features` (index), `/features/editor`, `/features/segments`, `/features/reports`,
`/features/automations`.

### Resources
- `/docs` (`docs/index.vue`) — docs landing. `/docs/api` (`docs/api.vue`) — API
  reference page.
- `/templates` (`templates.vue`) — **public** template gallery (SEO; distinct from
  the authed `/app/templates`).
- `/deliverability`, `/changelog`.

### Company
`/about`, `/customers`, `/careers`, `/press`, `/contact` (the contact form is
presentational/static — no store).

### Legal & security
`/legal/terms`, `/legal/privacy`, `/legal/gdpr`, `/legal/dpa`, `/security` — all
static prose so they're crawlable and statically cacheable.

### `/design` — `pages/design.vue`
- **Not** in the prerender list; default layout; `noindex`. A design-system "kitchen
  sink" rendering every shared component/icon/pill variant so a broken SFC surfaces
  at compile time.

> ⚠️ **`/pricing`** is listed in the prerender routes but `pages/pricing.vue` is
> absent on `main`, so the route 404s (and breaks `npm run generate`).

---

## App pages

All CSR (`ssr:false`), layout `app`, middleware `auth-required` unless noted. Every
authed page follows the same skeleton: `definePageMeta` + `useHead({ title })` + a
composable + `onMounted(load)` with `loading`/`error` refs and graceful empty states.

### Redirect — `/app`
`pages/app/index.vue` (`layout:false`). No UI — `navigateTo("/app/dashboard",
{replace:true})`. Saves users from a bare `/app`.

### Dashboard — `/app/dashboard`
- **Purpose:** org home — KPI cards, charts, recent campaigns, activity feed, and a
  real-state onboarding checklist.
- **Data:** `useDashboard()` → `getDashboardMetrics` (org-scoped), `onMounted`.
  Onboarding steps are driven by real org state; each incomplete step deep-links to
  where it's completed; the card hides when done or dismissed. Engagement widgets
  show graceful zeros until the send pipeline produces data.
- **Components:** `AppKpiCard`, `AppAudienceGrowthChart`, `AppEngagementDonut`,
  `AppCampaignFunnel`, `AppRecentCampaignsTable`, `AppTopPerformingCampaigns`,
  `AppActivityFeed`, `AppQuickActions`.

### Campaigns
**`/app/campaigns`** — list + KPI strip. Data: `useCampaigns().listCampaigns()` →
`{campaigns, kpis}`; status filtering is client-side. Row actions
(`rename/duplicate/archive/delete/pause/resume`) are cloud fns with server-side
status guards. Components: `AppCampaignsTable`, `AppKpiCard`.

**`/app/campaigns/new`** (`appWidth:"full"`) — a **pure bootstrapper, no UI**.
Creates a draft `Campaign` directly via `new Parse.Object("Campaign")` (status
`draft`, `body = makeDefaultBody()` which **ships a Footer block so every campaign is
CAN-SPAM-compliant by default**), then `navigateTo(edit, {replace:true})` so Back
doesn't spawn another draft.

**`/app/campaigns/:id/edit`** (`appWidth:"full"`) — the visual email editor.
- **Decision — the page is *only* a loader.** It does `new Parse.Query("Campaign")
  .get(id)` (with a graceful "not found" surface) and mounts
  `<EditorShell :campaign>`.
- **Decision — `EditorShell` owns ALL editor state in local refs, deliberately NOT
  Pinia** (body, selection, dirty/saving, undo/redo stacks, autosave timer, setup
  popover, preview width). Save pipeline: edit → patch body → mark dirty → debounce
  1.5 s autosave; explicit Save flushes immediately. Every structural mutation pushes
  the pre-mutation body onto the undo stack; inline-edit `@input` within 500 ms
  collapses into one undo entry. **Tradeoff:** editor state is ephemeral and
  page-local (simpler reasoning, no cross-page leakage) but not shareable with other
  views or restorable across a full reload beyond what's persisted to the Campaign.
- **Decision — `appWidth:"full"`** drops the 1200px container so the 3-pane editor
  grid (`BlockLibrary | EditorCanvas | EditorInspector`) uses every pixel between the
  sidebar and the screen edge. Sends/tests go through `useSending`
  (`scheduleSend`/`sendTestEmail`/`cancelScheduledSend`); recipient counts from
  `useAudiences`; sender defaults from `useSettings`.

### Audiences
**`/app/audiences`** — card grid + KPI strip (`useAudiences().listAudiences()` +
create/update/delete). Engagement/last-sent/growth degrade to neutral placeholders
until sends exist. Components: `AppAudienceCard`, `AppKpiCard`.

**`/app/audiences/:id`** — the contact table for one List. Paginated
`useContacts().listContacts`; add / inline-edit / delete + `bulkDeleteContacts` /
`bulkTagContacts`; the **custom-field registry** (`useCustomFields`) drives a dynamic
form section + up to 2 extra columns; CSV import via `<ImportWizard>`
(`components/app/import/ImportWizard.vue`). GDPR `deleteContactData` is available.

**`/app/audiences/fields`** — the custom-field (data-point) registry CRUD
(`useCustomFields`). Same registry the contact form reads, so this page literally
shapes the contact data model. (A static sibling of `[id]` — `fields` resolves to the
static route, not the dynamic param.)

### Segments
**`/app/segments`** — list (`useSegments().listSegments` + `duplicate`/`delete`);
each rule tree renders to a compact mono summary via shared `OPERATOR_LABELS`.

**`/app/segments/:id`** — the rule-tree builder handling **both create
(`id==="new"`) and edit** in one route. `<AppSegmentRuleBuilder>` + a debounced live
preview count/sample via `evaluateSegment({rules, preview:true})`; saves via
`createSegment`/`updateSegment`.

### Automations
**`/app/automations`** — list + KPIs + recipe gallery (`useAutomations`:
`listAutomations`, `listRecipes`/`installRecipe`, `createAutomation`,
`activate`/`pause`/`delete`).

**`/app/automations/:id`** — single-automation editor: `getAutomation` + step CRUD
(`addStep`/`updateStep`/`deleteStep`) + `activate`/`pause`. (`useAutomations` also
exposes `enrollContact`, `getAutomationStats`.)

### Forms (hosted signup forms)
**`/app/forms`** — list + create + delete (`useForms`: `listForms`,
`createForm`, `deleteForm`); create navigates to the builder.

**`/app/forms/:id`** — the form builder: name, target audience, field list
(text/email/number/checkbox/select), double-opt-in, redirect, submit text, status
(`getForm`/`updateForm`). Live preview + an embed-code modal. The public URL/embed
snippets are built from `window.location.origin` + `/f/:id` (served by Express
through the `/f/**` proxy — same origin).

### Templates
**`/app/templates`** — authed gallery, two tabs: **System** (global starters,
read-only — "Use this" forks into a new Campaign draft and opens the editor) and
**Saved** (the org's own — use/edit/delete). `useTemplates`: `listTemplates`
(`{system, org}`), `useTemplate`, `deleteTemplate`, `saveAsTemplate`. Thumbnails are
hand-authored inline SVGs keyed by `seedKey`.

### Reports
**`/app/reports`** — per-campaign engagement. `useReports`: `getCampaignReport` /
`getCampaignLinkBreakdown` / `getCampaignRecipients` / `exportCampaignRecipients`.
- **Decision — demo-mode pattern.** With no real sends yet (and not dismissed), the
  page renders realistic **sample data** (`useReportsSample`) behind a tutorial
  overlay so a fresh org sees what Reports will look like; it auto-ends once real
  data exists or on dismiss, and is suppressed during the first load to avoid a
  flash. Components: `AppReportsKpiStrip`, `AppReportsTrend`, `AppReportsEngagement`,
  `AppReportsTable`, `AppReportsOnboarding`.

**`/app/reports/revenue`** — revenue attribution (revenue/AOV trend, top campaigns,
attribution-model breakdown). `useRevenue().load()` → `getRevenueOverview` (via
`useCloud`, so it's clean on `main`). Same sample/demo pattern until real
`Conversion`s exist.

### Settings
**`/app/settings`** — org general settings: name, default from-name/email, reply-to,
timezone, and the **physical mailing address for CAN-SPAM footers**
(`useSettings`: `getOrgSettings`/`updateOrgSettings`).

**`/app/settings/senders`** — sender identities (from-name/from-email pairs);
`listSenderIdentities`/`create`/`verify`/`delete`. Verification is an MVP stub
(status flip).

**`/app/settings/domains`** — sending-domain verification (DKIM/SPF/DMARC).
`useDomains`: `create`/`list`/`verifyDomain`/`delete`. Mock-DNS-first:
`verifyDomain` attempts a real lookup and falls back to a mock pass. **This page's
`verified` flag is what gates custom-domain sends** (see Architecture §7).

**`/app/settings/suppression`** — the suppression list (never-email addresses).
`useSuppression`: paginated `listSuppressions` (debounced search), `addSuppressions`
(paste/CSV), `removeSuppression`. Bounces/complaints add entries automatically; this
is the manual surface.

**`/app/settings/api-keys`** — API keys for the inbound events/orders API
(`useApiKeys`: `list`/`create`/`revoke`; raw key shown once). **⚠ Broken on `main`**
— missing `composables/shared/useApi.ts`.

**`/app/settings/integrations`** — ecommerce store connections (Shopify/Woo) for
revenue attribution (`useStores`: `list`/`create`/`remove`; webhook URL + signing
secret shown once). **⚠ Broken on `main`** — same missing import.

---

## Cross-cutting page conventions

- **Skeleton:** `definePageMeta({ layout:"app", middleware:"auth-required" })` +
  `useHead({ title })` + a composable + `onMounted(load)` + `loading`/`error` refs +
  graceful empty states. Outliers: `/app` (redirect, `layout:false`) and
  `campaigns/new` (bootstrapper, no UI).
- **Data access:** prefer a `composables/app/*` wrapper over `useCloud().runCloud`;
  reach for the Parse SDK directly only when you genuinely need an object handle
  (the two editor pages).
- **Empty states are first-class:** many widgets are honest zeros / sample-data demos
  until the send + revenue pipelines produce real rows — design new pages the same
  way.
- **Marketing vs app discipline:** marketing components must never import from
  `components/app/*` or `stores/`; the wall is one-way (shared → marketing/app).
