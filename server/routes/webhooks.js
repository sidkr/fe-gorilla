// Inbound webhook endpoints. Phase 2A agent fills this in.
//
// POST /api/webhooks/ses → SNS message ingest. Two paths:
//   1. SubscriptionConfirmation: GET the SubscribeURL to confirm the topic
//      subscription (one-time per topic).
//   2. Notification: verify the SNS signature against AWS's public key,
//      enqueue a webhook-ingest Agenda job (don't process inline — keep
//      the webhook response fast so SNS doesn't retry).
//
// CRITICAL: SNS signature verification MUST happen before trusting the
// body. Anyone can POST to a public endpoint.
module.exports = {
  mount(/* app */) {
    // Phase 2A
  },
};
