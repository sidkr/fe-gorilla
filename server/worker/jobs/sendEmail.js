// send-email job. STUB — the send feature agent fills the handler body.
//
// Contract (Sending.md §7 step 4): given { sendId, campaignId, tenantId }, load
// the CampaignSend, bail if not "queued", suppression-check, then run the render
// pipeline (renderEmail.resolveMergeFields → injectTracking → injectUnsubscribe),
// call getSesAdapter().sendEmail(...), store sesMessageId + status, write an
// "accepted" EmailEvent. Throw on SES failure so Agenda retries with backoff.
//
// Worker plumbing pattern: export register(agenda).
const { SEND_EMAIL } = require("../../lib/jobNames");

function register(agenda) {
  agenda.define(SEND_EMAIL, { concurrency: 50 }, async (job) => {
    // TODO: feature agent fills. job.attrs.data = { sendId, campaignId, tenantId }.
  });
}

module.exports = { register };
