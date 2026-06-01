// Editor-facing send Cloud Functions. CommonJS. Loaded by Parse Server cloud,
// so `Parse.Cloud.define` is available here (unlike worker jobs).
//
// This module owns the three entry points the editor calls to send mail:
//   - sendTestEmail({ campaignId, to })   → send the design to up to 5 addresses
//                                            RIGHT NOW, directly via the SES
//                                            adapter. No CampaignSend, no
//                                            tracking, no suppression — it's a
//                                            preview-grade send for the author.
//   - scheduleSend({ campaignId, when })  → validate the campaign is ready, then
//                                            flip status to queued/scheduled and
//                                            enqueue the CAMPAIGN_FANOUT job that
//                                            the worker turns into per-recipient
//                                            sends.
//   - cancelScheduledSend({ campaignId }) → undo a queued/scheduled send: status
//                                            back to draft + best-effort cancel
//                                            the enqueued fanout job.
//
// Ownership is enforced by reading the Campaign as the caller (ACL isolates
// cross-org gets → OBJECT_NOT_FOUND), the same pattern campaigns.js uses. The
// org is resolved via the tenancy spine for the recipient-count query.
//
// Recipient model (see contacts.js): Contact.lists is an ARRAY of List id
// STRINGS, and Campaign.audienceId is a List id STRING. A "sendable" recipient
// is: status === "subscribed", deleted !== true, lists contains audienceId,
// scoped to the caller's organization. (Per-org Suppression is applied at fanout
// time by the worker; the count here is the addressable audience.)

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");
const { getSesAdapter } = require("../lib/ses");
const { resolveMergeFields } = require("../lib/renderEmail");
const { getAgenda } = require("../lib/agendaInstance");
const { CAMPAIGN_FANOUT } = require("../lib/jobNames");

// Default From identity when the campaign hasn't set one (test sends should
// still go out so the author can preview).
const DEFAULT_FROM_NAME = "Gorilla";
const DEFAULT_FROM_EMAIL = "hello@send.gorilla.email";

// The shared sending domain every tenant may send from at MVP (DKIM/SPF/DMARC
// are configured on it centrally). Sending from any OTHER domain requires the
// org to have verified it under Settings → Domains, otherwise the mail fails
// DKIM/DMARC alignment (hurting deliverability + enabling spoofing).
const SHARED_SENDING_DOMAIN = DEFAULT_FROM_EMAIL.split("@")[1]; // send.gorilla.email

// Pull the bare domain out of a From value, which may be either
// `user@domain` or `Display Name <user@domain>`. Returns "" if unparseable.
function fromEmailDomain(fromEmail) {
  const s = String(fromEmail || "");
  const angle = s.match(/<([^>]+)>/);
  const addr = (angle ? angle[1] : s).trim();
  const at = addr.lastIndexOf("@");
  if (at < 0) return "";
  return addr.slice(at + 1).trim().toLowerCase();
}

// SECURITY/DELIVERABILITY guard (LaunchReadiness §3): a campaign may send from
// the shared domain freely; any custom domain must have a verified SendingDomain
// row for this org. Throws OPERATION_FORBIDDEN otherwise. Synchronous at
// schedule time so it covers both "now" and scheduled sends.
async function assertSendableFromDomain(org, fromEmail) {
  const domain = fromEmailDomain(fromEmail);
  if (!domain) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Set a valid from address before sending.",
    );
  }
  if (domain === SHARED_SENDING_DOMAIN) return; // shared identity — always allowed

  const q = new Parse.Query("SendingDomain");
  q.equalTo("organization", org);
  q.equalTo("domain", domain);
  q.equalTo("verified", true);
  const verified = await q.first({ useMasterKey: true });
  if (!verified) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      `Verify ${domain} under Settings → Domains before sending from it (or use an @${SHARED_SENDING_DOMAIN} address).`,
    );
  }
}

// Cap on test-send recipients per call — a test send is for the author + a few
// teammates, not a blast. Also a cheap abuse guard.
const MAX_TEST_RECIPIENTS = 5;

// Campaign statuses from which a (re)schedule is allowed. A campaign that is
// already sending/sent/queued/scheduled-but-in-flight must not be re-enqueued
// from here — re-scheduling a queued/scheduled one would double-fanout.
const SCHEDULABLE_STATUSES = new Set(["draft", "scheduled"]);

// ── helpers ───────────────────────────────────────────────────────────────────

// Require auth + a campaignId, load the Campaign as the caller. ACL isolation
// means a campaign in another org surfaces as OBJECT_NOT_FOUND. Returns
// { campaign, sessionToken }.
async function loadOwnedCampaign(request) {
  if (!request.user) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, "Must be logged in.");
  }
  const { campaignId } = request.params || {};
  if (!campaignId) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Missing campaignId.");
  }
  const sessionToken = request.user.getSessionToken();
  const campaign = await new Parse.Query("Campaign").get(campaignId, { sessionToken });
  return { campaign, sessionToken };
}

