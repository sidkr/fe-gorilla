# OLAP migration runbook — `EmailEvent` firehose → ClickHouse

Status: **plan / not started.** Companion to `DECISIONS.md #13` ("Parse is the app, not the platform"). This is the concrete, reversible path to move the event firehose + reporting reads off MongoDB onto a columnar store, without rewriting the app.

---

## 1. Why & when

`EmailEvent` (deliveries/opens/clicks/bounces/complaints) is append-only, time-series, queried by aggregation — the workload Mongo is worst at. We already denormalize counters onto `Campaign` (`bumpCounter`) to dodge aggregation; that's the schema admitting the analytics store is mismatched.

**Start when a trigger fires (not on a calendar):**
- Reporting feels slow / we keep adding denormalized counters to avoid aggregation. ← primary
- We want real per-link / cohort / deliverability dashboards (the reporting roadmap).
- `EmailEvent` row count enters the 100M+ range or aggregation queries exceed ~1s.

Until then, the current Mongo `EmailEvent` is fine.

---

## 2. Scope — the data boundary

Move **only** the firehose. Everything transactional stays put.

| Stays in Parse / Mongo (system-of-record) | Moves to ClickHouse (analytics) |
|---|---|
| All control-plane CRUD (orgs, contacts, campaigns, templates, segments, settings) | **`EmailEvent`** — the unbounded firehose |
| **`Suppression`** — must be transactional at send time (`isSuppressed` gate) | All reporting **aggregations** built from events |
| **`CampaignSend`** — the bounded "we sent X to Y + their terminal status" snapshot; `getCampaignRecipients` reads it | |
| `Campaign` counters (`bumpCounter`) — optionally retired to a cache once CH rollups exist | |

Result: **`CampaignSend` (snapshot, Mongo) + `EmailEvent` (firehose, ClickHouse)**.

Do **not** move the control plane, `CampaignSend`, or `Suppression` — ClickHouse is bad at point updates / transactions.

---

## 3. Target architecture

```
 open pixel /t/o ─┐
 click    /t/c ──┤ server/routes/tracking.js  (recordOpen/recordClick/recordUnsub)
 unsub    /u   ─┘
 SES webhook   ──  server/worker/jobs/webhookIngest.js (writeEmailEvent)
 send accepted ──  server/worker/jobs/sendEmail.js (~L141)
        │
        ▼
   server/lib/events.js  recordEmailEvent(fields)     ← NEW single seam
        ├── Parse EmailEvent (Mongo)   [phases 1–3]
        └── ClickHouse sink            [phases 1+]
                 │  async_insert (early)  /  Kafka→CH engine table (at scale)
                 ▼
            ClickHouse: email_events (ReplacingMergeTree)
                 └── materialized views → campaign_rollup, link_rollup
                          ▲
   reporting reads ───────┘  server/cloud/reports.js
     getCampaignReport / getCampaignLinkBreakdown → ClickHouse
     getCampaignRecipients → stays on CampaignSend (Mongo)
```

---

## 4. ClickHouse DDL

```sql
CREATE TABLE email_events (
  org_id      String,
  campaign_id String,
  send_id     String,                       -- CampaignSend id
  contact_id  String,
  type        LowCardinality(String),       -- accepted|delivered|open|click|bounce|complaint|unsubscribe
  occurred_at DateTime64(3) CODEC(Delta, ZSTD),
  link_url    String DEFAULT '',
  link_id     LowCardinality(String) DEFAULT '',
  bounce_cat  LowCardinality(String) DEFAULT '',
  ua          String DEFAULT '',
  ip_prefix   String DEFAULT '',
  ingested_at DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(ingested_at)     -- collapses retried webhooks / prefetched pixels
ORDER BY (org_id, campaign_id, type, send_id, occurred_at)
PARTITION BY toYYYYMM(occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 90 DAY;  -- raw rows expire; rollups (below) live forever
```

