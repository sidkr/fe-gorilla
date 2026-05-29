# Sending.md — email delivery architecture

The hardest problem in the platform. Everything else is UI. This doc covers how Gorilla actually delivers email to inboxes without ending up in spam.

Supersedes Architecture.md §3 (which committed to Postmark + BullMQ); this doc represents the current direction.

## 1. The decision

**In-house glue + AWS SES as the dumb SMTP transport.**

```
┌───────────────────────────────────────────────────────────────┐
│  IN-HOUSE (we own + build + operate)                          │
│  ──────────────────────────────────────                       │
│  • Queue + fanout                                             │
│  • Per-tenant rate limiting                                   │
│  • Suppression list (global)                                  │
│  • Content scanning + abuse controls                          │
│  • DKIM signing                                               │
│  • Tracking pixel + click redirector                          │
│  • Unsubscribe + List-Unsubscribe                             │
│  • Webhook ingestion + EmailEvent storage                     │
│  • Compliance (CAN-SPAM, GDPR)                                │
│  • Reporting + analytics                                      │
└───────────────────────────────────────────────────────────────┘
                         │
                         │  signed message → SMTP
                         ▼
┌───────────────────────────────────────────────────────────────┐
│  AWS SES (the transport)                                      │
│  ──────────────────────                                       │
│  • TLS-encrypted SMTP delivery                                │
│  • IP warming + pool reputation (managed by AWS)              │
│  • RBL avoidance                                              │
│  • Bounce + complaint feedback loops with every major ISP     │
│  • Per-region capacity (us-east-1 for us)                     │
└───────────────────────────────────────────────────────────────┘
```

### Why not full DIY
Running our own MTA + warming our own IPs is 12–18 months before deliverability is competitive. Layer 2 (IP reputation) is permanent operational work. One missed DKIM rotation or unhandled FBL burns months of reputation rebuilding. Not the right shape for the team or stage.

### Why not full ESP (Postmark / Resend)
We lose the platform-glue moat. Most Mailchimp competitors that started this way had to migrate off — once you have campaign-fanout, suppression, scheduling, and analytics, the ESP's value collapses to "the SMTP pipe", and you're paying $1.25/1k for what costs $0.10/1k from SES.

### Why SES specifically over GCP/Mailgun/etc
- Cheapest at any scale ($0.10/1k = ~12× cheaper than Postmark)
- Largest verified IP pool, best documented reputation behavior
- First-class event publishing (SNS) and configuration sets
- AWS SDK v3 is modern and well-typed
- Dedicated-IP option ($24.95/mo per IP) when we're ready to own our reputation outright

## 2. System overview

```
                     ┌──────────────────────────┐
                     │  Nuxt (Nitro) /app/*     │
                     │   editor / dashboard     │
                     └────────────┬─────────────┘
                                  │ HTTPS · session token
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │   Express + Parse Server  (:8080)                │
        │   ─────────────────────────                      │
        │   Cloud Functions:                               │
        │     • scheduleSend(campaignId)                   │
        │     • sendTestEmail({campaignId, to})            │
        │     • compileBlocks (beforeSave on Campaign)     │
        │     • verifyDomain (Phase 3+)                    │
        └─────────────────┬────────────────────────────────┘
                          │   enqueue job
                          ▼
                ┌─────────────────────┐
                │  Mongo: jobs        │
                │  (Agenda queue)     │
                └────────┬────────────┘
                         │
                         │   pulled by worker
                         ▼
        ┌──────────────────────────────────────────────────┐
        │   Worker process (Node, separate from Express)   │
        │   ────────────────────────────────────────       │
        │   Jobs handled:                                  │
        │     • campaign-fanout                            │
        │     • send-email                                 │
        │     • webhook-ingest                             │
        │     • suppression-recompute                      │
        └─────────────────┬────────────────────────────────┘
                          │   AWS SDK v3 (SESv2)
                          ▼
                ┌──────────────────────┐
                │  AWS SES             │
                │  region: us-east-1   │
                └────────┬─────────────┘
                         │   SMTP → recipient inbox provider
                         ▼
                ┌──────────────────────┐
                │  Gmail / Outlook /   │
                │  Yahoo / Apple Mail  │
                └────────┬─────────────┘
                         │
        ┌────────────────┴────────────────┐
        │  hours later, async              │
        │   delivery / bounce / complaint  │
        ▼                                  ▼
┌──────────────┐               ┌─────────────────────┐
│  Recipient   │               │  AWS SES → SNS      │
│  open/click  │               │  topic              │
│  (our        │               └─────────┬───────────┘
│  pixel +     │                         │  HTTPS POST + HMAC
│  redirector) │                         ▼
│              │       ┌────────────────────────────┐
│              │       │ POST /api/webhooks/ses     │
│              │       │   verifies SNS signature   │
│              │       │   enqueues webhook-ingest  │
│              │       └────────────────────────────┘
│              │                         │
└──────┬───────┘                         │
       │   GET /t/o/<token> (open pixel) │
       │   GET /t/c/<token> (click)      │
       │   POST /u/<token> (unsubscribe) │
       ▼                                  ▼
┌──────────────────────────────────────────────┐
│   EmailEvent rows in Parse                   │
│   Suppression updates on bounce/complaint    │
│   Counter updates on Campaign                │
└──────────────────────────────────────────────┘
```

