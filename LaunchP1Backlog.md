# Gorilla — Launch P1 Backlog & Plan

Status: **authored 2026-06-01.** Companion to `LaunchReadiness.md`. The launch-
blocking **P0s are fixed** (see PR "fix: launch-blocker P0s") — tests are green
(901 pass), CI is in place, the CSV file-read hole is closed, the unverified-
domain send guard + real unique indexes + fail-hard prod config are in, and the
app now has health/liveness + stuck-campaign recovery.

This doc tracks the **P1s**: not launch-blocking, but each must be closed before
we put *real paying customers* on the shared sending domain. They came out of the
three-track launch audit (send-pipeline, security, ops/frontend/legal). Ordered
into four phases by dependency and leverage.

The one remaining **P0 is external**: the live-AWS SES end-to-end proof
(`LaunchReadiness.md` §1) — gated on AWS production access (~24h). Request it day
zero; it unblocks Phase A's real verification.

---

## Phase A — Send-safety & deliverability  *(highest leverage; do first)*

These protect the shared domain's reputation and prevent double/runaway sends the
moment real SES is live. Effort: ~1–1.5 weeks.

### A1. Per-tenant rate limiting + SES send-rate backpressure
- **Impact.** Fanout fires up to 50 concurrent sends with no pacing or respect
  for SES `MaxSendRate`; an unwarmed account throttles and those become silent
  `failed` rows → message loss + reputation damage.
- **Where.** `server/worker/jobs/sendEmail.js` (concurrency 50), `campaignFanout.js`.
- **Fix.** Implement the Sending.md §6/§13 Mongo token-bucket (`acquireTenantSlot`);
  cap send concurrency to the account's `MaxSendRate` (call `getSendQuota` once,
  cache); on a throttle error reschedule the job instead of failing it.
- **Effort.** ~3 days. **Tests:** bucket refill math; throttle → reschedule not fail.

### A2. Agenda retry policy (attempts + exponential backoff)
- **Impact.** No `attempts`/`backoff` on any `agenda.define` → failed sends retry
  on default lock-expiry cadence (or not at all), no max-attempt ceiling.
- **Where.** all `agenda.define(...)` in `server/worker/jobs/*`.
- **Fix.** Set `{ attempts: 3, backoff: { type: 'exponential' } }` (or equivalent
  Agenda config) on send/fanout/webhook jobs; dead-letter after the ceiling.
- **Effort.** ~0.5 day. **Tests:** transient error retried N times then dead-lettered.

### A3. Monthly send-count reset
- **Impact.** `monthlySendCount` is set to 0 only at org creation and incremented
  forever — no reset. After month one the cap silently misbehaves and the
  complaint/bounce auto-pause math (which divides by it) drifts.
- **Where.** `server/cloud/organizations.js:94`, `campaignFanout.js:120`.
- **Fix.** Store the counter's period (`sendCountPeriod = YYYY-MM`); on send/fanout
  reset to 0 when the period rolls over; check the cap atomically at send time.
- **Effort.** ~1 day. **Tests:** rollover resets; cap enforced atomically.

### A4. Close the double-send window on worker crash
- **Impact.** A row is set `sent` *after* the SES call returns; a crash between
  SES accepting and the save leaves it `queued` → re-sent on restart. The new
  unique `sesMessageId` index narrows but doesn't fully close this.
- **Where.** `server/worker/jobs/sendEmail.js:135`.
- **Fix.** Write a `sending` sentinel (with attempt id) before the SES call;
  on retry, detect an in-flight/just-sent row and reconcile via `sesMessageId`
  instead of re-sending.
- **Effort.** ~1 day. **Tests:** simulated crash-then-retry sends once.

### A5. Global shared-domain reputation monitor
- **Impact.** Auto-pause is per-org and gated at ≥1,000 lifetime sends — many
  tenants each just under 0.1%, or a 500-address bad actor during pilot, can
  still torch `send.gorilla.email` for everyone. (Sending.md §16.)
- **Where.** `server/worker/jobs/webhookIngest.js:155–197` (+ a new monitor job).
- **Fix.** A periodic job computing the *aggregate* trailing-window complaint/
  bounce rate across all tenants; alert under threshold, pause ALL sending above
  it; lower the per-org auto-pause floor or add an absolute-count trigger.
- **Effort.** ~2 days. **Tests:** aggregate-rate trip; absolute-count trip.

### A6. Classify real-SES errors (permanent vs transient)
- **Impact.** Bad-address (permanent) and throttle (transient) both surface as
  generic retryable errors → permanent failures retried blindly, throttles
  marked `failed`.
- **Where.** `server/lib/ses/real.js:74`.
- **Fix.** Map SDK error names; permanent → non-retryable + suppress; transient →
  reschedule (ties into A1/A2). **Effort.** ~0.5 day.

### A7. List-Unsubscribe `mailto:` + click-rewrite hardening
- **Impact.** `List-Unsubscribe` emits only the HTTPS URI (Gmail/Yahoo bulk rules
  prefer the `mailto:` fallback); the click-rewrite regex misses unquoted hrefs
  and doesn't bound the redirect target.
- **Where.** `server/lib/renderEmail.js:75–124`.
- **Fix.** Add the `mailto:` variant; allowlist redirect scheme to http(s);
  consider a real HTML parser for link rewriting. **Effort.** ~1 day.

---

## Phase B — Security hardening  *(quick, high-value; can run parallel to A)*

Effort: ~2–3 days total.

### B1. CSV temp-file cleanup + MIME gating
- **Impact.** Uploaded CSVs (≤100MB, full of PII) are never deleted → disk DoS +
  retention problem; any file type is accepted and written before validation.
