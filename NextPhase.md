# Gorilla — Next Phase Plan (Growth, Engagement, Retention)

Status: **draft / in progress** — authored 2026-05-30. Supersedes nothing; complements
`Features.md` (MVP catalog), `Sending.md` (send pipeline), `Architecture.md` (system design).

This document is the build plan for the phase **after** the send pipeline. It is organized
around three growth levers the current product cannot yet move:

- **Adoption** — getting a marketer from signup to a real, growing audience.
- **Engagement** — getting them to send more, and more effectively.
- **Retention** — giving them recurring, automatic value so they don't churn.

---

## 1. Audit — where we are (2026-05-30)

The product **sends email end-to-end** through a mock-SES pipeline, is fully multi-tenant,
and has a real (non-mock) data layer behind every app page. ~750 tests across server,
component, and E2E layers are green.

### What's solid

| Area | State |
|---|---|
| Multi-tenant foundation | Org + role-ACL auto-stamp on every class via `registerBeforeSave` registry. Solid. |
| Audiences / Contacts | Full CRUD, custom fields, bulk add, soft + GDPR hard delete, denormalized counts. |
| Segments | Rule-tree builder UI + persistence. **Evaluation is a stub** (returns count 0). |
| Templates | 49 system templates, gallery, fork-to-campaign, save-as-template. |
| Editor | Block → MJML → HTML compile on save (`compiledHtml`). Test-send + send wired. |
| Send pipeline | Fanout → per-recipient `sendEmail` → SES adapter → webhook ingest. Mock-first. |
| Tracking | Open pixel, click redirect, one-click unsubscribe, all HMAC-signed. |
| Reports | Real org aggregations + honest empty/demo state until first send. |

### Gaps found in the audit (the backlog this plan attacks)

**Correctness / quick wins (cheap, do first):**
1. **Campaign status never flips `sending` → `sent`.** `sendEmail` marks each `CampaignSend`
   sent and bumps `Campaign.sentCount`, but the campaign is stuck in `sending` forever.
2. **No pause/resume.** `paused` status exists in schema + `EDITABLE_STATUSES` but no cloud
   function transitions to/from it.
3. **Scheduling UI not wired.** `scheduleSend` accepts future ISO timestamps; the editor has
   no date/time picker to produce one.
4. **Reports CSV export is an empty stub** (`onExport()` no-op).
5. **`evaluateSegment` is a stub** — segments can't actually target a send.

**Track A — Data-in / Growth (Adoption):**
- **CSV import is a stub** (`importContactsCsv` throws `COMMAND_UNAVAILABLE`). No way to
  onboard an existing list. This is the single biggest adoption blocker.
- **No signup forms.** There is no way to *grow* a list — no hosted form, no embed snippet,
  no submission handler. The top of the funnel does not exist.

**Track B — Automations / Journeys (Engagement + Retention):**
- **No automations/journeys.** Template copy references an "automation canvas" but there is
  no backend, no trigger model, no enrollment runner. This is the #1 retention lever in email
  marketing (welcome series, drip sequences) and the product has none.
- **No A/B testing** (deferred — see §6, lower priority than automations).

**Track C — Real delivery + trust (gates real adoption):**
- **Sender/domain verification is a stub** (`verifySenderIdentity` just flips status). No real
  DKIM/SPF/DMARC checks. Settings has no Domains page.
- **Rate limiting + send caps are unenforced** (`monthlySendCap`/`monthlySendCount` fields
  exist, no logic). Critical because of the shared sending domain — one bad tenant poisons it.
- **No complaint-rate auto-pause / abuse controls.**
- **No Suppression management UI** (settings page missing).
- **Real SES** path exists but unverified end-to-end (needs AWS account + SNS + config set).

**Test gaps:** worker jobs tested only indirectly; thin Nuxt composable/middleware coverage;
campaign-editor UI under-tested. Addressed inline per feature below.

---

## 2. Priority & sequencing

User selected tracks **A, B, and C** (D — A/B testing / AI — deferred). Recommended order:

```
Phase 0  Quick wins / correctness        (~2–3 days)   ← unblocks honest demos
Phase A  Data-in: CSV import + Forms      (~2 weeks)    ← adoption foundation
Phase C  Delivery trust (subset)          (~1.5 weeks)  ← can overlap A; gates real sends
Phase B  Automations / journeys           (~3 weeks)    ← biggest retention lever, built last
                                                          because it consumes A (enrollment
                                                          sources) and C (reliable sending)
```