Two processes: the existing Express+Parse server (handles API + Cloud Functions + webhook ingress + tracking endpoints) and a new long-running **worker process** (pulls jobs from Mongo, calls SES). Both connect to the same MongoDB.

## 3. AWS SES configuration

### Account setup
- **Region**: `us-east-1` (largest SES capacity, most documented; lowest latency to North America)
- **Move out of sandbox**: SES new accounts can only send to verified addresses up to 200/day. We file the "production access" request immediately on infra setup — Amazon usually approves within 24h.
- **Sending quotas**: start ~200/day, auto-increases over weeks based on bounce/complaint rates. We design around this; early customers send small.
- **IAM user**: dedicated IAM user with `AmazonSESFullAccess` (scoped down later) — credentials in `server/.env` as `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`.

### Configuration sets
Single configuration set `gorilla-production` (and `gorilla-dev` for staging). Configures:
- Event publishing → SNS topic `arn:aws:sns:us-east-1:<acct>:gorilla-ses-events`
- IP pool: shared (free tier); dedicated when we add it (Phase 4)
- Open + click tracking: **off at the SES level** (we do our own tracking — see §10)
- DKIM signing: on, key per sending domain (see §4)

### SNS event publishing
SES publishes one message per event to the SNS topic. Event types:
- `Bounce` — sub-types: `Permanent` (hard) / `Transient` (soft)
- `Complaint` — recipient hit spam
- `Delivery` — SES handed off to recipient's MX server
- `Send` — accepted by SES
- `Reject` — SES blocked (rare; format issues)
- `Rendering Failure` — bad template substitution (we don't use SES templates, so n/a)

SNS posts to our HTTPS endpoint: `POST https://api.gorilla.email/api/webhooks/ses`. SNS includes a signature header we verify against AWS's public key (don't trust the body without it).

### Sending throughput control
SES enforces a "max send rate" (e.g. 14 emails/sec for an unwarmed account, up to ~50/sec warmed). We respect this at the worker level by limiting concurrency on the `send-email` queue.

## 4. Sending domain — `send.gorilla.email`

MVP uses **one shared sending domain** owned by us. All tenants send from `<friendly-name>@send.gorilla.email` regardless of who they are. Phase 3+ adds BYO-domain.

### DNS records on `send.gorilla.email`

