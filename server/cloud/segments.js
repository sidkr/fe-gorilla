// Cloud functions for Segment — saved rule sets that filter Contacts.
//
// Phase 1B agent fills this in. Defer complex DSL — for MVP, support a
// small set of fields (engagement score, last open time, list membership)
// and AND/OR combinations.
//
// Expected cloud functions:
//   createSegment({ name, rules })
//   listSegments()
//   evaluateSegment({ id, preview? })   → count + sample
//   deleteSegment({ id })
