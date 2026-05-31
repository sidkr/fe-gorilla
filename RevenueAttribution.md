# Gorilla — Revenue Attribution & Ecommerce Integration Plan

Status: **plan / pre-implementation** — authored 2026-05-30. Companion to
`NextPhase.md` (features) and `LaunchReadiness.md` (launch gates). This addresses
the single biggest *value* gap surfaced in the feature audit: the product can
tell a marketer that a campaign got opened and clicked, but **not whether it made
any money.**

---

## 1. Audit findings (what exists today)

Two thorough audits confirm the product is **zero-revenue-attribution** and has
**no third-party integrations**.

**Reporting today** is purely email-engagement:
- KPIs: sent, delivered, open rate, click rate, bounce rate, unsubscribe rate;
  per-link click breakdown; per-recipient activity; CSV export.
- Dashboard: audience size, campaign-status counts, lifetime engagement rates.

**Completely absent (confirmed by repo-wide search):**
- ❌ Any monetary field anywhere (revenue, order, AOV, GMV, price, amount).
- ❌ Conversion / purchase tracking endpoint (only the open pixel + click redirect).
- ❌ Any `Contact` notion of lifetime value or order history.
- ❌ Shopify / WooCommerce / BigCommerce / Stripe integration.
- ❌ Inbound events API or per-org API keys.
- ❌ Outbound webhooks.

A marketer **cannot answer "which campaign drove these sales?"** — table-stakes
for ecommerce email marketing, and the headline gap.

**Architecture is, however, very ready to extend** (second audit):
- Tenancy spine auto-stamps org + ACL on any new per-tenant class via
  `registerBeforeSave` + `PER_TENANT_CLASSES` — zero manual plumbing.
- Agenda worker: `register(agenda)` + pure `handle(data)` per job; enqueue via
  `getAgenda().now(NAME, data)`.
- Public routes: `routes/*.mount(app)` + `nuxt.config` proxy; HMAC-verify
  pattern already used for SES/SNS in `webhookIngest.js` — the template for ecom.
- **Tracking tokens are HMAC-signed, self-contained, and never expire** — they
  already encode `sendId` and can carry attribution back to a `CampaignSend` →
  `contact` → `campaign`. This is the linchpin that makes attribution feasible.

---

## 2. The attribution model (core design)

**How a purchase ties back to a campaign:**

```
Email sent → CampaignSend{contact, campaign} created, click links carry a
             signed token encoding sendId.
Recipient clicks → /t/c/:token records a click AND drops a first-party
             attribution cookie/identifier (sendId + contactId + ts) on the
             store domain handoff, OR we match later by email.
Recipient buys on the store → store fires an order event (webhook or pixel)
             carrying email + order value + orderId (+ the attribution id if present).
We ingest → look up the CampaignSend (by attribution id, else by contact email
             within an attribution window) → write a Conversion row →
             bump Campaign.revenueTotal / conversionCount.
Reports → group Conversion by campaign → revenue, orders, AOV, conversion rate,
             revenue-per-recipient, ROAS.
```

**Attribution rules (MVP, configurable later):**
- **Last-click within an attribution window** (default 7 days) — the most recent
  campaign the contact clicked before the order gets credit. Simple, defensible,
  matches what ecommerce ESPs do by default.
- Fallback: if no click, **last-open within a shorter window** (default 1 day),
  flagged as weaker attribution.
- An order with no matching engagement → recorded as **unattributed revenue**
  (still valuable as a baseline / store-total denominator).
- Idempotent on `(organization, orderId, sourceType)` so webhook retries and
  pixel double-fires don't double-count.

---

## 3. Data model (new classes + field additions)

All per-tenant (registered in `bootstrapSchemas` + `PER_TENANT_CLASSES`),
org+ACL auto-stamped.

**`Conversion`** — one row per attributed (or unattributed) order:
- `organization` →Org, `contact` →Contact (nullable), `campaign` →Campaign
  (nullable), `campaignSend` →CampaignSend (nullable), `automation`/`automationStep`
  (nullable — attribute automation revenue too).
