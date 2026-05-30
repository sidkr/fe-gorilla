# Gorilla — Launch Readiness Plan

Status: **plan / pre-implementation** — authored 2026-05-30. This is the gate
between "MVP-complete application" and "service that can safely onboard a paying
customer." Companion to `NextPhase.md` (which delivered the features). Nothing
here is built yet; this sequences the work and defines done.

The product **logic** is green (814 tests). The product **as a service** is
unproven because the entire send path has only ever run on the mock SES adapter.
These six workstreams close that gap, in dependency order.

```
1  Real SES wire-up + delivery proof        ← THE blocker; everything follows
2  Security review of the new surface        ← can run parallel to 1
3  Unverified-domain send guard              ← small; depends on 1's domain model
4  Manual smoke test of new UI               ← needs 1 (real send) for full value
5  CI + schema-bootstrap-on-real-DB          ← independent; do early to protect 1–4
6  Controlled pilot: warmup + monitoring     ← last; depends on all above
```

Recommended execution: start **1 and 5 together** (5 protects everything else),
run **2** in parallel, then **3 → 4 → 6**.

---

## 1. Real AWS SES wire-up + end-to-end delivery proof  **[BLOCKER]**

**Goal.** A real campaign sends from `send.gorilla.email`, lands in a real inbox,
and a real bounce + complaint round-trip back through the webhook into
suppression + auto-pause. Until this happens the core product is unproven.

**Prerequisites (human, not code — gate the rest):**
- AWS account with billing.
- **SES production access** requested + granted (sandbox only sends to verified
  addresses; approval can take ~24h — request this FIRST, day zero).
- DNS control for `send.gorilla.email`.

**Work:**
1. **DNS authentication** on `send.gorilla.email`: DKIM (SES-issued CNAMEs),
   SPF (`include:amazonses.com`), DMARC (`p=none` to start, monitoring mailbox).
   Verify all three resolve + SES shows the identity "verified".
2. **SES configuration set** with event publishing → SNS topic for
   Delivery / Bounce / Complaint (+ optionally Send/Reject).
3. **SNS → webhook**: subscribe the topic to `POST /api/webhooks/ses`; confirm
   the `SubscriptionConfirmation` handshake works against the deployed URL (the
   route already handles it). Verify SNS signature validation passes with real
   AWS payloads (it was only tested with synthesized ones).