| Record | Purpose | Value (template) |
|---|---|---|
| `send.gorilla.email` MX | Receive bounces + replies fallback | `10 inbound-smtp.us-east-1.amazonaws.com` |
| `send.gorilla.email` TXT (SPF) | Authorize SES to send for us | `v=spf1 include:amazonses.com -all` |
| `<selector>._domainkey.send.gorilla.email` CNAME | DKIM | Pointed to SES-generated DKIM record |
| `_dmarc.send.gorilla.email` TXT (DMARC) | Authentication policy + reporting | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@gorilla.email; ruf=mailto:dmarc-reports@gorilla.email; pct=100; aspf=s; adkim=s` |

### DKIM
- AWS SES generates a 2048-bit RSA keypair for the domain
- We add the CNAME to DNS (one-time setup)
- SES signs every outbound message with the matching private key
- Rotation: SES handles automatically

### From-address composition

Recipient sees:
```
From: "Alex from Folkways" <alex@send.gorilla.email>
Reply-To: alex@folkways.io
```

The `From` is on OUR domain (so DKIM passes against our key). The visible name carries the tenant's brand. `Reply-To` routes replies to the tenant's real address.

**Drawback**: recipients see `via send.gorilla.email` in some clients (Gmail). Migrating to BYO-domain in Phase 3 fixes this — the tenant's domain then signs the email and `via` disappears.

## 5. Data model

Adds to what Architecture.md committed:

### `CampaignSend` (refined)
One row per recipient per campaign. Snapshotted at fanout time.

| Field | Type | Notes |
|---|---|---|
| `campaign` | Pointer → Campaign | |
| `contact` | Pointer → Contact | |
| `email` | String | snapshot — survives Contact email changes |
| `mergeFields` | Object | snapshot of merge values at queue time |
| `sesMessageId` | String | set after SES accepts; primary key for webhook joins |
| `status` | String | `pending` / `queued` / `sent` / `delivered` / `bounced` / `complained` / `failed` / `suppressed` |
| `statusUpdatedAt` | Date | |
| `bounceCategory` | String | nullable; `permanent` / `transient` / `undetermined` |
| `bounceSubType` | String | nullable; `mailbox-full` / `unknown-recipient` / etc. |
| `failureReason` | String | nullable; SMTP-level failure if SES rejected |
| `openedAt` | Date | first open; nullable |
| `clickedAt` | Date | first click; nullable |
| `unsubscribedAt` | Date | nullable |

Indexes: `(campaign, contact)` unique, `sesMessageId` unique (for webhook lookup), `status` for filtered reports.

### `EmailEvent`
Raw event log. Cheap to write, expensive to query without rollups → keep per-campaign counters denormalized on Campaign.

| Field | Type | Notes |
|---|---|---|
| `campaignSend` | Pointer → CampaignSend | |
| `type` | String | `accepted` / `delivered` / `open` / `click` / `bounce` / `complaint` / `unsubscribe` / `failed` |
| `timestamp` | Date | event-occurred time, not write time |
| `linkUrl` | String | for `click` only |
| `userAgent` | String | for `open`/`click` |
| `ipAddress` | String | for `open`/`click`, geo-derivable |
| `bounceCategory` | String | for `bounce` |
| `raw` | Object | full SES event body, for debugging |

TTL: 90 days on raw `EmailEvent` rows. Headline counters on Campaign persist forever (per Architecture.md).

### `Suppression`
Global per-organization suppression. Once an email lands here for a given tenant, no future sends go to it.

| Field | Type | Notes |
|---|---|---|
| `email` | String (lowercase) | indexed |
| `organization` | Pointer → Organization | per-tenant scope |
| `reason` | String | `hard_bounce` / `soft_bounce_threshold` / `complaint` / `unsubscribe` / `manual` |
| `firstSuppressedAt` | Date | |
| `lastEventAt` | Date | most recent event that affirmed the suppression |
| `eventCount` | Number | how many events triggered this; used for soft-bounce promotion |

Compound index: `(organization, email)` unique. Lookup at fanout is `O(log n)` per recipient.

**Decision: per-org scoping, not global.** A user who unsubscribed from tenant A may still want tenant B's emails. But within an org, suppression is absolute.

### `SendingDomain` (deferred; Phase 3)
Lives empty in MVP since we use the shared `send.gorilla.email`. Added later for BYO-domain.

### `WorkerJob` / `JobLog` (Agenda's tables)
Mongo-backed queue uses two collections under the hood — `agendaJobs` for active jobs, `agendaJobsHistory` (optional) for completed. No app-level model needed.

## 6. Queue layer — Mongo via Agenda

Architecture.md committed to Redis + BullMQ; we override to Mongo + **Agenda** since the user picked Mongo-backed. Trade-offs called out:

| | BullMQ | Agenda |
|---|---|---|
| Backing store | Redis | Mongo |
| Per-job rate limiting | First-class (`limiter` option, `groupKey`) | Hand-rolled via `concurrency` + custom Mongo locks |
| Retries with backoff | First-class | First-class but less ergonomic |
| Throughput ceiling | Very high | Lower (Mongo ops not as fast as Redis pubsub) |
| Operational footprint | + Redis instance | Zero extra (uses existing Mongo) |
| Debugging | Bull Board (excellent) | Less mature tooling |

For MVP volume (sub-50k emails/day per tenant) Agenda's throughput is sufficient. We design the rate-limiting carefully (see below).

### Queues
| Queue name | Concurrency | Purpose |
|---|---|---|
| `campaign-fanout` | 2 | One job per scheduled campaign; expands to N send-email jobs |
| `send-email` | 50 (global) | Actual SES API call per recipient. Per-tenant throttling enforced via job filter (§7) |
| `webhook-ingest` | 10 | SES → SNS → us; queue-buffered so spikes don't overwhelm Parse |
| `suppression-recompute` | 1 | Recomputes Contact engagement scores; runs daily |
| `cleanup-events` | 1 | TTL-prunes EmailEvent rows older than 90d; runs daily |

Worker process boots Agenda with these handlers, then processes forever. PM2-managed in production.

### Per-tenant rate limiting (the trick with Mongo queues)
Agenda doesn't have BullMQ's `groupKey` rate limiter. We implement it ourselves:

```js
// pseudocode for the send-email worker
agenda.define('send-email', { concurrency: 50 }, async (job) => {
  const { tenantId, recipientCount } = job.attrs.data;

  // Per-tenant lock + rate window
  const allowed = await acquireTenantSlot(tenantId, {
    rateLimit: tenantRateLimit(tenantId),  // e.g. 10/sec
    windowMs: 1000,
  });
  if (!allowed) {
    return job.schedule('in 1 second');  // retry shortly, don't fail
  }

  await sendViaSES(job.attrs.data);
});
```

`acquireTenantSlot` uses a Mongo upsert + bucket pattern (per-tenant doc with a token bucket). Slow path but simple; not a hot loop.

## 7. The send pipeline (end-to-end)

### Step 1: Editor clicks Send
- Pre-flight checklist passes (Editor-phase1.md §8)
- Frontend POSTs to `Parse.Cloud.run("scheduleSend", { campaignId, when: "now" | ISO })`

### Step 2: `scheduleSend` cloud function
Validates server-side (don't trust client pre-flight):
- Campaign belongs to caller's org
- `compiledHtml` is set (re-run `compileBlocks` if dirty)
- Audience is set + has > 0 recipients
- Subject + fromEmail are set
- Sender domain (shared in MVP, BYO in Phase 3) is verified
- Tenant isn't suspended (see §15 abuse controls)

Then:
```js
campaign.set("status", "queued");
await campaign.save();
await agenda.now("campaign-fanout", { campaignId: campaign.id, when });
return { jobId, recipientCount };
```

### Step 3: `campaign-fanout` worker job
```js
async function fanout({ campaignId, when }) {
  const campaign = await getCampaign(campaignId);
  const audience = await resolveAudience(campaign);  // List or Segment → Contact[]

  // Dedupe + suppression check in one query
  const validRecipients = await dedupedRecipients(audience, campaign.get('organization'));
  // validRecipients = unique by email, not in Suppression table

  // Snapshot
  const sends = validRecipients.map(c => new Parse.Object('CampaignSend', {
    campaign, contact: c,
    email: c.get('email'),
    mergeFields: extractMergeFields(c),
    status: 'queued',
  }));
  await Parse.Object.saveAll(sends, { useMasterKey: true });

  campaign.set('status', 'sending');
  campaign.set('recipientCount', sends.length);
  await campaign.save();

  // Enqueue per-recipient jobs (may be N=20,000 — Agenda handles in batches)
  const jobs = sends.map(s => ({
    name: 'send-email',
    data: { sendId: s.id, campaignId, tenantId },
  }));
  await agenda.insertMany(jobs);

  // For scheduled sends, the campaign-fanout job itself runs at `when`,
  // so by the time we're here it's go-time.
}
```

### Step 4: `send-email` worker job (per recipient)
```js
async function sendOne({ sendId, campaignId, tenantId }) {
  const send = await getCampaignSend(sendId);
  if (send.get('status') !== 'queued') return; // already sent or cancelled

  const campaign = await getCampaign(campaignId);
  const compiledHtml = campaign.get('compiledHtml');

  // Merge-field substitution
  const html = mergeFields(compiledHtml, send.get('mergeFields'));

  // Tracking pixel + link rewriting (see §10)
  const trackedHtml = injectTracking(html, sendId);

  // Add unsubscribe footer + List-Unsubscribe header (see §11)
  const unsubToken = signUnsubToken(sendId);
  const finalHtml = injectUnsubscribeFooter(trackedHtml, unsubToken);

  // Send via SES
  const cmd = new SendEmailCommand({
    Source: `${campaign.get('fromName')} <alex@send.gorilla.email>`,
    Destination: { ToAddresses: [send.get('email')] },
    Content: {
      Simple: {
        Subject: { Data: campaign.get('subject'), Charset: 'UTF-8' },
        Body: { Html: { Data: finalHtml, Charset: 'UTF-8' } },
      },
    },
    ConfigurationSetName: 'gorilla-production',
    ReplyToAddresses: [campaign.get('replyTo') || campaign.get('fromEmail')],
    Headers: [
      { Name: 'List-Unsubscribe',      Value: `<https://api.gorilla.email/u/${unsubToken}>` },
      { Name: 'List-Unsubscribe-Post', Value: 'List-Unsubscribe=One-Click' },
    ],
  });

  try {
    const res = await ses.send(cmd);
    send.set('sesMessageId', res.MessageId);
    send.set('status', 'sent');
    await send.save(null, { useMasterKey: true });
    await writeEmailEvent(send, 'accepted', res);
  } catch (err) {
    send.set('status', 'failed');
    send.set('failureReason', err.message);
    await send.save(null, { useMasterKey: true });
    throw err;  // Agenda will retry with backoff
  }
}
```

Retry policy: `attempts: 3, backoff: { type: 'exponential', delay: 5000 }`.

### Step 5: SES delivers (or doesn't)
Async; we don't wait. SES queues internally and delivers within seconds to minutes.

### Step 6: SES → SNS → our webhook
Events arrive at `POST /api/webhooks/ses` minutes (delivery) to hours (open/click) later.

```js
app.post('/api/webhooks/ses', async (req, res) => {
  // Verify SNS signature against AWS public key (CRITICAL — anyone can POST)
  const verified = await verifySNSSignature(req.body, req.headers);
  if (!verified) return res.status(403).send('bad signature');

  // SNS subscription confirmation handshake (one-time)
  if (req.body.Type === 'SubscriptionConfirmation') {
    await confirmSNS(req.body.SubscribeURL);
    return res.sendStatus(200);
  }

  // Enqueue for ingest (don't process inline — keep webhook fast)
  await agenda.now('webhook-ingest', { event: JSON.parse(req.body.Message) });
  res.sendStatus(200);
});
```

### Step 7: `webhook-ingest` worker
```js
async function ingestWebhook({ event }) {
  const messageId = event.mail.messageId;
  const send = await new Parse.Query('CampaignSend')
    .equalTo('sesMessageId', messageId)
    .first({ useMasterKey: true });
  if (!send) return;  // shouldn't happen, but harmless

  switch (event.eventType) {
    case 'Delivery':
      send.set('status', 'delivered');
      await writeEmailEvent(send, 'delivered', event);
      break;
    case 'Bounce':
      await handleBounce(send, event.bounce);
      break;
    case 'Complaint':
      await handleComplaint(send, event.complaint);
      break;
  }
  await send.save(null, { useMasterKey: true });
  await bumpCampaignCounters(send.get('campaign'));
}
```

## 8. Bounce + complaint handling

### Bounces
SES classifies bounces:

| `bounceType` | `bounceSubType` | Our action |
|---|---|---|
| `Permanent` | `General` / `NoEmail` / `Suppressed` | Add to Suppression (`hard_bounce`). Never retry. |
| `Transient` | `MailboxFull` / `MessageTooLarge` | Increment `Contact.softBounceCount`. If ≥ 5, promote to hard bounce + Suppression. |
| `Transient` | `General` / `AttachmentRejected` | Retry up to 3x via worker backoff. |
| `Undetermined` | — | Treat as soft bounce; log for review. |

### Complaints
ANY complaint = immediate Suppression with reason `complaint`. Plus:
- If tenant's complaint rate > 0.1% in trailing 24h: **alert tenant via in-app notification + email**
- If complaint rate > 0.3% in 24h or > 0.5% in trailing 7d: **auto-pause sends from that tenant**. Manual review to unpause.

This is non-negotiable for shared-domain operation — one bad tenant's complaint rate damages every other tenant on the same domain.

## 9. DKIM signing

Handled by SES at the transport layer; we configure the keypair once per domain. SES signs each message header automatically.

For Phase 3 (BYO-domain), the flow:
- We generate a 2048-bit RSA keypair per `SendingDomain`
- Public key published in the tenant's DNS at `<selector>._domainkey.<domain>` as CNAME → SES (or as TXT with the public key directly)
- SES signs outbound emails on that domain with the matching private key (managed in SES)
- DMARC alignment: From: domain must match the DKIM d= domain

For MVP (shared domain), all this is one-time setup on `send.gorilla.email`.

## 10. Open + click tracking

We do tracking in-house, not via SES's built-in tracking. Reasons:
- Our tracking endpoints can record richer data (per-link, per-recipient, geo from IP)
- Token signing prevents abuse
- SES's tracking URL pattern (`r.us-east-1.awstrack.me`) is widely blocked by privacy-conscious clients

### Open pixel
Each email contains:
```html
<img src="https://api.gorilla.email/t/o/<token>" width="1" height="1" alt="" border="0" />
```

`<token>` is an HMAC-signed value containing `{ sendId, ts }`. The endpoint:
- Verifies the HMAC
- Records an `EmailEvent { type: "open" }`
- Sets `CampaignSend.openedAt` if first open
- Returns a 1×1 GIF (cached `no-store` so each open re-records)

### Click redirect
Every `<a href>` in the compiled HTML is rewritten at send time:
```
<a href="https://example.com/sale">Shop</a>
```
becomes
```
<a href="https://api.gorilla.email/t/c/<token>">Shop</a>
```

`<token>` contains `{ sendId, originalUrl, ts }`, HMAC-signed. The endpoint:
- Verifies HMAC
- Records `EmailEvent { type: "click", linkUrl: originalUrl }`
- Sets `CampaignSend.clickedAt` if first click
- 302-redirects to `originalUrl`

### Gmail image prefetching
Gmail aggressively prefetches images via Google proxies — this fires our open pixel within seconds of delivery, regardless of whether the user actually opened the email. Result: open rates are inflated by ~30%. We document this; not a bug.

## 11. Unsubscribe

Three paths to opt out:

### Footer link (existing Footer block)
At send time, the Footer block's "Unsubscribe" text becomes:
```
<a href="https://api.gorilla.email/u/<token>">Unsubscribe</a>
```
GETs go to a confirmation page ("You're unsubscribed."); POSTs (from List-Unsubscribe-Post) skip the page.

### `List-Unsubscribe` header
Required by Gmail/Outlook bulk-sender guidelines (2024+ enforcement).

```
List-Unsubscribe: <https://api.gorilla.email/u/<token>>, <mailto:unsub@send.gorilla.email?subject=unsub:<token>>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

