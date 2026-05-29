// webhook-ingest job. STUB — the webhook feature agent fills the handler body.
//
// Contract (Sending.md §7 step 7): given { event } (a parsed SES/SNS message),
// look up the CampaignSend by sesMessageId, branch on event type
// (Delivery/Bounce/Complaint), update CampaignSend status + first-event
// timestamps, write an EmailEvent, bump Campaign counters, and on
// hard_bounce/complaint add a Suppression row.
//
// Worker plumbing pattern: export register(agenda).
const { WEBHOOK_INGEST } = require("../../lib/jobNames");

function register(agenda) {
  agenda.define(WEBHOOK_INGEST, { concurrency: 10 }, async (job) => {
    // TODO: feature agent fills. job.attrs.data = { event }.
  });
}

module.exports = { register };