// Pragmatic RFC-5322-ish address check. Not a full grammar — rejects the obvious
// garbage (no @, spaces, missing local/domain, no dot in domain) while letting
// real addresses through. Mirrors the strictness the editor's client uses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(addr) {
  return typeof addr === "string" && EMAIL_RE.test(addr.trim());
}

// Parse the `to` param into a validated, de-duplicated list of addresses.
// Accepts a comma-separated string OR an array. Throws on empty/invalid/over-cap.
function parseRecipients(to) {
  let raw;
  if (Array.isArray(to)) {
    raw = to;
  } else if (typeof to === "string") {
    raw = to.split(",");
  } else {
    raw = [];
  }
  const addrs = [];
  const seen = new Set();
  for (const part of raw) {
    const addr = String(part || "").trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    addrs.push(addr);
  }
  if (addrs.length === 0) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Enter at least one recipient address.",
    );
  }
  if (addrs.length > MAX_TEST_RECIPIENTS) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Test sends are limited to ${MAX_TEST_RECIPIENTS} recipients at a time.`,
    );
  }
  const bad = addrs.filter((a) => !isValidEmail(a));
  if (bad.length) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Not a valid email address: ${bad.join(", ")}`,
    );
  }
  return addrs;
}

// Compose the RFC From header from the campaign's identity (or defaults).
function composeFrom(campaign) {
  const name = campaign.get("fromName") || DEFAULT_FROM_NAME;
  const email = campaign.get("fromEmail") || DEFAULT_FROM_EMAIL;
  return `${name} <${email}>`;
}

// Count addressable (subscribed, non-deleted) contacts for a campaign's
// audience, scoped to the org. audienceId is a List id string; Contact.lists is
// an array of List id strings (see contacts.js). Master key — the cloud fn has
// already established ownership of the campaign; this is a privileged count.
async function countRecipients(org, audienceId) {
  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("lists", audienceId); // array-contains on the string id
  q.equalTo("status", "subscribed");
  q.notEqualTo("deleted", true);
  return q.count({ useMasterKey: true });
}

// Best-effort enqueue. A queue hiccup must NOT crash the cloud fn — the status
// flip is the source of truth and a stuck job can be re-driven. Logs + swallows.
async function enqueueFanout({ campaignId, when, schedule }) {
  try {
    const agenda = await getAgenda();
    if (schedule) {
      // Future ISO — let Agenda hold it until `when`.
      await agenda.schedule(when, CAMPAIGN_FANOUT, { campaignId });
    } else {
      await agenda.now(CAMPAIGN_FANOUT, { campaignId, when: "now" });
    }
  } catch (err) {
    console.error(
      "[sending] failed to enqueue CAMPAIGN_FANOUT for",
      campaignId,
      "-",
      err && err.message,
    );
  }
}

// ── sendTestEmail ─────────────────────────────────────────────────────────────
// Sends the campaign's compiled HTML to up to MAX_TEST_RECIPIENTS addresses
// immediately, via the SES adapter. Renders with PLACEHOLDER merge fields (no
// real contact) so the author sees merge tags resolved. No CampaignSend, no
// tracking injection, no suppression writes — this is a preview send.
// Returns { ok, messageId, sentTo }.
Parse.Cloud.define("sendTestEmail", async (request) => {
  const { campaign } = await loadOwnedCampaign(request);

  const compiledHtml = campaign.get("compiledHtml");
  if (!compiledHtml || typeof compiledHtml !== "string" || !compiledHtml.trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Save your design first — there's nothing compiled to send.",
    );
  }

  const sentTo = parseRecipients(request.params && request.params.to);

  // Placeholder merge fields: prefer the caller's own name so the preview feels
  // real, fall back to "there". custom.* fields fall through to their inline
  // defaults / empty string (resolveMergeFields handles that).
  const callerName =
    (request.user && (request.user.get("name") || request.user.get("firstName"))) ||
    "there";
  const html = resolveMergeFields(compiledHtml, {
    firstName: callerName,
    name: callerName,
    custom: {},
  });

  const subject = "[TEST] " + (campaign.get("subject") || "(no subject)");

  // One send per recipient so each gets a clean To: line (and the mock outbox
  // records one MockSentMessage per address). Use the first messageId as the
  // representative id in the response.
  const adapter = getSesAdapter();
  const from = composeFrom(campaign);
  const replyTo = campaign.get("replyTo") || undefined;

  let firstMessageId = null;
  for (const to of sentTo) {
    const res = await adapter.sendEmail({ from, to, replyTo, subject, html });
    if (!firstMessageId) firstMessageId = res && res.messageId;
  }

  return { ok: true, messageId: firstMessageId, sentTo };
});