The HTTPS URL accepts POST without confirmation (RFC 8058 one-click). The mailto: address is parsed by an inbound SES rule that fires the same suppression logic.

### Manual (via account settings, not relevant for MVP)
Future: per-list opt-out semantics. For MVP, all unsubs are tenant-wide.

### What "unsubscribe" does
- Adds to `Suppression` with reason `unsubscribe`
- Sets `Contact.unsubscribed = true`
- Records an `EmailEvent { type: "unsubscribe" }`
- Bumps `Campaign.unsubscribeCount`

## 12. Suppression — the safety net

Every send-email job hits Suppression check before SES:

```js
const suppressed = await new Parse.Query('Suppression')
  .equalTo('organization', orgPointer)
  .equalTo('email', send.get('email').toLowerCase())
  .first({ useMasterKey: true });
if (suppressed) {
  send.set('status', 'suppressed');
  await send.save(null, { useMasterKey: true });
  return;  // skip SES call entirely
}
```

Most platforms also dedupe at the fanout stage so we don't enqueue jobs that will be no-op'd. We do both — defense in depth.

### Recovery
Manual un-suppression (via the Suppression list UI) is possible for `manual` / `unsubscribe` reasons. **Cannot un-suppress** `hard_bounce` or `complaint` — those are irrevocable for compliance.