- **Where.** `server/worker/jobs/importCsv.js` (no unlink), `server/routes/imports.js:126`.
- **Fix.** `fs.unlink` in a `finally` after the job; sweep orphans; validate
  content-type/extension on upload. **Effort.** ~0.5 day.

### B2. Enforce SNS signature verification by environment, not SES mode
- **Impact.** `routes/webhooks.js` skips signature verification whenever
  `AWS_SES_MODE !== "real"` — a prod instance misconfigured to mock/smtp would
  accept forged bounce/complaint events → forced suppressions, poisoned stats.
- **Where.** `server/routes/webhooks.js:153–166`.
- **Fix.** Gate enforcement on `NODE_ENV === "production"` (the crypto path is
  already correct); hard-fail boot if prod runs with an unsigned-webhook mode.
- **Effort.** ~0.5 day. **Tests:** prod + unsigned → 403.

### B3. Validate `Form.redirectUrl` (open redirect)
- **Impact.** `redirectUrl` is stored unvalidated and `res.redirect(302, …)`'d
  verbatim → phishing redirect from our domain.
- **Where.** `server/cloud/forms.js:93`, `server/routes/forms.js:534`.
- **Fix.** Validate to absolute http(s) at write; consider same-origin/interstitial.
- **Effort.** ~0.5 day.

### B4. CORS lockdown + encrypt `StoreConnection.accessToken`
- **Impact.** Parse defaults CORS to `*` on a multi-tenant data API;
  OAuth access tokens are stored plaintext in Mongo.
- **Where.** Parse config (`server/index.js`), `bootstrapSchemas.js:493`.
- **Fix.** Restrict `allowOrigin` to the app origin (or only front via the Nitro
  proxy + block direct :8080); encrypt `accessToken` at rest. **Effort.** ~1 day.

### B5. Explicit `ALLOW_CLIENT_CLASS_CREATION` flag
- **Impact.** `allowClientClassCreation` is keyed solely on `NODE_ENV` — a direct
  `node server/index.js` in prod without that export gets permissive class creation.
- **Where.** `server/index.js:33`.
- **Fix.** Drive from an explicit env flag defaulting to false. **Effort.** ~0.5 day.

---

## Phase C — Compliance & data lifecycle  *(legal exposure; before paid GA)*

Effort: ~3–4 days.

### C1. Enforce CAN-SPAM physical address at send time
- **Impact.** The postal address is only prompted in the editor UI; automation-
  recipe emails ship with none, and an API/automation send or a cleared footer
  goes out without the legally-required address.
- **Where.** `server/worker/jobs/sendEmail.js:110`, `server/cloud/lib/automationRecipes.js:27`.
- **Fix.** Inject `Organization.address` into every commercial send (mirror the
  unsubscribe guarantee) or reject a send whose body lacks one. **Effort.** ~1.5 days.

### C2. Account deletion + data export (GDPR)
- **Impact.** Only per-contact erasure exists. No org-level export or account
  deletion → GDPR controller obligations (portability + account erasure) unmet.
- **Where.** new cloud fns (no `deleteAccount`/`exportData` today).
- **Fix.** Org-scoped export (contacts/campaigns/reports → CSV/JSON) + a cascading
  account-deletion fn across all per-tenant classes. **Effort.** ~2 days.

---

## Phase D — Ops, observability & quality  *(operational confidence)*

Effort: ~3–4 days.

### D1. Error tracking + structured logging
- **Impact.** No Sentry/pino for either process; prod errors vanish unless someone
  tails pm2. A campaign that fails *every* send produces no operator signal.
- **Fix.** Sentry (server + worker) + a JSON logger; alert on send-failure spikes.
- **Effort.** ~1 day.

### D2. Move index builds to an out-of-band migration
- **Impact.** The Parse-side `bootstrapSchemas` still swallows index-build failures
  (`:81`); on a populated DB a unique build that fails leaves a false sense of a
  constraint. (The new `uniqueIndexes.js` already logs loudly; this finishes the job.)
- **Fix.** A deliberate `npm run migrate:indexes` step run before flipping
  `allowClientClassCreation` off; treat unique-build failure as a hard migration
  error. **Effort.** ~1 day.

### D3. Lint + typecheck gate in CI
- **Impact.** No ESLint/tsconfig check; `lang="ts"` pages are never typechecked.
- **Fix.** Add ESLint + `nuxi typecheck` to the CI job (the workflow already
  exists from the P0 PR). **Effort.** ~1 day (plus fixing what it surfaces).

### D4. Mongo backup/restore runbook
- **Impact.** No documented or automated backup strategy.
- **Fix.** Automate `mongodump` (or managed-Mongo PITR) + a tested restore runbook.
- **Effort.** ~0.5 day.

### D5. `pages/pricing.vue` onto the shared marketing layout
- **Impact.** Pricing isn't on `layouts/marketing.vue` — 15 dead `href="#"`
  nav/footer links while the real prerendered routes exist (~470 dup CSS lines).
- **Fix.** `definePageMeta({ layout: "marketing" })`; delete inline nav/footer.
- **Effort.** ~0.5 day.

---

## Suggested sequencing

```
Week 1   A1 A2 A3 A4 A6 (send-safety core)   ║ B1 B2 B3 (security quick wins, parallel)
Week 2   A5 A7  ║ C1 (CAN-SPAM)  ║ B4 B5      ║ D1 (Sentry) early so Week-2 work is observable
Week 3   C2 (GDPR)  ║ D2 D3 D4 D5  ║ + live-AWS proof verification (once SES prod access lands)
```

Phase A is the gate for safely turning real SES on. B is cheap and parallel. C
is the legal gate for charging money. D is the operational confidence layer.
Each item lands as its own small PR with tests; CI (from the P0 PR) keeps `main`
green throughout.
