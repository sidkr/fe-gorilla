# DECISIONS.md

Engineering decision log. One entry per load-bearing choice. **Append, don't rewrite** — superseded decisions stay in the log with a `superseded by: #N` marker.

Each entry follows the same shape:

```
## #N — Short title (YYYY-MM-DD)

**Context.** What forced the decision.
**Options considered.** Brief list, with the trade-off that mattered.
**Choice.** What we went with.
**Why.** The actual reason, not the rationalization.
**Cost of changing later.** Low / Medium / High — and what it would take.
```

Entries are append-only and numbered. Reference them in commits (`see DECISIONS #7`) and in code comments where they explain a non-obvious choice.

---

## #1 — In-house glue + AWS SES (not full ESP, not full DIY) (2026-05-22)

**Context.** Need to deliver email. Three shapes: (a) full DIY MTA + warm our own IPs, (b) full ESP (Postmark / Resend) — pay them, they handle everything, (c) in-house platform glue + dumb SMTP transport.

**Options considered.**
- Full DIY MTA: 12–18 months before deliverability is competitive; permanent operational work; one missed DKIM rotation burns months of reputation rebuild.
- Full ESP (Postmark $1.25/1k, Resend similar): platform glue moat collapses to "the SMTP pipe"; ~12× more expensive at scale; once we have campaign-fanout + suppression + scheduling + analytics, ESP's value is gone and we'd be migrating off.
- In-house glue + SES ($0.10/1k): we own the moat (queue, fanout, tracking, suppression, abuse controls, reporting); SES handles only SMTP + IP warming + RBL avoidance + per-ISP feedback loops.

**Choice.** Option (c). In-house everything except the dumb SMTP pipe.

**Why.** Right balance for the team and stage. Owns what matters (platform glue = product moat), delegates what's permanent ops work (IP warming + RBL hygiene = AWS's job). Cheapest at any scale.

**Cost of changing later.** Low to swap SES for Postmark (just an adapter swap). High to add a full DIY MTA. So the asymmetry favors this direction.

Full rationale in `Sending.md` §1.

---

## #2 — Mongo + Agenda over Redis + BullMQ (2026-05-22)

**Context.** Need a queue for `campaign-fanout` + `send-email` + `webhook-ingest`. Two reasonable shapes.

**Options considered.**
- Redis + BullMQ: best-in-class for job queues. First-class per-job rate limiting (`groupKey`), excellent debugging via Bull Board, very high throughput.
- Mongo + Agenda: zero extra infrastructure (uses existing Mongo). Lower throughput. Per-tenant rate limiting requires hand-rolled Mongo token-bucket. Less mature tooling.

**Choice.** Mongo + Agenda.

**Why.** MVP-volume reality: sub-50k emails/day per tenant. Agenda's throughput is fine there. Avoids operating a Redis cluster (one fewer thing that pages someone at 3am). The throughput ceiling becomes a problem at scale — we accept that future cost.

**Cost of changing later.** Medium. Migrating queue infra means re-implementing rate-limiting + retries + handler bootstrapping. Not destructive but not trivial. Worth it if we hit Agenda's throughput wall.

Full rationale in `Sending.md` §6.

---

## #3 — Shared sending domain `send.gorilla.email` at MVP, BYO domain in Phase 3+ (2026-05-22)

**Context.** Every send needs a `From:` domain that's DKIM-signed and SPF-aligned. Two approaches: tenants bring their own domain (BYO) or all tenants ride a shared domain we own.

**Options considered.**
- BYO at MVP: tenants verify DNS records on their own domain. Industry best practice for deliverability. But: high-friction onboarding (DNS is intimidating), and we can't even *test* until DNS propagates.
- Shared at MVP: every tenant sends from `<friendlyname>@send.gorilla.email`. Instant onboarding. But: one bad tenant poisons the shared reputation for everyone.

**Choice.** Shared at MVP. BYO in Phase 3+.