## 13. Per-tenant rate limiting + throttling

| Tier | Send rate | Daily cap | Concurrent fanouts |
|---|---|---|---|
| Free | 1/sec | 1,000/day | 1 |
| Paid (default) | 10/sec | 50,000/day | 3 |
| Custom | configurable | configurable | configurable |

Enforced at the `send-email` worker via the Mongo token-bucket pattern in §6. Daily cap enforced at `scheduleSend` time (refuse to schedule if would exceed cap in next 24h).

SES enforces its own per-account rate (currently ~50/sec for warmed accounts). We stay well under it.

## 14. Compliance — the legal floor

| Requirement | Source | How we satisfy it |
|---|---|---|
| Unsubscribe in every commercial email | CAN-SPAM | Footer block (Editor-phase1.md §6) |
| Physical sender address | CAN-SPAM | Footer block, tenant must fill in their address |
| Honor opt-out within 10 days | CAN-SPAM | Real-time Suppression check at every send |
| Truthful From and Subject | CAN-SPAM | Pre-flight checks for non-spammy patterns |
| One-click unsubscribe (>5k/day senders) | Gmail/Outlook 2024 bulk-sender guidelines | `List-Unsubscribe` header (§11) |
| `From:` domain must align with DKIM | DMARC, RFC 7489 | DKIM is on `send.gorilla.email`, From domain is `send.gorilla.email` |
| Right to data deletion | GDPR | `deleteContactData(contactId)` cloud function — purges Contact + Sends + Events + Suppression rows for that email |
| Explicit consent capture for imported contacts | GDPR | CSV import requires the marketer to attest "I have opt-in proof for these contacts." We log the attestation. |

