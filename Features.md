# Gorilla — Features

This document is the **MVP feature catalog** and **delivery plan** for Gorilla, a Mailchimp-style email marketing platform built on Vue 3 + Vite + Vuex 4 (frontend) and Express + Parse Server v7 + MongoDB (backend).

Feature IDs (`F-XX`) are **stable** — once assigned they do not get renumbered. New features added later append to the end of the catalog, even if they belong topically inside an earlier area.

Cross-references to `Architecture.md` use **section titles** (not numbers), because that document is being authored in parallel.

---

## Conventions

- **Status values**: `planned` · `in progress` · `shipped`
- **Parse class names** are PascalCase singular (`Campaign`, `Contact`, `AudienceList`).
- **Cloud function names** are camelCase verbs (`importContactsCsv`, `sendCampaign`).
- **Routes** are kebab-case under the SPA history root (`/audiences`, `/campaigns/:id/edit`).
- **Acceptance criteria** must be testable — concrete numbers, observable UI states, or specific server responses. "Supports X" and "handles Y" are banned.

---

## MVP Scope Summary

**29 features across 9 areas.** Everything else is deferred — see *Out-of-MVP Backlog* below.

| Area | F-IDs |
|---|---|
| Auth & onboarding | F-01 … F-04 |
| Audiences | F-05 … F-09 |
| Segments | F-10 … F-12 |
| Templates | F-13 … F-14 |
| Email editor | F-15 … F-17 |
| Campaigns | F-18 … F-21 |
| Sending & tracking | F-22 … F-24 |
| Reports | F-25 … F-26 |
| Compliance | F-27 … F-29 |

---

## Index