**Why.** Onboarding friction kills early adoption. Defer DNS UX until we have customers who care about brand-domain sending. Compensate for shared-reputation risk with aggressive abuse controls (content scan, complaint-rate auto-pause; see `Sending.md` §15).

**Cost of changing later.** Low. BYO-domain is additive — existing shared-domain sends keep working.

---

## #4 — Per-org suppression scoping, not global (2026-05-22)

**Context.** Suppression list = emails that must never receive future sends. Should it be global across all tenants on the platform, or scoped per organization?

**Options considered.**
- Global: more conservative — one unsubscribe protects the user everywhere on the platform. Easier to reason about for compliance.
- Per-org: a user who unsubscribes from tenant A's marketing may still want tenant B's transactional. Matches user expectations of brand-vs-brand opt-in.

**Choice.** Per-org.

**Why.** Matches how users actually think about email subscriptions. Hard bounces and complaints still flow into the per-org list, so compliance is preserved within each tenant.

**Cost of changing later.** Low. Promoting per-org → global is a one-time data migration (`SELECT DISTINCT email FROM Suppression`).

---

## #5 — In-house open/click tracking, not SES tracking (2026-05-22)

**Context.** SES offers built-in open-pixel + click-rewriting via configuration sets. Or we can do it ourselves.

**Options considered.**
- SES tracking: zero implementation; data flows through SES → SNS → us. But: tracking URLs are `r.us-east-1.awstrack.me/...` which is widely blocked by privacy-conscious mail clients; less per-recipient detail; no HMAC signing.
- In-house: HMAC-signed tokens (`{ sendId, ts }` for opens, `{ sendId, originalUrl, ts }` for clicks). Endpoints at `/t/o/:token`, `/t/c/:token`. Per-link, per-recipient, geo-derivable. URLs are on our domain.

**Choice.** In-house.