## 15. Abuse controls — critical for shared-domain operation

Shared sending domain = shared reputation. One bad tenant can blacklist `send.gorilla.email` for everyone. Three layers of defense:

### Layer 1: Pre-flight content scan
Before send, scan the compiled HTML for spam signals:
- URL shorteners (`bit.ly`, `t.co`, `goo.gl`, etc.) → block
- Excessive caps in subject (>30% uppercase) → warn
- Hidden text (white on white, `display: none`) → block
- Multiple `<a>` tags pointing to mismatched display text and href → warn
- Known spam-trigger words ("FREE!!!" with excessive punctuation) → warn

Block = pre-flight check fails, can't send. Warn = pre-flight check passes with a warning surfaced to the user.

### Layer 2: Real-time complaint monitoring
Run a job every 5 minutes:
- Compute trailing-1h and trailing-24h complaint rates per tenant
- If > 0.1%: in-app warning + email to tenant
- If > 0.3% in 24h or > 0.5% in 7d: **auto-pause the tenant**. Block future scheduleSend calls until ops reviews + unpauses. Slack alert internally.

### Layer 3: Bounce-rate monitoring
Same job:
- Hard-bounce rate > 5% in 24h → throttle to 1 email/sec
- Hard-bounce rate > 10% in 24h → auto-pause