- `orderId` (String), `sourceType` (String: shopify|woocommerce|api|pixel|manual),
  `revenue` (Number, minor units or decimal — decide), `currency` (String),
  `itemCount` (Number), `occurredAt` (Date), `attributionModel` (String:
  last_click|last_open|unattributed), `attributionWindowDays` (Number),
  `raw` (Object — original payload).
- Indexes: `(organization, occurredAt)`, `(organization, orderId, sourceType)`
  **unique** (idempotency), `(campaign)`, `(contact)`.

**`StoreConnection`** — a connected ecommerce store per org:
- `organization` →Org, `provider` (shopify|woocommerce|bigcommerce|custom),
  `shopDomain` (String), `status` (connected|pending|error),
  `webhookSecret` (String, for verifying inbound), `accessToken` (String,
  encrypted — for outbound API/OAuth later), `installedAt`, `lastEventAt`,
  `settings` (Object: attribution window, currency).
- Index: `(organization, provider, shopDomain)` unique.

**`ApiKey`** — org-scoped key for the inbound events API + future partner use:
- `organization` →Org, `name`, `keyPrefix` (String, shown), `keyHash` (String —
  store a hash, never the raw key), `scopes` (Array), `lastUsedAt`, `revokedAt`.
- Index: `(keyPrefix)` unique. Raw key returned **once** on creation.

**Field additions:**
- `Campaign`: `revenueTotal` (Number*), `conversionCount` (Number*),
  `orderCount` (Number*) — denormalized counters, $inc'd by the ingest job (same
  pattern as the engagement counters in campaignCounters.js).
- `Contact`: `totalRevenue` (Number*), `orderCount` (Number*),
  `lastOrderAt` (Date*) — lifetime-value rollup for segmentation.
- `Automation`: `revenueTotal`, `conversionCount` (so automation ROI shows too).

---

## 4. Ingestion surfaces (how orders get in)

Three intake paths, all converging on one `ingestConversion` worker job
(mirrors webhookIngest.js: validate → look up → write Conversion → bump counters,
fast-ack + async).

**A. Ecommerce webhooks** (`server/routes/ecommerceWebhooks.js`, public):
- `POST /webhooks/shopify` — verify `X-Shopify-Hmac-SHA256` against the
  StoreConnection's `webhookSecret`; resolve org from shop domain; enqueue.
- `POST /webhooks/woocommerce` — WooCommerce HMAC.
- Always `200` (no partner retry storms); enqueue, never block.

**B. Inbound events API** (`server/routes/eventsApi.js`, public, API-key auth):
- `POST /api/v1/events/purchase` — `Authorization: Bearer <apiKey>`; body
  `{ email, orderId, value, currency, occurredAt, attributionId? }`. For stores
  on platforms we don't natively integrate, or server-to-server.
- Rate-limited per key; idempotent on `orderId`.

**C. Conversion pixel** (`server/routes/tracking.js`, extend):
- `GET /t/p/:token` (or a JS snippet) on the store's order-confirmation page,
  carrying `value` + `orderId`. Token encodes the attribution id from the click
  handoff. Lowest-integration-effort path for non-technical users (paste a
  snippet), weaker/again-confirmable attribution.

Plus an **attribution handoff** on click: `/t/c/:token` appends a signed
`?ga=<attrId>` (or sets a first-party cookie on redirect) so a later pixel/order
can name the exact send without relying on email match.

---

## 5. Reporting (turn data into the answers marketers want)

New/extended cloud fns in `reports.js` (+ revenue.js):
- **Per-campaign**: revenue, orders, **AOV** (revenue/orders), conversion rate
  (orders/delivered), revenue-per-recipient, **ROAS** if campaign cost is known
  (defer cost input). Add these to `getCampaignReport`.
- **Org dashboard**: total attributed revenue (period), revenue trend, top
  campaigns by revenue, attributed vs. unattributed split.
- **Per-contact**: lifetime revenue + order history on the contact drawer.
- **Revenue report page** (`pages/app/reports/revenue.vue` or a tab): revenue
  over time, by campaign, by automation, AOV trend, attribution-model breakdown.

