// webhook-ingest job. Sending.md §7 step 7 + §8.
//
// Given { event } (a parsed SES-via-SNS notification), look up the CampaignSend
// by sesMessageId, branch on event type (Delivery/Bounce/Complaint), update the
// CampaignSend status + statusUpdatedAt, write an EmailEvent, bump Campaign
// counters, and on hard_bounce/complaint add a Suppression row.
//
// Runs in the worker process (parseClient already initialized to master key).
// Every read/write uses the master key — the worker is privileged and owns
// CampaignSend / EmailEvent / Suppression / Contact regardless of campaign owner.
const Parse = require("parse/node");
const { WEBHOOK_INGEST } = require("../../lib/jobNames");
const { addSuppression } = require("../../lib/suppression");
const { bumpCounter } = require("../../lib/campaignCounters");

const MK = { useMasterKey: true };

// Promote a Transient (soft) bounce to a hard suppression once a contact has
// soft-bounced this many times (Sending.md §8).
const SOFT_BOUNCE_PROMOTE_THRESHOLD = 5;

// Pointer → id helper for both Parse.Object pointers and bare ids.
function ptrId(v) {
  if (!v) return null;
  return typeof v === "string" ? v : v.id;
}

// Write one EmailEvent mirroring the CampaignSend's tenancy pointers.
async function writeEmailEvent(send, type, event, extra = {}) {
  const EmailEvent = Parse.Object.extend("EmailEvent");
  const ev = new EmailEvent();
  ev.set("organization", send.get("organization"));
  ev.set("campaign", send.get("campaign"));
  ev.set("campaignSend", send);
  if (send.get("contact")) ev.set("contact", send.get("contact"));
  ev.set("type", type);
  ev.set("timestamp", eventTimestamp(event));
  ev.set("raw", event || {});
  for (const [k, v] of Object.entries(extra)) {
    if (v != null) ev.set(k, v);
  }
  await ev.save(null, MK);
  return ev;
}

// SES timestamps live on the per-type sub-object (e.g. event.bounce.timestamp,
// event.delivery.timestamp). Fall back to mail.timestamp, then "now".
function eventTimestamp(event) {
  const candidates = [
    event && event.delivery && event.delivery.timestamp,
    event && event.bounce && event.bounce.timestamp,
    event && event.complaint && (event.complaint.timestamp || event.complaint.arrivalDate),
    event && event.mail && event.mail.timestamp,
  ];
  for (const c of candidates) {
    if (c) {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d;
    }
  }
  return new Date();
}

async function handleDelivery(send, event) {
  send.set("status", "delivered");
  await writeEmailEvent(send, "delivered", event);
  await bumpCounter(send.get("campaign"), "deliveredCount");
}

async function handleBounce(send, event) {
  const bounce = event.bounce || {};
  const bounceType = bounce.bounceType; // Permanent | Transient | Undetermined
  const bounceSubType = bounce.bounceSubType;
  const category = String(bounceType || "undetermined").toLowerCase();

  if (bounceType === "Permanent") {
    // Hard bounce → suppress immediately, never retry (Sending.md §8).
    await addSuppression({
      organization: send.get("organization"),
      email: send.get("email"),
      reason: "hard_bounce",
      campaign: send.get("campaign"),
    });
    send.set("status", "bounced");
    send.set("bounceCategory", category);
    if (bounceSubType) send.set("bounceSubType", bounceSubType);
    await writeEmailEvent(send, "bounce", event, { bounceCategory: category });
    await bumpCounter(send.get("campaign"), "bounceCount");
    return;
  }

  // Transient / Undetermined → treat as a soft bounce. Increment the contact's
  // softBounceCount; if it crosses the threshold, promote to a hard suppression.
  send.set("bounceCategory", category);
  if (bounceSubType) send.set("bounceSubType", bounceSubType);

  let promoted = false;
  const contact = await loadContact(send);
  if (contact) {
    contact.increment("softBounceCount", 1);
    await contact.save(null, MK);
    if ((contact.get("softBounceCount") || 0) >= SOFT_BOUNCE_PROMOTE_THRESHOLD) {
      await addSuppression({
        organization: send.get("organization"),
        email: send.get("email"),
        reason: "soft_bounce_threshold",
        campaign: send.get("campaign"),
      });
      promoted = true;
    }
  }

  if (promoted) {
    send.set("status", "bounced");
    await bumpCounter(send.get("campaign"), "bounceCount");
  }
  // EmailEvent recorded for every soft bounce (for review/reporting).
  await writeEmailEvent(send, "bounce", event, { bounceCategory: category });
}

async function handleComplaint(send, event) {
  // ANY complaint = immediate suppression (Sending.md §8). Irrevocable.
  await addSuppression({
    organization: send.get("organization"),
    email: send.get("email"),
    reason: "complaint",
    campaign: send.get("campaign"),
  });
  send.set("status", "complained");
  await writeEmailEvent(send, "complaint", event);
  // COUNTER CHOICE: there is no dedicated complaint counter on Campaign. A
  // complaint is an involuntary opt-out (the recipient hit "spam"), so we bump
  // `unsubscribeCount` — the same bucket the explicit-unsubscribe path uses.
  // (bounceCount is reserved for actual bounces.)
  await bumpCounter(send.get("campaign"), "unsubscribeCount");
}

// Fetch the Contact pointer on the send as a full object (need softBounceCount).
async function loadContact(send) {
  const contactId = ptrId(send.get("contact"));
  if (!contactId) return null;
  const q = new Parse.Query("Contact");
  return q.get(contactId, MK);
}

async function handle({ event } = {}) {
  if (!event || !event.mail || !event.mail.messageId) return;
  const messageId = event.mail.messageId;

  const q = new Parse.Query("CampaignSend");
  q.equalTo("sesMessageId", messageId);
  const send = await q.first(MK);
  if (!send) return; // unknown message — harmless (e.g. a test send, or already GC'd)

  switch (event.eventType) {
    case "Delivery":
      await handleDelivery(send, event);
      break;
    case "Bounce":
      await handleBounce(send, event);
      break;
    case "Complaint":
      await handleComplaint(send, event);
      break;
    default:
      // Send / unknown — nothing to do for the engagement model.
      return;
  }

  send.set("statusUpdatedAt", new Date());
  await send.save(null, MK);
}

function register(agenda) {
  agenda.define(WEBHOOK_INGEST, { concurrency: 20 }, (job) => handle(job.attrs.data));
}

module.exports = { register, handle };
