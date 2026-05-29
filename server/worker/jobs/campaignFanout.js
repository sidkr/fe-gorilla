// campaign-fanout job. STUB — the fanout feature agent fills the handler body.
//
// Contract (Sending.md §7 step 3): given { campaignId, when }, resolve the
// audience, dedupe + suppression-check, snapshot CampaignSend rows, flip the
// Campaign to "sending", then enqueue one send-email job per recipient via
// getAgenda().now(SEND_EMAIL, { sendId, campaignId, tenantId }).
//
// Worker plumbing pattern: export register(agenda); the worker requires this
// file and calls register(agenda) after getAgenda() resolves.
const { CAMPAIGN_FANOUT } = require("../../lib/jobNames");

function register(agenda) {
  agenda.define(CAMPAIGN_FANOUT, { concurrency: 2 }, async (job) => {
    // TODO: feature agent fills. job.attrs.data = { campaignId, when }.
  });
}

module.exports = { register };