Bounce rate that high signals a stale or scraped list. Forcing throttle protects the shared domain's reputation.

### Layer 4: List import sanity check
On CSV import:
- Run every email through a basic validator (regex + MX lookup for the domain)
- If > 30% of rows fail validation: reject the import, surface "this list looks dirty"

## 16. Monitoring + observability

What to log + watch:

| Signal | Threshold | Action |
|---|---|---|
| Queue depth (send-email) | > 10k pending | Alert ops; scale worker |
| Worker error rate | > 1% over 5 min | Alert ops |
| SES API latency p95 | > 2s | Alert; possibly switch region |
| Webhook ingest lag (SES event → ingested) | > 5 min | Alert ops |
| Per-tenant complaint rate | > 0.1% in 24h | Auto-warn tenant |
| Per-tenant bounce rate | > 5% in 24h | Auto-throttle tenant |
| Aggregate complaint rate (all tenants) | > 0.05% in 24h | Alert ops — shared-domain reputation at risk |
| DMARC aggregate reports | n/a (parsed daily) | Surface unauthorized senders + alignment failures |

Tooling: Parse logs + simple Mongo aggregations for the per-tenant rate jobs. Slack webhook for alerts.

External monitors to register with:
- **Google Postmaster Tools** (`gorilla.email`) — visibility into Gmail's reputation scoring
- **Microsoft SNDS** + **JMRP** — for Outlook/Hotmail
- **AWS SES dashboard** — reputation dashboard, bounce/complaint rates
- **MXToolbox blacklist watch** — alert if our IP or domain lands on any major RBL

## 17. Phased delivery plan