Rationale: you cannot **retain or engage** users who can't get an audience **in** (import) or
**grow** one (forms). So A is the floor. C's cheap, high-leverage pieces (rate-limit enforcement,
suppression UI) slot in early because the shared domain makes abuse a present risk. B is the
highest-value feature but depends on A and C existing, so it goes last.

---

## 3. Phase 0 — Quick wins (correctness)

Each is small, contained, and removes an embarrassment from a live demo.

### 0.1 Auto-flip campaign `sending` → `sent`
- **Where:** when the last `CampaignSend` for a campaign reaches a terminal state. Cleanest
  implementation: after each `sendEmail` job + each `webhookIngest` terminal event, check
  `pending = recipientCount - (sent+failed+bounced+...)`; when 0, set `Campaign.status="sent"`,
  stamp `sentAt`. Guard with a conditional update so it fires exactly once.
- Alternative (simpler, less precise): a fanout-tail job that, when it finishes enqueuing all
  sends, waits and reconciles. Prefer the counter-driven approach.
- **Tests:** fanout with N recipients → all sent → status `sent`, `sentAt` set; partial failure
  still terminates; idempotent (no double-flip).

### 0.2 Pause / resume
- Cloud fns `pauseCampaign` / `resumeCampaign`: `sending → paused` (worker checks status and
  bails before SES call) and `paused → sending` (re-enqueue remaining `queued` CampaignSends).
- Editor/campaign-list action + tests.

### 0.3 Scheduling UI
- Date/time picker in the editor pre-flight that produces an ISO timestamp in the org timezone,
  passed to existing `scheduleSend`. Show scheduled badge + "cancel schedule" (already exists).

### 0.4 Reports CSV export
- Wire `onExport()` to a cloud fn `exportCampaignRecipients` streaming CSV (email, status,
  delivered/opened/clicked, bounce reason). Reuse `getCampaignRecipients` query.

### 0.5 Segment evaluation (real)
- Implement the rule-tree → Parse query compiler (`Architecture.md §5.2`) so `evaluateSegment`
  returns true counts and fanout can target a segment, not just a whole list. Required before
  segments are usable as automation/campaign audiences.

---

## 4. Phase A — Data-in (Adoption)

### A1. CSV contact import (F-07, finish the stub)
- **Backend:** `ImportJob` class; `startContactImport({listId, mapping, consent})` enqueues an
  `import-csv` Agenda job; streamed parse (no full-file buffer); per-row lowercase/trim/validate;
  suppression check; upsert `Contact` on `(org,email)` (merge customFields, append list, keep
  existing status); per-row counter `$inc`; first-100 errors captured; `errors.csv` regenerated
  on demand. Upload via multer disk storage to `/tmp/<jobId>.csv`.
- **Frontend:** import wizard on the audience page — upload → column-map (first 5 rows) →
  consent step (F-29) → live progress (LiveQuery on `ImportJob`) → summary
  (`imported/updated/skipped/invalid`) with error download.
- **Tests:** mapping, dedupe-within-file, dedupe-vs-existing, suppression skip, malformed-email
  reject, BOM handling, counter accuracy.

### A2. Signup forms (NEW — top of funnel)
- **Data model:** `Form` (org, name, fields[], targetList, doubleOptIn, redirectUrl, styling),
  `FormSubmission` (audit). 
- **Public render + submit:** Express route `GET /f/:formId` (server-rendered, JS-optional) and
  `POST /f/:formId` → validate → create/merge `Contact` with `consent={source:"signup_form"}`;
  if `doubleOptIn`, set status `pending` + send confirmation email with HMAC token, confirm via
  `GET /f/confirm/:token` → `subscribed`. Honeypot + rate-limit for spam.
- **Embed:** a one-line `<script>` snippet that injects the hosted form as an iframe, plus raw
  HTML embed option.
- **Frontend:** form builder under `/app/forms` (list + builder), field picker bound to the
  list's custom fields, live preview, embed-code modal.
- **Tests:** submit creates subscribed contact; double-opt-in flow; honeypot rejects; merge with
  existing contact; consent stamped.

**Why these two together:** import brings the *existing* list in; forms grow it organically.
Together they make the audience real, which every other feature depends on.

---

