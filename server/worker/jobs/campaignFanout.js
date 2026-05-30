// campaign-fanout job. Sending.md §7 step 3.
//
// Given { campaignId, when }: re-fetch the Campaign (master key), bail unless
// status === "queued". Resolve the audience (Contacts on the campaign's
// audienceId List that are subscribed + not deleted/unsubscribed), dedupe by
// lowercased email, drop suppressed addresses, then upsert one CampaignSend row
// per remaining recipient (idempotent on the unique (campaign, contact) index).
// Flip the Campaign to "sending" with recipientCount, and enqueue one SEND_EMAIL
// job per created CampaignSend.
//
// Worker plumbing pattern: export register(agenda) AND a pure handle(data, deps)
// so tests can call the handler directly with an injected enqueue stub (no live
// Agenda needed).
const Parse = require("parse/node");
const { CAMPAIGN_FANOUT, SEND_EMAIL } = require("../../lib/jobNames");
const { isSuppressed, normalizeEmail } = require("../../lib/suppression");

const MK = { useMasterKey: true };
const PAGE_SIZE = 1000;

// Default enqueue: hit the real shared Agenda. Lazy-required so test paths that
// inject a stub never touch agendaInstance (which would open a Mongo connection).
async function defaultEnqueue(jobName, data) {
  const { getAgenda } = require("../../lib/agendaInstance");
  const agenda = await getAgenda();
  await agenda.now(jobName, data);
}

// Build the per-recipient mergeFields snapshot the resolver understands:
// flat std keys + a nested `custom` object mirroring contact.customFields.
function buildMergeFields(contact) {
  return {
    firstName: contact.get("firstName") || "",
    lastName: contact.get("lastName") || "",
    email: contact.get("email") || "",
    company: contact.get("company") || "",
    phone: contact.get("phone") || "",
    city: contact.get("city") || "",
    country: contact.get("country") || "",
    timezone: contact.get("timezone") || "",
    custom: { ...(contact.get("customFields") || {}) },
  };
}

// Page through every subscribed, non-deleted, non-unsubscribed Contact on the
// campaign's audience List, scoped to the org. `lists` is stored as an array of
// String list ids (see server/cloud/contacts.js), so match on the id string.
async function fetchRecipients(org, listId) {
  const out = [];
  let skip = 0;
  for (;;) {
    const q = new Parse.Query("Contact");
    q.equalTo("organization", org);
    q.equalTo("lists", listId);
    q.equalTo("status", "subscribed");
    q.notEqualTo("deleted", true);
    q.notEqualTo("unsubscribed", true);
    q.limit(PAGE_SIZE);
    q.skip(skip);
    q.ascending("createdAt");
    const page = await q.find(MK);
    out.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return out;
}

async function handle(data, { enqueue = defaultEnqueue } = {}) {
  const { campaignId } = data || {};
  if (!campaignId) return { recipientCount: 0 };

  // 1. Re-fetch the Campaign; only fan out a queued campaign.
  const campaign = await new Parse.Query("Campaign").get(campaignId, MK);
  if (campaign.get("status") !== "queued") return { recipientCount: 0 };

  const org = campaign.get("organization");
  const listId = campaign.get("audienceId");
  const segmentId = campaign.get("segmentId");
  if (!org || (!listId && !segmentId)) return { recipientCount: 0 };

  // 2. Resolve audience — a Segment if the campaign targets one, else the whole
  // List. resolveSegmentContacts already applies org scope + subscribed/not-
  // deleted/not-unsubscribed, matching fetchRecipients, so the dedupe +
  // suppression loop below works identically for both.
  let contacts;
  if (segmentId) {
    const { resolveSegmentContacts } = require("../../cloud/segments");
    const segment = await new Parse.Query("Segment").get(segmentId, MK);
    contacts = await resolveSegmentContacts(segment, org);
  } else {
    contacts = await fetchRecipients(org, listId);
  }

  // 3. Dedupe by lowercased email + drop suppressed addresses.
  const seen = new Set();
  const recipients = [];
  for (const contact of contacts) {
    const email = normalizeEmail(contact.get("email"));
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (await isSuppressed(org, email)) continue;
    recipients.push({ contact, email });
  }

  // 3b. Monthly send-cap guard (Architecture §3.6). Never fan out a send that
  // would push the org past its ceiling — fail the campaign cleanly with a
  // human-readable reason rather than half-sending. Also refuse if the org has
  // been auto-paused for abuse (complaint/bounce rate — see webhookIngest).
  const orgFull = await new Parse.Query("Organization").get(org.id, MK);
  if (orgFull.get("sendingPaused")) {
    campaign.set("status", "paused");
    campaign.set(
      "failureReason",
      `Sending paused for this account (${orgFull.get("sendingPausedReason") || "abuse controls"}).`,
    );
    await campaign.save(null, MK);
    return { recipientCount: 0, paused: true };
  }
  const cap = orgFull.get("monthlySendCap");
  const used = orgFull.get("monthlySendCount") || 0;
  if (typeof cap === "number" && cap > 0 && used + recipients.length > cap) {
    campaign.set("status", "failed");
    campaign.set(
      "failureReason",
      `Monthly send cap exceeded (${used}/${cap} used; this send needs ${recipients.length}).`,
    );
    await campaign.save(null, MK);
    return { recipientCount: 0, capExceeded: true };
  }

  // 4. Upsert a CampaignSend per recipient. Idempotent on (campaign, contact)
  // two ways: a cheap pre-check skips rows a prior fanout already wrote, and the
  // unique (campaign, contact) index is the backstop against a concurrent retry
  // racing past the check — its duplicate-key error is swallowed. Only
  // newly-created rows get enqueued.
  const CampaignSend = Parse.Object.extend("CampaignSend");
  const createdSendIds = [];
  for (const { contact, email } of recipients) {
    const existing = await new Parse.Query("CampaignSend")
      .equalTo("campaign", campaign)
      .equalTo("contact", contact)
      .first(MK);
    if (existing) continue; // already fanned out → don't double-create or re-enqueue

    const send = new CampaignSend();
    send.set("organization", org);
    send.set("campaign", campaign);
    send.set("contact", contact);
    send.set("email", email);
    send.set("status", "queued");
    send.set("mergeFields", buildMergeFields(contact));
    try {
      await send.save(null, MK);
      createdSendIds.push(send.id);
    } catch (err) {
      // DUPLICATE_VALUE (137) → a concurrent retry beat us to this row; skip it
      // (and don't re-enqueue). Re-throw anything else so Agenda can retry.
      if (err && err.code === Parse.Error.DUPLICATE_VALUE) continue;
      throw err;
    }
  }

  // 5. Stamp recipientCount + flip to "sending".
  const recipientCount = recipients.length;
  campaign.set("recipientCount", recipientCount);
  campaign.set("status", "sending");
  await campaign.save(null, MK);

  // 6. Enqueue one SEND_EMAIL per newly-created CampaignSend.
  for (const sendId of createdSendIds) {
    await enqueue(SEND_EMAIL, { sendId, campaignId });
  }

  return { recipientCount };
}

function register(agenda) {
  agenda.define(CAMPAIGN_FANOUT, { concurrency: 2 }, (job) => handle(job.attrs.data));
}

module.exports = { register, handle };
