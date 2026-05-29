// ─────────────────────────────────────────────────────────────────────────────
// send-email worker job. CommonJS. Sending.md §7.
//
// Given { sendId, campaignId } it renders + sends ONE CampaignSend:
//
//   1. re-fetch CampaignSend (master) — bail unless status === "queued"
//      (a retry of an already-sent/cancelled row is a no-op)
//   2. suppression check on (org, email) → status "suppressed", no send
//   3. render: resolveMergeFields → injectTracking → injectUnsubscribe
//   4. send via getSesAdapter() (mock or real, chosen by env)
//   5. on success: store sesMessageId + status "sent", write an "accepted"
//      EmailEvent, bump Campaign.sentCount
//   6. on SES failure: status "failed" + failureReason, then re-throw so Agenda
//      retries with backoff
//
// The handler is exported separately from register() so tests can call it
// directly with a plain data object — no live Agenda needed.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { SEND_EMAIL } = require("../../lib/jobNames");
const { getSesAdapter } = require("../../lib/ses");
const {
  openToken,
  clickToken,
  unsubToken,
} = require("../../lib/trackingTokens");
const {
  resolveMergeFields,
  injectTracking,
  injectUnsubscribe,
  listUnsubHeaders,
} = require("../../lib/renderEmail");
const { isSuppressed } = require("../../lib/suppression");
const { bumpCounter } = require("../../lib/campaignCounters");

const MK = { useMasterKey: true };

function trackingBase() {
  return process.env.PUBLIC_BASE_URL || "http://localhost:3001";
}

// The token builders already sign their payload (they wrap signToken internally),
// so they return the final URL-safe string. signToken(builder(...)) would
// double-encode — call the builders directly.
function buildPixelUrl(base, sendId) {
  return `${base}/t/o/${openToken(sendId)}`;
}
function buildClickUrl(base, sendId, originalHref) {
  return `${base}/t/c/${clickToken(sendId, originalHref)}`;
}
function buildUnsubUrl(base, sendId) {
  return `${base}/u/${unsubToken(sendId)}`;
}

async function handle(data) {
  const { sendId, campaignId } = data || {};
  if (!sendId || !campaignId) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "send-email requires { sendId, campaignId }.",
    );
  }

  // 1. Re-fetch the CampaignSend (authoritative state).
  const sendQ = new Parse.Query("CampaignSend");
  sendQ.include("organization");
  const send = await sendQ.get(sendId, MK);

  // Bail on any non-queued status — covers retries of an already-processed row,
  // cancellation, and suppression that ran on a prior attempt.
  if (send.get("status") !== "queued") return;

  const org = send.get("organization");
  const email = send.get("email");

  // 2. Suppression: never send to a suppressed (org, email) pair.
  if (await isSuppressed(org, email)) {
    send.set("status", "suppressed");
    send.set("statusUpdatedAt", new Date());
    await send.save(null, MK);
    return;
  }

  // 3. Load Campaign + run the merge pass.
  const campaign = await new Parse.Query("Campaign").get(campaignId, MK);
  let html = resolveMergeFields(
    campaign.get("compiledHtml") || "",
    send.get("mergeFields") || {},
  );

  // 4. Tracking: open pixel + click-rewrite (run before unsub injection so the
  //    rewriter never touches the still-placeholder {{unsubscribeUrl}}).
  const base = trackingBase();
  html = injectTracking(html, {
    pixelUrl: buildPixelUrl(base, sendId),
    rewriteHref: (orig) => buildClickUrl(base, sendId, orig),
  });

  // 5. Unsubscribe link + List-Unsubscribe headers.
  const unsubUrl = buildUnsubUrl(base, sendId);
  html = injectUnsubscribe(html, unsubUrl);
  const headers = listUnsubHeaders(unsubUrl);

  // 6. Compose From + send.
  const fromName = campaign.get("fromName") || "Gorilla";
  const fromEmail = campaign.get("fromEmail") || "hello@send.gorilla.email";
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = campaign.get("replyTo") || campaign.get("fromEmail");
  const subject = campaign.get("subject");

  try {
    const { messageId } = await getSesAdapter().sendEmail({
      from,
      to: email,
      replyTo,
      subject,
      html,
      headers,
      campaignSend: send,
    });

    // 7. Success: persist sesMessageId + "sent", record the EmailEvent + counter.
    const now = new Date();
    send.set("sesMessageId", messageId);
    send.set("status", "sent");
    send.set("sentAt", now);
    send.set("statusUpdatedAt", now);
    await send.save(null, MK);

    const event = new Parse.Object("EmailEvent");
    event.set("organization", org);
    event.set("campaign", campaign);
    event.set("campaignSend", send);
    const contact = send.get("contact");
    if (contact) event.set("contact", contact);
    event.set("type", "accepted");
    event.set("timestamp", now);
    await event.save(null, MK);

    await bumpCounter(campaignId, "sentCount");
  } catch (err) {
    // 8. Failure: mark failed (+ truncated reason) then re-throw for Agenda retry.
    const reason = String((err && err.message) || err || "unknown error").slice(0, 500);
    send.set("status", "failed");
    send.set("failureReason", reason);
    send.set("statusUpdatedAt", new Date());
    try {
      await send.save(null, MK);
    } catch (_) {
      // If even the status write fails, still surface the original send error.
    }
    throw err;
  }
}

function register(agenda) {
  agenda.define(SEND_EMAIL, { concurrency: 50, lockLifetime: 60000 }, (job) =>
    handle(job.attrs.data),
  );
}

module.exports = { register, handle };
