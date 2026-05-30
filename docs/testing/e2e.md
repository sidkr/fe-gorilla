# Testing Plan — Cross-Page End-to-End Journeys

The nine per-surface plans (`auth-marketing`, `dashboard`, `audiences-contacts`,
`segments`, `campaigns-editor`, `templates`, `reports`, `settings`,
`send-pipeline`) each cover their own surface in isolation. **This document owns
the journeys that span pages** — the flows where the bug only shows up because
two surfaces have to agree (signup → settings → audiences → campaign → send →
reports → suppression). A fanout that enqueues a job nobody runs is green in
every unit test and broken in production; these scenarios exist to catch exactly
that class of seam failure.

Stack (DECISIONS #7): **Vitest** for unit / integration / component, **Playwright**
for browser journeys. Node 20 (`nvm use 20` before any `npm`/`npx`). See §6 for
how to run.

---

## 0. Conventions & layering for E2E

Two distinct meanings of "E2E" live in these plans; keep them straight:

- **Wired integration E2E (Vitest).** Drive the real cloud functions + the pure
  job `handle(data, {enqueue})`s in sequence against an in-memory Parse Server,
  with an in-process array as the queue. Hermetic, no browser, no live Agenda,
  no network (mock SES). This is the right home for the *data*-correctness span:
  fanout → send-email → counters → webhook → suppression → re-send exclusion.
  (Send-pipeline plan §3.12 E2E-1/2/3.)
- **Browser E2E (Playwright).** `tests/e2e/*.spec.ts` against `npm run dev` +
  dev Mongo. This is the right home for the *user-visible* span: forms, redirects,
  optimistic UI, navigation, the "Sample → real" flip rendered in the DOM. One
  worker, shared dev Mongo (`playwright.config.ts`).

Each numbered journey below states which flavor it is.

### Two preconditions that BLOCK most browser journeys today

1. **Org-provisioning fixture is missing.** `tests/setup/playwrightFixtures.ts`
   `freshUser` creates a bare `_User` via `POST /api/users` — **no Organization**.
   Every authed cloud fn calls `getUserOrg` and rejects an org-less user, so any
   journey that reads/writes tenant data fails at the first cloud call. **All
   authed browser journeys depend on adding an org-provisioning fixture** that
   POSTs `signUpWithOrg` over REST (returns `{ sessionToken, userId, orgId }`)
   and seeds the Parse session into `localStorage` before navigating. Until it
   lands, only the golden-path signup journey (which creates its own org through
   the UI) and the anonymous-redirect checks run. This is tracked as **P0
   blocker #2** in the README.
2. **Session bootstrap.** `/app/*` is CSR; the app reads the Parse session from
   `localStorage` on first paint (`plugins/parse.client.ts`). Browser specs must
   seed that key (or drive the login UI) before visiting any `/app/*` route.

---

## 1. Golden path (flagship) — signup to suppression, one continuous run

**Type:** primarily **Playwright** (the user-visible spine), with a **wired
integration** sibling (Journey 1b) that automates the send/track/suppress tail
without a browser. Run the wired sibling first in CI — it is hermetic and
P0; the browser spine is P1 and slower.

**Why split:** the browser cannot fire SES/SNS webhooks or open-pixel hits
against a real inbox. The send → track → bounce → suppress tail is exercised by
driving the cloud fns + tracking routes + job handlers directly (mock SES). The
browser journey carries the flow up to "Send" and then to "Reports shows real
numbers"; the tail's correctness is owned by 1b.

### 1a. Browser spine (Playwright)

**Preconditions:** dev stack up (`npm run dev`, Mongo at
`mongodb://localhost:27017/gorilla`); unique namespaced email
`t_<ts>_<rand>@test.gorilla.local`; mock SES (`AWS_SES_MODE` unset).

| # | Page / route | Action | Observable outcome |
|---|---|---|---|
| 1 | `/signup` | Fill name/email/company/password, agree terms, submit | Lands `/app/dashboard`; org name visible in app chrome. **Org created** (`_User` role owner + `Organization plan:free` + `org_<id>_members` role). |
| 2 | `/app/dashboard` | Observe onboarding checklist | "Finish setting up Gorilla" card, "0 of 5 steps done". |
| 3 | `/app/settings` | Set org name + **CAN-SPAM mailing address**; Save | "Settings saved."; address persists on reload. |
| 4 | `/app/settings/senders` | Add a sender identity; click **Verify** | Row appears "Pending" → pill flips to **Verified** (MVP stub). Onboarding `senderIdentity` step now satisfiable (set default from-email). |
| 5 | `/app/audiences/fields` | Create a **custom field** (e.g. enum `plan_tier`) | Field appears in registry; type locked after create. |
| 6 | `/app/audiences` | Create an **Audience** ("Newsletter") | New card in grid; KPI strip updates. |
| 7 | `/app/audiences/[id]` | Add 2–3 **Contacts** with the custom field + **tags**; one `subscribed`, set distinct `firstName` | Rows appear; header count increments; custom-field column renders; dashboard `audience`+`contact` onboarding steps flip true. |
| 8 | `/app/segments/new` | Build a **Segment** over that data (e.g. `tags contains "vip" AND plan_tier eq "pro"`); watch live **preview count**; name it; Create | Redirect to `/app/segments/<id>`; preview count matches saved `lastCount`; row visible in `/app/segments`. |
| 9 | `/app/templates` | Gallery → pick a system template → **"Use this"** | Navigates to `/app/campaigns/<id>/edit`; editor shows the template's blocks; a new **draft Campaign** exists. |
| 10 | `/app/campaigns/[id]/edit` | Insert a **merge tag** (`{{firstName}}`) into a block; toggle **sample-data preview** | Preview renders the sample contact value (e.g. "Hi Avery"); autosave persists (or Cmd+S). |
| 11 | editor → Test-send popover | Enter own address; **Send test** | Save flushes first, then `sendTestEmail`; success panel shows recipient + messageId. **No** CampaignSend / EmailEvent / Suppression side-effects. |
| 12 | editor → Pre-flight | Set subject/from/audience; all checks pass; **Send** | Save flushes, then `scheduleSend(id,"now")`; campaign → `queued`→`sending`; recipient count shown; routed toward campaigns/report view. |
| 13 | `/app/reports` | Open after send | **Flips out of demo**: no onboarding card, no "Sample" pills; a real campaign row with real `sentCount`/rates. |
| 14 | (tail — see 1b) | open/click/unsubscribe simulated via tracking endpoints | Counters move; unsubscribed contact suppressed; re-send excludes them. |

**Data this sets up:** one org with a verified sender + CAN-SPAM address; one
custom field; one audience with tagged contacts; one segment; one sent campaign
with denormalized counters; suppression rows from the tail. Tear down org +
children with the master key.

### 1b. Send → track → suppress tail (wired integration, Vitest, P0)

Replaces steps 11–14's data assertions with hermetic, deterministic checks. This
is the automation of the send owner's manual "2 recipients → both sent" check.

**Ordered steps (all via real cloud fns / job `handle()`s, mock SES):**
1. `signUpWithOrg` → org; `createAudience`; `addContact` ×2 subscribed (one with
   a `{{firstName}}` value) + 1 already-suppressed address; `createCampaign` with
   valid compiledHtml containing a real link and `{{unsubscribeUrl}}`.
2. `scheduleSend({campaignId, when:"now"})` → campaign `queued`,
   `recipientCount === 2` (suppressed excluded at validation).
3. `campaignFanout.handle({campaignId, organization, audienceId}, {enqueue})`
   with `enqueue` pushing onto an array → 2 `CampaignSend` rows, campaign
   `sending`, **suppressed contact never enqueued**, dedup by lowercased email.
4. For each enqueued job, `sendEmail.handle({sendId, campaignId})` → each send
   `status:sent` with distinct `mock-` `sesMessageId`; 2 `MockSentMessage` rows
   with merged HTML (pixel `/t/o/`, click `/t/c/`, `{{unsubscribeUrl}}`→`/u/`,
   `List-Unsubscribe` header); `Campaign.sentCount === 2`; 2 `accepted` events.
5. **Open/click** via the tracking routes (or `recordOpen`/`recordClick`) using
   tokens minted from the actual sent HTML, fired twice each → `openCount`/
   `clickCount` increment once (unique-event gate), EmailEvents written.
6. **One-click unsubscribe**: `POST /u/<unsubToken>` → `Suppression(unsubscribe)`,
   `Contact.unsubscribed=true`/`status`/`unsubscribedAt`, `unsubscribeCount=1`;
   POST again → 200, counter stays 1 (idempotent).
7. `getCampaignReport({campaignId})` → counters consistent with the events
   (sent 2, opens/clicks/unsub reflect unique events). **Reports out of demo.**
8. **Re-send exclusion**: reset campaign → `queued`, re-run fanout → the
   unsubscribed/suppressed contact is **not** in the new CampaignSend set.

**Expected invariants proven:** no send to a suppressed/unsubscribed address;
unique-event counting; idempotent unsubscribe; counter ↔ report agreement;
suppression closes the loop into the next send.

---

## 2. Bounce / complaint via SES webhook → suppression → excluded next send

**Type:** wired integration (Vitest), P0. Continues from Journey 1b's two sends.

1. Feed a **Permanent-bounce** SES-via-SNS event for send #1 to
   `webhookIngest.handle({event})` → send #1 `status:bounced`,
   `Suppression(hard_bounce)`, `bounceCount++`, `delivered` not counted.
2. Feed a **Complaint** event for send #2 → send #2 `status:complained`,
   `Suppression(complaint)`, `unsubscribeCount++`.
3. (Optional) **Transient bounce** ×5 on a third address → `softBounceCount`
   climbs, suppression promoted at the ≥5 threshold (`soft_bounce_threshold`).
4. **Re-fanout** the same campaign (status reset to `queued`) → both bounced and
   complained addresses are excluded (suppression filter), `recipientCount`
   drops accordingly.

**Security note carried from the send plan:** the webhook *route*
(`/api/webhooks/ses`) SNS signature verification is a `TODO(real)` stub — these
journeys drive the *handler* directly. The route-level authenticity gate (real
mode rejects unsigned / non-AWS payloads) must be tested separately AND the real
crypto verify must land before real SES (README blocker #3).

---

## 3. Campaign lifecycle — edit / rename / duplicate / delete with status guards

**Type:** Playwright (UI) over a seeded org; corroborated by the server
status-guard matrix (campaigns plan §3.2). Requires the org fixture.

**Preconditions:** org with campaigns staged at differing statuses
(`draft`, `scheduled`, `sending`, `sent`, `archived`) via cloud calls in setup.

| # | Page | Action | Observable outcome |
|---|---|---|---|
| 1 | `/app/campaigns` | Load | KPI strip + rows render; status tabs filter correctly. |
| 2 | row kebab (draft) | Open menu | All actions present (Edit, Rename, Duplicate, Archive, Delete). |
| 3 | row kebab (sent) | Open menu | No Edit/Rename; Duplicate + Archive + **soft** Delete present; delete copy reads "Archive this campaign?". |
| 4 | row kebab (sending) | Open menu | **Only** Duplicate (edit/rename/archive/delete all forbidden). |
| 5 | Rename modal (draft) | Blank name → confirm | Inline "Name can't be empty."; no cloud call. Valid name → optimistic row update. |
| 6 | Duplicate (any status) | Confirm | New `"<name> (copy)"` draft row appears; body deep-cloned; sent-only stats dropped. |
| 7 | Delete (draft) | Confirm | Row hard-removed. Delete (sent) → soft-archives (row leaves the list, still exists archived). |

**Data:** one duplicated draft; one renamed campaign; one deleted/archived
campaign. All guard rejections are owned at the server layer (CR-* in the
campaigns plan); this journey proves the UI *gates the menu* so a forbidden op
can't be initiated.

---

## 4. Reports demo dismiss + auto-vanish

**Type:** Playwright, P1. Requires the org fixture (or runs in the fresh-user
zero-state, which holds for an org-less user too for the demo half).

1. Fresh org, `/app/reports` → **demo mode**: onboarding card + "Sample" pills on
   all four widgets; no real rows.
2. Click **"Dismiss sample data"** → onboarding unmounts; widgets show real
   (empty) states; `localStorage["reports_demo_dismissed"]==="1"`.
3. `page.reload()` → demo stays gone on first paint (no flash).
4. Separately (fresh org, not dismissed): seed a `sent` campaign + counters via
   REST, revisit `/app/reports` → demo **auto-vanishes** without a dismiss
   (`hasRealData` wins); real campaign row + numbers shown, no "Sample" pills.

**Data:** localStorage dismiss flag; one seeded sent campaign for the auto-vanish
half.

---

## 5. Cross-tenant isolation walk (org B never sees org A's data, anywhere)

**Type:** Playwright walk, P0, backed by per-surface integration isolation
cases. Two orgs (A and B) via the org fixture, each seeded with its own audience,
contacts, segment, campaign, template, sender identity.

Walk org B through every surface and assert **none of A's data appears**:

| Surface | Assert for org B |
|---|---|
| `/app/dashboard` | KPIs/onboarding reflect B's state only; A's counts absent. |
| `/app/audiences` + `/[id]` | Only B's audiences/contacts; B cannot open A's audience id (redirect/empty/not-found). |
| `/app/audiences/fields` | Only B's custom fields; B may reuse A's field key (per-org uniqueness). |
| `/app/segments` | Only B's segments; B cannot open/eval A's segment id. |
| `/app/campaigns` | Only B's campaigns; opening A's campaign id → not-found. |
| `/app/templates` | System library shared (49); B's "Saved by me" excludes A's org templates; B cannot fork A's org template. |
| `/app/reports` | B's reports only; A's campaignId → not-found on report/links/recipients. |
| `/app/settings/senders` | Only B's senders; B cannot verify/delete A's sender (OBJECT_NOT_FOUND). |

**Why a walk and not just server tests:** server tests prove the ACL boundary
per-function. This journey proves the *UI never surfaces a cross-org id* anywhere
a user can reach, which is the boundary that actually leaks if a page forgets to
org-scope a query. Server-layer corroboration: INT-05/14 (auth), A-15/T-*,
TI-*, CR-07/14/35/36, RPT-T01-04, TEN-01-04, TPL-T01-03.

---

## 6. Tooling & how to run

| Layer | Tool | Env | Command |
|---|---|---|---|
| Unit / lib | Vitest | node | `npm test` (`vitest run`) |
| Integration (cloud + job handlers) | Vitest + `startTestParseServer` | node, in-memory Mongo | `npm test` |
| Component (SFC) | Vitest + happy-dom | `// @vitest-environment happy-dom` header | `npm test` |
| Browser E2E | Playwright | dev stack (`npm run dev`) + dev Mongo | `npm run e2e` |

Notes:
- `npm test` = `vitest run`; `npm run test:watch` for watch mode. Vitest config
  **excludes** `tests/e2e/**` so the two runners never collide.
- `npm run e2e` = `playwright test`; `npm run e2e:headed` to watch; first run
  needs `npm run e2e:install` (chromium). `webServer` boots `npm run dev`
  automatically (120s headroom) and reuses a running dev server locally; CI gets
  a fresh boot. Single worker — dev Mongo is shared.
- **Node 20 only.** Source nvm + `nvm use 20` before any command; system Node 14
  breaks installs and the Parse SDK silently.
- Mock SES is the default (`AWS_SES_MODE` unset). The wired send journeys assert
  against the `MockSentMessage` outbox; real SES is never exercised in CI.
- The two browser-journey blockers (org fixture, `@vitejs/plugin-vue` for
  component tests) are tracked in `README.md` — most of §1, §3, §4, §5 are
  blocked until the org-provisioning fixture lands.