## 5. Phase C — Delivery trust (gates real adoption)

Build the cheap, high-leverage pieces now; defer dedicated-IP/DMARC-parsing.

### C1. Rate limiting + send-cap enforcement
- At fanout: `monthlySendCount + recipients <= monthlySendCap` guard; per-org token-bucket
  (Mongo-backed, per `Sending.md`) on `sendEmail` so one tenant can't burst the shared domain.
  Surface cap state on the dashboard.

### C2. Complaint-rate auto-pause (abuse control)
- In `webhookIngest`, track rolling complaint/bounce rate per org; when complaint rate > 0.1%
  or hard-bounce rate > 5% over a window, auto-pause the org's in-flight campaigns and flag the
  org. Critical for a shared domain.

### C3. Suppression management UI
- `/app/settings/suppression`: list (email, reason, addedAt, campaign), search, manual add
  (paste/CSV), manual remove with audit row. Backend list/add/remove cloud fns (suppression
  data + auto-add already exist from the pipeline).

### C4. Real sender/domain verification
- `/app/settings/domains`: add domain → SES `CreateEmailIdentity` → display DKIM CNAMEs + SPF +
  DMARC guidance → `verifyDomain` polls DNS / SES identity status → flip `verified`. Block send
  from unverified `fromEmail`. Replaces the `verifySenderIdentity` stub with real checks.
- **Real SES wire-up:** runbook for AWS account, `AWS_SES_MODE=real`, SNS topic → 
  `/api/webhooks/ses` subscription, configuration set with event publishing. Keep mock as the
  dev/test default.

### C5. Deliverability widget
- Dashboard tile: send quota used, bounce rate, complaint rate, domain auth status.

---

## 6. Phase B — Automations / Journeys (Retention + Engagement)

The big one. A visual journey builder where a contact is enrolled by a trigger and walked
through steps (send / wait / branch) over time. This is what makes the product *sticky*.

### B1. Data model
- `Automation` (org, name, status: draft|active|paused, trigger, stats).
- `AutomationStep` (automation, type, config, nextStepId / branch targets) — ordered/linked.
- `AutomationEnrollment` (automation, contact, currentStepId, status: active|completed|exited,
  nextRunAt) — one per enrolled contact.

### B2. Triggers
- `contact_added_to_list`, `form_submission` (ties to A2), `date_field` (e.g. birthday/anniv),
  `manual`, and `api`. Trigger fires → create `AutomationEnrollment` at step 0.
  Hook into `Contact.afterSave` and the form submit handler.

### B3. Step types
- **Send email** (reuse the render + SES path, single-recipient).
- **Wait** (delay N hours/days → set `nextRunAt`).
- **Branch** (condition on opened/clicked previous step, or contact field) → two next steps.
- **Exit / goal**.

### B4. Enrollment runner
- Agenda repeat job (e.g. every 60s) selects `AutomationEnrollment` where
  `status=active AND nextRunAt<=now`, executes the current step, advances `currentStepId` /
  `nextRunAt`. Idempotent; concurrency-safe via per-enrollment locking.

### B5. UI
- `/app/automations`: list + status toggles.
- Builder canvas: linear-first (welcome series), branch support second. Step inspector reuses
  editor pieces for the email step.
- **Pre-built recipes:** "Welcome series" (3 emails), "Re-engagement", "Post-signup" — one-click
  install so a new user gets value in minutes (engagement + adoption multiplier).

### B6. Reporting
- Per-automation: enrolled, completed, per-step open/click, drop-off. Reuse `EmailEvent`.

**Tests:** enrollment on trigger; wait advances at `nextRunAt`; branch routing; runner
idempotency; pause halts enrollments; recipe install builds correct step graph.

---

## 7. Explicitly deferred (Track D and beyond)

- A/B testing & multivariate, AI subject/content assistance, send-time optimization,
  preference center (granular topics), dedicated IPs, DMARC report parsing, integrations
  marketplace, billing/paywall. Revisit after A+B+C land and the growth loop is proven.

---

## 8. Cross-cutting

- Every new per-tenant class goes through `registerBeforeSave` for org+ACL stamping.
- Mock-first for anything touching AWS, so A and B aren't blocked on real SES.
- Each feature ships with server tests + at least one component/E2E happy path.
- Convert Architecture.md's Postmark/BullMQ references to SES/Agenda where touched (debt).
