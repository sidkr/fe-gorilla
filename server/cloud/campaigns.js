// Cloud functions + beforeSave hooks on Campaign.
//
// The Campaign class already exists (created on-demand by the editor's save).
// This module owns:
//   - Parse.Cloud.beforeSave("Campaign", compileBlocksHook)  ← Phase 1D
//   - listCampaigns() / getCampaign({ id })                  ← Phase 3A
//   - duplicateCampaign({ id })                              ← later
//   - archiveCampaign({ id })                                ← later
