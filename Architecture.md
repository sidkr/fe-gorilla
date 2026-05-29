# Gorilla — Architecture

Gorilla is a Mailchimp-style email marketing platform for MVP. A marketer signs up, imports a contact list, builds rule-based segments, designs an email in a block editor, sends it, and watches a delivery/open/click report. The stack is Vue 3 + Vite + Vuex 4 on the client, Express + Parse Server v7 + MongoDB on the server, with a Redis-backed BullMQ sending pipeline and **Postmark** as the ESP for MVP. The same Express process serves the SPA in production.

This document is the system-design spec for the MVP. It is opinionated. Where alternatives exist, the section ends with **Decision** and a one-line rationale. Out-of-MVP non-goals are listed explicitly so reviewers stop suggesting them.

Companion: `Features.md` (parallel). Cross-references here are by **area name** (e.g. "Audiences → CSV import"), not by feature ID.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Data Model](#2-data-model)
3. [Email Sending Pipeline](#3-email-sending-pipeline)
4. [Tracking & Events](#4-tracking--events)
5. [Segmentation Engine](#5-segmentation-engine)
6. [CSV Import](#6-csv-import)
7. [Compliance & Deliverability](#7-compliance--deliverability)
8. [Reporting Architecture](#8-reporting-architecture)
9. [Frontend Architecture](#9-frontend-architecture)
10. [Security & Rate Limiting](#10-security--rate-limiting)
11. [Observability](#11-observability)
12. [Out of MVP](#12-out-of-mvp)
13. [Key Trade-off Decisions](#13-key-trade-off-decisions)
14. [Open Questions](#14-open-questions)

---

## 1. System Overview

### 1.1 Process layout

```
                 ┌──────────────────────────────────────────────────────┐
 Browser SPA ───►│ Express + Parse Server (:8080)                       │
 (Vue 3 + Vuex)  │                                                      │
                 │  /api/*            Parse REST (classes, users, etc.) │
                 │  /api/functions/*  Cloud Code functions              │
                 │  /t/o/:token       Open tracking pixel (1x1 GIF)     │
                 │  /t/c/:token       Click redirect                    │
                 │  /u/:token         One-click unsubscribe (POST + GET)│
                 │  /hooks/postmark   ESP webhook ingestion             │
                 │  /*  (non-API)     SPA shell (HTML5 history)         │
                 └──┬───────────────┬─────────────────────┬─────────────┘
                    │               │                     │
                    ▼               ▼                     ▼
              ┌──────────┐   ┌──────────────┐      ┌──────────────┐
              │ MongoDB  │   │ Redis        │      │ Postmark API │
              │  :27017  │   │  :6379       │      │  (outbound)  │
              │  gorilla │   │  BullMQ      │      │              │
              └──────────┘   └──────────────┘      └──────────────┘
                                   ▲                     │
                                   │                     │
                             ┌─────┴──────┐              │
                             │ Worker     │◄─────────────┘
                             │ process(es)│  (delivery confirmations
                             │ (BullMQ)   │   surface via webhook,
                             └────────────┘    not inline)
```

Two Node processes in production, both on the same box for MVP:

| Process | Port | Role |
|---|---|---|
| `gorilla-web`     | 8080 | Express + Parse Server, REST, webhooks, tracking endpoints, SPA |
| `gorilla-worker`  | —    | BullMQ workers — `campaign-fanout`, `send-email`, `webhook-ingest`, `import-csv` |

Both share the same Mongo (`gorilla`) and Redis (`:6379`). In dev, Vite runs on `:3000` with HMR; the worker can be started in the same `npm run dev` via `concurrently`.

### 1.2 Request flow — sending a campaign

```
 Marketer clicks "Send"
        │
        ▼
 SPA → Parse.Cloud.run("campaigns.send", { campaignId })
        │
        ▼
 Cloud Code:
   1. Re-fetch campaign + segment with master key, validate ownership
   2. Validate sending-domain is verified
   3. Transition Campaign.status: draft → queued
   4. Enqueue 1 BullMQ job: { type: "campaign-fanout", campaignId }
   5. Return { jobId, campaignId } to the client
        │
        ▼
 [BullMQ: campaign-fanout]
   Worker resolves the segment to a list of contactIds (deduped, suppression-filtered),
   writes one CampaignSend row per recipient (idempotent on (campaign, contact)),
   transitions Campaign.status: queued → sending,
   enqueues N child jobs into "send-email" with per-tenant rate-limit group.
        │
        ▼
 [BullMQ: send-email] × N (rate-limited per Organization)
   For each CampaignSend:
     - Render template (MJML → HTML, then merge fields)
     - Inject tracking pixel, rewrite links, append unsubscribe footer
     - POST to Postmark with a per-send Message-Stream + Idempotency-Key
     - Persist Postmark MessageID on CampaignSend, status = "sent"
        │
        ▼
 Postmark delivers → fires webhook (Delivery / Open / Click / Bounce / SpamComplaint)
        │
        ▼
 POST /hooks/postmark  ───► BullMQ webhook-ingest job
   - Look up CampaignSend by (postmarkMessageId)
   - Write one EmailEvent row
   - Atomically $inc the matching counter on Campaign (deliveredCount, openCount, ...)
   - For Bounce/SpamComplaint: also upsert a Suppression row
        │
        ▼
 SPA polls / live-queries Campaign → counters update → report view fills in
```

### 1.3 Why split web and worker

The web process must stay responsive. Email sending is bursty (10k recipients in a small window), CPU-heavy on the template render path, and IO-bound on Postmark API calls. Co-locating those with the API endpoint would block tracking-pixel responses behind a render storm. Splitting them also means we can horizontally scale workers later (more pods) without touching the web tier.

---

## 2. Data Model

All app data is Parse classes on Mongo. ACL is the default isolation primitive; CLP (class-level permissions) locks down what the public/clientside can do at all.

### 2.1 Tenancy model

**Decision: multi-tenant from day one, via `Organization` + ACL-based isolation.**

A single-user model paints us into a corner the first time a marketer wants to invite a teammate. Adding an `Organization` later means rewriting every query and every ACL. Doing it now costs us one pointer per row and a role-per-org pattern lifted from Parse's built-in `_Role`.

The model:

- Every signup creates an `Organization` and a `_Role` named `org_<orgId>_members`. The signing-up user is added to that role.
- Every per-tenant object (`List`, `Contact`, `Campaign`, …) carries an `organization` pointer **and** an ACL that grants `read, write` to `role:org_<orgId>_members` only. Public access is disabled at the CLP level.
- Cross-tenant leakage is impossible by construction: a query for `Contact` with the wrong session token returns zero rows because the ACL filter executes inside Parse.
- The master key bypasses ACL — Cloud Code and workers use it deliberately for fanout and webhook ingestion. Client code never sees the master key.

Single-user-without-org is a degenerate case we don't optimise for: every user has exactly one org at signup.

### 2.2 Classes

Below: every class, its fields, types, indexes, and ACL intent. Notation: `→` is a Parse pointer, `*` marks a field set/managed exclusively by Cloud Code (never trusted from the client). Indexes called out are Mongo indexes registered via Parse's `schema.indexes`.

---

#### `_User` (Parse built-in)

| Field | Type | Notes |
|---|---|---|
| `username` | String | Email, lowercased on write |
| `email`    | String | Same as username; kept for Parse's email-verification machinery |
| `organization` * | → Organization | Set by `_User.beforeSave` on signup |
| `role`     | String  | `"owner"` \| `"admin"` \| `"member"` — org-scoped |
| `name`     | String  | Display name |
| `emailVerified` | Boolean | Parse-managed |
| `lastLoginAt`   | Date    | Updated on session create |

**ACL**: self read+write; members of same org can read (for "team members" UI).
**CLP**: no public create — signup goes through a `signUpWithOrg` Cloud Function that creates the Org + User + Role transactionally (well, as transactionally as Mongo allows — see Open Questions).

---

#### `Organization`

| Field | Type | Notes |
|---|---|---|
| `name` | String | Display name |
| `slug` | String | URL-safe, unique. Index: unique. |
| `plan` | String | `"free"` for MVP; placeholder for billing later |
| `defaultFromName`  | String | Default sender display name (overridable per campaign) |
| `defaultFromEmail` | String | Must belong to a verified `SendingDomain` at send time |
| `monthlySendCap`   | Number | Hard ceiling for MVP free tier (e.g. 10k/mo). Counter on Org. |
| `monthlySendCount` | Number * | Reset by a daily cron at month rollover |
| `timezone` | String | For display only in MVP — no send-time optimisation |

**ACL**: org members read; org owners write.
**Index**: `slug` unique.

Why a `monthlySendCap` on the Org and not derived: cheap to read, atomic to `$inc` per send, and gives us a one-line guard at fanout time without a count query over `CampaignSend`.

---

#### `List` (a.k.a. Audience)

A named container for contacts. A contact can belong to many lists (membership lives on `Contact` via an array — see below).

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `name`         | String | |
| `description`  | String | |
| `contactCount` | Number * | Denormalised counter, maintained by Cloud Code triggers and CSV import |
| `defaultFromName`  | String | Per-list override of Org defaults |
| `defaultFromEmail` | String | Per-list override of Org defaults |
| `doubleOptInRequired` | Boolean | **Out of MVP** — field reserved, ignored by code for now |

**ACL**: `role:org_<orgId>_members` r+w.
**Index**: `(organization, name)` non-unique; `(organization, createdAt)` for list-of-lists views.

---

#### `Contact`

The actual person. Multi-list membership is modelled as an array of pointers on Contact, not as a join class, because:
- A typical contact is in 1–3 lists at most.
- A join class triples our row count and makes "find all contacts in list X" cost a join.
- Mongo indexes arrays natively (`multikey`).

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `email`        | String | Lowercased, trimmed on write. Index: `(organization, email)` unique. |
| `lists`        | Array<→ List> | Multikey index. Empty = orphan (allowed; useful for imports-in-flight). |
| `status`       | String | `"subscribed"` \| `"unsubscribed"` \| `"cleaned"` \| `"pending"` |
| `firstName`    | String | |
| `lastName`     | String | |
| `customFields` | Object | Free-form `{ key: value }` map, keys must match a `CustomField` def for the org |
| `source`       | String | `"csv_import"` \| `"signup_form"` \| `"manual"` \| `"api"` |
| `subscribedAt`   | Date   | First time we observed the address |
| `unsubscribedAt` | Date | Set when `status` flips to `unsubscribed` |
| `lastBouncedAt`  | Date | Set on hard bounce; `status` may also flip to `cleaned` |

**ACL**: org members r+w.
**Indexes**:
- `(organization, email)` **unique** — the dedupe key for CSV import.
- `(organization, lists)` multikey — segment evaluation, list views.
- `(organization, status)` — quick filter for active recipient counts.
- `(organization, createdAt)` for list pagination.

**Why `customFields` is an embedded Object, not a separate class:**

A contact has on average 5–20 custom fields, all small scalars. Splitting them into a `ContactCustomFieldValue` class would explode row count by 10× and make segment evaluation a multi-stage aggregation. Embedded objects + a registry class (`CustomField`) for schema validation is the right shape for MVP.

The trade-off: we can't index *into* `customFields.country` natively across the whole org without help. We solve that for the segments we care about by writing **wildcard indexes** on hot custom-field paths at the schema layer (`customFields.$**`) — Mongo 4.2+ supports this. Segment queries fall back to a collection scan for cold paths, which is acceptable at MVP contact counts (<1M per org).

---

#### `CustomField`

The registry/schema for custom fields on `Contact`. Keeps the CSV import UI honest and gives segments a type-aware operator menu.

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `key`          | String | Slug-cased, must match the key in `Contact.customFields`. Index: `(org, key)` unique. |
| `label`        | String | Human-readable |
| `type`         | String | `"text"` \| `"number"` \| `"date"` \| `"boolean"` \| `"enum"` |
| `enumValues`   | Array<String> | Required when `type === "enum"` |
| `required`     | Boolean | If true, CSV import rejects rows that omit it |

**ACL**: org members r+w.

---

#### `Segment`

A rule tree against a `List` (or unioned across the whole org).

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `name`         | String | |
| `list`         | → List \| null | `null` = whole-org segment |
| `kind`         | String | `"dynamic"` (re-evaluated at send time) or `"static"` (snapshotted) |
| `rules`        | Object | The rule tree (see [§5](#5-segmentation-engine)) |
| `staticContacts`  | Array<→ Contact> | Set only when `kind === "static"`, capped at 100k |
| `lastEvaluatedAt` | Date | For dynamic segments: when its count was last computed |
| `lastCount`       | Number | Cached count for the UI |

**ACL**: org members r+w.
**Index**: `(organization, list)`.

---

#### `Template`

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `name`         | String | |
| `blocks`       | Object | Block-based JSON (see [§9.3](#93-email-editor)) — the source of truth |
| `mjml`         | String * | Compiled MJML, regenerated on save by a `beforeSave` |
| `html`         | String * | Compiled HTML, regenerated on save |
| `subject`      | String | Default subject; campaigns may override |
| `previewText`  | String | Inbox preview snippet |

**ACL**: org members r+w.

Why compile MJML → HTML eagerly on save instead of at send time: render is the slow path of the send loop; precomputing it once at template-edit time means the worker only does field merging at fanout, not full MJML compilation per recipient.

---

#### `Campaign`

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `name`         | String | Internal-only name |
| `subject`      | String | Per-send subject; overrides template default |
| `previewText`  | String | |
| `fromName`     | String | |
| `fromEmail`    | String | Must resolve to a verified `SendingDomain` at queue time |
| `replyTo`      | String | Optional; defaults to `fromEmail` |
| `template`     | → Template | Snapshot of `blocks` is taken at queue time — see below |
| `templateSnapshotHtml` * | String | Locked at queue time; survives template edits |
| `segment`      | → Segment | |
| `status`       | String | `"draft"` → `"queued"` → `"sending"` → `"sent"` (or `"paused"` / `"cancelled"` / `"failed"`) |
| `scheduledAt`  | Date \| null | `null` = send immediately on user click; future Date = honoured by a scheduler job |
| `sentAt`       | Date | Stamped when all sends are accepted by the ESP (not when delivered) |
| `recipientCount` * | Number | Set at queue time |
| `deliveredCount`   * | Number | $inc'd from `Delivery` webhook |
| `openCount`        * | Number | unique opens; see §4 |
| `clickCount`       * | Number | unique clicks |
| `bounceCount`      * | Number | hard+soft combined; broken out in events |
| `complaintCount`   * | Number | |
| `unsubscribeCount` * | Number | |

**ACL**: org members r+w on draft; once `status !== "draft"` Cloud Code rejects writes to mutating fields (subject, template, segment, etc.) — only counters and status transitions may change.
**Index**: `(organization, status, createdAt desc)` for the Campaigns list view.

Template snapshotting at queue time matters: a user could edit the template after clicking Send. We freeze `templateSnapshotHtml` on the campaign at queue time so the recipients all get the same content.

---

#### `CampaignSend`

**One row per recipient per campaign.** This is the central denormalised table that makes per-recipient reports possible.

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | Denormalised for index locality |
| `campaign`     | → Campaign | |
| `contact`      | → Contact | |
| `email`        | String | Snapshot at queue time (in case Contact.email mutates) |
| `status`       | String | `"queued"` → `"sent"` → `"delivered"` / `"bounced"` / `"failed"` |
| `postmarkMessageId` | String * | Returned by the ESP API. Index: unique. |
| `attempts`     | Number | Send-attempt counter for retries |
| `lastError`    | String | Truncated to 500 chars |
| `sentAt`       | Date | When the ESP accepted the message |
| `deliveredAt`  | Date | From the Delivery webhook |
| `firstOpenedAt` | Date | First Open event; subsequent opens go to EmailEvent only |
| `firstClickedAt` | Date | Same pattern |
| `opens`        | Number | Open count (≥ 0); 0/1 is the only thing the UI shows |
| `clicks`       | Number | Click count |
| `bouncedAt`    | Date | If bounced |
| `bounceType`   | String | `"hard"` \| `"soft"` \| `"transient"` |
| `unsubscribedAt` | Date | If they unsubbed from this email |

**ACL**: master-key writes only (`{}` ACL — see Parse `setAccess`). Reads via Cloud Function `campaignSends.list` so we can paginate and apply per-org filtering server-side.

**Indexes**:
- `(campaign, contact)` unique — guarantees idempotency on fanout retries.
- `(campaign, status)` — report queries.
- `postmarkMessageId` unique — webhook lookups.
- `(organization, createdAt)` — for "recent activity" UI.

Why `email` is snapshotted: at report time we want to show what the email was *when sent*, not what it is now.

Why uniques on `(campaign, contact)`: the fanout job is idempotent on retry — if BullMQ reruns it, we attempt to insert and let Mongo's duplicate-key error mark the existing row as "already queued."

---

#### `EmailEvent`

The raw event log. Every webhook from Postmark becomes a row here, then ripples into counters on `Campaign` and `CampaignSend`.

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | Denormalised |
| `campaign`     | → Campaign | Denormalised; `null` for non-campaign events (none in MVP) |
| `campaignSend` | → CampaignSend | The row this event belongs to |
| `contact`      | → Contact | |
| `type`         | String | `"delivered"` \| `"open"` \| `"click"` \| `"bounce"` \| `"complaint"` \| `"unsubscribe"` |
| `occurredAt`   | Date | From the ESP payload's `ReceivedAt` (not our ingestion time) |
| `ingestedAt`   | Date | When we wrote it |
| `link`         | String | Click target URL (decoded from the redirect token) |
| `linkId`       | String | Stable hash of the link for per-link rollups |
| `userAgent`    | String | From the open/click request |
| `ipPrefix`     | String | First three octets only (privacy; see §7) |
| `bounceCategory` | String | Postmark's category (`HardBounce`, `Transient`, `Blocked`, ...) |
| `raw`          | Object | The full Postmark payload, kept for debugging — TTL'd via index after 90d |

**ACL**: master-key only.
**Indexes**:
- `(campaign, type, occurredAt)` — the workhorse for per-campaign report queries.
- `(organization, type, occurredAt)` — for org-wide dashboards later.
- `(linkId)` — per-link click breakdowns.
- `ingestedAt` TTL 90 days on `raw.*` — actually implemented as a Mongo TTL index on `ingestedAt` for the *whole row*, with rollup counters living on `Campaign` so we don't lose the headline numbers. See [§8](#8-reporting-architecture).

---

#### `Suppression`

The global "do not send" list, per organization.

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `email`        | String | Lowercased, normalised |
| `reason`       | String | `"unsubscribe"` \| `"hard_bounce"` \| `"complaint"` \| `"manual"` \| `"global_blocklist"` |
| `campaign`     | → Campaign \| null | If the suppression originated from a specific campaign |
| `createdAt`    | Date | |

**ACL**: org members read; master-key write (Cloud Code only — never the client).
**Index**: `(organization, email)` unique.

The fanout step does `email IN suppression` filtering before writing `CampaignSend` rows. Suppression is checked on every send, every time — never cached on `Contact`.

Why also keep `Contact.status`: convenient for the UI (list view shows "12k subscribed / 1.2k unsubscribed / 200 cleaned"). The two surfaces stay consistent because Cloud Code writes both atomically on bounce/unsubscribe.

---

#### `SendingDomain`

Per-tenant sending identity. SPF/DKIM/DMARC verification.

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `domain`       | String | `example.com` — index unique within org |
| `status`       | String | `"pending"` → `"verified"` → `"failed"` |
| `dkimHost`     | String | DNS record name (Postmark-issued selector) |
| `dkimValue`    | String | Public key |
| `returnPathDomain` | String | e.g. `pm-bounces.example.com` (CNAME to Postmark) |
| `postmarkSignatureId` | String * | The Postmark Sender Signature ID |
| `lastCheckedAt` | Date | Last DNS poll |
| `verifiedAt`    | Date | |

**ACL**: org members r+w.
**Index**: `(organization, domain)` unique.

A campaign cannot leave `draft` if its `fromEmail` doesn't resolve to a `SendingDomain` with `status === "verified"`. Enforced in `Campaign.beforeSave` on the `draft → queued` transition.

---

#### `ImportJob`

CSV import lifecycle (referenced by [§6](#6-csv-import)).

| Field | Type | Notes |
|---|---|---|
| `organization` | → Organization | |
| `list`         | → List | The destination list |
| `filename`     | String | Original filename, display-only |
| `s3Key` / `localPath` | String | Where the temp file lives (see §6) |
| `mapping`      | Object | `{ "Email": "email", "First": "firstName", "Country": "customFields.country" }` |
| `status`       | String | `"pending"` → `"running"` → `"done"` / `"failed"` |
| `totalRows`    | Number | Set after first streaming pass |
| `processedRows` | Number | $inc'd per row |
| `createdCount`  | Number | |
| `updatedCount`  | Number | |
| `skippedCount`  | Number | Duplicate-row skips |
| `errorCount`    | Number | |
| `errors`        | Array<Object> | First 100 errors `{ row, reason }` — never more |
| `startedAt` / `finishedAt` | Date | |

**ACL**: org members read; master-key write.

LiveQuery-enabled so the SPA can show a live progress bar via Parse Live Query subscription on `(organization, status='running')`.

---

### 2.3 Why no `Subscription` join class

The classic Mailchimp data model has a join class (sometimes `ListMember`) holding `(contact, list, status, subscribedAt)`. We instead put `lists: Array<Pointer>` on `Contact` plus a global `status` field on Contact.

This is a deliberate compromise:

- **Pros**: 1× row per person, simpler segmentation, simpler counts.
- **Cons**: A contact can't be "unsubscribed from list A but subscribed to list B." Their `status` is global.

For MVP this is fine — most marketers don't run multi-list unsubscribe semantics. If we ever need per-list opt-out, we add a `ListUnsubscribe` join class (which is strictly additive — `Contact.lists` keeps its meaning as "currently a member of").

**Decision: single Contact row with `lists[]` and a global `status`. Revisit if per-list opt-out becomes a top-3 user request.**

---

## 3. Email Sending Pipeline

### 3.1 ESP choice — **Postmark**

We need three things from the ESP for MVP: (1) high deliverability with minimal setup, (2) clean webhook semantics, (3) a free tier large enough for development.

| | Postmark | SES | SendGrid |
|---|---|---|---|
| Out-of-box deliverability | Excellent (transactional-grade IPs by default) | Depends on IP warming + identity setup | Mixed |
| Identity/sender setup | DKIM via DNS records, ~5 mins | SES verified-identity / production-access dance | Sender verification + domain auth |
| Bounce/complaint webhooks | One endpoint, JSON, no SNS dance | SNS → HTTP confirmation, MIME parsing | Webhook endpoints, OK |
| Cost at MVP scale (<1M/mo) | $15/mo for 10k sends, $1.25/k after | ~$0.10/k (cheapest by a lot) | Free tier 100/day, then paid |
| Idempotency keys on send | Native `X-PM-Tag`/`Idempotency-Key`-shaped via Postmark client | Have to build manually | Have to build manually |
| Production-access gate | None | "Production access" form, can take days | None |

**Decision: Postmark.** SES is cheaper at scale, but the IAM/identity/production-access overhead is a multi-day distraction. Postmark's defaults (transactional-tuned IPs, clean webhook payloads, per-domain signatures via DNS) move us from "decided" to "sending email" in a single afternoon. We can swap to SES later — the ESP boundary is a single adapter module (`server/cloud/esp/postmark.js`) and the schema fields (`postmarkMessageId`, `dkimHost`, etc.) generalise via renaming.

### 3.2 Queue choice — **Redis + BullMQ**

| | BullMQ | Mongo-backed (manual) | Parse Cloud Jobs |
|---|---|---|---|
| Retry/backoff semantics | Built-in, exponential w/ jitter | Hand-roll | Coarse — schedule a re-run |
| Per-tenant rate limiting | Native (`{ limiter: { groupKey } }`) | Hand-roll, lock-prone | Not really |
| Concurrency control | Yes | Yes (with care) | Single-process |
| Observability | Bull-board dashboard, OOTB | Build your own | Parse Cloud Jobs UI is thin |
| Ordering guarantees | FIFO within a queue | FIFO if you really try | Per-job-name only |
| Operational cost | Adds Redis | Zero extra infra | Zero extra infra |

**Decision: BullMQ on Redis.** Mongo-backed queues are tempting because we already run Mongo, but the moment we want per-tenant throttling ("Org A is bursting 50k, don't starve Org B") we are reimplementing BullMQ's `groupKey` rate limiter on top of `findOneAndUpdate`. Parse Cloud Jobs are designed for periodic maintenance, not high-throughput email fanout. Redis is the cheapest piece of infrastructure to add and it instantly buys us things (retries, backoff, concurrency, rate limits, a dashboard) we would otherwise hand-roll.

### 3.3 Queues and jobs

```
┌──────────────────────────────────────────────────────────────────────┐
│ Queues (all BullMQ on Redis)                                         │
├──────────────────────────────────────────────────────────────────────┤
│ campaign-fanout      — 1 job per Campaign send. Spawns child jobs.   │
│ send-email           — 1 job per CampaignSend. Rate-limited per org. │
│ webhook-ingest       — 1 job per ESP webhook event.                  │
│ import-csv           — 1 job per ImportJob.                          │
│ scheduled-campaigns  — Repeat job, runs every 60s, finds Campaigns   │
│                        with scheduledAt <= now and enqueues fanout.  │
└──────────────────────────────────────────────────────────────────────┘
```

#### `campaign-fanout`

- Input: `{ campaignId }`.
- Steps:
  1. Re-fetch campaign with master key. Bail if status isn't `queued`.
  2. Resolve `segment` → set of contactIds. For `dynamic` segments, evaluate the rule tree now; for `static`, read `staticContacts`. (See [§5.4](#54-snapshotting-vs-on-the-fly).)
  3. Filter against `Suppression` (org-scoped) and `Contact.status === "subscribed"`.
  4. Check `Organization.monthlySendCount + recipients <= monthlySendCap`. Fail fast if it would exceed.
  5. `bulkWrite` `CampaignSend` rows, ordered `false`, with `upsert` on `(campaign, contact)`. Duplicate-key errors are ignored — that's the idempotency on retry.
  6. `Campaign.set("recipientCount", n)`, `status = "sending"`.
  7. Enqueue N `send-email` jobs, batched in chunks of 1000 via `addBulk`, with `groupKey: orgId` for rate limiting and `jobId: campaignSend.id` for de-dup.
- Concurrency: 4 workers (fan-out is mostly I/O, but the bulk write benefits from low contention).
- Retries: 3 attempts, exponential backoff starting at 30s. After 3 failures: `Campaign.status = "failed"`, `lastError` set, alert.
- Idempotency: re-running is safe because the bulk write upserts by `(campaign, contact)` and child-job ids are deterministic.

#### `send-email`

- Input: `{ campaignSendId }`.
- Steps:
  1. Re-fetch `CampaignSend` with master key. Bail if status is not `queued` (handles retries crossing manual cancels).
  2. Re-fetch the contact (their email could have been updated; we use the snapshot on `CampaignSend.email` to avoid mid-flight drift).
  3. Merge fields into `templateSnapshotHtml` using a Handlebars-lite renderer with strict undefined behaviour (`{{firstName}}` missing → empty string, *not* an error — the alternative bricks an entire send for a missing custom field).
  4. Inject the tracking pixel (`<img src="/t/o/{token}" width="1" height="1" />`) at the bottom of the `<body>`.
  5. Rewrite all `<a href>` to point at `/t/c/{token}` (see [§4](#4-tracking--events)).
  6. Append the unsubscribe footer with a one-click signed URL (`/u/{token}`).
  7. Set `List-Unsubscribe` and `List-Unsubscribe-Post` headers.
  8. POST to Postmark with `MessageStream: "broadcast"` and a per-send `Metadata: { campaignSendId, organizationId }` so webhooks carry our IDs.
  9. On 200, write `postmarkMessageId`, `status: "sent"`, `sentAt`. `$inc` Org `monthlySendCount`.
  10. On 422 (suppressed by Postmark) or 406 (inactive recipient): write to `Suppression`, `Contact.status = "cleaned"`, `CampaignSend.status = "failed"` — do not retry.
  11. On 429 (rate limit): rely on BullMQ backoff. On 5xx: rely on BullMQ backoff. On non-retryable 4xx: fail the job permanently.
- Concurrency: 10 per worker process; rate-limit `{ max: 10, duration: 1000 }` per `groupKey` (per-org), so a single org cannot burn through Postmark's rate budget. Postmark's published rate for `broadcast` is 300 req/s overall; 10/s per org with multiple orgs in flight stays comfortably under.
- Retries: 5 attempts, exponential, max delay 5 minutes.
- Idempotency: the `jobId` on add is `campaignSend.id`, so BullMQ deduplicates duplicates. The `CampaignSend.status` check inside the job is the second line of defence — if a duplicate job slips through, the second one returns immediately.

#### `webhook-ingest`

- Input: `{ payload }` — Postmark's JSON, untouched.
- Steps:
  1. Look up `CampaignSend` by `postmarkMessageId`. Bail (200 OK) if not found — keeps webhook acks fast and lets out-of-order events drop cleanly.
  2. Insert `EmailEvent` with the typed fields populated.
  3. `findAndModify` `CampaignSend` and `Campaign` counter updates atomically (`$inc`, `$min` for `firstOpenedAt`).
  4. For `Bounce` (Type=HardBounce) and `SpamComplaint`: upsert `Suppression`, flip `Contact.status` to `"cleaned"` (hard bounce) or `"unsubscribed"` (complaint).
- Concurrency: 20.
- Retries: 5, exponential. After exhaustion: drop to a dead-letter queue, alert.

#### `import-csv`

- Input: `{ importJobId }`.
- Streamed via `csv-parser` over a `fs.createReadStream`. See [§6](#6-csv-import).
- Concurrency: 2. CSV import is cheap on a per-row basis but the file lock makes parallelism within a single file pointless.

#### `scheduled-campaigns`

- Repeats every 60 seconds (`addRepeatableJob`).
- Finds `Campaign` rows with `status === "draft"`, `scheduledAt <= now`, transitions to `queued`, enqueues `campaign-fanout`.

### 3.4 Rate limiting

Two tiers:

1. **Per-org sending rate** — BullMQ `{ limiter: { max: 10, duration: 1000, groupKey: orgId } }` on `send-email`. Hard ceiling: no org can do >10 sends/sec.
2. **Postmark account rate** — Postmark's API rate (`broadcast` stream: 300 req/s sustained). We never approach this in MVP, but the worker has a global semaphore (`p-limit`, 50 in-flight) as a circuit breaker so a rogue burst can't 429 us into oblivion.

If `Postmark` returns 429, BullMQ's backoff handles it without us needing to ack/reschedule manually.

### 3.5 Ordering and idempotency summary

- **Ordering within a campaign**: not guaranteed. BullMQ is FIFO at enqueue but concurrency unwinds that. We don't care — `firstClickedAt` is min-aggregated, not assumed-monotonic.
- **Idempotency on fanout retries**: enforced by the `(campaign, contact)` unique index on `CampaignSend`.
- **Idempotency on send retries**: enforced by `jobId = campaignSend.id` + the `CampaignSend.status` check. Without this, a worker crash mid-send could double-send.
- **Idempotency on webhook retries**: Postmark may resend webhooks; we look up by `postmarkMessageId` and `$inc` once we've inserted an `EmailEvent` with a matching `(campaignSend, type, occurredAt)` tuple. We add a unique index on `(campaignSend, type, occurredAt)` and ignore duplicate-key errors.

### 3.6 ESP quota awareness

We don't try to predict Postmark's quota; we react. The org-level monthly cap (`Organization.monthlySendCap`) is *our* business-rule limit, evaluated at fanout time. Postmark's own rate limits surface as 429s and are absorbed by BullMQ backoff.

If we hit a Postmark monthly billing cap, the worker pauses the queue (`queue.pause()`) and writes a `Campaign.status = "paused"` with a human-readable `lastError`. We surface this in the SPA dashboard.

---

## 4. Tracking & Events

### 4.1 URLs and token design

All three tracking endpoints (`/t/o/:token`, `/t/c/:token`, `/u/:token`) accept a self-contained, HMAC-signed token instead of an opaque DB lookup ID. The token is the source of truth; the database is consulted only to write an event. This means the endpoints stay fast under load and can degrade gracefully if Mongo is slow — we don't block on a DB read before redirecting a click.

#### Token format

```
base64url( JSON.stringify({
  v: 1,                    // schema version
  s: campaignSendId,       // string
  c: campaignId,           // string
  o: organizationId,       // string
  // for click tokens only:
  u: targetUrl,            // string
  l: linkId,               // string, sha1(targetUrl).slice(0, 16)
}) ) + "." + base64url( HMAC_SHA256(secret, body) ).slice(0, 22)
```

Secret rotates per environment via `TRACKING_SECRET` env var. Tokens never expire — open and click events arrive months after sending, and we don't want valid tokens to become invalid silently.

Why we sign and don't encrypt: there's nothing secret about a campaignSendId or a redirect URL. We just need to know it wasn't tampered with so we don't redirect to an attacker-controlled URL or fabricate open events for arbitrary recipients.

### 4.2 Open tracking pixel

`GET /t/o/:token`:

1. Verify HMAC. Bail (200 + cached 1x1 GIF) if invalid — never give a webcrawler debug information.
2. Decode token, push `{ type: "open", payload }` to `webhook-ingest` queue (or a `local-ingest` queue, same handler).
3. Respond immediately with a 1x1 transparent GIF, `Cache-Control: no-store`, `Pragma: no-cache`.

The response writes nothing synchronously. The pixel must return fast; the DB write is async.

Image proxies (Gmail, iCloud) inflate open counts. We do **not** try to filter these in MVP — every modern email client now uses an image proxy, so the metric is "this address has the email client we trust to load images." We rename "Opens" to "Unique opens" in the UI and stop there.

### 4.3 Click tracking and redirect

`GET /t/c/:token`:

1. Verify HMAC. Bail with 400 if invalid.
2. Decode token → `targetUrl`, `linkId`, `campaignSendId`.
3. Enqueue `{ type: "click", payload }` onto `webhook-ingest`.
4. Issue a `302 Found` to `targetUrl`.

The redirect ships before the event is written. If the queue is down, we still redirect — the user gets where they want to go and we lose one event. We log the failure to a `tracking-errors` log and move on.

### 4.4 Unsubscribe

Two paths in MVP, both signed:

1. **In-email link footer** (`/u/:token`): `GET` renders a confirmation page ("You're unsubscribing — confirm?"). `POST` actually unsubscribes. We deliberately gate the destructive action behind a POST to comply with RFC 8058 expectations and avoid `Link:prefetch` accidentally unsubscribing users.
2. **One-click via List-Unsubscribe-Post**: every send includes both headers:

   ```
   List-Unsubscribe: <https://gorilla.example/u/{token}>, <mailto:unsubscribe@example.com?subject=unsub-{token}>
   List-Unsubscribe-Post: List-Unsubscribe=One-Click
   ```

   Gmail/Yahoo's "Unsubscribe" inbox button POSTs to the URL with the body `List-Unsubscribe=One-Click`. We accept that as the destructive confirmation (RFC 8058 explicitly carves this out as auth-equivalent).

Action of an unsubscribe:

1. Verify HMAC.
2. Upsert `Suppression` (reason=`unsubscribe`).
3. Set `Contact.status = "unsubscribed"`, `unsubscribedAt = now`.
4. Write an `EmailEvent` (type=`unsubscribe`), `$inc Campaign.unsubscribeCount`.
5. Render the "you're unsubscribed" page.

The mailto: address gets processed by a small inbound-email handler on `webhook-ingest` (Postmark inbound webhook). MVP: we parse the `subject` for `unsub-{token}` and run the same path. If the user replies with garbage, we drop it.

### 4.5 Bounce and complaint webhooks

Postmark webhook config (all to `POST /hooks/postmark`):

| Event | Type field |
|---|---|
| Delivery | `Delivery` |
| Bounce | `Bounce` (with sub-type `HardBounce` / `Transient` / `Blocked` / `AutoResponder`) |
| Spam complaint | `SpamComplaint` |
| Open | `Open` |
| Click | `Click` |
| Subscription change | `SubscriptionChange` (Postmark's unsub button — same handling as our unsub) |

`POST /hooks/postmark` does:

1. Verify the webhook came from Postmark — Basic Auth shared secret on the URL, set in Postmark's webhook config and matched in middleware.
2. Push the payload to `webhook-ingest`.
3. Respond 200 immediately.

Same fast-ack pattern as the pixel: the response gets out before any DB work. Postmark retries failed deliveries for 24 hours; the `webhook-ingest` queue's own retry semantics are extra insurance.

### 4.6 Open/click double counting

- Per-recipient `firstOpenedAt` uses `findAndModify` with `$min` — first event wins, subsequent ones increment `opens` only.
- Campaign `openCount` is **unique opens**: incremented only on the first open per `CampaignSend`. We track this via a `firstOpen` boolean stamped by the same `findAndModify` (if `firstOpenedAt` was previously null and is now set, increment Campaign counter).
- `clickCount` is unique clicks per send, by the same pattern. Total clicks-with-replays is `EmailEvent` count per campaign.

This split lives in the UI: "Opens: 4,302 unique (8,109 total)" — the unique number is the headline, the total is a secondary stat.

---

## 5. Segmentation Engine

A segment is a rule tree the marketer builds in a UI. Internally it's a tree of `and`/`or` groups and leaf conditions, persisted as JSON and compiled to a Parse query at evaluation time.

### 5.1 Rule tree schema

```json
{
  "op": "and",
  "conditions": [
    { "field": "email", "operator": "contains", "value": "@gmail.com" },
    {
      "op": "or",
      "conditions": [
        { "field": "customFields.country", "operator": "eq", "value": "IN" },
        { "field": "customFields.country", "operator": "eq", "value": "US" }
      ]
    },
    { "field": "subscribedAt", "operator": "after", "value": "2025-01-01T00:00:00Z" }
  ]
}
```

Leaf condition fields:

- `field`: dotted path. Top-level Contact field (`email`, `firstName`, `status`, `subscribedAt`) or `customFields.<key>`.
- `operator`: depends on field type (validated at save time against the `CustomField` registry).
- `value`: scalar (string/number/date/bool) or array (for `in` / `not_in`).

Allowed operators:

| Type    | Operators |
|---------|-----------|
| text    | `eq`, `neq`, `contains`, `not_contains`, `starts_with`, `ends_with`, `is_empty`, `is_not_empty` |
| number  | `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in` |
| date    | `before`, `after`, `between`, `last_n_days` |
| boolean | `eq` (true/false) |
| enum    | `in`, `not_in` |

### 5.2 Compile to Parse Query

The compiler walks the tree depth-first:

- Leaf condition → a single `Parse.Query` constraint (`equalTo`, `contains`, `greaterThan`, …).
- `and` group → `Parse.Query.and(children)` (Parse v3 SDK supports this; falls back to merging constraints).
- `or` group → `Parse.Query.or(children)`.

Two non-obvious bits:

- `customFields.country` becomes a Mongo dotted-key query (`{"customFields.country": "IN"}`). Parse's `equalTo("customFields.country", "IN")` translates to that natively.
- `last_n_days` is rewritten at compile time to `gte: now - n*86400000` so we always pass an absolute timestamp to Mongo — letting Mongo see "today" relative to the server clock would break determinism between evaluation and send time.

The compiler also enforces tenancy: every compiled query gets an extra `.equalTo("organization", org)` constraint at the root. This is the second line of defence; the ACL filter is the first.

### 5.3 Static vs dynamic segments

- **Dynamic** (`kind: "dynamic"`): rule tree evaluated at send time. The count shown in the UI is `Segment.lastCount`, refreshed on demand (and at most every 60s while the segment editor is open).
- **Static** (`kind: "static"`): the contact list is frozen at segment-create time into `staticContacts`. Useful for "the cohort that won the contest last week" — segment is immune to new signups or churn.

The UI exposes "Build segment" (dynamic) and "Save current selection as static list" (static). Static segments are capped at 100k members in MVP — beyond that the `staticContacts` array becomes a Mongo pain point.

### 5.4 Snapshotting vs on-the-fly

**Decision: snapshot recipients at queue time, always.**

When the user clicks Send (or `scheduledAt` triggers), the fanout job evaluates the segment **once**, produces the contact list, and writes one `CampaignSend` row per recipient. From that point forward, the recipient set is frozen on the campaign.

Why:

- The "send to people who signed up in the last 7 days" segment cannot drift mid-send. A 30-min send to 100k recipients should hit the same 100k regardless of who signs up during minute 14.
- Per-recipient reports require a stable recipient set anyway — the `CampaignSend` rows are the report.
- Idempotency on fanout retries is impossible without a snapshot.

The cost: 1 `CampaignSend` row per recipient at queue time. A 1M-recipient campaign produces 1M rows. Mongo handles this comfortably; the indexed lookups are O(log n).

### 5.5 Recomputation strategy for the UI

The Segment editor needs to show a live count ("3,247 contacts match"). We don't want to run the query on every keystroke. The flow:

1. User changes the rule tree → SPA debounces 500ms.
2. SPA calls `Cloud.run("segments.preview", { rules })`.
3. Cloud Code compiles, runs `.count()` (capped via `q.limit(1).count()` style, Parse supports `count()` directly).
4. Result stamped on `Segment.lastCount` if the segment is saved.

For very large orgs (>500k contacts) a full count can take seconds. We accept that for MVP. Optimisation later: maintain a denormalised `Segment.lastCount` background-refreshed by a cron, and never count on edit.

### 5.6 Size estimation

A reasonable MVP org is up to ~1M contacts. Mongo handles `Contact` collection scans for segment compile at that size in single-digit seconds with the right indexes. We index:

- `(organization, email)` unique
- `(organization, lists)` multikey
- `(organization, status)`
- `(organization, customFields.$**)` wildcard — Mongo 4.2+

The wildcard index is the dial we turn if segment perf degrades. The cost is index size (~30% of collection). At MVP scale, fine.

---

## 6. CSV Import

### 6.1 Flow

```
SPA: file <input>
  ├── Client-side: parse first 50 rows with PapaParse for the mapping UI preview
  │   (Don't ship the whole file through the parser in-browser — could be 200MB.)
  │
  ├── Upload to /api/imports (multipart, streamed) → /tmp/<importJobId>.csv
  │   Express middleware: multer with disk storage, 100MB cap.
  │
  ├── POST /api/functions/imports.start { listId, mapping, hasHeader }
  │   Cloud Function:
  │     - Creates ImportJob row, status="pending"
  │     - Enqueues BullMQ job: { type: "import-csv", importJobId }
  │     - Returns { importJobId }
  │
  └── SPA subscribes to ImportJob via Parse LiveQuery → progress bar fills in.

Worker (import-csv job):
  1. Open the file via fs.createReadStream.
  2. Pipe through csv-parser (streaming, never buffers the full file).
  3. First pass — count rows (single pass on the byte stream, no parse), write totalRows.
  4. Second pass — for each row:
       a. Apply mapping → { email, firstName, lastName, customFields }.
       b. Lowercase + trim + validate email format. Reject malformed.
       c. Check Suppression for this org+email. If present, skip with reason="suppressed".
       d. Upsert Contact by (organization, email).
          On insert: status="subscribed", source="csv_import", subscribedAt=now.
          On update: merge customFields, append list to lists[] if missing, update names if currently blank.
       e. $inc the appropriate counter on ImportJob.
       f. On error, push to errors[] (capped at 100 entries).
  5. Update List.contactCount.
  6. status = "done", stamp finishedAt. Delete the temp file.
```

### 6.2 Streaming and the two-pass tradeoff

A streamed parse can't know `totalRows` without scanning the file first. For a 1M-row file, scanning is ~1s on local SSD; the user value of a real progress bar (vs an "N processed so far" counter) is high enough that we pay it. The first pass counts newlines, not parses CSV — node `readline` style, never instantiating row objects.

### 6.3 Validation and dedupe

- **Email validation**: a small in-house regex (`/^[^@\s]+@[^@\s]+\.[^@\s]+$/i`) plus a length cap. We do **not** ship a heavy validator like `validator.js` for this — false negatives on edge-case emails (`foo+bar@sub.example.co.uk`) are expensive in marketer trust, and the ESP will catch the truly bad ones anyway via hard bounces.
- **Dedupe**: the `(organization, email)` unique index. Upsert behaviour: append `listId` to `lists[]` if not present; merge `customFields`; keep existing `status` (we don't re-subscribe a previously-unsubscribed contact via CSV import — that's a compliance footgun).
- **Suppression check**: per-row before the upsert. Suppressed emails go straight to `skippedCount` with `reason: "suppressed"`. They are **not** added to the list.

### 6.4 Error reporting

The `errors` array on `ImportJob` is capped at 100 entries. Beyond that, `errorCount` keeps incrementing but the entries stop. The UI shows the first 100 inline and offers a "Download error CSV" button — for MVP this regenerates the CSV from `errors[]` on demand (no separate storage).

### 6.5 Max row count

**Decision: 1M rows per import in MVP.** Over that, the upload UI rejects with "Split into multiple files." This caps:

- Temp file size (100MB at ~100 bytes/row → 100MB).
- Worker runtime (~5–10 min at our row throughput).
- Mongo write amplification at peak.

A 5M-row import is a fine post-MVP feature; making the worker resumable across restarts is the actual work.

### 6.6 Why temp files instead of streaming to Mongo directly

We could parse the upload stream straight into Mongo without ever touching disk. We don't, because:

- A streamed upload + parse holds the HTTP connection open for the whole import. A network blip kills the import with no recovery.
- The two-process split means the worker isn't even on the same machine in some future deploy.
- Disk is cheap; resumability is valuable.

Tradeoff: we use disk space proportional to peak concurrent imports. Acceptable.

---

## 7. Compliance & Deliverability

### 7.1 Domain authentication (SPF / DKIM / DMARC)

A `SendingDomain` row is the spine. Workflow:

1. User adds a domain in Settings.
2. Cloud Code calls Postmark's `/sender-signatures` API; Postmark issues a DKIM selector + public key.
3. We surface DNS records to copy:
   - `DKIM` (TXT): `<selector>._domainkey.<domain>` → public key.
   - `Return-Path` (CNAME): `pm-bounces.<domain>` → `pm.mtasv.net`.
4. A 60-second cron polls `/sender-signatures/<id>` and updates `SendingDomain.status` when Postmark confirms.
5. SPF is **not** required by Postmark for DKIM-authenticated sends, but we surface it as a recommendation: `v=spf1 a mx include:spf.mtasv.net ~all`.
6. DMARC: we recommend `v=DMARC1; p=none; rua=mailto:dmarc@<domain>` but do not require it. Postmark's monthly DMARC report integration is a post-MVP nice-to-have.

A campaign cannot leave `draft` unless `fromEmail` matches a `SendingDomain` where `status === "verified"`. Hard-enforced in `Campaign.beforeSave`.

### 7.2 Bounce handling

- **Hard bounce**: `Suppression` row created (reason=`hard_bounce`), `Contact.status` = `"cleaned"`, `Campaign.bounceCount` $inc'd. The contact is excluded from future sends without manual reinstatement.
- **Soft bounce** (transient): an `EmailEvent` is written, `CampaignSend.status = "bounced"`, but **no** `Suppression`. The contact stays subscribed. We don't retry the same send — Postmark already did.
- **Blocked / spam-filtered**: treated as transient; no suppression. We bump `bounceCount` but don't clean the contact.

### 7.3 Complaint handling

A `SpamComplaint` webhook triggers:
1. `Suppression` row (reason=`complaint`).
2. `Contact.status = "unsubscribed"` (treating complaint as the strongest possible unsub signal).
3. `Campaign.complaintCount` $inc.
4. Alert on org-level complaint rate >0.1% over the last 7d — this is a deliverability emergency, not a normal stat.

### 7.4 Suppression list semantics

- **Scope**: per-organization. We do not maintain a global cross-tenant blocklist in MVP (tempting but legally fraught — one user's mistake shouldn't block another user's legitimate send to the same person).
- **Sources**: unsubscribe, hard_bounce, complaint, manual (via Settings → Suppression list), global_blocklist (reserved for future).
- **Reinstatement**: only via the Settings UI, only by an org owner, and the UI shows a warning. We log every reinstatement to an audit log.
- **Send-time filter**: every `campaign-fanout` job re-queries Suppression. We do **not** rely on `Contact.status` alone — a user could be `subscribed` on `Contact` but `unsubscribed` in `Suppression` due to a webhook race; Suppression wins.

### 7.5 CAN-SPAM / GDPR consent

- **CAN-SPAM**: every email carries a physical mailing address in the footer (from `Organization.mailingAddress` — a required field on Org creation, also surfaced as a hard gate at first-campaign-send), an unsubscribe link, and an honest `fromName`/`subject`.
- **GDPR consent capture**: we record `Contact.subscribedAt` and `Contact.source` on every contact. A future audit log of "where did this contact come from" is buildable from those plus `ImportJob`/signup form metadata. We do **not** in MVP gate sends on consent type — it's the marketer's responsibility to import only opted-in contacts.

### 7.6 Double opt-in

**Decision: out of MVP.** The schema reserves `List.doubleOptInRequired` so we can light it up later. Implementing the double-opt-in flow well (signup form → confirmation email → confirmation click → contact activation, with an expiring confirmation token) is a multi-day feature on its own. For MVP, all contacts imported via CSV or added manually are `status: "subscribed"` immediately, and the unsubscribe path is the primary compliance surface.

---

## 8. Reporting Architecture

### 8.1 Raw events vs rollups

**Decision: both. Raw `EmailEvent` rows for drill-down; denormalised counters on `Campaign` for list views.**

The counters on `Campaign` (`deliveredCount`, `openCount`, `clickCount`, `bounceCount`, `complaintCount`, `unsubscribeCount`) are the headline numbers. They're written by the `webhook-ingest` worker via atomic `$inc`. Reading them is a single document fetch — cheap, scales forever.

Raw events live in `EmailEvent`, indexed by `(campaign, type, occurredAt)`. Per-recipient drill-down queries `CampaignSend` rows by campaign; per-link click breakdowns query `EmailEvent` grouped by `linkId`. Time-series ("opens per hour") run an aggregation on `EmailEvent` filtered to `type: "open"` and bucketed by hour — direct Mongo aggregation, no precomputation.

**Why not just rollups?** The marketer wants to ask "who opened this?" Without raw events, that question is unanswerable.

**Why not just raw events?** The campaigns list view displays counters across 50 campaigns at once; running an aggregation per campaign per page load is wasteful.

### 8.2 Event retention

`EmailEvent.ingestedAt` carries a Mongo TTL index of 90 days. After 90 days, the raw event row is deleted. The rolled-up counters on `Campaign` survive — those are the historical record. We lose the ability to do per-link drill-down on a 4-month-old campaign; we keep all the numbers that matter.

Trade-off: a marketer who wants to forensic-debug an open-rate drop from 6 months ago is out of luck. We document the 90-day window in the UI ("Detailed events retained for 90 days") and call it MVP.

### 8.3 Per-campaign report queries

The Campaign report page surfaces:

| Metric | Source |
|---|---|
| Sent / Delivered / Bounced | Counters on `Campaign` |
| Unique opens / Total opens | `Campaign.openCount` + `EmailEvent` count where type=open |
| Unique clicks / Total clicks | Same pattern |
| Open rate / Click rate / CTOR | Derived client-side from counters |
| Per-link click breakdown | Aggregation on `EmailEvent` group by `linkId` |
| Top openers / clickers (recipient list) | `CampaignSend` query, sort by `clicks desc` then `opens desc` |
| Bounces by category | Aggregation on `EmailEvent` where type=bounce, group by `bounceCategory` |
| Time-series of opens/clicks over 24h | Aggregation on `EmailEvent`, `$bucket` by hour |

All of these are direct Mongo queries. None of them are pre-aggregated in MVP. At MVP scale (campaigns of ≤1M, retention 90d) every report query completes in single-digit seconds.

### 8.4 Pre-aggregation post-MVP

When campaigns hit 5M+ recipients or we want per-day cross-campaign dashboards, we add a `CampaignDailyRollup` class populated by a nightly cron. The migration is additive — read paths fall back to live aggregation if the rollup doesn't exist. We don't build it now.

---

## 9. Frontend Architecture

### 9.1 Routing and views

HTML5 history (`createWebHistory`), per `CLAUDE.md`. The Express SPA fallback (`/^(?!\/api|\/t|\/u|\/hooks).*/`) ensures tracking URLs (`/t/o/...`, `/u/...`) hit the server, never the SPA shell.

| Route | View | Auth | Notes |
|---|---|---|---|
| `/` | `Home.vue` | Public | Landing, marketing copy, signup CTA |
| `/signup` | `SignUp.vue` | Public | Creates Org + User + Role |
| `/login` | `Login.vue` | Public | |
| `/dashboard` | `Dashboard.vue` | Auth | Recent campaigns, org stats, send cap progress |
| `/audiences` | `AudiencesIndex.vue` | Auth | List of `List`s |
| `/audiences/:id` | `AudienceDetail.vue` | Auth | Contacts table, segments, custom fields |
| `/audiences/:id/import` | `Import.vue` | Auth | CSV import flow (4-step wizard) |
| `/segments/:id` | `SegmentEditor.vue` | Auth | Rule tree builder |
| `/templates` | `TemplatesIndex.vue` | Auth | |
| `/templates/:id` | `TemplateEditor.vue` | Auth | Block editor (§9.3) |
| `/campaigns` | `CampaignsIndex.vue` | Auth | List + filters |
| `/campaigns/new` | `CampaignWizard.vue` | Auth | 4-step: Recipients → From → Subject → Content |
| `/campaigns/:id` | `CampaignDetail.vue` | Auth | Pre-send review or post-send report |
| `/campaigns/:id/report` | `CampaignReport.vue` | Auth | Detailed report (charts + recipient drill-down) |
| `/settings` | `Settings.vue` | Auth | Org settings, sending domains, team |
| `/settings/domains/:id` | `DomainDetail.vue` | Auth | DKIM DNS records, verification status |
| `/settings/suppression` | `Suppression.vue` | Auth | Suppression list management |

### 9.2 Vuex module layout

Vuex 4, namespaced modules. The auth/session pattern is already wired in the scaffold: `auth.SET_USER` mutation, error sinks for code-209 (`INVALID_SESSION_TOKEN`) in `app.config.errorHandler` and `window.unhandledrejection` to flip the session-invalid flag in `utils/sessionGuard.js`.

```
src/store/
├── index.js              # createStore({ modules: { auth, org, network, importProgress } })
├── auth.js               # Parse.User.* wrappers; SET_USER, current user, role
├── org.js                # Current Organization, monthly send count, defaults
├── network.js            # navigator.onLine
└── importProgress.js     # In-flight import jobs (LiveQuery-fed reactive state)
```

Why these four and not more:

- **`auth`** is unavoidable — wraps `Parse.User.*` and exposes `currentUser` / `isAuthenticated` / `username` getters consumed by every guarded view.
- **`org`** holds the current Organization. Loaded once on session restore, updated rarely. Lives in the store so every view doesn't re-query it.
- **`network`** is cheap and useful for "you're offline" banners during the campaign send flow.
- **`importProgress`** holds the LiveQuery feed of in-flight import jobs so the global nav can show a "1 import running" pill regardless of which view the user is on.

Everything else (campaigns, segments, templates) lives in component-local `data()` — views own their data, mutations go straight to Parse. Reach for a Vuex module only when state needs to outlive a view or be read from more than one place (the four above earn it; the rest don't).

### 9.3 Email editor

Three viable choices:

| | Block-based JSON → MJML → HTML (in-house) | Raw HTML editor | Third-party (GrapesJS / Unlayer / EasyEmail) |
|---|---|---|---|
| Non-dev friendly | Yes | No | Yes |
| Output deliverability | Excellent (MJML handles Outlook quirks) | Marketer's problem | Varies |
| Bundle weight | ~80KB (MJML browser build) + ours | Tiny | 1–3MB for GrapesJS-class libs |
| We own the schema | Yes | N/A | No — locked into vendor JSON shapes |
| Time to first usable editor | ~2 weeks of focused work | 1 day | 3 days to integrate, but… |
| License / vendor risk | None | None | GrapesJS MIT but heavy customisation; Unlayer paid SaaS |

**Decision: block-based JSON → MJML → HTML, in-house.**

The output quality is what marketers actually judge a platform on, and MJML solves the Outlook/Gmail/iOS rendering matrix that we will lose 6 weeks of life to otherwise. Owning the JSON schema means a future "duplicate block," "block-level analytics," or "AI-write-this-block" feature is ours to design without vendor cooperation.

The schema:

```json
{
  "version": 1,
  "globals": { "bodyBg": "#f5f0fd", "fontFamily": "Helvetica, Arial, sans-serif", "linkColor": "#c026d3" },
  "blocks": [
    { "type": "header", "logoUrl": "...", "align": "center" },
    { "type": "text", "html": "<h1>Hello {{firstName}}</h1>" },
    { "type": "image", "src": "...", "alt": "...", "href": "..." },
    { "type": "button", "label": "Shop now", "href": "https://...", "bgColor": "#c026d3", "color": "#fff" },
    { "type": "divider" },
    { "type": "spacer", "height": 24 },
    { "type": "footer", "html": "..." }
  ]
}
```

The MVP block library: `header`, `text` (with a constrained rich-text editor — bold, italic, link, h1/h2, list), `image`, `button`, `divider`, `spacer`, `footer`. No columns, no custom HTML escape hatch — that's a deliberate v2 expansion.

`Template.beforeSave` runs `mjmlFromBlocks(blocks) → mjml2html(mjml)` and stores both `mjml` and `html` on the row. Send-time render only does the field-merge pass over `templateSnapshotHtml`.

### 9.4 Live preview

The editor shows a side-by-side preview that updates on every block edit. Implementation: an `<iframe srcdoc>` rendered with the compiled HTML, regenerated on a debounced 200ms keystroke. The iframe isolation prevents the editor CSS from styling the preview.

### 9.5 Routing-time data fetching

Each view fetches in `setup()` / `onMounted()`. We do **not** use route-level data loaders in MVP — route components stay simple and the auth guard handles the redirect-on-unauth case via `meta.requiresAuth`.

### 9.6 LiveQuery surfaces

LiveQuery (registered in `liveQuery.classNames`):

- `ImportJob` — for the import progress bar.
- `Campaign` — for the report view, so counters update without polling.

Everything else is fetched on view enter. We don't LiveQuery `Contact` (too noisy), `EmailEvent` (very noisy), or `Suppression` (rare).

Subscription lifetime: per-view, set up in `onMounted`, torn down in `onUnmounted`. Subscriptions for these classes are scoped to a single view, so they don't belong in `App.vue` — only put a subscription in `App.vue` if it must outlive every route (none in MVP).

---

## 10. Security & Rate Limiting

### 10.1 Parse ACLs on every class

The matrix:

| Class | Owner ACL | CLP `create` | CLP `find` |
|---|---|---|---|
| `Organization` | role:org_X read; org owners write | session | session |
| `_User` | self r+w; org members read | session-only via signUp Cloud Function | session |
| `List`, `Contact`, `CustomField`, `Segment`, `Template`, `Campaign`, `SendingDomain` | role:org_X r+w | session | session |
| `CampaignSend`, `EmailEvent`, `Suppression` | `{}` (master key only) | requiresMasterKey | requiresMasterKey |
| `ImportJob` | role:org_X read; master key write | requiresMasterKey | session |

The pattern: anything the user creates or owns flows through normal ACL. Anything generated by the system (sends, events, suppressions) is master-key-only — there is no path for a client SDK to read another tenant's sends or fabricate an event.

CLP enforcement happens in `server/cloud/main.js` via `Parse.Schema(...).update()` calls at boot time, idempotent on re-runs.

### 10.2 Master key discipline

The master key is read from `PARSE_MASTER_KEY` on the server only. It never reaches the SPA. Workers use it freely (they don't process user input directly — they consume queue jobs that were validated when they were enqueued). Cloud Code uses it explicitly via `useMasterKey: true` on the calls that need it.

Every Cloud Function that takes user-supplied IDs re-fetches the object with the master key for an authoritative read, then checks ownership against the calling user's org. **Never** trust the client to send the org ID — derive it from `request.user`.

### 10.3 Per-tenant API rate limits

Express-level rate limiter (`express-rate-limit` backed by Redis):

| Endpoint group | Limit | Bucket |
|---|---|---|
| `POST /api/login` | 10/min | IP |
| `POST /api/users` (signup) | 5/min | IP |
| `POST /api/functions/imports.start` | 5/min | userId |
| `POST /api/functions/campaigns.send` | 10/hour | orgId |
| `POST /api/functions/campaigns.preview` | 30/min | userId |
| `POST /api/functions/segments.preview` | 60/min | userId |
| All other `/api/*` | 600/min | userId |

These are blunt instruments — the goal is to keep a runaway script from DOSing the cluster, not to enforce business-tier limits. Business-tier limits (monthly send cap) live on `Organization` and are checked in Cloud Code.

### 10.4 Tracking endpoint rate limits

`/t/o/*` and `/t/c/*` are unauthenticated by design (recipients clicking them don't have sessions). We accept that they're DOSable as a class of endpoint, and we mitigate:

- Per-IP rate cap (`express-rate-limit`, 600/min/IP) — not to prevent legit users, but to slow a single attacker.
- HMAC validation is cheap and rejects garbage in <1ms.
- The actual event-write path is queued, not synchronous — so even under load the response stays fast.

### 10.5 Sending rate limits

Covered in [§3.4](#34-rate-limiting). To restate: BullMQ rate-limiter `groupKey: orgId` enforces per-org caps, a global `p-limit(50)` semaphore protects Postmark.

### 10.6 Webhook authentication

Postmark webhooks are authenticated via Basic Auth with a shared secret embedded in the webhook URL (Postmark supports this natively). The middleware compares against `POSTMARK_WEBHOOK_SECRET` env var. We do **not** rely on Postmark IP whitelisting in MVP — IP ranges change.

---

## 11. Observability

### 11.1 Logging

Structured JSON logs from both web and worker processes, via `pino`. Required fields on every line: `ts`, `level`, `service` (`"web"` or `"worker"`), `traceId`. Per-org logs additionally carry `orgId`.

What gets logged where:

| Event | Where | Level |
|---|---|---|
| Cloud Function call (entry/exit) | web | debug |
| Cloud Function error | web | error |
| Webhook received | web | info (sparingly — sample 1%) |
| Webhook processed | worker | info |
| Webhook ingestion error | worker | error |
| Campaign fanout start / end | worker | info |
| `send-email` per-send | worker | debug; sample 10% to keep volume sane |
| `send-email` failure | worker | warn (with response body, truncated) |
| Suppression created | worker | info |
| BullMQ job failure | worker | error (final attempt only) |
| Parse error 209 | web | warn |

Logs are written to stdout; in production a log forwarder ships them to wherever (Datadog / Loki / CloudWatch — out of scope for this doc).

### 11.2 Metrics

A Prometheus-format `/metrics` endpoint on the web process, scraped by whatever runs in front. Key gauges and counters:

| Metric | Type | Labels |
|---|---|---|
| `gorilla_emails_sent_total` | counter | `org`, `result` (`sent`/`failed`/`suppressed`) |
| `gorilla_emails_delivered_total` | counter | `org` |
| `gorilla_bounces_total` | counter | `org`, `category` |
| `gorilla_complaints_total` | counter | `org` |
| `gorilla_unsubscribes_total` | counter | `org` |
| `gorilla_send_queue_depth` | gauge | `queue` |
| `gorilla_send_queue_lag_seconds` | gauge | `queue` — age of oldest waiting job |
| `gorilla_send_duration_seconds` | histogram | — |
| `gorilla_webhook_ingest_duration_seconds` | histogram | `event_type` |
| `gorilla_import_active` | gauge | `org` |

Worker process exposes its own `/metrics` on a separate port.

### 11.3 Alert thresholds

| Condition | Severity |
|---|---|
| Org complaint rate >0.1% over 24h | page |
| Org bounce rate >5% over 24h | page |
| `send-email` queue lag >5min | page |
| `webhook-ingest` queue lag >2min | warn |
| `campaign-fanout` job failed after 3 retries | page (campaign visibly broken to user) |
| Postmark 5xx rate >1% over 5min | page |
| Mongo connection failures | page |
| Redis connection failures | page |

The actual page/warn routing is out of scope.

### 11.4 How we'll know things are broken

The two scariest failure modes:

1. **Silent under-delivery** — campaigns appear to send but Postmark is rejecting them. Caught by `gorilla_emails_sent_total{result="failed"}` rising sharply. Also caught by `Campaign.bounceCount / recipientCount` spiking in the dashboard.
2. **Webhook ingestion lag** — emails are going out, but our reports say nothing happened. Caught by `gorilla_webhook_ingest_duration_seconds` and the queue depth gauge.

Less scary but visible:

- LiveQuery dropouts — UI stops updating, user complains. We add a fallback `setInterval(refresh, 30s)` on Campaign report views so a dropped LiveQuery never freezes the report stats.

---

## 12. Out of MVP

Explicit non-goals. Calling these out so reviewers stop pitching them:

- **Billing / Stripe integration**. Free tier only; `Organization.monthlySendCap` enforces a ceiling. Plans, upgrades, invoices, dunning — all out.
- **A/B testing**. Subject-line splits, content variants, send-time arms. Out.
- **Automations / journeys / drip campaigns**. No triggered sends, no welcome series, no abandoned-cart flows.
- **Landing pages**. The platform sends email; it doesn't host pages.
- **SMS / push / WhatsApp**. Email-only.
- **Transactional API**. We do not expose a "send this email now" REST endpoint. All sends go through the Campaign UI. (Postmark's own transactional API is sitting right there and tempting, but supporting it correctly means rate plans, API keys per tenant, full SDK story — too much for MVP.)
- **Predictive analytics / send-time optimisation / AI subject lines**. None.
- **Integrations marketplace** (Shopify, Salesforce, Zapier, etc.). None. Org members import via CSV.
- **Multi-language UI**. English only.
- **Custom domains for tracking links**. All clicks go through `gorilla.example/t/c/*`. Custom tracking domains (CNAME `t.<tenant-domain>` → gorilla) are a v2.
- **Dedicated IPs**. All sends share Postmark's shared transactional IP pool. Dedicated IPs require warming and a tier of marketer who isn't our MVP customer.
- **DMARC reporting dashboard**. We recommend DMARC config, we don't ingest reports.
- **Team management UI beyond the basics**. Invite/remove members, single owner-vs-member role distinction. No granular per-class permissions, no audit log UI.
- **2FA / SSO**. Password auth only.
- **Webhook outbound API** (i.e. "notify my system when a send completes"). Marketer-facing webhooks are out.
- **Mobile apps**. Web only.
- **Image hosting**. Image blocks reference URLs; we don't host the images.

---

## 13. Key Trade-off Decisions

| Decision | Why | Alternatives considered | Cost of changing later |
|---|---|---|---|
| **Multi-tenant from day one (Organization + Role + ACL)** | Single-user paints us into a corner the first time a marketer invites a teammate. ACL isolation is the same machinery Parse already runs. | Single-user MVP, add Org in v2 | High — every query and every ACL would need rewriting. Cheap to put in now; expensive to retrofit. |
| **Postmark as the ESP** | Best deliverability defaults, simplest webhook model, fastest setup. SES is cheaper but the IAM/identity dance burns days. | SES (cheaper, heavier setup), SendGrid (mixed deliverability) | Low — the ESP boundary is a single adapter (`server/cloud/esp/*.js`) and the schema fields generalise. |
| **Redis + BullMQ for the send pipeline** | Battle-tested retry/rate-limit semantics. Mongo-backed gets awkward fast on per-tenant throttling. Parse Cloud Jobs are designed for cron, not throughput. | Mongo-backed queue (less infra), Parse Cloud Jobs (too coarse), AWS SQS (heavy setup) | Medium — workers and rate-limiting logic would need to be rewritten. The job handlers themselves are portable. |
| **Block-based JSON → MJML → HTML editor, in-house** | Output deliverability across email clients is what marketers judge us on; MJML solves the Outlook/Gmail matrix. Owning the JSON schema means future features (analytics-per-block, AI assist) are ours to design. | Raw HTML (hostile to non-devs), GrapesJS (heavyweight, vendor schema), Unlayer (paid SaaS) | Medium — schema migration of saved templates is non-trivial. Cheap if we do it before 1000 templates exist; expensive at scale. |
| **Snapshot recipients at queue time (`CampaignSend` row per recipient)** | Stable recipient set is required for per-recipient reports and idempotent fanout. Avoids "segment changed mid-send" footgun. | Evaluate at each `send-email` job (no `CampaignSend` until ESP accepts) | Low — the `CampaignSend` table is the report. Removing snapshotting is a regression, not a refactor. |
| **Raw `EmailEvent` + denormalised counters on `Campaign`** | List-of-campaigns view is one document read per row. Drill-down works because raw events exist. Both is the price of doing one well. | Counters only (no drill-down), Raw only (every list view is an aggregation) | Low — adding rollups later is additive. Stripping raw events is a feature loss. |
| **Customer fields as embedded Object on Contact** | Average 5–20 small scalars per contact; splitting into a value-class explodes row count and breaks segment perf. Mongo wildcard indexes solve the indexing problem. | Separate `ContactCustomFieldValue` join class | Medium — migrating to a join class is data movement plus segment compiler rewrite. Not bad, but not trivial. |
| **Contacts have a global `status`, not per-list opt-out** | Most marketers don't run per-list unsubscribe semantics. One row per person is simpler. | Per-list status via a join class | Low — adding a `ListUnsubscribe` join class later is purely additive. |
| **HTML5 history, web SPA serves at `/`** | Cleaner URLs, no SEO concerns (auth-gated), Express fallback already handles it per CLAUDE.md. | Hash history (`createWebHashHistory`) | Trivial — config flip. |
| **Suppression list checked at fanout, not cached on Contact** | A single source of truth is more defensible than "did we remember to sync the flag?" Webhook races can flip Suppression without flipping Contact instantly. | Cache suppression status on Contact | Trivial — we already do this. |
| **No double opt-in in MVP** | Multi-day feature with its own UI surface (signup form + confirmation flow). Imported contacts are the marketer's compliance burden. | Implement double-opt-in for V1 | Low — `List.doubleOptInRequired` field is reserved, all logic lives in the signup-form flow which doesn't exist yet. |
| **Tracking URLs signed, not opaque IDs** | Pixel and click endpoints stay fast without DB lookups; tampering is impossible. | Opaque IDs (DB lookup per request) | Low — both schemes can coexist; we'd add ID-based on top of signed tokens. |
| **TTL on `EmailEvent` raw rows at 90d, counters retained forever** | Headline numbers survive; drill-down is bounded. Mongo TTL is free. | Retain raw forever (storage cost), drop raw entirely (no drill-down) | Trivial — change the TTL or drop the index. |
| **Subscription form / double opt-in / public signup widgets are out of MVP** | Each one is a feature with its own UI, validation, and abuse vectors. CSV import gets us to "first campaign sent" fastest. | Build at least a hosted signup form for MVP | Low — additive. |
| **One Express process serves SPA + API + tracking endpoints + webhooks** | One pm2 entry, one port — operationally simple and sufficient for MVP traffic. The BullMQ worker is the only separate process. | Separate process per concern (API / tracking / webhooks) | Low — splitting is mechanical when scale demands it; the routes are already namespaced. |
| **No transactional API for MVP** | API keys per tenant + per-key rate limits + a separate ingress queue = a feature in itself. The MVP user wants to send marketing campaigns from the UI. | Expose a `/api/v1/send` endpoint | Medium — designing the transactional API after the fact is fine, but the data model needs `messageType: "campaign" \| "transactional"` and a parallel suppression scope. |

---

## 14. Open Questions

Things the principal-engineer take cannot resolve without product input:

1. **MVP send cap**: I've assumed `monthlySendCap` defaults to 10,000/org/month. Higher and we burn through Postmark's free tier; lower and we don't have a usable demo. Product call.
2. **Custom field hard limit**: how many `CustomField` definitions per org? I've assumed unlimited; Mongo's wildcard index on `customFields.$**` scales fine to ~20. Beyond ~50 we get index bloat. Set a soft cap (e.g. 30) and surface in the UI? Product call.
3. **What happens at the monthly cap?** Hard-block ("you've sent all your emails this month") or soft-warn ("you're at 95%, contact us")? I've assumed hard-block in the fanout job. Product call.
4. **Send-from-shared-domain story**: a brand-new user has no verified domain. Do we offer "send from `@gorilla-mail.example` for your first campaign" as an onboarding ramp, or hard-gate on domain verification? Hard-gate is the safer answer; the ramp speeds time-to-first-send. Product call.
5. **Inbound-email handling for the `mailto:` unsub address**: I've assumed we wire Postmark Inbound to a webhook and parse subject lines. That's a non-trivial extra integration. Alternative: drop the `mailto:` variant of `List-Unsubscribe` and rely entirely on the HTTPS one-click. The HTTPS variant is what Gmail/Yahoo actually use; the `mailto:` is RFC ceremony at this point. Worth a product discussion before we wire the inbound webhook.
6. **Contact deletion vs anonymisation** (GDPR right-to-erasure): when a user deletes a contact, do we leave the per-recipient send/event rows in place with a null pointer, or cascade-delete? I've assumed cascade-delete via a Cloud Function. The downside: we lose historical campaign report row counts. Product call worth surfacing.
7. **Team invite flow**: I've reserved a `role` field on `_User` (`owner` / `admin` / `member`) but the UI for inviting a teammate isn't in the MVP scope as I've drawn it. Inviting + role assignment is a 2-day feature; including it in MVP means delaying the first send-something demo. Out of MVP unless explicitly requested.
8. **Transactional consistency on signup**: creating Org + Role + User is three writes. Mongo transactions exist (replica-set required) but local dev runs against a single-node. Decision so far: do it in order (Org → Role → User), fail-open if any step fails (orphan rows are detectable and cleanable by a cron). Should we require a replica set in MVP? Probably not, but it's worth the user knowing.
9. **Sandbox / test-send mode**: do we let a marketer send a campaign to "just these 5 emails" without it counting as a campaign-of-record? Useful for QA, complicates the data model (we'd need a `testSends: boolean` on `Campaign` and "real" vs "test" partitioning everywhere). I've assumed it's out of MVP — but it's the single most-requested feature in adjacent platforms. Product call.

---
