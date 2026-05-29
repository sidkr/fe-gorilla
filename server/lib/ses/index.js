// ─────────────────────────────────────────────────────────────────────────────
// SES adapter selector. CommonJS.
//
// The send pipeline NEVER imports a concrete SES implementation directly. It
// calls getSesAdapter() and uses the returned object's interface. Which concrete
// adapter you get is decided by the AWS_SES_MODE env var (default "mock").
//
//   AWS_SES_MODE=mock  (default) → server/lib/ses/mock.js — writes "sent"
//                                   messages to a MockSentMessage Parse object
//                                   for tests + a future dev outbox. No network.
//   AWS_SES_MODE=real             → server/lib/ses/real.js — calls AWS SESv2 via
//                                   @aws-sdk/client-sesv2. Requires AWS_* creds.
//
// DECISIONS #6 (mock-SES-first): mock unblocks every phase of the build, tests
// run hermetically, and the swap to real is one env var.
//
// ─── ADAPTER INTERFACE (the contract every feature agent relies on) ──────────
//
//   async sendEmail({
//     from,              // String — fully composed RFC From, e.g. `"Alex" <alex@send.gorilla.email>`
//     to,                // String | String[] — recipient address(es)
//     replyTo,           // String | String[] | undefined — Reply-To address(es)
//     subject,           // String
//     html,              // String — final HTML body (post merge/tracking/unsub)
//     headers,           // { [name]: value } | undefined — extra MIME headers
//                        //   (e.g. List-Unsubscribe; see renderEmail.listUnsubHeaders)
//     campaignSend,      // Parse.Object | undefined — pointer the mock stores for the outbox
//   }) → { messageId }   // messageId is what you store on CampaignSend.sesMessageId
//
//   async getSendQuota() → { ... }   // OPTIONAL. mock returns synthetic numbers;
//                                    // real returns the SES GetAccount response.
//
// sendEmail throws on hard failure (the send-email worker catches + sets
// CampaignSend.status="failed" and lets Agenda retry).
// ─────────────────────────────────────────────────────────────────────────────

const { optional } = require("../env");

let cached = null;
let cachedMode = null;

function getSesAdapter() {
  const mode = (optional("AWS_SES_MODE", "mock") || "mock").toLowerCase();
  // Re-resolve if the mode changed (tests may flip the env between cases).
  if (cached && cachedMode === mode) return cached;

  if (mode === "real") {
    cached = require("./real").createRealAdapter();
  } else {
    cached = require("./mock").createMockAdapter();
  }
  cachedMode = mode;
  return cached;
}

// Test/dev seam: drop the memoized adapter so the next getSesAdapter() re-reads
// AWS_SES_MODE. Not used in production.
function _resetSesAdapter() {
  cached = null;
  cachedMode = null;
}

module.exports = { getSesAdapter, _resetSesAdapter };
