// Cloud functions for the send pipeline. Most of this lives in worker jobs;
// the cloud-fns here are the editor-facing entry points.
//
// Phase 2B agent fills this in.
//
// Expected cloud functions:
//   sendTestEmail({ campaignId, to })           ← Phase 1 (after worker + SES adapter exist)
//   scheduleSend({ campaignId, when })          ← Phase 3 in Sending.md
//   cancelScheduledSend({ campaignId })         ← later
