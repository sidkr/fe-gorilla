// Cloud functions for Contact — single + bulk create, CSV import, list,
// update, soft-delete, GDPR-style hard-delete.
//
// Phase 1B agent fills this in.
//
// Expected cloud functions:
//   addContact({ audienceId, email, firstName?, lastName?, mergeFields? })
//   addContactsBulk({ audienceId, contacts: [{...}] })
//   importContactsCsv({ audienceId, csv, consentAttested: true })
//   listContacts({ audienceId, page?, perPage? })
//   updateContact({ id, patch })
//   deleteContact({ id })                ← soft delete
//   deleteContactData({ email })         ← GDPR hard delete (Suppression too)