**Why.** Better data. Better URLs (not on AWS's tracking domain that gets blocked). Token signing prevents abuse. SES tracking's URL pattern is a known deliverability liability.

**Cost of changing later.** Low — could swap to SES tracking by changing the HTML-rewrite step. The endpoint scaffolding is small.

Full rationale in `Sending.md` §10.

---

## #6 — Mock SES adapter first, real SES second (2026-05-29)

**Context.** Phase 1 of the send pipeline needs SES. Real SES requires (a) AWS account, (b) production-access approval from Amazon (24h), (c) DNS control on `send.gorilla.email`, (d) DKIM CNAME + SPF + DMARC verified. Worker + queue + fanout + suppression + tracking + webhook ingestion are blocked behind that approval if we wire real SES first.

**Options considered.**
- Real SES first: blocks all phases until AWS lands. Also makes tests fragile (real network, real cost).
- Mock SES adapter first: behind a `sesAdapter` interface. Mock writes "sent" messages to a `MockSentMessage` Mongo collection that tests can inspect. Real impl is `@aws-sdk/client-sesv2`. Swap is one env var: `AWS_SES_MODE=mock|real`.

**Choice.** Mock SES adapter first.

**Why.** Unblocks all 4 phases of build. Tests run hermetically (no AWS account, no network). When AWS lands, swap the env var. The adapter interface is small (3 methods: `sendEmail`, `verifyDomain`, `getSendQuota`).

**Cost of changing later.** Trivial — both implementations live in the codebase.

---

## #7 — Vitest + Playwright (no Jest, no Cypress) (2026-05-29)

**Context.** No test suite exists yet. Need to pick framework(s) and commit before agents start writing tests.

**Options considered.**
- Vitest only (unit + integration): faster delivery; manual QA for browser flows.
- Vitest + Playwright (full pyramid): unit + integration + E2E. One extra harness to maintain.
- Jest + Cypress: more mature/community, but Jest's ESM story is weaker than Vitest's, and Vitest is the Nuxt-native default.

**Choice.** Vitest + Playwright.

**Why.** Vitest is Nuxt 3's default story (`@nuxt/test-utils`), uses Vite for transform so no separate Babel config, ESM-native, fast. Playwright over Cypress: cross-browser, better debugging tools (codegen, trace viewer), no separate runtime to install. Send pipeline has too many silent-failure paths (webhook signature verification, suppression check, HMAC token verification) to skip tests entirely — and the editor → audience → send → report flow is exactly the kind of golden path E2E covers cheaply.

**Cost of changing later.** Low for Vitest (tests are mostly framework-agnostic with the `describe/it/expect` API). Medium for Playwright (specs are tied to its API surface).

---

## #8 — Repo on GitHub at `sidkr/fe-gorilla` (2026-05-29)

**Context.** Project needs a remote for backup + future CI + multi-machine work.

**Choice.** Single `main` branch on `github.com/sidkr/fe-gorilla`. SSH remote. No required-status-checks yet (no CI yet).

**Why.** Default branch is `main` (modern). SSH over HTTPS because the user has SSH keys configured. No PR enforcement during this solo-build phase — direct commits to `main` are fine.

**Cost of changing later.** Trivial (rename, mirror, fork).

---

## #9 — Canonical Parse class names (2026-05-29)

**Context.** Features.md and Architecture.md drifted on class names (e.g. `AudienceList`, `CampaignRecipient`, `SenderIdentity`). Five agents are about to build features on these classes; they need one canonical set.

**Choice.** The per-tenant classes are exactly:
`List`, `Contact`, `Segment`, `Campaign`, `Template`, `CampaignSend`, `EmailEvent`, `Suppression` — plus `Organization` (tenant root) and the built-in `_User` / `_Role`.

Features.md's `AudienceList` (→ `List`), `CampaignRecipient` (→ `CampaignSend`), and `SenderIdentity` (→ future `SendingDomain`) names are **superseded** by this entry.

**Why.** `List` matches the editor + `editor-types.ts`, which already reference `List`, and the editor already writes a `Campaign` object client-side. Keeping the names the code already uses avoids a rename churn across five agents.

**Cost of changing later.** Medium — a class rename is a data migration + every query. Locked now to avoid exactly that.

The canonical list is exported as `PER_TENANT_CLASSES` from `server/cloud/lib/tenancy.js`; bootstrap, stamping hooks, and CLPs all iterate that one array.

---

## #10 — Multi-tenant via Organization + role ACL + beforeSave stamping (2026-05-29)

**Context.** Multi-tenant from day one (Architecture.md §2.1). Need isolation that feature agents can't accidentally bypass and that requires zero per-feature boilerplate.

**Choice.** Three moving parts:
1. **`signUpWithOrg` cloud function** (`server/cloud/organizations.js`): the only signup path. While the caller is anonymous it creates the `_User`, an `Organization` (unique slug, `plan:"free"`, defaults), and a `_Role` named `org_<orgId>_members` containing the user; sets `user.organization` + `user.role="owner"`; returns a `sessionToken`. Best-effort cleanup if a step fails. Duplicate username/email → Parse.Error 202.
2. **`beforeSave` stamping** (`server/cloud/tenantHooks.js`): registered for every class in `PER_TENANT_CLASSES`. On NEW objects it requires an authenticated user (rejects anonymous), resolves their org, stamps the `organization` pointer if unset, and stamps an ACL granting r+w to `role:org_<orgId>_members` only (no public) if no explicit ACL was set. On UPDATES it leaves org/ACL alone and rejects moving a row to a different org. Master-key writes (workers) bypass the user requirement and may set org themselves.
3. **CLPs that disable public access** (`server/cloud/lib/bootstrapSchemas.js`): every per-tenant class requires authentication for all ops; row-level isolation is then the ACL's job. Bootstrap is idempotent and never crashes boot on a benign schema/index error.

**Why the editor needs no changes.** The editor creates a `Campaign` client-side as a logged-in user with no `organization`/ACL set. The `beforeSave` hook stamps both automatically, so the object is tenant-isolated without the editor knowing tenancy exists. Same for any feature cloud function: just create + save as the logged-in user; resolve the caller's org for explicit filters via `getUserOrg(request.user, { useMasterKey: true })`.

**Cost of changing later.** High — this is the isolation contract every class depends on. Designed to be the thing we don't change.

---

## #11 — Per-org custom-field registry + rich Contact (2026-05-29)

**Context.** Advanced segmentation and personalization need arbitrary, per-tenant data points (e.g. "Plan Tier", "Lifetime Value", "Signup Source") plus a richer set of standard contact attributes than the bare email/name we started with. The contact-capture form, the segment rule builder, and the editor merge-tag picker all need to agree on what data points exist and what type each one is — without each re-inventing a shape.

**Options considered.**
- Schemaless free-for-all: let any key land in `Contact.customFields`. No registry. Cheapest to write, but segments can't enumerate filterable fields, merge-tags can't be offered, and a typo'd key silently creates a phantom data point — no type coercion, no validation.
- Hardcoded standard fields only: add a fixed column set and stop. Covers the common case but not tenant-specific data (the whole point of advanced segments).
- Per-org `CustomField` registry + extended standard fields: a tenant-scoped registry of typed data-point definitions, plus first-class standard columns for the common attributes.

**Choice.** Option 3. A new per-tenant `CustomField` class (`{ key, label, type, enumValues, required, order }`, `type ∈ text|number|date|boolean|enum`, unique `(organization, key)`) is the org's data-point registry. Contact gains standard columns `company, phone, city, country, timezone, tags, consent` alongside the existing `customFields` Object bag for registry-defined values. Shared coercion/validation lives in `server/cloud/lib/customFields.js` (`slugifyKey`, `coerceValue`, `validateCustomFields`) so contacts.* cleans a contact's `customFields` against the registry on save, segments validates rule RHS by type, and the editor reads the registry for merge-tags. The frontend mirrors the shape in `composables/app/useCustomFields.ts`. `CustomField` is in `PER_TENANT_CLASSES`, so org+ACL stamping is automatic.

**Why.** One typed registry per org is the minimum that makes the three consumers coherent: segments can list filterable fields, merge-tags can be offered, and values get coerced/validated to a declared type instead of being arbitrary strings. Standard columns stay first-class (indexable, no Object-bag overhead) for the attributes every tenant uses. Key + type are immutable post-create (changing either is a migration), which keeps stored contact values consistent with their definition.

**Cost of changing later.** Medium. Adding field types or standard columns is additive. Renaming a key or changing a type is a per-contact data migration (deliberately disallowed in `updateCustomField`). Dropping the registry entirely would orphan every `customFields` value and break segments/merge-tags.

## #12 — Send-pipeline foundation: the shared contract layer (2026-05-29)

**Context.** Six feature agents (fanout / send-email / webhook-ingest jobs, tracking + webhook routes, send cloud fns, frontend) are about to build the send pipeline in parallel. They all depend on the same primitives — SES transport, signed tracking tokens, render/merge, suppression, counters, job names, worker wiring, schema. Building those six times (or letting each agent invent its own shape) guarantees drift. So the contract layer ships first, alone.

**Choice.** A set of small, single-purpose CommonJS libs under `server/lib/**`, three worker job stubs, schema additions, and env — with the implementations (job bodies, routes, cloud fns, UI) left to the feature agents.

**The contract (load-bearing — feature agents follow this verbatim):**

- **SES adapter** (`server/lib/ses/`, DECISIONS #6). `getSesAdapter()` returns the adapter chosen by `AWS_SES_MODE` (default `mock`). Interface: `async sendEmail({ from, to, replyTo, subject, html, headers, campaignSend }) → { messageId }`; optional `async getSendQuota()`. **mock** (`mock.js`) returns `mock-<hex>` and writes a `MockSentMessage` Parse object (master key) — no network. **real** (`real.js`) uses `@aws-sdk/client-sesv2`, constructs the client lazily inside `sendEmail` so it requires cleanly with no creds; reads `AWS_REGION`/creds/`SES_CONFIGURATION_SET` from env. Swap is one env var.
- **Tracking tokens** (`server/lib/trackingTokens.js`). `token = base64url(JSON) + "." + first22(base64url(HMAC_SHA256(secret, body)))`. `signToken(payload)→string`, `verifyToken(token)→payload|null` (constant-time tag compare; null on any tamper/garbage). Builders: `openToken(sendId)`, `clickToken(sendId, url, linkId)`, `unsubToken(sendId)` (carry a `t` discriminator: `o`/`c`/`u`). Secret from `TRACKING_SECRET` (legacy `TRACKING_TOKEN_SECRET` fallback, then a loud dev default). **Tokens never expire.**
- **renderEmail** (`server/lib/renderEmail.js`, pure). Pipeline order: `resolveMergeFields(html, fields)` (replaces `{{key}}` / `{{custom.<key>}}` / `{{key|default}}`, HTML-escapes values, **leaves `{{unsubscribeUrl}}`/`{{webVersionUrl}}` untouched**) → `injectTracking(html, { pixelUrl, rewriteHref })` (appends a 1×1 pixel before `</body>`, rewrites every `<a href>` except `mailto:`/`tel:`/`#`/unresolved placeholders) → `injectUnsubscribe(html, unsubUrl, webVersionUrl?)`. `listUnsubHeaders(unsubUrl)` returns the `List-Unsubscribe` + `List-Unsubscribe-Post` header map.
- **Suppression** (`server/lib/suppression.js`, master key). `isSuppressed(orgPointerOrId, email)→bool`, `addSuppression({ organization, email, reason, campaign? })` — upsert on `(org, email)`, lowercased; idempotent (repeat bumps `eventCount`, never downgrades reason). Reasons: `hard_bounce`/`soft_bounce_threshold`/`complaint`/`unsubscribe`/`manual`.
- **Counters** (`server/lib/campaignCounters.js`, master key). `bumpCounter(campaignId, field, by=1)` — atomic `increment` (Mongo `$inc`); `setFirst(campaignSend, field, date)` — write a first-event timestamp only if unset.
- **Job names** (`server/lib/jobNames.js`): `CAMPAIGN_FANOUT`/`SEND_EMAIL`/`WEBHOOK_INGEST` = `"campaign-fanout"`/`"send-email"`/`"webhook-ingest"`. Never inline these strings.
- **Worker register() pattern.** Each handler module exports `register(agenda)` which calls `agenda.define(NAME, { concurrency }, async (job) => ...)`. `server/worker/index.js` requires each module and calls `register(agenda)` after `getAgenda()` resolves. Cloud fns enqueue with `getAgenda().now(NAME, data)` (the API server never calls `agenda.start()`).
- **Schema.** `MockSentMessage` added as a **global** mock store (NOT per-tenant, NOT in `PER_TENANT_CLASSES`) with a **master-key-only CLP** (no public, no authenticated access). `CampaignSend` gained `mergeFields`/`statusUpdatedAt`/`bounceCategory`/`bounceSubType`/`failureReason`/`openedAt`/`clickedAt`/`unsubscribedAt`/`attempts`. `EmailEvent` gained `timestamp`/`linkUrl`/`linkId`/`userAgent`/`ipAddress`/`bounceCategory`/`raw`. `Contact` gained `unsubscribed`/`softBounceCount`.

**Why.** One typed/documented contract per primitive is the minimum that lets six agents build independently without colliding. Mock-first SES (DECISIONS #6) keeps the whole thing hermetic and testable today. Pure render functions mean `sendTestEmail` and the `send-email` job share one code path. Atomic counters survive concurrent webhook ingest.

**Cost of changing later.** Medium. These signatures are imported across six features; a breaking change is a coordinated edit. Designed to be additive (new token builders, new counter fields, new SES methods) rather than re-shaped.

<!-- Append new entries below this line. Keep the numbering monotonic. -->