**Headline rollup — replaces `bumpCounter`** (incrementally maintained; `uniq*` gives correct *unique* opens/clicks, which `$inc` can't):
```sql
CREATE MATERIALIZED VIEW campaign_rollup_mv
ENGINE = AggregatingMergeTree ORDER BY (org_id, campaign_id) AS
SELECT org_id, campaign_id,
       countIf(type='delivered')                  AS delivered,
       uniqExactStateIf(contact_id, type='open')  AS unique_opens,
       uniqExactStateIf(contact_id, type='click') AS unique_clicks,
       countIf(type='bounce')                      AS bounces,
       countIf(type='complaint')                   AS complaints,
       countIf(type='unsubscribe')                 AS unsubscribes
FROM email_events GROUP BY org_id, campaign_id;
-- read: SELECT delivered, uniqExactMerge(unique_opens) AS opens, ... FROM campaign_rollup_mv WHERE campaign_id = ?
```

**Per-link rollup** (powers `getCampaignLinkBreakdown`):
```sql
CREATE MATERIALIZED VIEW link_rollup_mv
ENGINE = AggregatingMergeTree ORDER BY (org_id, campaign_id, link_url) AS
SELECT org_id, campaign_id, link_url,
       uniqExactState(contact_id) AS unique_clicks
FROM email_events WHERE type='click' GROUP BY org_id, campaign_id, link_url;
```

Notes:
- **Idempotency:** webhooks retry and Gmail prefetches the open pixel. `ReplacingMergeTree` dedups on the `ORDER BY` key (use a stable `occurred_at` from the SES event, not ingest time, for opens/clicks dedup within a send). For exactness, query with `FINAL` or dedup in the read MV.
- **First-open / first-click time** (if ever needed beyond `CampaignSend.openedAt`): `argMinState(occurred_at, ...)` or `min(occurred_at)` per `(campaign_id, contact_id)`.

---

## 5. Ingestion — do **not** insert per event

ClickHouse hates many tiny inserts (each = a part to merge). By stage:
- **Phase 1 (low volume):** `async_insert=1, wait_for_async_insert=0` — the CH server batches. Simplest, ships today.
- **At scale (recommended):** handlers publish to **Kafka / Redpanda**; a CH **Kafka engine table + MV** consumes into `email_events` in batches. Decouples ingest spikes, gives replay, and converges with the queue swap (DECISIONS #2) onto one streaming backbone.

---

## 6. Concrete code changes in this repo

### 6.1 New: `server/lib/clickhouse.js` (CH client, safe no-op when unconfigured)
```js
const { createClient } = require("@clickhouse/client");   // npm i @clickhouse/client
const { optional } = require("./env");
let client = null;
function getCH() {
  if (client) return client;
  const url = optional("CH_URL", "");
  if (!url) return null;                                   // OLAP off → callers no-op
  client = createClient({ url, username: optional("CH_USER","default"),
    password: optional("CH_PASSWORD",""), database: optional("CH_DATABASE","gorilla") });
  return client;
}
async function insertEvents(rows) {
  const ch = getCH(); if (!ch || !rows.length) return;
  await ch.insert({ table: "email_events", values: rows, format: "JSONEachRow",
    clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 } });
}
module.exports = { getCH, insertEvents };
```

### 6.2 New: `server/lib/events.js` — the single dual-write seam
```js
const Parse = require("parse/node");
const { insertEvents } = require("./clickhouse");
const { optional } = require("./env");

// Writes one email event to whichever sinks are enabled by EVENTS_OLAP:
//   "off"  → Mongo only (today)   "dual" → Mongo + ClickHouse   "read" → ClickHouse only
async function recordEmailEvent(f) {   // f: { organization, campaign, campaignSend, contact, type, timestamp, linkUrl, linkId, userAgent, ipPrefix, bounceCategory, raw }
  const mode = optional("EVENTS_OLAP", "off");
  if (mode !== "read") {
    const ev = new Parse.Object("EmailEvent");
    ev.set({ organization: f.organization, campaign: f.campaign, campaignSend: f.campaignSend,
      contact: f.contact, type: f.type, timestamp: f.timestamp || new Date(),
      linkUrl: f.linkUrl, linkId: f.linkId, userAgent: f.userAgent, ipAddress: f.ipPrefix,
      bounceCategory: f.bounceCategory, raw: f.raw });
    await ev.save(null, { useMasterKey: true });
  }
  if (mode === "dual" || mode === "read") {
    await insertEvents([{ org_id: f.organization?.id, campaign_id: f.campaign?.id,
      send_id: f.campaignSend?.id, contact_id: f.contact?.id, type: f.type,
      occurred_at: (f.timestamp || new Date()).toISOString(), link_url: f.linkUrl || "",
      link_id: f.linkId || "", bounce_cat: f.bounceCategory || "",
      ua: f.userAgent || "", ip_prefix: f.ipPrefix || "" }]).catch((e) =>
        console.warn("[events] CH insert failed (non-fatal in dual mode):", e.message));
  }
}
module.exports = { recordEmailEvent };
```

### 6.3 Refactor the three write sites to call `recordEmailEvent`
- `server/worker/jobs/webhookIngest.js` → replace the body of `writeEmailEvent(send, type, event, extra)` (L29) with a `recordEmailEvent({...})` call.
- `server/worker/jobs/sendEmail.js` (~L141) → the `"accepted"` event.
- `server/routes/tracking.js` → `recordOpen` / `recordClick` / `recordUnsub` (L68/84/103) — note these run **async after the HTTP response**; keep that (CH insert is fire-and-forget).

This is the whole dual-write: one new helper, ~4 call-sites swapped. No behavior change while `EVENTS_OLAP=off`.

### 6.4 Reads — `server/cloud/reports.js`
- `getCampaignReport` (L322) → read `campaign_rollup_mv`. Keep `bumpCounter` as a 10–30s cache or retire it (the UI already client-caches).
- `getCampaignLinkBreakdown` (L336) → `link_rollup_mv` / the `email_events` `type='click'` group-by (replaces the Mongo `EmailEvent` query at L348).
- `getCampaignRecipients` (L386) → **unchanged**, stays on `CampaignSend`.
- `getDashboardMetrics` (L147) — org lifetime totals can come from CH rollups summed across campaigns, or keep reading Campaign counters.

### 6.5 Env
```
EVENTS_OLAP=off            # off | dual | read   (feature flag, the migration dial)
CH_URL=                    # https://<host>:8443  (empty → CH disabled)
CH_DATABASE=gorilla
CH_USER=default
CH_PASSWORD=
```

---

## 7. Migration phases (each independently shippable & reversible)

| Phase | Change | Verify | Rollback |
|---|---|---|---|
| **0 · Infra** | Provision CH (managed Cloud to start); apply the DDL in §4 | rollup MVs exist, empty | drop DB |
| **1 · Dual-write** | Ship §6.1–6.3; set `EVENTS_OLAP=dual` | `count()` per campaign in CH == Mongo `EmailEvent` over a window (shadow-diff job) | `EVENTS_OLAP=off` |
| **2 · Backfill** | Batched job: read `EmailEvent` (Parse, master key, paged by `createdAt`) → `insertEvents` | CH total == Mongo total for history | truncate CH `email_events`, rerun |
| **3 · Cut reads** | Point `getCampaignReport` + link-breakdown at CH behind a per-read flag; run in shadow first (compute both, log diffs) | CH numbers within tolerance of Mongo-derived for N campaigns | flip read flag back to Mongo |
| **4 · Drop Mongo writes** | `EVENTS_OLAP=read`; add a TTL index to Mongo `EmailEvent` to age it out; `bumpCounter` → cache-only or removed | dashboards green off CH only | `EVENTS_OLAP=dual` (re-resume Mongo writes) |

Backfill sketch:
```js
// scripts/backfill-events-to-ch.js  (run once, phase 2)
let skip = 0;
for (;;) {
  const q = new Parse.Query("EmailEvent").ascending("createdAt").limit(5000).skip(skip);
  const rows = await q.find({ useMasterKey: true });
  if (!rows.length) break;
  await insertEvents(rows.map(toChRow));   // toChRow mirrors §6.2 mapping
  skip += rows.length;
}
```

---

## 8. Retention, privacy, GDPR

- **TTL:** raw `email_events` expire at 90d (§4); rollup MVs persist forever (headline numbers survive). Matches the Mongo `EmailEvent` 90d intent.
- **GDPR delete-by-contact:** `ALTER TABLE email_events DELETE WHERE contact_id = ?` (lightweight delete; rare, acceptable) — wire into the existing `deleteContactData` cloud fn so it fans the erase to CH too.
- **Tenant offboarding:** because `org_id` leads the `ORDER BY` and data is monthly-partitioned, a tenant purge is cheap (`DELETE WHERE org_id=?`, or partition-scoped).

---

## 9. Ops & cost

- **Start managed (ClickHouse Cloud)** — removes ops; pay-per-use. Self-host (a small CH node compresses email events ~10×) only when volume justifies the ops.
- **Consistency:** events land asynchronously → reporting is *near*-real-time (rollups update within seconds). The UI already tolerates this (client-side 10–30s cache). Headline counters are no longer hand-maintained, so they can't drift.
- **Sizing intuition:** email events compress extremely well; even billions of rows are modest storage. The cost is ingestion plumbing, not storage.

---

## 10. Explicitly out of scope (here)

- Control-plane migration Parse → Postgres (DECISIONS #13's bigger lift) — only on its own trigger.
- Moving `CampaignSend` / `Suppression` to CH — they're transactional; they stay.
- Self-hosting CH on day one.
- The queue swap (Agenda → Redis/Kafka, DECISIONS #2) — related but separable; if/when you add Kafka for ingestion (§5), reuse it for the send queue.
