# Testing Plan — Send Pipeline

The send pipeline is the riskiest surface in Gorilla: it has the most silent-failure
paths (HMAC verification that returns `null`, suppression checks that skip a send,
fire-and-forget tracking writes, webhook acks that swallow errors), it talks to an
external transport (SES), and a single bug can either drop mail on the floor or — worse
for a shared sending domain — blast suppressed/complained recipients and poison
deliverability for every tenant. This plan enumerates the test surfaces, the existing
coverage, and the concrete gaps.

Stack facts that shape every test below:

- **Vitest + Playwright** (DECISIONS #7). Vitest for unit + integration + route-handler
  tests; Playwright for the browser-driven golden path.
- **Node 20** (`.nvmrc`); source nvm + `nvm use 20` before any `npm`/`npx`.
- **Mock SES first** (DECISIONS #6 / #12). `AWS_SES_MODE=mock` (default) makes
  `getSesAdapter()` return the mock adapter, which writes a `MockSentMessage` Parse
  object instead of hitting the network. Tests inspect that collection. The swap to
  real SES is one env var; **real SES is never exercised in CI** (see §3 deferred / §5).
- **Worker jobs are split** into a pure `handle(data, deps)` (directly callable, no live
  Agenda) and `register(agenda)` (production wiring). All job tests drive `handle()`
  with an injected `enqueue` stub.
- **Multi-tenant**; suppression is per-org (`(organization, email)` unique). Every
  cross-org test must prove no leakage.
- Tests boot an in-memory Parse Server via `tests/setup/parseServer.ts`
  (`startTestParseServer()`); server libs are CommonJS, loaded with `createRequire`
  AFTER the harness initializes the `parse/node` singleton so master-key writes land in
  the same in-memory server.

---

## 1. Scope & surfaces

The pipeline, end to end:

```
editor → scheduleSend ──enqueue──▶ campaign-fanout ──enqueue per-recipient──▶ send-email
                                        │ snapshot CampaignSend                    │ render + track + unsub
                                        │ suppression filter + dedup              │ suppression check
                                        ▼                                          ▼ SES adapter (mock|real)
                                   Campaign.status=sending               CampaignSend.status=sent,
                                   recipientCount                        sesMessageId, accepted EmailEvent,
                                                                         Campaign.sentCount++
                                                                              │
recipient inbox ── open pixel /t/o ──▶ open EmailEvent + openCount (unique)   │
              ── click /t/c (302)  ──▶ click EmailEvent + clickCount (unique) │
              ── unsubscribe /u    ──▶ Suppression(unsubscribe) + Contact     │
                                       + unsubscribeCount (idempotent)        │
                                                                              ▼
SES ──SNS──▶ POST /api/webhooks/ses ──verify+enqueue──▶ webhook-ingest
                                                          │ Delivery  → delivered + deliveredCount
                                                          │ Bounce(Permanent) → Suppression(hard_bounce) + bounceCount
                                                          │ Bounce(Transient) → softBounceCount++ ; ≥5 → suppress
                                                          │ Complaint → Suppression(complaint) + unsubscribeCount
                                                          ▼
                                                     Reports read the denormalized counters
```

### Surfaces under test

| Surface | File | What it owns |
|---|---|---|
| SES mock adapter | `server/lib/ses/{index,mock}.js` | adapter selection by env; `mock-<hex>` messageId; `MockSentMessage` outbox row |
| SES real adapter | `server/lib/ses/real.js` | SESv2 `SendEmailCommand` mapping; lazy client; **deferred** |
| Tracking tokens | `server/lib/trackingTokens.js` | HMAC sign/verify, tamper rejection, builder shapes (`o`/`c`/`u`) |
| renderEmail | `server/lib/renderEmail.js` | merge resolve, tracking inject (pixel + href rewrite), unsubscribe inject, List-Unsubscribe headers |
| suppression | `server/lib/suppression.js` | per-org add/check, lowercasing, idempotent upsert, reason escalation, org isolation |
| campaignCounters | `server/lib/campaignCounters.js` | atomic `bumpCounter` ($inc), `setFirst` (first-event gate), unknown-field guard |
| jobNames | `server/lib/jobNames.js` | shared name constants (enqueuer ↔ handler) |
| campaign-fanout job | `server/worker/jobs/campaignFanout.js` | audience resolve, dedup, suppression filter, idempotent CampaignSend upsert, status flip, fan-out enqueue |
| send-email job | `server/worker/jobs/sendEmail.js` | render→track→unsub→headers→adapter; status/sesMessageId/EmailEvent/counter; suppressed skip; failure→retry |
| webhook-ingest job | `server/worker/jobs/webhookIngest.js` | Delivery/Bounce/Complaint branch; suppression writes; counter bumps; soft-bounce threshold |
| tracking routes | `server/routes/tracking.js` | `GET /t/o`, `GET /t/c`, `GET|POST /u` |
| SES webhook route | `server/routes/webhooks.js` | SNS handshake, authenticity gate, enqueue, fast-ack |
| send cloud fns | `server/cloud/sending.js` | `sendTestEmail`, `scheduleSend`, `cancelScheduledSend` |

### Explicitly out of scope (not built yet — see §3 deferred list)

- Per-tenant rate limiting / token-bucket (`acquireTenantSlot`) — Sending.md §6/§13.
- Abuse controls: complaint-rate / bounce-rate monitors, auto-pause, pre-flight content
  scan, list-import sanity — Sending.md §15.
- Real SNS cryptographic signature verification (currently a TODO stub — Sending.md §6).
- Scheduler firing (Agenda actually running a delayed `campaign-fanout` at `when`).
- `getSendQuota`, daily-cap enforcement, DKIM (transport-layer, SES-owned).

---

## 2. Test matrix

| Layer | Runner | Boots | Drives | Files |
|---|---|---|---|---|
| **Unit — pure libs** | Vitest | none (or Parse for the persisting libs) | functions directly | `sendFoundation` |
| **Integration — job handlers** | Vitest | in-memory Parse | `handle(data, {enqueue})` | `fanout`, `sendEmail`, `webhookIngest` |
| **Route handlers (HTTP)** | Vitest + node `http` | in-memory Parse + tiny Express w/ `mount(app)` | real HTTP requests | `tracking` (built); webhook route HTTP test (**gap**) |
| **Cloud functions** | Vitest | in-memory Parse + Cloud | `Parse.Cloud.run(...)` | `sending` |
| **E2E full-send** | Vitest (mock SES, end-to-end) **and** Playwright (browser golden path) | Parse + Express + worker handlers | wired sequence | **gap — not built** |

Layering rationale: the libs are pure or near-pure and cheap to exercise exhaustively;
the jobs are the integration seams where Parse state, suppression, counters, and the SES
adapter meet; the routes need true HTTP because status codes, headers (`Cache-Control`,
`Location`, `Content-Type`), and the urlencoded body parser are part of the contract; the
E2E proves the seams actually compose (a fanout that enqueues a job nobody runs is green
in unit tests and broken in production).

---

## 3. Detailed test cases

Priority: **P0** = a bug here loses/duplicates mail, leaks across tenants, or sends to a
suppressed/complained address (compliance-critical). **P1** = correctness of counters,
events, status, validation. **P2** = edge/defensive paths.

### 3.1 SES mock adapter (`server/lib/ses/{index,mock}.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| SES-1 | unit | mock selected by default | unset `AWS_SES_MODE`, `_resetSesAdapter()`, `getSesAdapter()` | `.mode === "mock"` | P1 |
| SES-2 | unit | sendEmail returns messageId + writes MockSentMessage | call `sendEmail({from,to,replyTo,subject,html,headers})` | `messageId` matches `/^mock-/`; one `MockSentMessage` with all fields persisted | P1 |
| SES-3 | unit | messageId is unique per call | two sends | distinct messageIds | P1 |
| SES-4 | unit | array `to`/`replyTo` normalized | pass `to: ["a@x","b@x"]` | stored `to` is `"a@x, b@x"` | P2 |
| SES-5 | unit | null/undefined fields coerced, no throw | omit subject/html/headers | empty strings / `{}` stored, no error | P2 |
| SES-6 | unit | `campaignSend` pointer stored when provided | pass a saved CampaignSend | `MockSentMessage.campaignSend` points at it | P1 |
| SES-7 | unit | adapter re-resolves when env flips | set `AWS_SES_MODE=real`, `_resetSesAdapter()`, `getSesAdapter()` | `.mode === "real"` (no network until `sendEmail`) | P2 |
| SES-8 | unit | `getSendQuota` synthetic shape | call on mock | `{Max24HourSend, MaxSendRate, SentLast24Hours, mock:true}` | P2 |

### 3.2 Tracking tokens (`trackingTokens.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| TOK-1 | unit | sign→verify roundtrip | `verifyToken(signToken(payload))` | deep-equals payload | P0 |
| TOK-2 | unit | tamper on body → null | flip a char in the body segment | `verifyToken` returns `null` | P0 |
| TOK-3 | unit | tamper on tag → null | flip a char in the signature segment | `null` | P0 |
| TOK-4 | unit | wrong-secret token → null | sign with secret A, verify after rotating `TRACKING_SECRET` to B | `null` (rotation invalidates all links) | P0 |
| TOK-5 | unit | malformed/garbage input → null | `""`, `"."`, `"a.b.c"`, `"garbage"`, `null`, non-string | `null` for each (no throw) | P1 |
| TOK-6 | unit | tag length mismatch → null (no timingSafeEqual throw) | token with truncated tag | `null`, not an exception | P1 |
| TOK-7 | unit | builder shapes | `openToken`/`clickToken`/`unsubToken` round-trip | `{t:"o",sendId}` / `{t:"c",sendId,url,linkId?}` / `{t:"u",sendId}` | P1 |
| TOK-8 | unit | `clickToken` without linkId omits the field | `clickToken(id,url)` | payload has no `linkId` key | P2 |
| TOK-9 | unit | URL-safe alphabet | inspect token | only `[A-Za-z0-9-_.]`, no `+`/`/`/`=` | P2 |

### 3.3 renderEmail (`renderEmail.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| RND-1 | unit | merge std + custom keys, HTML-escape | `{{firstName}}` / `{{custom.company}}` with `<`/`&` values | substituted + escaped | P1 |
| RND-2 | unit | inline default on missing | `{{firstName|there}}` with `{}` | `"there"` | P1 |
| RND-3 | unit | empty string on missing, no default | `{{nope}}` | `""` | P1 |
| RND-4 | unit | reserved placeholders untouched by merge | `{{unsubscribeUrl}}`, `{{webVersionUrl}}` even if passed as a field | left literal | P0 (mis-resolving would break unsub injection) |
| RND-5 | unit | whitespace-tolerant tokens | `{{ firstName }}` | resolves | P2 |
| RND-6 | unit | pixel inserted before `</body>` | injectTracking with pixelUrl | `<img …>` immediately before `</body>` | P1 |
| RND-7 | unit | pixel appended when no `</body>` | bodyless html | pixel at end | P2 |
| RND-8 | unit | `<a href>` rewritten via rewriteHref | real https link | href replaced with rewriter output | P1 |
| RND-9 | unit | mailto:/tel:/# / `{{…}}` hrefs skipped | mixed links | left original | P0 (rewriting `{{unsubscribeUrl}}` would corrupt the unsub link) |
| RND-10 | unit | rewriteHref returning null leaves original | rewriter returns null for one href | that href unchanged | P2 |
| RND-11 | unit | injectUnsubscribe replaces `{{unsubscribeUrl}}` (and webVersion when given) | placeholder html | real signed URL substituted | P0 |
| RND-12 | unit | listUnsubHeaders pair | `listUnsubHeaders(url)` | `List-Unsubscribe: <url>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` | P1 |
| RND-13 | unit | order invariant: merge-before-track-before-unsub leaves unsub placeholder for injector | run full sequence as send-email does | `{{unsubscribeUrl}}` survives merge + track, replaced only by injectUnsubscribe | P0 |

### 3.4 suppression (`suppression.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| SUP-1 | unit+Parse | add + isSuppressed, case-insensitive | add `Bouncer@Example.COM`, check lowercased + uppercased | stored lowercased; both checks `true` | P0 |
| SUP-2 | unit+Parse | idempotent upsert bumps eventCount | add same pair twice | same row id; `eventCount` 1→2; count==1 | P0 |
| SUP-3 | unit+Parse | reason escalation never downgrades | add `soft_bounce_threshold` then `unsubscribe` then `hard_bounce`; then add `manual` | reason climbs to `hard_bounce`, never falls back | P1 |
| SUP-4 | unit+Parse | org isolation | suppress `x@y` in org A | A→`true`, B→`false` | P0 |
| SUP-5 | unit+Parse | missing org throws | `addSuppression({email})` | VALIDATION_ERROR | P1 |
| SUP-6 | unit+Parse | missing/blank email throws | `addSuppression({organization})` | VALIDATION_ERROR | P1 |
| SUP-7 | unit | accepts org id string OR pointer | both forms to `toOrgPointer`/`isSuppressed` | equivalent | P2 |

### 3.5 campaignCounters (`campaignCounters.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CNT-1 | unit+Parse | bumpCounter increments by 1 ($inc) | bump `sentCount` | field == prior+1 | P1 |
| CNT-2 | unit+Parse | concurrent bumps don't clobber | fire N parallel `bumpCounter` | final == N (atomic) | P0 (webhook ingest is concurrent) |
| CNT-3 | unit | unknown field rejected | `bumpCounter(c,"bogus")` | VALIDATION_ERROR | P1 |
| CNT-4 | unit+Parse | setFirst sets when empty, returns true | first call | field set, returns `true` | P1 |
| CNT-5 | unit+Parse | setFirst no-op when present, returns false | second call | unchanged, returns `false` | P0 (unique-open/click/unsub gating) |
| CNT-6 | unit | setFirst requires a CampaignSend object | pass non-object | VALIDATION_ERROR | P2 |

### 3.6 campaign-fanout (`campaignFanout.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| FAN-1 | integration | one CampaignSend per eligible recipient + flip | queued campaign, list with subscribed/unsub/suppressed/dup-email contacts | row per eligible (subscribed, non-deleted, non-unsub, not suppressed, unique email); campaign→`sending`; `recipientCount` correct | P0 |
| FAN-2 | integration | unsubscribed contacts excluded | contact `unsubscribed=true` | no row for it | P0 |
| FAN-3 | integration | suppressed addresses excluded | (org,email) in Suppression | no row, not enqueued | P0 |
| FAN-4 | integration | dedup by lowercased email | two contacts same email diff case | single row | P0 |
| FAN-5 | integration | mergeFields snapshot (flat + nested custom) | rich contact + customFields | snapshot has std keys + `custom` mirror | P1 |
| FAN-6 | integration | idempotent re-run (pre-check) | reset status→queued, re-run | no duplicate rows; nothing newly enqueued | P0 |
| FAN-7 | integration | DUPLICATE_VALUE backstop swallowed | simulate concurrent insert racing the unique `(campaign,contact)` index | err code 137 skipped, others re-thrown | P1 |
| FAN-8 | integration | bails unless status==queued | campaign in `sending`/`draft`/`sent` | `recipientCount:0`, no rows, no enqueue | P0 |
| FAN-9 | integration | missing campaignId / org / audienceId | each absent | `recipientCount:0`, no work | P1 |
| FAN-10 | integration | enqueues exactly one SEND_EMAIL per created send | capture enqueue stub | one job per row, carrying `{sendId, campaignId}` | P0 |
| FAN-11 | integration | pagination > PAGE_SIZE (1000) | seed 1001+ contacts (or stub) | every contact fanned out (no page drop) | P2 |
| FAN-12 | integration | org isolation on recipient fetch | contacts in another org on same listId | only caller-org contacts selected | P0 |

### 3.7 send-email (`sendEmail.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| SND-1 | integration | full render→track→unsub→send happy path | queued send + campaign w/ link + `{{unsubscribeUrl}}` | MockSentMessage has merged HTML, `/t/o/` pixel, original href replaced by `/t/c/`, `{{unsubscribeUrl}}`→`/u/`; List-Unsubscribe header set | P0 |
| SND-2 | integration | success persists state | after SND-1 | send `status:sent`, `sesMessageId` (mock-), `sentAt`; `accepted` EmailEvent; `Campaign.sentCount++` | P0 |
| SND-3 | integration | From/Reply-To/subject composed | inspect MockSentMessage | `"fromName <fromEmail>"`, replyTo fallback to fromEmail, subject from campaign | P1 |
| SND-4 | integration | From defaults when campaign lacks identity | no fromName/fromEmail | `Gorilla <hello@send.gorilla.email>` | P2 |
| SND-5 | integration | suppressed recipient skipped | (org,email) suppressed | send `status:suppressed`, NO MockSentMessage, sentCount untouched | P0 |
| SND-6 | integration | no-op when send not queued | status already `sent`/`cancelled` | nothing sent, no counter change | P0 |
| SND-7 | integration | SES failure → failed + reason + re-throw | inject adapter that throws | send `status:failed`, `failureReason` (≤500 chars), error re-thrown for Agenda retry; sentCount NOT bumped | P0 |
| SND-8 | integration | failure to even write status still surfaces send error | adapter throws + status-save throws | original send error propagates | P2 |
| SND-9 | integration | missing sendId/campaignId | call with `{}` | VALIDATION_ERROR | P1 |
| SND-10 | integration | tokens are per-send (sendId embedded) | decode pixel/click/unsub tokens from HTML | each verifies + carries this `sendId` | P1 |

### 3.8 webhook-ingest (`webhookIngest.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| WHI-1 | integration | Delivery → delivered | seed send, Delivery event | `status:delivered`, `delivered` EmailEvent, `deliveredCount++`, `statusUpdatedAt` set | P1 |
| WHI-2 | integration | Permanent bounce → hard suppress | bounceType Permanent | Suppression(`hard_bounce`), send `status:bounced`, `bounceCategory:permanent`, subtype set, `bounce` event, `bounceCount++` | P0 |
| WHI-3 | integration | Transient bounce below threshold | softBounceCount 0→1 | `softBounceCount++`, NO suppression, status stays `sent`, `bounceCategory:transient`, `bounce` event, bounceCount unchanged | P0 |
| WHI-4 | integration | Transient bounce at threshold (≥5) | softBounceCount 4 + event | promote to Suppression(`soft_bounce_threshold`), `status:bounced`, `bounceCount++` | P0 |
| WHI-5 | integration | Complaint → suppress + status complained | Complaint event | Suppression(`complaint`), `status:complained`, `complaint` event, `unsubscribeCount++` (no complaint counter) | P0 |
| WHI-6 | integration | unknown messageId → no-op | event for a sesMessageId with no send | resolves undefined, no rows, no throw | P1 |
| WHI-7 | integration | missing/empty event or mail.messageId → no-op | `handle({})`, `handle({event:{}})` | early return, no throw | P1 |
| WHI-8 | integration | unknown eventType (Send/Reject) → no-op | `eventType:"Send"` | early return, no status/event change | P2 |
| WHI-9 | integration | event timestamp parsed from sub-object | delivery.timestamp present | EmailEvent.timestamp == that time, not write time | P2 |
| WHI-10 | integration | bad/absent timestamp falls back to now | no parseable timestamp | timestamp ≈ now, no NaN date | P2 |
| WHI-11 | integration | org isolation of suppression write | bounce for org-A send | suppression created under org A only | P0 |
| WHI-12 | integration | repeat bounce idempotent on suppression | same Permanent bounce twice | one Suppression row, eventCount bumps | P1 |

### 3.9 Tracking endpoints (`routes/tracking.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| TRK-1 | route HTTP | open records + unique-counts + returns GIF | `GET /t/o/<openToken>` twice | 200 image/gif, `Cache-Control: no-store`, GIF magic bytes; first open writes event + `openedAt` + `openCount=1`; second writes event but `openCount` stays 1 | P0 |
| TRK-2 | route HTTP | open captures UA + anonymized IP | send UA + `X-Forwarded-For: 203.0.113.7` | event UA stored, ipAddress `203.0.113.0` | P1 |
| TRK-3 | route HTTP | invalid open token → GIF, no write | `GET /t/o/garbage` | 200 GIF, no EmailEvent created | P1 |
| TRK-4 | route HTTP | open token type mismatch ignored | unsub token on `/t/o` | 200 GIF, no write (payload.t !== "o") | P2 |
| TRK-5 | route HTTP | click 302 + records | `GET /t/c/<clickToken>` | 302 to original url, `click` event w/ linkUrl + linkId, `clickedAt` + `clickCount=1` | P0 |
| TRK-6 | route HTTP | click unique-count | second click | clickCount stays 1 | P1 |
| TRK-7 | route HTTP | invalid/typewrong click token → 400, no redirect | garbage; open token on `/t/c` | 400, no Location header | P0 (no open redirect) |
| TRK-8 | route HTTP | click token without `url` → 400 | craft `{t:"c",sendId}` token | 400 | P1 |
| TRK-9 | route HTTP | GET /u valid → confirm page w/ POST form | `GET /u/<unsubToken>` | 200 html, form `method=POST action=/u/<token>` | P1 |
| TRK-10 | route HTTP | GET /u invalid → invalid page | `GET /u/garbage` | 400, "invalid" copy | P2 |
| TRK-11 | route HTTP | POST /u one-click suppresses + idempotent | POST twice (RFC 8058 body) | Suppression(`unsubscribe`), Contact `unsubscribed/status/unsubscribedAt`, send `unsubscribedAt`, `unsubscribeCount=1`, `unsubscribe` event; second POST 200, counter stays 1 | P0 |
| TRK-12 | route HTTP | POST /u invalid token → 400, no suppression | `POST /u/garbage` | 400, Suppression count unchanged | P0 |
| TRK-13 | route HTTP | token outlives deleted send → graceful | valid token, send deleted | open: GIF no write; click: 302 (url is in token); unsub: 200, no crash | P2 |
| TRK-14 | route HTTP | uses email snapshot when contact missing | send w/ no contact pointer | unsub suppresses on `send.email` | P1 |
| TRK-15 | unit | anonymizeIp helper | IPv4 / IPv6 / undefined | IPv4 last octet→0; others unchanged/empty | P2 |

### 3.10 SES webhook route (`routes/webhooks.js`)

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| WHK-1 | route HTTP | SubscriptionConfirmation handshake | POST `{Type:"SubscriptionConfirmation", SubscribeURL}` (stub https.get) | 200; SubscribeURL GET attempted (best-effort) | P1 |
| WHK-2 | route HTTP | Notification parsed + enqueued | POST `{Type:"Notification", Message: JSON}` (stub getAgenda) | 200; `agenda.now(WEBHOOK_INGEST, {event})` called with parsed Message | P0 |
| WHK-3 | route HTTP | mock mode trusts (isAuthentic true) | mode=mock, Notification | enqueued, 200 | P1 |
| WHK-4 | route HTTP | real mode rejects missing sig fields | mode=real, no Signature/SigningCertURL/MessageId | 403 | P0 |
| WHK-5 | route HTTP | real mode rejects non-amazonaws SigningCertURL | `SigningCertURL` host `evil.com` | 403 | P0 |
| WHK-6 | route HTTP | real mode accepts amazonaws host (current stub depth) | valid-looking SNS fields | 200 (documents that crypto verify is still a TODO — see §5 gap) | P0 |
| WHK-7 | route HTTP | malformed Message JSON → 200, no enqueue | bad JSON in Message | 200 (stop SNS retries), nothing enqueued | P1 |
| WHK-8 | route HTTP | enqueue failure still 200 | getAgenda throws | 200 (no 5xx → no SNS retry storm), error logged | P0 |
| WHK-9 | route HTTP | unknown Type → 200 | `Type:"Whatever"` | 200, no work | P2 |
| WHK-10 | route HTTP | parses `text/plain` SNS body | Content-Type text/plain | body parsed (`express.json({type:"*/*"})`) | P1 |

### 3.11 Send cloud functions (`cloud/sending.js`)

**sendTestEmail**

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CF-1 | cloud | rejects empty compiledHtml | no body | VALIDATION_ERROR "save your design first" | P1 |
| CF-2 | cloud | rejects invalid recipient | `to:"not-an-email"` | VALIDATION_ERROR "valid email" | P1 |
| CF-3 | cloud | caps at 5 recipients | 6 addresses | VALIDATION_ERROR "limited to 5" | P1 |
| CF-4 | cloud | dedups recipients | `"a@x, a@x"` | sentTo == `["a@x"]` | P2 |
| CF-5 | cloud | sends `[TEST]` w/ merge resolved, returns messageId | valid campaign | MockSentMessage subject `[TEST] …`, merge tags resolved (caller name + inline default), no `{{`; returns `mock-` id | P1 |
| CF-6 | cloud | default subject + From when absent | no subject/from | `[TEST] (no subject)`, `Gorilla <hello@send.gorilla.email>` | P2 |
| CF-7 | cloud | cross-org campaign rejected | other org's campaignId | throws (OBJECT_NOT_FOUND via ACL) | P0 |
| CF-8 | cloud | no tracking/CampaignSend/suppression side-effects | after a test send | zero CampaignSend, zero EmailEvent, no Suppression; HTML has no `/t/o//t/c/` injection | P1 |
| CF-9 | cloud | unauthenticated rejected | no session | INVALID_SESSION_TOKEN | P1 |

**scheduleSend**

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CF-10 | cloud | reject missing compiledHtml | delete compiledHtml | VALIDATION_ERROR | P1 |
| CF-11 | cloud | reject missing subject | delete subject | VALIDATION_ERROR /subject/ | P1 |
| CF-12 | cloud | reject missing fromEmail | delete fromEmail | VALIDATION_ERROR /from address/ | P1 |
| CF-13 | cloud | reject missing audienceId | delete audienceId | VALIDATION_ERROR /audience/ | P1 |
| CF-14 | cloud | reject empty audience | list with no subscribers | VALIDATION_ERROR /no subscribed recipients/ | P0 (don't queue a no-op blast) |
| CF-15 | cloud | valid "now" → queued + recipientCount | full valid campaign, 2 subs | `status:"queued"`, recipientCount 2, persisted | P0 |
| CF-16 | cloud | future ISO → scheduled + scheduledAt | when = +1h ISO | `status:"scheduled"`, scheduledAt Date | P1 |
| CF-17 | cloud | reject past ISO | when in past | VALIDATION_ERROR /future/ | P1 |
| CF-18 | cloud | reject non-schedulable status | status `sent`/`sending`/`queued` | OPERATION_FORBIDDEN "can't schedule" (prevents double-fanout) | P0 |
| CF-19 | cloud | reject invalid `when` string | `when:"banana"` | VALIDATION_ERROR | P2 |
| CF-20 | cloud | status committed even if enqueue fails | getAgenda throws | status still flips (best-effort enqueue), fn returns ok | P1 |
| CF-21 | cloud | recipientCount scoped to org + list + subscribed/non-deleted | mixed contacts | count matches addressable audience only | P0 |

**cancelScheduledSend**

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| CF-22 | cloud | revert queued → draft + clear scheduledAt + cancel job | schedule then cancel | `status:"draft"`, scheduledAt unset, agenda.cancel attempted | P1 |
| CF-23 | cloud | revert scheduled → draft | future-scheduled then cancel | draft | P1 |
| CF-24 | cloud | no-op on draft/sent | already draft | returns ok, status unchanged | P2 |
| CF-25 | cloud | cancel survives agenda failure | getAgenda throws | status still draft, fn ok | P2 |

### 3.12 E2E — full send via mock adapter (**gap; highest-value missing test**)

The send-pipeline integration owner verified manually that 2 recipients → both sent +
counters bumped. That assertion must become an automated test. Two flavors:

| ID | Layer | Scenario | Steps | Expected | Priority |
|---|---|---|---|---|---|
| E2E-1 | integration (wired) | full pipeline, mock SES, 2 recipients | sign up org → create list → add 2 subscribed contacts (one with a `{{firstName}}` value) + 1 suppressed → create valid campaign → `scheduleSend("now")` → run `fanout.handle({campaignId})` with `enqueue` that pushes onto an array → run `sendEmail.handle()` for each enqueued job | campaign `sending`→ (after sends) all 2 CampaignSend `sent` with distinct `sesMessageId`; suppressed contact never enqueued/sent; 2 MockSentMessage rows with merged HTML; `Campaign.sentCount==2`; 2 `accepted` EmailEvents | **P0** |
| E2E-2 | integration (wired) | bounce/complaint → suppression closes the loop | from E2E-1, feed a Permanent-bounce webhook event for send #1 and a Complaint for send #2 via `webhookIngest.handle()` | send #1 `bounced` + Suppression(hard_bounce) + `bounceCount==1`; send #2 `complained` + Suppression(complaint) + `unsubscribeCount==1`; a re-fanout of the same campaign now excludes both (suppressed) | **P0** |
| E2E-3 | integration (wired) | open/click/unsub tracking → counters → "reports" | from E2E-1, hit `recordOpen/recordClick/recordUnsub` (or the HTTP routes) for the sends using tokens minted from the actual sent HTML | `openCount`/`clickCount`/`unsubscribeCount` reflect unique events; Suppression(unsubscribe) added; reports read counters consistently | P1 |
| E2E-4 | Playwright (browser) | editor golden path | log in → build/save campaign → pick audience → click Send (mock SES) → land on a sent/report view showing recipient + sent counts | UI reflects a queued/sent campaign; counters surface (covers the editor→audience→send→report flow DECISIONS #7 calls out) | P1 |

E2E-1/2/3 are Vitest "wired" integration tests (drive the real `handle()`s in sequence
with an in-memory enqueue) — they need no live Agenda and run hermetically. E2E-4 is the
one Playwright spec and depends on `npm run dev` (Mongo up) + a seeded login.

### 3.13 What needs REAL-SES integration tests (deferred)

These cannot run hermetically and are explicitly **out of CI**; they run as a manual /
gated suite against a real (sandbox) SES + SNS, using SES simulator addresses:

- Real adapter maps `sendEmail` args → SESv2 `SendEmailCommand` correctly (region,
  FromEmailAddress, Destination, ReplyTo, ConfigurationSet, Simple.Content, Headers) and
  returns a real `MessageId`. (Can be partly unit-tested by mocking `@aws-sdk/client-sesv2`
  and asserting the command shape — **recommended even before live SES**.)
- Lazy client construction: file `require`s cleanly with no AWS creds; client built only
  on first `sendEmail`/`getSendQuota`.
- End-to-end DKIM/SPF/DMARC pass on a delivered message (Sending.md §17 Phase 1 demo).
- `bounce@simulator.amazonses.com` / `complaint@simulator.amazonses.com` round-trip:
  real SNS event arrives at `/api/webhooks/ses`, ingests, suppresses within ~30s
  (Sending.md §17 Phase 2 demo).
- Real SNS signature verification against AWS's signing cert (once implemented).
- `getSendQuota` returns the live SES GetAccount shape.

### 3.14 Abuse-control tests (Sending.md §13/§15 — NOT yet built)

No code exists for these; the tests are listed so the gap is explicit. When the features
land they are **P0** for shared-domain safety:

- Per-tenant token-bucket rate limiting: send rate honored per tier (Free 1/s, Paid
  10/s); over-limit job reschedules (`in 1 second`) instead of failing; daily cap
  enforced at `scheduleSend` (refuse if next-24h would exceed cap).
- Complaint-rate monitor: >0.1%/24h warns; >0.3%/24h or >0.5%/7d auto-pauses tenant
  (future `scheduleSend` blocked until unpaused).
- Bounce-rate monitor: >5%/24h throttle to 1/s; >10%/24h auto-pause.
- Pre-flight content scan: URL-shortener / hidden-text → block; excessive caps /
  mismatched anchor text → warn.
- CSV-import sanity: >30% invalid rows → reject import.
- `scheduleSend` refuses when tenant is suspended (Sending.md §7 step 2).

---

## 4. Acceptance criteria

The send pipeline is considered adequately tested when:

1. **Every P0 case in §3 is automated and green** under `AWS_SES_MODE=mock` with no
   network access.
2. **No-suppressed-send invariant** is proven at both layers it's enforced (fanout
   filter FAN-3 and send-email check SND-5) plus the wired E2E-2 (a bounced/complained
   address is excluded from a subsequent fanout).
3. **Tenant isolation** is proven for suppression (SUP-4), fanout recipient fetch
   (FAN-12), webhook suppression writes (WHI-11), and cross-org cloud-fn access (CF-7).
4. **Token security**: forged/tampered/wrong-secret tokens never validate (TOK-2..4) and
   the click route never 302s on an invalid token (TRK-7) — no open-redirect.
5. **Counter integrity**: unique events count once (TRK-1/5/11, CNT-5) and concurrent
   bumps are atomic (CNT-2); a failed send never bumps `sentCount` (SND-7).
6. **Idempotency**: fanout re-run creates no duplicate sends (FAN-6); one-click
   unsubscribe retries don't inflate counters (TRK-11); repeat bounce events don't
   duplicate suppressions (WHI-12).
7. **Webhook resilience**: the route never returns 5xx on enqueue failure or malformed
   payload (WHK-7/8) — SNS must not enter a retry storm; real-mode rejects unsigned /
   non-AWS payloads (WHK-4/5).
8. **Validation**: `scheduleSend` refuses every incomplete/illegal campaign (CF-10..19)
   and never double-fanouts (CF-18).
9. **The full-send E2E (E2E-1) passes**: 2 recipients → both `sent` + `sentCount==2`,
   suppressed recipient skipped — the automation of the integration owner's manual check.
10. CI runs the Vitest suite on Node 20 and is required to pass before merge; the
    deferred real-SES suite (§3.13) and abuse-control suite (§3.14) are tracked as
    follow-up and do not block (their absence is a documented risk, not a passing test).

---

## 5. Current coverage → file map, and gaps

### What exists today (6 send files + tracking route)

| Test file | Covers (case IDs above) | Layer |
|---|---|---|
| `tests/server/sendFoundation.test.ts` | SES-1..3 (partial), TOK-1/2/5/7, RND-1/2/3/4/6/7/8/9/11/12, SUP-1/2/4 | unit + Parse |
| `tests/server/fanout.test.ts` | FAN-1/2/3/4/5/6/8/10 | integration |
| `tests/server/sendEmail.test.ts` | SND-1/2/3/5/6 (+ token-in-HTML asserts) | integration |
| `tests/server/webhookIngest.test.ts` | WHI-1/2/3/4/5/6 | integration |
| `tests/server/tracking.test.ts` | TRK-1/2/3/5/7/9/10/11/12 (+ anonymizeIp via behavior) | route HTTP |
| `tests/server/sending.test.ts` | CF-1/2/3/4/5/6/7, CF-10..18, CF-22/24 | cloud |

Coverage of the happy paths and the primary failure branches is genuinely strong. The
gaps are at the edges and the seams.

### GAPS (ordered by risk)

1. **No SNS signature verification — and no test that would catch its absence (BIGGEST GAP).**
   `routes/webhooks.js#isAuthentic` only checks that, in real mode, the SNS fields exist
   and `SigningCertURL` is an `amazonaws.com` host. The actual cryptographic
   verification is a `TODO(real)` — the canonical string-to-sign + RSA verify against the
   fetched cert is **not implemented**. Until it is, anyone who can craft a payload with
   a plausible `SigningCertURL` host can inject fake delivery/bounce/complaint events.
   Needed: implement the verify, then add WHK-4/5/6 plus a true signature-valid/invalid
   pair. This is the highest-severity gap: it is a security hole, not just missing
   coverage.

2. **No HTTP test for the webhook route at all** (WHK-1..10). The webhook-ingest *handler*
   is well tested, but the route that gates authenticity, handles the SNS handshake,
   parses `text/plain` bodies, and must fast-ack 200 on every failure path has **zero**
   tests. The `tracking.test.ts` harness (tiny Express + node `http`) is the exact
   pattern to copy; `getAgenda` and `https.get` need stubbing.

3. **No full-send E2E** (E2E-1/2/3) and **no Playwright golden path** (E2E-4). The
   integration owner verified 2-recipients-both-sent manually; nothing automates the
   fanout→send-email→counters→bounce/complaint→suppression composition. Each job is green
   in isolation while the wiring between them is unverified.

4. **No real-SES tests, not even a mocked command-shape unit test** (§3.13).
   `real.js` (the SESv2 command mapping, lazy client) has no coverage. A cheap win is a
   unit test that mocks `@aws-sdk/client-sesv2` and asserts the `SendEmailCommand` input
   shape — runnable in CI without AWS.

5. **No rate-limit / abuse-control tests** (§3.14) because the code doesn't exist
   (Sending.md §13/§15, Phase 5). For a shared sending domain this is a real operational
   risk; flagged so it's not forgotten when the feature lands.

6. **No scheduler-firing test.** `scheduleSend` with a future ISO sets `status:scheduled`
   + `scheduledAt` and calls `agenda.schedule(when, …)`, but no test proves Agenda
   actually fires the delayed `campaign-fanout` at `when`. Cloud-fn tests assert the
   status flip only (the enqueue is best-effort and not asserted).

7. **Smaller untested branches:** failure→retry in send-email (SND-7/8), soft-bounce
   below/at threshold edge already covered (WHI-3/4) but the **DUPLICATE_VALUE backstop**
   in fanout (FAN-7) and **fanout pagination > 1000** (FAN-11) are not; SES adapter
   array-normalization + null coercion (SES-4/5/6) and env re-resolution (SES-7);
   `bumpCounter` unknown-field guard + concurrent atomicity (CNT-2/3); token wrong-secret
   + tag-length-mismatch (TOK-4/6); reason-escalation ranking (SUP-3).

---

## 6. Test data & fixtures

### Harness

- `tests/setup/parseServer.ts` → `startTestParseServer()` returns `{ Parse, stop }`;
  boots an in-memory Parse Server + Mongo (`tests/setup/mongo.ts`). Server libs are
  CommonJS — load them with `createRequire(import.meta.url)` **after** `startTestParseServer`
  so their `require("parse/node")` resolves to the harness's initialized singleton.
- Org/user setup via the only signup path: `Parse.Cloud.run("signUpWithOrg", {...})` →
  `{ sessionToken, orgId }`. Tenancy `beforeSave` stamps `organization` + ACL, so
  fixtures created as the caller are auto-scoped; worker-style fixtures use
  `{ useMasterKey: true }` and set `organization` explicitly.
- Lists/contacts via `createAudience` / `addContact` cloud fns (matches production list
  membership: `Contact.lists` is an array of List id strings; `Campaign.audienceId` is a
  List id string).
- Route tests: tiny `express()` + `require("../../server/routes/<x>").mount(app)` +
  node `http` client that does **not** follow 302 (so `Location` is assertable). Set
  `app.set("trust proxy", true)` so `req.ip` honors `X-Forwarded-For`.

### SES / SNS event fixtures

- Mock adapter is the default (`AWS_SES_MODE` unset). Assert against `MockSentMessage`
  (global, master-key-only). To test adapter selection, set `AWS_SES_MODE` then call
  `_resetSesAdapter()` (the test-only seam) before `getSesAdapter()`.
- **SES simulator addresses** (Sending.md §19, AWS) for real-SES (deferred) suites:
  - `bounce@simulator.amazonses.com` → Permanent bounce
  - `complaint@simulator.amazonses.com` → complaint
  - `success@simulator.amazonses.com` → clean delivery
  - `suppressionlist@simulator.amazonses.com`, `ooto@simulator.amazonses.com` (out-of-office)
- **SES-via-SNS event bodies** (webhook-ingest fixtures, mirror real SES JSON):
  - Delivery: `{ eventType:"Delivery", mail:{messageId, timestamp}, delivery:{timestamp} }`
  - Permanent bounce: `{ eventType:"Bounce", mail:{messageId}, bounce:{ bounceType:"Permanent", bounceSubType:"General", timestamp } }`
  - Transient bounce: `bounce:{ bounceType:"Transient", bounceSubType:"MailboxFull" }`
  - Complaint: `{ eventType:"Complaint", mail:{messageId}, complaint:{ complaintFeedbackType:"abuse", timestamp } }`
- **SNS envelope** (webhook *route* fixtures):
  - SubscriptionConfirmation: `{ Type:"SubscriptionConfirmation", SubscribeURL, Token, TopicArn }`
  - Notification: `{ Type:"Notification", Message: JSON.stringify(sesEvent), MessageId, Signature, SigningCertURL:"https://sns.us-east-1.amazonaws.com/...pem", TopicArn }`
  - For real-mode auth tests: a Notification with a non-`amazonaws.com` `SigningCertURL`
    (expect 403) and one missing `Signature` (expect 403).

### Tokens & emails

- Mint tracking tokens with the **real** `trackingTokens` builders
  (`openToken`/`clickToken`/`unsubToken`) so route `verifyToken` accepts them; for
  tamper tests, flip a character in the body or tag segment. For wrong-secret tests, set
  `TRACKING_SECRET`, mint, then change it and verify (expect `null`).
- Standard recipient addresses: `alice@example.com`, `bob@example.com`,
  `carol@example.com` (rich + custom fields), plus mixed-case (`Bouncer@Example.COM`) to
  prove lowercasing, and duplicate-with-different-case pairs to prove fanout dedup.
- Compiled-HTML fixture covering all three render passes in one body:
  `"<body>Hi {{firstName}}! <a href=\"https://shop.example.com/sale\">Shop</a> <a href=\"{{unsubscribeUrl}}\">unsubscribe</a></body>"`
  — verifies merge, click-rewrite (real link only), pixel injection, and unsub injection
  without touching the `{{unsubscribeUrl}}` placeholder until the unsub pass.