// ── scheduleSend ──────────────────────────────────────────────────────────────
// Validates the campaign is ready to send, then flips status + enqueues the
// fanout job. `when` is "now" or an ISO 8601 string in the future.
//   when === "now"  → status "queued", enqueue CAMPAIGN_FANOUT now.
//   future ISO      → status "scheduled" + scheduledAt, schedule a delayed
//                     CAMPAIGN_FANOUT for `when`.
// VALIDATIONS (throw clear Parse.Error): compiledHtml set, subject set,
// fromEmail set, audienceId set AND resolves to ≥1 addressable recipient, and
// the campaign is in a schedulable status (draft/scheduled).
// Returns { ok, recipientCount, status }.
Parse.Cloud.define("scheduleSend", async (request) => {
  const { campaign, sessionToken } = await loadOwnedCampaign(request);
  const org = await getUserOrg(request.user, { useMasterKey: true });

  const status = campaign.get("status") || "draft";
  if (!SCHEDULABLE_STATUSES.has(status)) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      `Can't schedule a campaign that is ${status}. Only draft or scheduled campaigns can be sent.`,
    );
  }

  // ── content + identity validations ──
  const compiledHtml = campaign.get("compiledHtml");
  if (!compiledHtml || typeof compiledHtml !== "string" || !compiledHtml.trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Save your design first — there's nothing compiled to send.",
    );
  }
  if (!campaign.get("subject") || !String(campaign.get("subject")).trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Add a subject line before sending.",
    );
  }
  if (!campaign.get("fromEmail") || !String(campaign.get("fromEmail")).trim()) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Set a from address before sending.",
    );
  }
  // Block sending from an unverified custom domain (shared domain always OK).
  await assertSendableFromDomain(org, campaign.get("fromEmail"));

  // ── audience validation ──
  const audienceId = campaign.get("audienceId");
  if (!audienceId) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Choose an audience before sending.",
    );
  }
  const recipientCount = await countRecipients(org, audienceId);
  if (recipientCount < 1) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "This audience has no subscribed recipients to send to.",
    );
  }

  // ── parse `when` ──
  const when = (request.params && request.params.when) || "now";
  const isNow = when === "now" || when == null;
  let scheduledAt = null;
  if (!isNow) {
    const d = when instanceof Date ? when : new Date(when);
    if (Number.isNaN(d.getTime())) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        "`when` must be \"now\" or a valid ISO date string.",
      );
    }
    if (d.getTime() <= Date.now()) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        "Scheduled send time must be in the future.",
      );
    }
    scheduledAt = d;
  }

  // ── flip status + persist (source of truth) BEFORE enqueue ──
  if (isNow) {
    campaign.set("status", "queued");
    campaign.unset("scheduledAt");
  } else {
    campaign.set("status", "scheduled");
    campaign.set("scheduledAt", scheduledAt);
  }
  await campaign.save(null, { sessionToken });

  // ── enqueue (best-effort; status is already committed) ──
  if (isNow) {
    await enqueueFanout({ campaignId: campaign.id, when: "now", schedule: false });
  } else {
    await enqueueFanout({
      campaignId: campaign.id,
      when: scheduledAt,
      schedule: true,
    });
  }

  return { ok: true, recipientCount, status: campaign.get("status") };
});

// ── cancelScheduledSend ───────────────────────────────────────────────────────
// Reverts a queued/scheduled campaign back to draft + clears the schedule, and
// best-effort cancels the enqueued fanout job. No-op-safe: a campaign that isn't
// queued/scheduled is left untouched (still returns ok). Returns { ok }.
Parse.Cloud.define("cancelScheduledSend", async (request) => {
  const { campaign, sessionToken } = await loadOwnedCampaign(request);
  const status = campaign.get("status") || "draft";

  if (status !== "queued" && status !== "scheduled") {
    // Nothing scheduled to cancel — idempotent success.
    return { ok: true, status };
  }

  campaign.set("status", "draft");
  campaign.unset("scheduledAt");
  await campaign.save(null, { sessionToken });

  // Best-effort cancel of the enqueued fanout. A failure here just leaves a job
  // that will find the campaign back in "draft" and no-op (the worker guards on
  // status), so don't crash the fn.
  try {
    const agenda = await getAgenda();
    await agenda.cancel({ name: CAMPAIGN_FANOUT, "data.campaignId": campaign.id });
  } catch (err) {
    console.error(
      "[sending] failed to cancel CAMPAIGN_FANOUT for",
      campaign.id,
      "-",
      err && err.message,
    );
  }

  return { ok: true, status: "draft" };
});