| Phase | Scope | Demo at end | Dependencies |
|---|---|---|---|
| **1 · SES wire-up + test send** | AWS account setup, SES out of sandbox, DKIM CNAME, `send.gorilla.email` domain verified, `sendTestEmail` cloud-fn POSTs to SES, single recipient. Mongo `Suppression` table created. | Click "Test send" in editor → email arrives in your inbox with DKIM-pass, SPF-pass, DMARC-pass. | AWS account, DNS access |
| **2 · Webhook ingestion + Suppression** | SNS topic + subscription. `/api/webhooks/ses` endpoint with signature verification. `webhook-ingest` worker. Hard-bounce → suppression. Complaint → suppression. Display in a basic Suppression list UI. | Send to a fake bounce address (`bounce@simulator.amazonses.com`) — see it land in Suppression within 30s. | Phase 1 |
| **3 · Fanout + broadcast send** | Worker process (PM2). Agenda queues. `campaign-fanout` job snapshots `CampaignSend` rows. `send-email` job dispatches. Suppression check at fanout + send. Editor's "Send" button actually sends. Pre-flight content scan. | Send a campaign to 50 mock contacts. See real delivery / open / click events trickle into the report. | Phase 1, Phase 2 |
| **4 · Tracking + List-Unsubscribe** | Open pixel endpoint + token signing. Click redirect endpoint. HTML rewriter at send time. `List-Unsubscribe` header. `/u/<token>` unsubscribe endpoint. | Click a link in a sent email → land on the destination, EmailEvent recorded. Click Unsubscribe → instantly suppressed, see it in the list. | Phase 3 |
| **5 · Per-tenant rate limiting + abuse controls** | Token-bucket rate limiter. Complaint-rate + bounce-rate monitors with auto-pause. Tenant dashboard reflects send health. Daily SES quota enforcement. | Burst-send 5000 in 30 seconds; see throttle kick in to your tenant tier. | Phase 3 |
| **6 · Hardening** | DMARC aggregate report parser. Google Postmaster Tools / SNDS integration. MX toolbox alerting. Dedicated IP option (Phase 6.5 — when volume justifies). | Bounce rate < 2%, complaint rate < 0.1%, deliverability dashboards green. | All prior |

Phase 1 + 2 = ~2 weeks (one engineer). Phase 3 = ~2 weeks. Phase 4 = ~1 week. Phase 5 = ~1 week. Phase 6 = ongoing.

**Total to "production-ready send": ~6 weeks of focused work.**

## 18. Key trade-off decisions

| Decision | Rationale | Cost of changing later |
|---|---|---|
| In-house glue + AWS SES (not full ESP, not full DIY) | Owns the platform glue (queue, fanout, tracking, suppression), delegates SMTP + IP warming to AWS. Right balance for stage. | Low to swap SES for Postmark (just an adapter); high to add full DIY MTA. |
| Mongo-backed queue (Agenda) over Redis + BullMQ | Saves operating Redis. Throughput sufficient for MVP. | Medium — migrating queue infra means re-implementing rate-limiting + retries. |
| Shared sending domain at MVP, BYO-domain in Phase 3+ | Instant onboarding. Defers DNS-onboarding UX. | Low — BYO-domain is additive, doesn't break existing shared-domain sends. |
| Per-org suppression scoping (not global) | A user who unsubscribed from tenant A may still want tenant B's emails. | Low — promoting to global is a one-time data migration. |
| In-house tracking (open pixel + click redirect), not SES tracking | Richer data per-link/per-recipient, no `r.awstrack.me` URLs (which clients block), token-signed. | Low — could swap to SES tracking by changing the rewriter step. |
| TTL 90 days on raw EmailEvent rows | Headline counters survive forever on Campaign. Storage cost is bounded. | Trivial. |
| Auto-pause tenant on complaint rate > 0.3% / 24h | Shared-domain operation requires it. Bad tenant = poisoned well for everyone. | None — adds, doesn't subtract. |

## 19. Open questions

1. **AWS account boundaries.** One AWS account for dev + prod, or two? Two is the AWS-recommended pattern. Adds setup overhead. Lean: one for now, split when we hit it.
2. **Region.** `us-east-1` is the default. If we have European customers, multi-region SES setup adds complexity. Defer until needed.
3. **Inbound email handling.** For the `mailto:` variant of List-Unsubscribe, we need SES inbound + a rule to forward to a Lambda that suppresses. Optional in Phase 4; could skip for MVP.
4. **Pricing pass-through.** Will we charge customers per-email or per-month? Per-email is cleaner with SES's cost. Affects how we model billing later.
5. **Dedicated IP threshold.** At what monthly volume do we offer dedicated IPs to specific tenants? Industry default is 50k-100k/month; we revisit when we have a customer at that volume.
6. **Sandbox testing.** SES has `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com` for testing. Should we expose a "Send to bounce simulator" affordance in the editor's Test Send for QA? Yes — flag for Phase 2.