4. **Env wiring**: set `AWS_SES_MODE=real`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`,
   `AWS_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET`, `PUBLIC_BASE_URL` (public
   origin for tracking/unsub links) in `server/.env`. IAM user scoped to
   `ses:SendEmail` + nothing else.
5. **Live proof run** (the actual exit criterion):
   - Test-send to a personal inbox → renders correctly, DKIM/SPF/DMARC **pass**
     (check Gmail "show original").
   - Real 2–3 recipient campaign → all reach `sent`, `sesMessageId` stored.
   - Force a **bounce** (AWS `bounce@simulator.amazonses.com`) → webhook ingests
     → CampaignSend `bounced`, Suppression row written, counters bump.
   - Force a **complaint** (`complaint@simulator.amazonses.com`) → suppression +
     `unsubscribeCount` bump; confirm auto-pause math triggers at threshold.
   - Click the tracked links + open pixel from a real client → EmailEvent rows.

**Exit criterion.** A real inbox receives a DKIM-signed campaign email, a
simulated bounce and complaint both round-trip into suppression, and tracking
events appear in the report. Mock stays the dev/test default (flip by env only).

**Risks.** SES production-access denial/delay; DNS propagation lag; SNS
signature-cert URL validation edge cases.

---

## 2. Security review of the new public attack surface

**Goal.** No exploitable hole in the unauthenticated surface this PR added.

**Scope (highest risk first):**
- `POST /f/:formId` (signup form submit) — creates a `Contact` with **no
  session**. Check: honeypot + rate-limit actually bite; org resolved only from
  the Form row (no IDOR to other orgs); email validation; no stored-XSS via
  field values rendered back on the thank-you/confirm page; submission flooding.
- `POST /api/imports/upload` (multipart) — file-size cap enforced server-side;
  MIME/type checks; temp-file path traversal; the `filePath` token can't be
  pointed at an arbitrary file by a later `startContactImport`; cleanup of temp
  files; session-gating.
- `GET /f/:id/embed.js` + hosted form HTML — no reflected XSS, correct
  `Content-Type`, no secret leakage.
- Tracking/unsub (`/t/*`, `/u/*`) + `/api/webhooks/ses` — HMAC/signature
  verification can't be bypassed; open-redirect check on click tracking.
- Tenancy: every new cloud fn (imports, forms, automations, suppression,
  domains) enforces `organization` scoping — spot-check cross-tenant access.

**Work:** run the repo's `/security-review` on the branch, triage findings,
fix anything ≥ medium, re-review.

**Exit criterion.** `/security-review` returns no unresolved high/medium finding
on the new surface; cross-tenant access attempts on each new cloud fn fail.

---

## 3. Unverified-domain send guard

**Goal.** A campaign can't send from a custom domain the org hasn't verified,
**without** breaking the MVP shared-domain (`send.gorilla.email`) flow.

**Work:** in `scheduleSend` (so the error is synchronous, covering now +
scheduled), after the existing `fromEmail` check: if the `fromEmail` domain is
the shared sending domain → allow. Else look up a `SendingDomain` for the org +
that domain with `status === "verified"`; if absent → throw a clear
`OPERATION_FORBIDDEN` ("Verify this domain under Settings → Domains first").
(Agent C supplied a blanket-block snippet earlier — this is the scoped version.)

**Tests:** shared-domain send still allowed; custom unverified domain blocked
with the right message; custom verified domain allowed. Add to
`tests/server/sending.test.ts`.

**Exit criterion.** The three cases pass; full suite still green.

---

## 4. Manual smoke test of the new UI in a running app

**Goal.** The new flows actually work in the browser, not just in unit tests.

**Setup:** boot the dev stack on the alt ports (web :3001 + API :8090, per the
operational notes), Node 20.

**Click-through checklist (each must complete without console errors):**
- CSV import: upload → column-map → consent → progress → summary + errors.csv.
- Signup form: build → preview → grab embed → submit the public `/f/:id` →
  contact appears; double-opt-in confirm flow.
- Automations: install Welcome-series recipe → builder renders the step graph →
  activate; manually enroll a contact → step advances.
- Settings → Domains: add a domain → records shown → verify.
- Settings → Suppression: manual add → search → remove.
- Pause/resume a sending campaign; schedule a campaign via the date picker;
  export a report CSV.
- Regression: dashboard, campaigns, audiences, segments, templates still load;
  sidebar nav (incl. new Forms + Automations entries) works.

**Work:** drive it (the `/verify` or `/run` skill can launch + screenshot).
File any defect found; fix before pilot.

**Exit criterion.** Every checklist item completes in a real browser session;
screenshots captured; zero uncaught console errors on the happy paths.

---

## 5. CI + production-DB schema bootstrap verification

**Goal.** Automated guard so "green" is enforced on every change, and confidence
that startup won't corrupt/abort against a real database.

**Work:**
- **CI**: GitHub Actions workflow — Node 20, `npm ci`, `npm test` (vitest) on
  PR + push. (E2E/Playwright optional in CI now; note it needs Mongo.) Make the
  check required on `main`.
- **Schema bootstrap**: run `bootstrapSchemas` against a Mongo with the
  *existing* (pre-this-PR) schema to confirm the 8 new classes + new fields +
  indexes get added idempotently, twice in a row, with no error and no
  destructive change. Document the run.

**Exit criterion.** CI is green on the PR and required on `main`; a documented
double-run of bootstrap against a populated DB is clean.

---

## 6. Controlled pilot — warmup + monitoring

**Goal.** Go live to a small, friendly set of users without torching the shared
domain's reputation.

**Work:**
- **Warmup plan**: start with low daily volume from `send.gorilla.email`, ramp
  over ~2 weeks; cap per-tenant during pilot; the existing monthly-cap +
  complaint-auto-pause are the safety net.
- **Monitoring/alerting**: dashboard + alerts on bounce rate, complaint rate
  (alert well under the 0.1% / 5% auto-pause thresholds), stuck-in-`sending`
  campaigns, worker liveness/queue depth, SES send-quota usage.
- **Deliverability watch**: seed-inbox / inbox-placement check across Gmail /
  Outlook / Yahoo; DMARC aggregate reports reviewed.
- **Pilot cohort**: a handful of internal/friendly orgs; explicit feedback loop;
  runbook for pausing a tenant or the whole queue.

**Exit criterion.** A pilot cohort sends real campaigns over a warmup ramp with
bounce/complaint rates inside safe bounds and no manual firefighting; monitoring
catches an injected fault (e.g. a forced bounce spike) and pages.

---

## Cross-cutting notes
- Keep **mock SES as the default** for dev/test forever; real is env-gated.
- Items 1, 2, 5 can run in parallel from day one (different surfaces, no code
  conflict). 3 is small. 4 needs 1 for full value. 6 is the finish line.
- No new framework/infra decisions required — this is wiring, hardening, and
  proving, not building.