| ID | Name | Area |
|---|---|---|
| [F-01](#f-01-account-signup) | Account signup | Auth |
| [F-02](#f-02-login--session) | Login & session | Auth |
| [F-03](#f-03-sender-identity) | Sender identity (from-name / from-email) | Auth |
| [F-04](#f-04-sending-domain-verification) | Sending domain verification (SPF + DKIM) | Auth |
| [F-05](#f-05-audience-list) | Audience list | Audiences |
| [F-06](#f-06-custom-fields-on-a-list) | Custom fields on a list | Audiences |
| [F-07](#f-07-csv-contact-import) | CSV contact import | Audiences |
| [F-08](#f-08-manual-contact-addedit) | Manual contact add / edit | Audiences |
| [F-09](#f-09-contact-detail-view) | Contact detail view | Audiences |
| [F-10](#f-10-segment-rule-builder) | Segment rule builder | Segments |
| [F-11](#f-11-segment-preview--save) | Segment preview & save | Segments |
| [F-12](#f-12-static-vs-dynamic-segment-toggle) | Static vs dynamic segment toggle | Segments |
| [F-13](#f-13-template-gallery) | Template gallery (starter templates) | Templates |
| [F-14](#f-14-save-as-template) | Save-as-template | Templates |
| [F-15](#f-15-block-based-email-composer) | Block-based email composer | Editor |
| [F-16](#f-16-subject--preheader-editor) | Subject + preheader editor | Editor |
| [F-17](#f-17-merge-tags) | Merge tags (`{{firstName}}`, etc.) | Editor |
| [F-18](#f-18-campaign-draft-creation) | Campaign draft creation | Campaigns |
| [F-19](#f-19-campaign-recipient--content-selection) | Campaign recipient & content selection | Campaigns |
| [F-20](#f-20-test-send-to-self) | Test-send to self | Campaigns |
| [F-21](#f-21-schedule-or-send-now) | Schedule or send-now | Campaigns |
| [F-22](#f-22-outbound-delivery-via-postmark) | Outbound delivery via Postmark (ESP) | Sending |
| [F-23](#f-23-open--click-tracking) | Open + click tracking | Sending |
| [F-24](#f-24-list-unsubscribe-header--injected-link) | List-Unsubscribe header + injected link | Sending |
| [F-25](#f-25-campaign-report) | Campaign report (headline metrics) | Reports |
| [F-26](#f-26-per-link-click-breakdown--recipient-activity) | Per-link click breakdown + recipient activity | Reports |
| [F-27](#f-27-unsubscribe-page) | Unsubscribe page | Compliance |
| [F-28](#f-28-suppression-list) | Suppression list | Compliance |
| [F-29](#f-29-gdpr-consent-capture-on-import) | GDPR consent capture on import | Compliance |

---

# Auth & Onboarding

## F-01: Account signup

**Description.** A new marketer creates a Gorilla account with email + password and lands on an empty dashboard with onboarding prompts to set up sender identity and import a list.

**User story.** As a marketer, I want to sign up with email and password so that I can start building my first audience without a sales call.

**Acceptance criteria.**
- Signup form accepts `email`, `password`, `companyName`, `country`; rejects passwords shorter than 10 chars with an inline error.
- Email uniqueness is enforced server-side; duplicate signup returns Parse error code 202 and the form surfaces "An account with this email already exists."
- On successful signup, a `_User` row and an `Organization` row are created in the same Cloud Function call; the user is added to the org as `role: "owner"`.
- The user is redirected to `/dashboard` with a yellow "Set up your sender identity" banner visible until F-03 is complete.
- A confirmation email is sent to the signup address via the same Postmark sender used by F-22; bounce on this email does not block account use but flags `_User.emailVerified = false`.

**Data touchpoints.** `_User`, `Organization`, `OrgMembership`; Cloud Function `signupOrg`.

**Frontend touchpoints.** `src/views/SignUp.vue` (extend existing), `src/views/Dashboard.vue` (new).

**Cross-ref.** *Architecture.md* — section "Auth model and organization scoping".

---

## F-02: Login & session

**Description.** Existing users sign in with email + password and resume on the dashboard. Sessions are Parse session tokens guarded by an account-lockout policy (5 failed attempts → 30-minute lockout per Parse Server's `accountLockout` config).

**User story.** As a marketer, I want to log back in and be returned to wherever I left off so that I do not have to re-navigate every time.

**Acceptance criteria.**
- `/login` accepts email + password and calls `Parse.User.logIn`.
- 5 failed attempts in 15 minutes locks the account for 30 minutes per Parse `accountLockout` config.
- On success, the session token is stored in `localStorage` (Parse default) and the router redirects to the last-visited authenticated route, or `/dashboard` if none.
- "Forgot password" link triggers `Parse.User.requestPasswordReset`; a reset email is sent within 30s.
- Logout clears the session, navigates to `/`, and revokes the session token server-side via `Parse.User.logOut`.

**Data touchpoints.** `_User`, `_Session`.

**Frontend touchpoints.** `src/views/Login.vue` (extend), `src/store/auth.js`, `src/utils/sessionGuard.js`.

**Cross-ref.** *Architecture.md* — section "Session lifecycle and lockout".

---

## F-03: Sender identity (from-name / from-email)

**Description.** Before any send, the org must register at least one verified `SenderIdentity` — a from-name + from-email pair — used as the envelope sender on outbound mail.

**User story.** As a marketer, I want to register the address my campaigns will send from so that recipients see a recognizable sender.

**Acceptance criteria.**
- `/settings/senders` lists all `SenderIdentity` records for the org with status `pending` / `verified` / `failed`.
- "Add sender" form accepts `fromName` (max 60 chars) and `fromEmail` (RFC 5322 valid).
- On save, a verification email is sent to `fromEmail` with a single-use token (Parse `_JobStatus`-style row in `SenderVerification`); clicking the link in the email within 24h flips the identity to `verified`.
- An unverified identity cannot be selected when composing a campaign (F-19): the dropdown shows it greyed out with a "Verify first" badge.
- An org-level default identity is settable from the same screen; new campaigns auto-select it.

**Data touchpoints.** `SenderIdentity`, `SenderVerification`; Cloud Functions `createSenderIdentity`, `verifySenderToken`.

**Frontend touchpoints.** `src/views/settings/Senders.vue`.

**Cross-ref.** *Architecture.md* — section "Sender identity and domain authentication".

---

## F-04: Sending domain verification (SPF + DKIM)

**Description.** For each `fromEmail` domain, the org can optionally verify the domain via DNS — adding SPF and DKIM records produced by Gorilla — to remove "via gorilla.email" tagging in Gmail and improve deliverability. Domain verification is **optional in MVP**; unverified domains send via a shared `via gorilla.email` envelope-from.

**User story.** As a marketer, I want to authenticate my own domain so that my campaigns land in primary inboxes and show my brand instead of "via gorilla.email".

**Acceptance criteria.**
- `/settings/domains` lists all `SendingDomain` rows for the org with status and DNS record snippets.
- Adding `acme.com` generates a DKIM key pair and surfaces three records: one TXT for SPF guidance, one CNAME for DKIM, one TXT for the `_dmarc` recommendation.
- "Verify" button triggers a Cloud Function `verifyDomainDns` which performs DNS lookups for the expected records; on all-pass it flips status to `verified` and writes `verifiedAt`.
- Verified domain unlocks `From: marketer@acme.com` headers without the `via gorilla.email` Sender tag on outbound mail.
- Unverified state shows clear remediation copy ("DKIM record not found — expected CNAME at `gorilla1._domainkey.acme.com`").

**Data touchpoints.** `SendingDomain`; Cloud Functions `createSendingDomain`, `verifyDomainDns`.

**Frontend touchpoints.** `src/views/settings/Domains.vue`.

**Cross-ref.** *Architecture.md* — section "Sender identity and domain authentication".

---

# Audiences

## F-05: Audience list

**Description.** A named container of contacts. An org can have multiple lists; each contact belongs to exactly one list (Mailchimp's audience model, not segments-as-lists).

**User story.** As a marketer, I want to keep separate audiences for separate products so that I can send the right message to the right people.

**Acceptance criteria.**
- `/audiences` shows all `AudienceList` rows for the org with: name, contact count, subscribed count, created date.
- "Create audience" requires `name` (max 80 chars) and a default `fromIdentity` (F-03 reference).
- Lists are deletable only if `contactCount === 0`; otherwise the delete button is disabled with a tooltip "Remove all contacts first."
- Audience count is denormalized on the `AudienceList` row and updated by `Contact.afterSave` / `afterDelete` triggers.

**Data touchpoints.** `AudienceList`, `Contact`; `Contact.afterSave` / `afterDelete` triggers to recompute counts.

**Frontend touchpoints.** `src/views/audiences/AudienceList.vue`, `src/views/audiences/AudienceCreate.vue`.

**Cross-ref.** *Architecture.md* — section "Audience and contact data model".

---

## F-06: Custom fields on a list

**Description.** Per-list user-defined fields (e.g. `birthday`, `plan`, `signupSource`) usable as merge tags in emails and as segment criteria.

**User story.** As a marketer, I want to attach arbitrary attributes to my contacts so that I can personalize and segment on data specific to my business.

**Acceptance criteria.**
- Each `AudienceList` carries a `customFields` array of `{ key, label, type, required }` where `type` is one of `text`, `number`, `date`, `boolean`.
- A list supports up to 20 custom fields in MVP; the 21st add returns an error.
- `key` is unique within the list, lowercased, alphanumeric + underscore only; UI rejects invalid keys at input time.
- Adding a field after contacts exist does **not** backfill; existing contacts have `null` for the new field, and segment filters using that field treat `null` as "not equal to any value".
- Removing a field is allowed but warns "This field is used in N segments and M templates" and on confirmation strips the value from all contacts.

**Data touchpoints.** `AudienceList.customFields` (embedded schema), `Contact.fields` (Map).

**Frontend touchpoints.** `src/views/audiences/AudienceSettings.vue` (Fields tab).

**Cross-ref.** *Architecture.md* — section "Audience and contact data model".

---

## F-07: CSV contact import

**Description.** Bulk-import a CSV into a list with column mapping to email + custom fields, per-row validation, and a summary report.

**User story.** As a marketer, I want to upload my existing contact list from a spreadsheet so that I can start sending without re-entering thousands of rows by hand.

**Acceptance criteria.**
- Upload accepts `.csv` up to 20 MB; rejects other MIME types client-side.
- Parser reads UTF-8 and UTF-8-with-BOM; non-UTF-8 files surface "Save your CSV as UTF-8."
- Column-mapping step shows the first 5 rows; user maps each CSV column to either `email` (required, exactly one), one of the list's custom fields, or "ignore".
- Row validation rejects rows where `email` is missing or fails RFC 5322 regex; duplicates within the file collapse to the last occurrence; duplicates against existing list contacts **update** the existing contact's custom fields.
- A 10,000-row CSV completes import within 60 seconds on the dev box; progress bar shows row count every 500 rows.
- Final summary shows: `imported`, `updated`, `skipped (invalid)`, `skipped (suppressed)`; each skipped row downloadable as `errors.csv` with the original row + reason column.
- GDPR consent capture (see F-29) is part of the mapping step — the user must affirm an opt-in source before the job runs.

**Data touchpoints.** `Contact`, `AudienceList`, `ImportJob`; Cloud Function `startContactImport`, `processContactImportBatch` (batched 500/row chunks).

**Frontend touchpoints.** `src/views/audiences/Import.vue` (wizard).

**Cross-ref.** *Architecture.md* — section "CSV import pipeline".

---

## F-08: Manual contact add / edit

**Description.** Add a single contact via form, or edit any contact's email, custom field values, and subscribe status.

**User story.** As a marketer, I want to add one contact at a time from the UI so that I do not need a CSV for a single signup.

**Acceptance criteria.**
- "Add contact" modal on the list view accepts `email` (required) + all custom field values + `status` (`subscribed`, `unsubscribed`, `nonSubscribed`).
- Duplicate email within the same list returns "This email is already on the list — open contact" with a link to F-09.
- Editing a contact's email is allowed but updates `email` and writes a row to `ContactAuditLog` with the old and new values.
- Status change to `unsubscribed` writes an entry to `SuppressionList` (F-28) with reason `manual`.

**Data touchpoints.** `Contact`, `ContactAuditLog`, `SuppressionList`.

**Frontend touchpoints.** `src/views/audiences/ContactList.vue` (table + add modal), `src/views/audiences/ContactEdit.vue`.

**Cross-ref.** *Architecture.md* — section "Audience and contact data model".

---

## F-09: Contact detail view

**Description.** A single-contact page showing all custom field values, subscription status, the list of campaigns this contact received, and per-campaign open/click activity.

**User story.** As a marketer, I want to see what one specific person has received from me and how they engaged so that I can answer a customer-support question or a sales handoff.

**Acceptance criteria.**
- `/audiences/:listId/contacts/:contactId` shows: email, status, all custom fields, list membership, GDPR consent timestamp (if F-29 captured it), source (import filename or `manual`).
- "Activity" tab lists the last 50 campaigns sent to this contact with columns: campaign name, sent date, delivered, opened (count), clicked (count), bounced reason if any.
- Activity rows link to the campaign report (F-25) filtered to this recipient.
- "Unsubscribe" button moves the contact to `unsubscribed` status and writes a `SuppressionList` row with reason `manual`.

**Data touchpoints.** `Contact`, `CampaignRecipient`, `EmailEvent` (open/click/bounce), `SuppressionList`.

**Frontend touchpoints.** `src/views/audiences/ContactDetail.vue`.

**Cross-ref.** *Architecture.md* — section "Email event ingestion and storage".

---

# Segments

## F-10: Segment rule builder

**Description.** A rule-builder UI that constructs an AND/OR tree of filters on contact attributes — email, status, custom fields, engagement (opened/clicked any campaign in last N days).

**User story.** As a marketer, I want to slice my audience by attributes and behaviour so that I only send a campaign to the people it is relevant to.

**Acceptance criteria.**
- Rule builder supports a single top-level operator (`ALL of` = AND, `ANY of` = OR); MVP does **not** nest groups.
- Available filter fields: `email` (`contains`, `equals`), `status` (`equals` from `subscribed`/`unsubscribed`/`nonSubscribed`), each custom field with operators appropriate to its type (`text`: `equals`/`contains`/`is set`; `number`: `=`/`!=`/`<`/`>`; `date`: `before`/`after`/`is set`; `boolean`: `is true`/`is false`), `openedCampaignInLastDays` (number), `clickedCampaignInLastDays` (number).
- A segment with zero filters is invalid and the Save button is disabled.
- Filter changes recompute the preview count (F-11) with a 400ms debounce; concurrent edits cancel in-flight queries.

**Data touchpoints.** `Segment` (with `rules` JSON), `Contact`, `CampaignRecipient`, `EmailEvent`; Cloud Function `previewSegmentCount`, `materializeSegment`.

**Frontend touchpoints.** `src/views/segments/SegmentEditor.vue`, `src/components/RuleBuilder.vue`.

**Cross-ref.** *Architecture.md* — section "Segment evaluation and materialization".

---

## F-11: Segment preview & save

**Description.** Live count of matching contacts as rules are built, plus the ability to save a named segment for reuse in campaigns.

**User story.** As a marketer, I want to see how many people match my filters as I tweak them so that I can find a meaningful audience size before committing.

**Acceptance criteria.**
- Preview count appears within 2s for a list of up to 50k contacts; for larger lists, shows "≈ N matches" using an estimation query.
- Saved segment requires `name` (max 80 chars) unique within the list.
- Segment list view (`/audiences/:listId/segments`) shows name, type (static/dynamic — F-12), match count at last evaluation, last evaluated timestamp.
- Editing a saved segment re-opens the rule builder with the saved rules pre-populated.

**Data touchpoints.** `Segment`, `SegmentSnapshot` (for materialized members of static segments).

**Frontend touchpoints.** `src/views/segments/SegmentList.vue`, `src/views/segments/SegmentEditor.vue`.

**Cross-ref.** *Architecture.md* — section "Segment evaluation and materialization".

---

## F-12: Static vs dynamic segment toggle

**Description.** A segment is either **dynamic** (re-evaluated at send time) or **static** (membership frozen at save time). User picks at save.

**User story.** As a marketer, I want to freeze a segment's members at a point in time so that a follow-up campaign hits the exact same people as the original.

**Acceptance criteria.**
- Save-segment dialog has a radio: "Re-evaluate at send (dynamic)" / "Freeze members now (static)". Dynamic is default.
- Static segment writes a `SegmentSnapshot` row containing the `contactId` array at save time; subsequent contact changes do not alter the snapshot.
- Dynamic segment stores only the `rules` JSON; campaign send resolves members against the current `Contact` table at send time.
- A static segment is editable: re-saving re-snapshots and overwrites the previous snapshot.
- Segment list view shows `Dynamic` / `Static (snapshot taken May 10)` next to each segment.

**Data touchpoints.** `Segment.type`, `SegmentSnapshot`.

**Frontend touchpoints.** `src/views/segments/SegmentEditor.vue` save dialog.

**Cross-ref.** *Architecture.md* — section "Segment evaluation and materialization".

---

# Templates

## F-13: Template gallery (starter templates)

**Description.** A read-only set of 6 starter templates the user can fork into a new campaign or new template — newsletter, product announcement, welcome, plain-text, basic header+body+CTA, blank.

**User story.** As a marketer, I want a few pre-built layouts to start from so that I am not staring at an empty canvas on my first campaign.

**Acceptance criteria.**
- `/templates` lists 6 system templates with thumbnail previews and "Use this" / "Preview" buttons.
- "Use this" forks the template into a new `Template` row owned by the org (or directly into a new `Campaign` draft if entered from the campaign-create flow).
- System templates are seeded by a startup Cloud Code script and are not editable; the fork is editable.
- Thumbnails render from a pre-rendered PNG stored on the `Template.thumbnail` Parse File field.

**Data touchpoints.** `Template` (with `isSystem: true` for the 6 starters); seed script in `server/cloud/seedTemplates.js`.

**Frontend touchpoints.** `src/views/templates/Gallery.vue`.

**Cross-ref.** *Architecture.md* — section "Template and block document model".

---

## F-14: Save-as-template

**Description.** From any campaign draft or sent campaign, save the current block layout as a new org-owned template that can be reused in future campaigns.

**User story.** As a marketer, I want to save my newsletter layout once and re-use it monthly so that I do not rebuild the design every send.

**Acceptance criteria.**
- "Save as template" button in the email editor (F-15) prompts for a `name` (max 80 chars).
- A `Template` row is created with the current block tree, subject placeholder, preheader placeholder, and a thumbnail rendered from the first 600px of the email.
- Editing a saved template opens the same block-editor UI as a campaign (F-15) but without a "Send" button.
- `/templates` lists org templates separately from system templates; org templates have edit and delete actions.

**Data touchpoints.** `Template`, `Template.thumbnail` (Parse File).

**Frontend touchpoints.** `src/views/templates/Gallery.vue` (Org tab), `src/views/templates/TemplateEditor.vue`.

**Cross-ref.** *Architecture.md* — section "Template and block document model".

---

# Email Editor

## F-15: Block-based email composer

**Description.** A WYSIWYG editor where the user assembles an email out of typed blocks — text, image, button, divider, spacer — by adding, reordering (drag), and deleting them. Renders to inlined-CSS HTML at send time.

**User story.** As a marketer, I want to drag and drop sections to build my email so that I do not need to know HTML.

**Acceptance criteria.**
- Editor surface has a left rail with block types (Text, Image, Button, Divider, Spacer) and a center preview canvas.
- Adding a block appends it to the bottom of the canvas; drag-handle on each block reorders within the canvas; trash icon deletes with a confirm.
- **Text block**: rich text — bold, italic, link, bullet list, ordered list, headings H1/H2. Renders to `<td>` with inline styles.
- **Image block**: upload (max 2 MB, jpg/png/gif), alt text required, optional link URL. Image stored as `Parse.File` and served via Parse's file URL.
- **Button block**: label, URL, alignment (left/center/right), background colour (hex picker), text colour.
- **Divider block**: horizontal rule with selectable colour + thickness (1/2/4 px).
- **Spacer block**: height in px (8/16/24/32/48).
- Render pipeline emits a single `<table>`-based HTML document with inline CSS via `juice` at send time (F-22).
- Editor autosaves every 5s to the underlying `Campaign` or `Template` row; "Saved" indicator visible in the header.
- Editor supports up to 50 blocks per email; the 51st block add is rejected with a tooltip.

**Data touchpoints.** `Campaign.blocks` (array of block nodes), `Template.blocks`; render helper `server/cloud/renderEmailHtml.js`.

**Frontend touchpoints.** `src/views/editor/EmailEditor.vue`, `src/components/blocks/*.vue` (one per block type).

**Cross-ref.** *Architecture.md* — section "Email rendering pipeline".

---

## F-16: Subject + preheader editor

**Description.** A header strip above the block canvas where the user sets the email's subject and preheader text.

**User story.** As a marketer, I want to write the subject line and preview text from the same screen as the body so that I do not have to context-switch.

**Acceptance criteria.**
- Subject input: max 150 chars, character counter visible, warning colour at >70 (Gmail truncation threshold).
- Preheader input: max 150 chars; if empty at send time, falls back to the first 100 chars of plain-text body.
- Both fields autosave with the rest of the campaign (F-15).
- Merge tags (F-17) are usable in both subject and preheader.

**Data touchpoints.** `Campaign.subject`, `Campaign.preheader`.

**Frontend touchpoints.** `src/views/editor/EmailEditor.vue` header strip.

**Cross-ref.** *Architecture.md* — section "Email rendering pipeline".

---

## F-17: Merge tags (`{{firstName}}`, etc.)

**Description.** `{{fieldKey}}` tokens in subject, preheader, text-block content, button label, button URL — resolved per-recipient at send time against that recipient's `Contact.fields` map.

**User story.** As a marketer, I want to insert each recipient's first name into the subject so that the email feels personal at scale.

**Acceptance criteria.**
- Editor "Insert merge tag" picker lists `email` + all custom fields on the campaign's selected list, plus a default-value syntax: `{{firstName | there}}`.
- Render walks the block tree and replaces `{{...}}` tokens before juice inlining; missing tokens fall back to the default value, or to empty string if no default.
- Subject token replacement runs against the contact at envelope-build time; the subject delivered to each recipient is personalized.
- Test-send (F-20) substitutes from the test recipient's contact record if they are on the list; if not, replaces tokens with `[firstName]` placeholders so the marketer can see the structure.
- A token referencing an unknown field (typo) is left literal in the rendered HTML and surfaced as a "1 unknown merge tag: `{{firstname}}`" warning in the pre-send review (F-21).

**Data touchpoints.** `Contact.fields`; render helper `server/cloud/resolveMergeTags.js`.

**Frontend touchpoints.** `src/views/editor/EmailEditor.vue` (picker), `src/components/blocks/TextBlock.vue`.

**Cross-ref.** *Architecture.md* — section "Merge tag resolution".

---

# Campaigns

## F-18: Campaign draft creation

**Description.** "Create campaign" entry point that produces a `Campaign` row in `draft` status and walks the user through audience → template → editor.

**User story.** As a marketer, I want to start a new campaign and have my progress saved as I go so that I do not lose work if I close the tab.

**Acceptance criteria.**
- `/campaigns/new` creates an empty `Campaign` row with status `draft`, `createdBy` = current user, `org` = current org; navigates to `/campaigns/:id/edit`.
- A draft is editable indefinitely; a draft is deletable from the campaign list.
- The campaign list (`/campaigns`) shows status badges: `draft`, `scheduled`, `sending`, `sent`, `paused`.
- A draft with no `audience`, no `template`, or no subject cannot be sent; the Send button is disabled with a tooltip listing missing pieces.

**Data touchpoints.** `Campaign`.

**Frontend touchpoints.** `src/views/campaigns/CampaignList.vue`, `src/views/campaigns/CampaignEdit.vue`.

**Cross-ref.** *Architecture.md* — section "Campaign lifecycle".

---

## F-19: Campaign recipient & content selection

**Description.** Within a draft, the user picks **one** audience list, optionally a segment within that list, a sender identity, and either a template fork or a blank composer.

**User story.** As a marketer, I want to choose who gets the email and what design to start from so that I can move from list to content in one flow.

**Acceptance criteria.**
- "Recipients" step shows the org's lists in a dropdown; selecting one reveals a "Send to entire list" radio plus a "Send to segment" radio that opens a sub-dropdown of segments on that list.
- Audience summary block shows: "Sending to N subscribers" where N is the live count of `status === subscribed` contacts in the selection minus suppression (F-28).
- "From" step shows a dropdown of `verified` `SenderIdentity` records; default identity preselected.
- "Design" step shows: "Start from template" (gallery picker) / "Start blank". Selecting a template forks its `blocks` into the campaign.
- All three selections must be set before the editor's Send button enables.

**Data touchpoints.** `Campaign.audienceList`, `Campaign.segment`, `Campaign.senderIdentity`, `Campaign.blocks`.

**Frontend touchpoints.** `src/views/campaigns/CampaignEdit.vue` (Recipients / From / Design tabs).

**Cross-ref.** *Architecture.md* — section "Campaign lifecycle".

---

## F-20: Test-send to self

**Description.** A "Send test" button in the editor that delivers the current campaign to up to 5 manually-entered email addresses, marked with a `[TEST]` subject prefix.

**User story.** As a marketer, I want to send a copy to my own inbox first so that I can check the rendering before hitting send for real.

**Acceptance criteria.**
- "Send test" modal accepts up to 5 comma-separated emails; each must be RFC 5322 valid.
- Test send dispatches via Postmark using the campaign's selected `SenderIdentity` (F-03).
- Subject is prepended with `[TEST] `; merge tags use the marketer's own contact record if any, otherwise placeholders (`[firstName]`).
- Test-send recipients are **not** tracked: no `CampaignRecipient` rows, no open/click pixels injected, no entries in `EmailEvent`.
- Test-send is rate-limited to 20 per campaign per hour to prevent abuse.

**Data touchpoints.** None persisted beyond a `TestSendLog` audit row; Cloud Function `sendCampaignTest`.

**Frontend touchpoints.** `src/views/editor/EmailEditor.vue` (modal).

**Cross-ref.** *Architecture.md* — section "Outbound delivery via Postmark".

---

## F-21: Schedule or send-now

**Description.** From the editor's "Review & send" step, the user either sends immediately or schedules the campaign for a specific date/time in their org's timezone.

**User story.** As a marketer, I want to schedule my newsletter for Tuesday at 10am so that I can finish it Friday and forget about it.

**Acceptance criteria.**
- "Review & send" step shows: recipient count, from name/email, subject preview, preheader preview, first-block preview, merge-tag warnings (if any from F-17).
- "Send now" button transitions the campaign to status `sending` and enqueues a `CampaignJob` row with `runAt = now()`.
- "Schedule" opens a date+time picker; min = `now + 5 minutes`, max = `now + 90 days`; org timezone shown next to the picker.
- Scheduled campaigns transition to status `scheduled` and surface in the campaign list with the scheduled timestamp.
- A `scheduled` campaign can be unscheduled from the list ("Cancel schedule" → back to `draft`) up until `runAt - 60s`; after that the Cancel button disables.
- A scheduler running in the Express process polls `CampaignJob` every 30s and runs jobs whose `runAt <= now()`; concurrency is 1 job at a time per org.

**Data touchpoints.** `Campaign.status`, `Campaign.scheduledAt`, `CampaignJob`; server-side scheduler in `server/jobs/runDueCampaigns.js`.

**Frontend touchpoints.** `src/views/campaigns/CampaignReview.vue`.

**Cross-ref.** *Architecture.md* — section "Campaign scheduler and job runner".

---

# Sending & Tracking

## F-22: Outbound delivery via Postmark (ESP)

**Description.** Each campaign's recipient list is resolved, the per-recipient HTML rendered, and one Postmark API call per recipient (or batched per Postmark's `/email/batch` of 500) is made. Per-recipient envelope status is persisted.

**User story.** As a system, I need to actually deliver the email via a reputable ESP so that messages reach inboxes.

**Acceptance criteria.**
- Recipient resolution: segment members (F-12) intersected with `status === subscribed` AND NOT in `SuppressionList` (F-28).
- Render: for each recipient, run merge-tag resolution (F-17), then juice inlining; output is cached per (campaign, contact) so retries do not re-render.
- Batched API call: groups of 500 messages per Postmark batch request; failure of one message in a batch surfaces per-message error in the response, recorded as `EmailEvent.type = "dispatchFailed"`.
- Per-recipient `CampaignRecipient` row created with `messageId` returned by Postmark.
- Throughput target for MVP: 10,000 recipients in under 5 minutes on the dev box (subject to Postmark rate limits).
- On the first dispatch error from Postmark (auth, 4xx), the job pauses, the campaign moves to `paused`, and a banner appears on the campaign report.

**Data touchpoints.** `CampaignRecipient`, `EmailEvent`; Cloud Function `dispatchCampaignBatch`; Postmark client in `server/lib/postmark.js`.

**Frontend touchpoints.** `src/views/campaigns/CampaignReport.vue` (status banner).

**Cross-ref.** *Architecture.md* — section "Outbound delivery via Postmark".

---

## F-23: Open + click tracking

**Description.** Each rendered email contains a 1×1 tracking pixel and link rewrites that route through Gorilla's redirector. Hits land in an `EmailEvent` table keyed by recipient + campaign.

**User story.** As a marketer, I want to know which recipients opened and which links they clicked so that I can measure campaign performance.

**Acceptance criteria.**
- Render injects `<img src="https://api.gorilla.email/t/open/:recipientId.gif">` as the last element before `</body>`; 1×1 transparent GIF returned by the redirector.
- Every `<a href>` in the rendered HTML is rewritten to `https://api.gorilla.email/t/click/:recipientId/:linkId` where `linkId` is the index into the campaign's `links` array stored on `Campaign.linkMap`.
- Open hit writes `EmailEvent { type: "open", recipient, campaign, userAgent, ipHash, ts }`; deduplicated within 60s per recipient.
- Click hit writes `EmailEvent { type: "click", recipient, campaign, linkId, ... }` then 302-redirects to the original URL.
- Tracking endpoints respond in under 50ms p95 and never block on database writes — write is async after the response.
- `mailto:`, `tel:`, and `#`-fragment links are **not** rewritten.

**Data touchpoints.** `Campaign.linkMap`, `EmailEvent`, `CampaignRecipient`; Express routes `/t/open/:id.gif`, `/t/click/:rid/:lid`.

**Frontend touchpoints.** None (server endpoints only).

**Cross-ref.** *Architecture.md* — section "Email event ingestion and storage".

---

## F-24: List-Unsubscribe header + injected link

**Description.** Every outbound email carries an `List-Unsubscribe` header (mailto + URL forms) plus an injected unsubscribe link in the footer (F-27). Click on either path lands on the unsubscribe page.

**User story.** As a system, I need to give recipients a one-click way to opt out so that we stay compliant with CAN-SPAM / GDPR and stay out of spam folders.

**Acceptance criteria.**
- Postmark headers include `List-Unsubscribe: <mailto:unsub@gorilla.email?subject=u-:recipientId>, <https://api.gorilla.email/u/:recipientId/:token>`.
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is included to satisfy Gmail / Yahoo bulk-sender requirements.
- Footer block (auto-appended by render — see F-27 for content) contains a visible "Unsubscribe" link to the same `/u/...` URL.
- `:token` is an HMAC of `(recipientId, campaignId, secret)` so the link is not guessable.
- A POST to the unsubscribe URL with `List-Unsubscribe=One-Click` body unsubs immediately without a confirm screen, per RFC 8058.

**Data touchpoints.** `CampaignRecipient.unsubscribeToken`; Express route `/u/:recipientId/:token`.

**Frontend touchpoints.** `src/views/public/Unsubscribe.vue` (handles GET; POST handled server-side).

**Cross-ref.** *Architecture.md* — section "Unsubscribe and suppression flow".

---

# Reports

## F-25: Campaign report (headline metrics)

**Description.** A per-campaign page that aggregates `EmailEvent` rows into headline counters: sent, delivered, open rate, click rate, bounce rate, unsubscribe rate.

**User story.** As a marketer, I want to see how my campaign performed at a glance so that I can compare against my last send.

**Acceptance criteria.**
- `/campaigns/:id/report` shows for the campaign:
  - **Sent**: count of `CampaignRecipient` rows with non-null `messageId`.
  - **Delivered**: sent minus bounces.
  - **Bounce rate**: bounces ÷ sent (separate counters for hard / soft).
  - **Open rate**: unique opens ÷ delivered.
  - **Click rate**: unique clicks ÷ delivered.
  - **Unsubscribe rate**: unsubs ÷ delivered.
- All metrics computed by a Cloud Function `getCampaignReport` that runs MongoDB aggregations on `EmailEvent`.
- Page caches the aggregation result on the client for 30s; "Refresh" button forces re-fetch.
- Campaigns in `sending` status show a live counter with the same fields, updating every 10s.

**Data touchpoints.** `Campaign`, `CampaignRecipient`, `EmailEvent`; Cloud Function `getCampaignReport`.

**Frontend touchpoints.** `src/views/campaigns/CampaignReport.vue`.

**Cross-ref.** *Architecture.md* — section "Reporting aggregations".

---

## F-26: Per-link click breakdown + recipient activity

**Description.** Inside the campaign report, two deeper views: a table of every tracked link with its unique-click count, and a paginated list of recipients with their per-event timeline.

**User story.** As a marketer, I want to see which links got clicked and which subscribers engaged so that I can dig into who responded to what.

**Acceptance criteria.**
- "Links" tab shows: rendered link URL, click count (unique), click rate (unique clicks ÷ delivered), sorted descending by click count.
- "Recipients" tab shows a paginated table (50/page) of `CampaignRecipient` with columns: email, sent, delivered, opened (timestamp of first open), last clicked, bounce reason if any.
- Recipients table filters: `opened`, `clicked`, `bounced`, `unsubscribed`, `not opened`.
- Recipient row click opens the contact detail (F-09) in a side drawer with the activity tab pre-selected.
- Export-as-CSV button on the Recipients tab downloads the full filtered list (max 100k rows).

**Data touchpoints.** `Campaign.linkMap`, `EmailEvent`, `CampaignRecipient`; Cloud Function `getCampaignLinkBreakdown`, `getCampaignRecipients`.

**Frontend touchpoints.** `src/views/campaigns/CampaignReport.vue` (Links + Recipients tabs).

**Cross-ref.** *Architecture.md* — section "Reporting aggregations".

---

# Compliance

## F-27: Unsubscribe page

**Description.** A public (unauthenticated) page that confirms an unsubscribe action and writes the recipient to the suppression list.

**User story.** As a recipient, I want to click "Unsubscribe" and stop receiving emails so that I am not bothered by a sender I do not want to hear from.

**Acceptance criteria.**
- `/u/:recipientId/:token` validates the HMAC; invalid token shows "This link is invalid or expired."
- Valid GET shows a confirm page with: sender org name, recipient email, "Confirm unsubscribe" button, optional "Why are you unsubscribing?" radio (Too frequent / Not relevant / Never signed up / Other).
- Confirm POST writes a `SuppressionList` row with reason `userOptOut`, optional `feedback`, ts.
- After confirm, the contact's `status` flips to `unsubscribed` (via `Contact.afterSave` → suppression sync).
- Page renders fully without JavaScript (server-side rendered HTML in Express, not Vue) so it works in privacy-strict mail clients.
- The same handler accepts `POST /u/:recipientId/:token` with body `List-Unsubscribe=One-Click` (per F-24) and unsubs without a confirm.

**Data touchpoints.** `SuppressionList`, `Contact`; Express route `/u/:recipientId/:token` (server-rendered).

**Frontend touchpoints.** Server-side template `server/templates/unsubscribe.html`; optional `src/views/public/Unsubscribe.vue` for the in-app preference re-subscribe flow.

**Cross-ref.** *Architecture.md* — section "Unsubscribe and suppression flow".

---

## F-28: Suppression list

**Description.** An org-wide table of email addresses that must not be mailed, with reason and timestamp. Send-time recipient resolution (F-22) skips any address present in the suppression list, regardless of which list they appear on.

**User story.** As a marketer, I want a single place to see and manage people who should not receive my campaigns so that I do not accidentally re-mail an unsubscriber.

**Acceptance criteria.**
- `/settings/suppression` shows the org's `SuppressionList` rows: email, reason (`userOptOut`, `hardBounce`, `complaint`, `manual`, `imported`), addedAt, campaign (if linked).
- Search by email returns within 500ms on a 1M-row table (indexed on `email`).
- Manual add accepts up to 5,000 emails via paste or CSV; each row inserted as `reason: manual`.
- Manual remove ("re-subscribe") writes an audit row in `SuppressionAuditLog` and removes from the table.
- Hard bounces (`type: "bounce"` events from Postmark webhook with category `HardBounce`) auto-add to suppression with reason `hardBounce`.
- Spam complaints (Postmark `SpamComplaint` webhook) auto-add with reason `complaint`.

**Data touchpoints.** `SuppressionList`, `SuppressionAuditLog`, `EmailEvent`; Postmark webhook handler `server/webhooks/postmark.js`.

**Frontend touchpoints.** `src/views/settings/Suppression.vue`.

**Cross-ref.** *Architecture.md* — section "Unsubscribe and suppression flow".

---

## F-29: GDPR consent capture on import

**Description.** During CSV import (F-07) and manual add (F-08), the user must affirm the source of consent for the contacts being added. The affirmed source is stored per-contact alongside a timestamp.

**User story.** As a marketer in an EU jurisdiction, I need to record where each contact's consent came from so that I can prove compliance if asked.

**Acceptance criteria.**
- Import wizard mapping step has a required step: "How did you collect consent for these contacts?" with options `signupForm`, `purchase`, `event`, `manuallyEntered`, `other (free text)`.
- Selected source is written to each new `Contact.consent = { source, capturedAt, importJobId }`.
- A list option (`AudienceList.requireConsent`) toggles whether consent capture is **mandatory**; default on. With it on, contacts cannot be saved without a consent source.
- Footer (F-27) includes an automatic "You are receiving this because you signed up at {{consent.source}}" sentence when the field is present.
- Per-contact consent record is visible on the contact detail view (F-09).

**Data touchpoints.** `Contact.consent`, `AudienceList.requireConsent`.

**Frontend touchpoints.** `src/views/audiences/Import.vue` (consent step), `src/views/audiences/ContactDetail.vue`.

**Cross-ref.** *Architecture.md* — section "Consent and compliance metadata".

---

# Out-of-MVP Backlog

Deferred. These are intentionally **not** in MVP — each has a one-line rationale so reviewers stop suggesting them.

| Feature | Rationale |
|---|---|
| **A/B testing & multivariate** | Requires send-split logic, statistical-significance UX, and variant-aware reporting — a feature surface as large as the rest of Sending combined. Validate that single-variant sends work before adding variance. |
| **Automations / journeys / drip sequences** | Needs trigger model, wait steps, branching, and a long-running job runner. Doubles the backend complexity. Marketers can manually schedule a sequence of campaigns in MVP. |
| **Landing pages** | A separate product surface (page builder, hosting, form capture). Adjacent but not required to send email. |
| **Surveys / forms** | Embedded data-capture is a discrete subsystem with its own renderer and submission ingest. Punt to V2. |
| **Transactional email API** | Different product (per-message API for app-driven email vs marketer-driven broadcast). Different rate, different reporting, different auth model. |
| **SMS / WhatsApp / push channels** | Multi-channel doubles the surface area without proving the email value first. |
| **Predictive demographics / send-time optimization** | ML features that need months of event data to even bootstrap. Premature with no campaign history. |
| **Integrations marketplace (Shopify, Salesforce, etc.)** | Each integration is its own multi-week project. Generic CSV import (F-07) covers ~80% of the value. |
| **Marketing CRM features (lead scoring, lifecycle stages)** | Pulls the product toward CRM territory. Stay focused on send + measure. |
| **Advanced reporting (cohorts, comparative, geo heatmaps)** | F-25 / F-26 cover the headline questions. Cohort/comparative needs a reporting warehouse, not OLTP aggregations. |
| **Sub-accounts / agency / multi-workspace** | One org per user in MVP (see Open Questions). Multi-tenancy adds permission and billing edges that need real demand to design correctly. |
| **Free-tier limits & billing** | No paywall in MVP. Internal pilot only — open question below. |
| **Mobile apps** | Web is the marketer's workflow tool. Mobile is a 6-month project on its own. |
| **AI subject-line / content assistance** | A nice-to-have whose absence does not block sending a single campaign. Bolt on once the editor and reports work. |
| **Preference center (granular topic subscriptions)** | MVP unsubscribe is binary (all or nothing per list). Granular preferences are a follow-up to F-27. |
| **Sub-user roles & permissions** | Owner-only org in MVP. Roles (admin/editor/viewer) added once teams need it. |
| **Audit log (who edited what, when)** | Partial coverage in `ContactAuditLog` + `SuppressionAuditLog`; full org-wide audit deferred. |
| **Webhook outputs for events** | Inbound webhooks (Postmark) are MVP; outbound (notifying customer systems on open/click) is V2. |

---

# Delivery Phases

Four phases. Each phase produces something **demoable end-to-end** — at the end of each phase, you can sit down and walk a stranger through a working flow.

Acceptance criteria within each F-XX still apply; phases describe **which** features are in scope, not a relaxation of their bar.

---

## Phase 1 — Pipeline proof (thinnest viable slice)

**Goal.** Confirm the entire send → deliver → confirm chain works end-to-end with the simplest possible scaffold. Everything else is built on this skeleton.

**In scope.**
- F-01 Account signup (minimal — no domain verification yet)
- F-02 Login & session
- F-03 Sender identity (shared `via gorilla.email` only — no DNS step)
- F-05 Audience list
- F-08 Manual contact add / edit (single-contact path only)
- F-18 Campaign draft creation
- F-19 Campaign recipient & content selection (list-only, no segments)
- F-21 Schedule or send-now (send-now path only; scheduling deferred to Phase 4)
- F-22 Outbound delivery via Postmark
- A minimal **plain-text** body composer (precursor to F-15; one textarea, no blocks)

**Out of scope this phase.** CSV import, segments, block editor, templates, tracking, reports, unsubscribe handling beyond a stub footer link.

**Demo.** Sign up. Create a list called "Family". Manually add one contact (your own personal email). Compose a plain-text email "Hello {{firstName}}" — for Phase 1 the merge tag is literal text and not resolved. Hit Send. Inbox receives it within 30s. There is no report screen yet; we confirm delivery by looking at the marketer's actual inbox.

**Exit criterion.** A campaign with a single recipient delivers and is observable in the recipient's mailbox. The Postmark message ID round-trips into `CampaignRecipient`.

---

## Phase 2 — Audience depth

**Goal.** Move from a hand-typed contact to a realistic 10k-row import, plus the deliverability hygiene needed to send to a real list without immediately hitting spam.

**In scope.**
- F-04 Sending domain verification (SPF + DKIM)
- F-06 Custom fields on a list
- F-07 CSV contact import
- F-09 Contact detail view
- F-17 Merge tags — promote from "literal in the body" to actually-resolved at send time
- F-24 List-Unsubscribe header + injected link
- F-27 Unsubscribe page (basic version — no preference center)
- F-28 Suppression list (read-only view + Postmark webhook for hard-bounce auto-add)
- F-29 GDPR consent capture on import

**Demo.** Verify `acme.com` via DNS. Define custom fields `firstName`, `plan`. Import a 10k-row CSV — see the progress bar, 50 invalid rows downloaded as `errors.csv`. Send a plain-text campaign to the imported list with `Hi {{firstName}}, your {{plan}} plan…`. Each recipient receives a personalized copy. Click the footer Unsubscribe link in your inbox; the contact moves to the suppression list; resend the same campaign — the unsubscribed address is skipped.

**Exit criterion.** A 10k-recipient send completes, suppression filtering works end-to-end, and DKIM passes per Postmark's delivery dashboard.

---

## Phase 3 — Composer + tracking + reports

**Goal.** Replace the plain-text composer with the full block editor and prove the measurement loop closes.

**In scope.**
- F-13 Template gallery
- F-14 Save-as-template
- F-15 Block-based email composer
- F-16 Subject + preheader editor
- F-20 Test-send to self
- F-23 Open + click tracking
- F-25 Campaign report (headline metrics)
- F-26 Per-link click breakdown + recipient activity

**Demo.** Fork a "Welcome" starter template. Drag in a header image, swap the button text, write a paragraph with a merge tag. Test-send to your own inbox — render is pixel-correct. Send to your 10k list. Watch the report tick: opens, clicks. Click "Links" tab — see which CTA won. Open a single recipient in the drawer — see they opened twice and clicked the bottom link.

**Exit criterion.** A campaign sent to 10k contacts produces accurate open / click / bounce numbers in the report within 30s of an event, and unique-click counts match Postmark's own dashboard within 1%.

---

## Phase 4 — Segments + scheduling + polish

**Goal.** Add the slicing and timing primitives that make Gorilla a real send tool rather than a one-shot blaster.

**In scope.**
- F-10 Segment rule builder
- F-11 Segment preview & save
- F-12 Static vs dynamic segment toggle
- F-21 Schedule or send-now — promote from "send-now only" to full scheduling
- Polish across earlier features: empty states, error toasts, retry UX on Postmark 4xx, suppression manual-edit, sender-identity revocation.

**Demo.** Build a segment "Pro-plan users who opened the last campaign". Preview count = 312. Save as dynamic. Compose a "thanks for engaging" campaign. Schedule for next Tuesday 10am in org timezone. Cancel it from the campaign list. Reschedule for 5 minutes from now. Send fires automatically at the scheduled time.

**Exit criterion.** A dynamic segment combined with a scheduled send runs unattended and the resulting report shows accurate metrics for the segment's resolved members.

---

# Open Questions

Decisions needed from product/business **before Phase 1 commits**, because each shapes data model or send semantics.

1. **Single-org-per-user or multi-workspace?** This plan assumes one `Organization` per `_User` (`OrgMembership` exists for future flexibility but is unused in MVP). Multi-workspace switching would change the `auth` Vuex module, route guards, and every Parse query's `org` filter. Recommend: one-per-user for MVP, design `OrgMembership` to allow expansion later.

2. **Shared sending domain (`via gorilla.email`) acceptable for MVP, or BYO-domain required?** This plan allows shared sending and defers F-04 to Phase 2. If shared sending is **not** acceptable (deliverability or brand), F-04 has to move to Phase 1 and ship before any real customer send.

3. **Free-tier limits and pricing model.** Affects: throttle/queue design (paid plans get priority queue?), suppression caps, campaign-send caps, retention of `EmailEvent` rows. Currently the plan assumes unlimited within a closed pilot. A real free tier means rate-limit middleware and a billing module — neither is in MVP.

4. **Double opt-in default behavior on signup forms?** Not in MVP (no signup forms — F-29 is import-time consent only), but the consent model needs to support double opt-in in V2. Decide now whether `Contact.consent` should carry a `confirmedAt` field so the schema does not need migration later.

5. **Retention of email events.** `EmailEvent` will grow unboundedly with sends. Retain for 90 days, 1 year, forever? Affects MongoDB sizing and the reporting aggregations' performance. Recommend 1 year with a TTL index.

6. **Suppression list scope — per-org or per-list?** This plan is **per-org** (a suppression entry blocks all lists in the org). Per-list suppression is what Mailchimp does. Per-org is safer for compliance but means a contact who unsubs from Newsletter A is also off Newsletter B. Confirm before Phase 2.

7. **Timezone of `Campaign.scheduledAt`.** Stored as UTC, but the user picks in their org timezone. Need to decide: does the org carry a `timezone` field set at signup, or per-user? If per-user, two users in the same org scheduling the same campaign see different clocks — usually confusing.

---

*This document is intentionally a planning artifact, not a status board. Mark features as `shipped` in the Index table only after their acceptance criteria are testable against running code.*
