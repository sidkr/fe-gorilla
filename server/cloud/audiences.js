// Cloud functions for Audience (a.k.a. List) — create, list, archive,
// resolve to Contact[] for fanout.
//
// Phase 1B agent fills this in. See Sending.md §5 and Features.md for the
// data model + behavior requirements.
//
// Expected cloud functions:
//   createAudience({ name })                          → { id }
//   listAudiences()                                   → [{ id, name, contactCount }, ...]
//   getAudience({ id })                               → { id, name, contactCount }
//   archiveAudience({ id })                           → { ok }
//   resolveAudienceRecipients({ id, excludeSuppressed }) → Contact[]