Segmentation payoff: because `Contact.totalRevenue`/`orderCount` are real fields,
the existing segment rule-builder can immediately target "high-value customers",
"purchased in last 30d", "never purchased" — high-leverage, near-free once the
fields exist.

---

## 6. Connect/config UX

- `pages/app/settings/integrations.vue` — connect a store (Shopify/Woo): show
  the webhook URL + secret to paste, or (phase 2) OAuth app install; connection
  status + last-event indicator.
- `pages/app/settings/api-keys.vue` — create/revoke API keys (raw key shown once).
- Conversion-pixel snippet generator (copyable) for the no-integration path.
- Attribution-window setting per store.

---

## 7. Delivery phases (build order)

**Phase R1 — Attribution spine (the foundation, mock/manual intake first):**
- `Conversion` class + `Campaign`/`Contact` counter fields.
- `ingestConversion` worker job + attribution matcher (last-click/open window,
  idempotent).
- A `recordConversion` cloud fn (manual/test intake) so the whole chain is
  testable without any external store.
- Reports: revenue/orders/AOV/conversion-rate on `getCampaignReport` + dashboard
  revenue tiles + contact LTV fields.
- **Exit**: a manually-recorded order attributes to the right campaign and shows
  as revenue/AOV in the report. Fully testable, no third party.

**Phase R2 — Inbound API + pixel (self-serve intake):**
- `ApiKey` class + auth middleware; `POST /api/v1/events/purchase`.
- Conversion pixel `/t/p/:token` + click attribution handoff.
- API-keys + pixel-snippet settings UI.
- **Exit**: an external curl with an API key, and a pixel fire, both attribute.

**Phase R3 — Native Shopify/WooCommerce (the headline integrations):**
- `StoreConnection` class; `ecommerceWebhooks` routes with HMAC verify per provider.
- Connect-store settings UI (webhook-secret paste first; OAuth app later).
- Order/refund event handling (refunds → negative Conversion).
- **Exit**: a real Shopify test-store order webhook attributes end-to-end.

**Phase R4 — Polish:**
- Revenue report page, attribution-model choice in UI, refund handling, ROAS
  with cost input, outbound webhooks (notify store on unsub), multi-currency.

---

## 8. Parallelization (for the implementation dispatch)

These are **disjoint verticals** safe to build in parallel, with me owning the
shared integration files (bootstrapSchemas, tenancy, jobNames, worker/index,
routes/index, nuxt.config, reports.js merges) as before:

- **Agent 1 — Attribution spine (R1)**: Conversion class*, ingestConversion job,
  matcher, recordConversion cloud fn, counter bumps, tests. *(schema delta to me)*
- **Agent 2 — Reporting (R1 reporting half)**: revenue metrics in getCampaignReport
  + dashboard + contact LTV surfacing + revenue report page. (Consumes Agent 1's
  Conversion model; can stub against it.)
- **Agent 3 — Inbound API + API keys (R2)**: ApiKey class*, auth middleware,
  events API route, pixel endpoint + click handoff, settings UI, tests.
- **Agent 4 — Native ecom (R3)**: StoreConnection class*, Shopify+Woo webhook
  routes, connect-store UI, refund handling, tests.

Each returns "integration deltas" (schema/jobName/route/nav/proxy) for me to apply
centrally in one pass, then I run the full suite + reconcile — same workflow that
delivered the growth phase.

**Recommended: build R1 first (Agents 1+2) since R2/R3 both depend on the
Conversion model + attribution matcher existing.** R2 and R3 can then go parallel.

---

## 9. Open decisions (need a steer)
- **Money representation**: integer minor units (cents) vs. decimal. Recommend
  integer minor units + currency code to avoid float drift.
- **Attribution window default**: 7-day last-click is the proposed default — OK?
- **First integration target**: Shopify first (largest ecom share) unless you
  have a specific WooCommerce/other need.
- **Multi-currency**: store native currency per Conversion now; defer
  normalization/FX to a reporting concern.
