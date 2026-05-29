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

<!-- Append new entries below this line. Keep the numbering monotonic. -->
