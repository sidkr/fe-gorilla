// ─────────────────────────────────────────────────────────────────────────────
// Idempotent schema bootstrap. CommonJS. Called from server/index.js after
// api.start(). Ensures each per-tenant class exists with its key fields,
// indexes, and a CLP that DISABLES public access (auth required; ACL handles
// row-level isolation).
//
// Idempotency: re-running is safe. "already exists" / "index exists" errors are
// swallowed; a single failing index never crashes boot — we log and continue.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { initParseClient } = require("../../lib/parseClient");

// Schema reads/writes are privileged operations — they must carry the master
// key, and the SDK must be pointed at the running server. Without this every
// Parse.Schema call comes back "unauthorized".
const MK = { useMasterKey: true };

// CLP that requires an authenticated session for all operations and disables
// public access. `requiresAuthentication: true` means "any logged-in user";
// row-level ACL then narrows it to the owning org's role.
function authOnlyCLP() {
  return {
    find: { requiresAuthentication: true },
    count: { requiresAuthentication: true },
    get: { requiresAuthentication: true },
    create: { requiresAuthentication: true },
    update: { requiresAuthentication: true },
    delete: { requiresAuthentication: true },
    addField: { requiresAuthentication: true },
    protectedFields: {},
  };
}

// Swallow benign "already exists" errors; log + continue on anything else.
function benign(err) {
  const msg = (err && (err.message || err.toString())) || "";
  return (
    /already exist/i.test(msg) ||
    /duplicate/i.test(msg) ||
    /already an index/i.test(msg) ||
    (err && err.code === Parse.Error.DUPLICATE_VALUE)
  );
}

async function safeSave(schema, label) {
  try {
    await schema.update();
  } catch (errUpdate) {
    // Not yet created — try create.
    try {
      await schema.save();
    } catch (errCreate) {
      if (benign(errCreate)) return;
      console.warn(`[bootstrapSchemas] ${label}: ${errCreate.message || errCreate}`);
    }
  }
}

// Apply field + index definitions to a schema, then persist. Each addIndex is
// wrapped so an existing index doesn't abort the rest.
async function ensureClass(className, define) {
  const schema = new Parse.Schema(className);
  // Load existing definition (if any) so update() doesn't try to re-add fields.
  let existing = null;
  try {
    existing = await schema.get(MK);
  } catch (_) {
    existing = null; // class doesn't exist yet
  }
  define(schema, existing);

  if (existing) {
    // Class exists: update is the right verb. Adding a field that already
    // exists throws — but define() guards with `existing`. Indexes are the
    // common re-run hazard; update() will skip ones already present in newer
    // parse-server, and benign() catches the rest.
    try {
      await schema.update(MK);
    } catch (err) {
      if (!benign(err)) {
        console.warn(`[bootstrapSchemas] ${className} update: ${err.message || err}`);
      }
    }
  } else {
    try {
      await schema.save(MK);
    } catch (err) {
      if (!benign(err)) {
        console.warn(`[bootstrapSchemas] ${className} create: ${err.message || err}`);
      }
    }
  }
}

// Add a field only if it's not already defined on the existing schema.
function field(schema, existing, name, type, opts) {
  if (existing && existing.fields && existing.fields[name]) return;
  if (type === "Pointer") {
    schema.addPointer(name, opts.targetClass);
  } else if (type === "Array") {
    schema.addArray(name);
  } else if (type === "Object") {
    schema.addObject(name);
  } else {
    schema.addField(name, type);
  }
}

// Add an index only if not already present.
function index(schema, existing, name, spec) {
  if (existing && existing.indexes && existing.indexes[name]) return;
  schema.addIndex(name, spec);
}

// CLP that grants NO public + NO authenticated access — only the master key can
// touch the class. Used for the global mock-SES outbox (MockSentMessage): it's a
// dev/test inspection store, never reachable by a client session.
function masterKeyOnlyCLP() {
  return {
    find: {},
    count: {},
    get: {},
    create: {},
    update: {},
    delete: {},
    addField: {},
    protectedFields: {},
  };
}

async function bootstrapSchemas() {
  // Point the Parse Node SDK at the running server with the master key. Idempotent.
  initParseClient();

  // ── Organization (not per-tenant; bespoke CLP) ──────────────────────────────
  await ensureClass("Organization", (s, e) => {
    field(s, e, "name", "String");
    field(s, e, "slug", "String");
    field(s, e, "plan", "String");
    field(s, e, "defaultFromName", "String");
    field(s, e, "defaultFromEmail", "String");
    field(s, e, "monthlySendCap", "Number");
    field(s, e, "monthlySendCount", "Number");
    field(s, e, "timezone", "String");
    // Physical mailing address shown in email footers (CAN-SPAM requirement).
    field(s, e, "address", "String");
    // Abuse controls (shared sending domain): rolling counters + auto-pause flag.
    // webhookIngest bumps complaintCount/hardBounceCount and flips sendingPaused
    // when a rate threshold is crossed; fanout refuses to send while paused.
    field(s, e, "complaintCount", "Number");
    field(s, e, "hardBounceCount", "Number");
    field(s, e, "sendingPaused", "Boolean");
    field(s, e, "sendingPausedReason", "String");
    field(s, e, "sendingPausedAt", "Date");
    index(s, e, "org_slug_unique", { slug: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── SenderIdentity (per-tenant) ───────────────────────────────────────────--
  // A verified from-name / from-email pair an org may send as. MVP verification
  // is a stub (status flip); the real domain/email verification belongs to the
  // send pipeline (later wave).
  await ensureClass("SenderIdentity", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "fromName", "String");
    field(s, e, "fromEmail", "String");
    field(s, e, "status", "String"); // "pending" | "verified"
    index(s, e, "sender_org_email", { organization: 1, fromEmail: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── List ────────────────────────────────────────────────────────────────────
  await ensureClass("List", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "description", "String");
    field(s, e, "contactCount", "Number");
    field(s, e, "archived", "Boolean");
    index(s, e, "list_org_name", { organization: 1, name: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Contact ───────────────────────────────────────────────────────────────--
  await ensureClass("Contact", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "email", "String");
    field(s, e, "lists", "Array");
    field(s, e, "status", "String");
    field(s, e, "firstName", "String");
    field(s, e, "lastName", "String");
    field(s, e, "customFields", "Object");
    // Standard rich-contact fields (DECISIONS #11) — first-class columns that the
    // capture form, segments, and merge-tags treat as built-ins (vs. the
    // per-org CustomField registry for arbitrary data points).
    field(s, e, "company", "String");
    field(s, e, "phone", "String");
    field(s, e, "city", "String");
    field(s, e, "country", "String");
    field(s, e, "timezone", "String");
    field(s, e, "tags", "Array");
    field(s, e, "consent", "Object");
    field(s, e, "deleted", "Boolean");
    field(s, e, "subscribedAt", "Date");
    field(s, e, "unsubscribedAt", "Date");
    // Send-pipeline fields: opt-out flag + soft-bounce promotion counter.
    field(s, e, "unsubscribed", "Boolean");
    field(s, e, "softBounceCount", "Number");
    // Lifetime-value rollup (Revenue R1) — maintained by the ingest job.
    field(s, e, "totalRevenue", "Number"); // integer minor units
    field(s, e, "orderCount", "Number");
    field(s, e, "lastOrderAt", "Date");
    // Unique compound: one contact per email per org (CSV dedupe key).
    index(s, e, "contact_org_email_unique", { organization: 1, email: 1 });
    index(s, e, "contact_org_status", { organization: 1, status: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── CustomField (per-org data-point registry; DECISIONS #11) ───────────────--
  await ensureClass("CustomField", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "key", "String");
    field(s, e, "label", "String");
    field(s, e, "type", "String");
    field(s, e, "enumValues", "Array");
    field(s, e, "required", "Boolean");
    field(s, e, "order", "Number");
    // One field definition per key per org.
    index(s, e, "customfield_org_key_unique", { organization: 1, key: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Segment ───────────────────────────────────────────────────────────────--
  await ensureClass("Segment", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "list", "Pointer", { targetClass: "List" });
    field(s, e, "kind", "String");
    field(s, e, "rules", "Object");
    field(s, e, "staticContacts", "Array");
    field(s, e, "lastEvaluatedAt", "Date");
    field(s, e, "lastCount", "Number");
    index(s, e, "segment_org_list", { organization: 1, list: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Template ──────────────────────────────────────────────────────────────--
  await ensureClass("Template", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    // Canonical block model field (matches Campaign.body): { version, blocks }.
    field(s, e, "body", "Object");
    field(s, e, "isSystem", "Boolean");
    field(s, e, "subject", "String");
    field(s, e, "previewText", "String");
    s.setCLP(authOnlyCLP());
  });

  // ── Campaign ──────────────────────────────────────────────────────────────--
  await ensureClass("Campaign", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "subject", "String");
    field(s, e, "status", "String");
    // Editor-authored content (see components/app/editor/EditorShell.vue).
    field(s, e, "body", "Object");          // { version, blocks } — source of truth
    field(s, e, "compiledHtml", "String");  // blocks → MJML → HTML (compileBlocks)
    field(s, e, "preheader", "String");
    field(s, e, "fromName", "String");
    field(s, e, "fromEmail", "String");
    field(s, e, "replyTo", "String");
    field(s, e, "audienceId", "String");    // a List id (string, not a pointer)
    field(s, e, "segmentId", "String");     // optional: target a Segment instead of the whole list
    field(s, e, "pausedFrom", "String");    // prior status snapshot for pause/resume
    field(s, e, "failureReason", "String"); // set when fanout fails (cap exceeded / abuse pause)
    field(s, e, "bodyBg", "String");
    field(s, e, "createdBy", "Pointer", { targetClass: "_User" });
    field(s, e, "scheduledAt", "Date");
    field(s, e, "sentAt", "Date");
    // Denormalized engagement counters — written by the send pipeline (later
    // wave); reports read them defensively and treat missing as 0.
    field(s, e, "recipientCount", "Number");
    field(s, e, "sentCount", "Number");
    field(s, e, "deliveredCount", "Number");
    field(s, e, "openCount", "Number");
    field(s, e, "clickCount", "Number");
    field(s, e, "bounceCount", "Number");
    field(s, e, "unsubscribeCount", "Number");
    // Revenue counters (Revenue R1) — $inc'd by the ingest-conversion job.
    field(s, e, "revenueTotal", "Number"); // integer minor units
    field(s, e, "conversionCount", "Number");
    field(s, e, "orderCount", "Number");
    index(s, e, "campaign_org_status_created", { organization: 1, status: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });

  // ── CampaignSend ──────────────────────────────────────────────────────────--
  await ensureClass("CampaignSend", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "campaign", "Pointer", { targetClass: "Campaign" });
    field(s, e, "contact", "Pointer", { targetClass: "Contact" });
    field(s, e, "email", "String");
    field(s, e, "status", "String");
    field(s, e, "sesMessageId", "String");
    // Snapshot of the contact's merge values at queue time (survives later edits).
    field(s, e, "mergeFields", "Object");
    field(s, e, "statusUpdatedAt", "Date");
    field(s, e, "bounceCategory", "String");   // permanent | transient | undetermined
    field(s, e, "bounceSubType", "String");    // mailbox-full | unknown-recipient | ...
    field(s, e, "failureReason", "String");     // SMTP/SES-level failure if rejected
    field(s, e, "openedAt", "Date");            // first open
    field(s, e, "clickedAt", "Date");           // first click
    field(s, e, "unsubscribedAt", "Date");
    field(s, e, "attempts", "Number");          // send-email retry count
    // Idempotency on fanout retry: one send row per (campaign, contact).
    index(s, e, "send_campaign_contact_unique", { campaign: 1, contact: 1 });
    // Webhook lookup key, unique.
    index(s, e, "send_ses_message_id_unique", { sesMessageId: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── EmailEvent ──────────────────────────────────────────────────────────────
  await ensureClass("EmailEvent", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "campaign", "Pointer", { targetClass: "Campaign" });
    field(s, e, "campaignSend", "Pointer", { targetClass: "CampaignSend" });
    field(s, e, "contact", "Pointer", { targetClass: "Contact" });
    field(s, e, "type", "String");
    field(s, e, "timestamp", "Date");       // event-occurred time (not write time)
    field(s, e, "linkUrl", "String");       // click only
    field(s, e, "linkId", "String");        // click only — disambiguates dup URLs
    field(s, e, "userAgent", "String");     // open/click
    field(s, e, "ipAddress", "String");     // open/click
    field(s, e, "bounceCategory", "String");// bounce only
    field(s, e, "raw", "Object");           // full SES event body, for debugging
    index(s, e, "event_org_created", { organization: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Suppression ───────────────────────────────────────────────────────────--
  await ensureClass("Suppression", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "email", "String");
    field(s, e, "reason", "String");
    // Per-org suppression (DECISIONS #4): unique (organization, email).
    index(s, e, "suppression_org_email_unique", { organization: 1, email: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── SendingDomain (Track C — F-04 domain verification) ──────────────────────
  await ensureClass("SendingDomain", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "domain", "String");
    field(s, e, "selector", "String");
    field(s, e, "status", "String"); // pending | verified | failed
    field(s, e, "verified", "Boolean");
    field(s, e, "records", "Array");
    field(s, e, "lastCheckedAt", "Date");
    field(s, e, "lastCheckResult", "Object");
    index(s, e, "sendingdomain_org_domain_unique", { organization: 1, domain: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── SuppressionAuditLog (Track C — F-28 manual remove audit trail) ──────────
  await ensureClass("SuppressionAuditLog", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "action", "String"); // "remove"
    field(s, e, "email", "String");
    field(s, e, "reason", "String");
    field(s, e, "suppressionId", "String");
    field(s, e, "actorId", "String");
    index(s, e, "supplog_org_created", { organization: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });

  // ── ImportJob (Track A — F-07 CSV import lifecycle) ─────────────────────────
  await ensureClass("ImportJob", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "listId", "String");
    field(s, e, "filePath", "String");
    field(s, e, "fileName", "String");
    field(s, e, "hasHeader", "Boolean");
    field(s, e, "mapping", "Object");
    field(s, e, "consent", "Object");
    field(s, e, "status", "String"); // pending | running | done | failed
    field(s, e, "totalRows", "Number");
    field(s, e, "processedRows", "Number");
    field(s, e, "created", "Number");
    field(s, e, "updated", "Number");
    field(s, e, "skippedInvalid", "Number");
    field(s, e, "skippedSuppressed", "Number");
    field(s, e, "errors", "Array");
    field(s, e, "startedAt", "Date");
    field(s, e, "finishedAt", "Date");
    index(s, e, "importjob_org_created", { organization: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Form + FormSubmission (Track A — signup forms) ──────────────────────────
  await ensureClass("Form", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "fields", "Array");
    field(s, e, "targetListId", "String");
    field(s, e, "doubleOptIn", "Boolean");
    field(s, e, "redirectUrl", "String");
    field(s, e, "submitButtonText", "String");
    field(s, e, "status", "String");
    field(s, e, "submissionCount", "Number");
    index(s, e, "form_org_created", { organization: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });
  await ensureClass("FormSubmission", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "form", "Pointer", { targetClass: "Form" });
    field(s, e, "email", "String");
    field(s, e, "data", "Object");
    field(s, e, "contact", "Pointer", { targetClass: "Contact" });
    field(s, e, "confirmed", "Boolean");
    field(s, e, "ip", "String");
    index(s, e, "formsub_org_created", { organization: 1, createdAt: -1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Automation + steps + enrollments (Track B — journeys) ───────────────────
  await ensureClass("Automation", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "status", "String"); // draft | active | paused
    field(s, e, "trigger", "Object"); // { type, config }
    field(s, e, "stats", "Object"); // { enrolled, completed, exited }
    field(s, e, "stepCount", "Number");
    field(s, e, "createdBy", "Pointer", { targetClass: "_User" });
    index(s, e, "automation_org_status", { organization: 1, status: 1 });
    s.setCLP(authOnlyCLP());
  });
  await ensureClass("AutomationStep", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "automation", "Pointer", { targetClass: "Automation" });
    field(s, e, "order", "Number");
    field(s, e, "type", "String"); // send_email | wait | branch | exit
    field(s, e, "config", "Object");
    field(s, e, "nextStepId", "String");
    field(s, e, "branchYesStepId", "String");
    field(s, e, "branchNoStepId", "String");
    index(s, e, "step_automation_order", { automation: 1, order: 1 });
    s.setCLP(authOnlyCLP());
  });
  await ensureClass("AutomationEnrollment", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "automation", "Pointer", { targetClass: "Automation" });
    field(s, e, "contact", "Pointer", { targetClass: "Contact" });
    field(s, e, "currentStepOrder", "Number");
    field(s, e, "status", "String"); // active | completed | exited
    field(s, e, "nextRunAt", "Date");
    field(s, e, "claimedAt", "Date");
    field(s, e, "context", "Object");
    index(s, e, "enroll_status_nextrun", { status: 1, nextRunAt: 1 });
    index(s, e, "enroll_automation_contact", { automation: 1, contact: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── Conversion (Revenue R1 — attributed/unattributed orders) ────────────────
  await ensureClass("Conversion", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "contact", "Pointer", { targetClass: "Contact" });
    field(s, e, "campaign", "Pointer", { targetClass: "Campaign" });
    field(s, e, "campaignSend", "Pointer", { targetClass: "CampaignSend" });
    field(s, e, "orderId", "String");
    field(s, e, "sourceType", "String"); // shopify|woocommerce|api|pixel|manual
    field(s, e, "revenue", "Number"); // INTEGER MINOR UNITS (e.g. cents)
    field(s, e, "currency", "String"); // ISO 4217
    field(s, e, "itemCount", "Number");
    field(s, e, "occurredAt", "Date");
    field(s, e, "attributionModel", "String"); // last_click|last_open|unattributed
    field(s, e, "attributionWindowDays", "Number");
    field(s, e, "raw", "Object");
    // UNIQUE idempotency key — webhook retries / pixel double-fires don't double-count.
    index(s, e, "conversion_org_order_source_unique", { organization: 1, orderId: 1, sourceType: 1 });
    index(s, e, "conversion_org_occurred", { organization: 1, occurredAt: -1 });
    index(s, e, "conversion_campaign", { campaign: 1 });
    index(s, e, "conversion_contact", { contact: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── ApiKey (Revenue R2 — inbound events API auth; NOT per-tenant) ───────────
  // Self-stamps org + ACL in createApiKey, so it is deliberately kept out of
  // PER_TENANT_CLASSES. Only a hash of the raw key is stored.
  await ensureClass("ApiKey", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "name", "String");
    field(s, e, "keyPrefix", "String");
    field(s, e, "keyHash", "String");
    field(s, e, "scopes", "Array");
    field(s, e, "lastUsedAt", "Date");
    field(s, e, "revokedAt", "Date");
    index(s, e, "apikey_prefix_unique", { keyPrefix: 1 });
    index(s, e, "apikey_org", { organization: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── StoreConnection (Revenue R3 — connected Shopify/WooCommerce store) ───────
  await ensureClass("StoreConnection", (s, e) => {
    field(s, e, "organization", "Pointer", { targetClass: "Organization" });
    field(s, e, "provider", "String"); // shopify|woocommerce|bigcommerce|custom
    field(s, e, "shopDomain", "String");
    field(s, e, "status", "String"); // connected|pending|error
    field(s, e, "webhookSecret", "String");
    field(s, e, "accessToken", "String");
    field(s, e, "installedAt", "Date");
    field(s, e, "lastEventAt", "Date");
    field(s, e, "settings", "Object"); // { attributionWindowDays, currency }
    index(s, e, "store_org_provider_domain_unique", { organization: 1, provider: 1, shopDomain: 1 });
    s.setCLP(authOnlyCLP());
  });

  // ── MockSentMessage (GLOBAL mock-SES outbox; NOT per-tenant) ────────────────
  // Written by the mock SES adapter (server/lib/ses/mock.js) so tests + a future
  // dev "outbox" can inspect what "sent". Master-key-only: no client session can
  // read or write it. Deliberately NOT in PER_TENANT_CLASSES — it has no org
  // scoping and no tenant ACL stamping. See DECISIONS #6 / #12.
  await ensureClass("MockSentMessage", (s, e) => {
    field(s, e, "to", "String");
    field(s, e, "from", "String");
    field(s, e, "replyTo", "String");
    field(s, e, "subject", "String");
    field(s, e, "html", "String");
    field(s, e, "headers", "Object");
    field(s, e, "messageId", "String");
    field(s, e, "campaignSend", "Pointer", { targetClass: "CampaignSend" });
    field(s, e, "sentAt", "Date");
    index(s, e, "mock_message_id", { messageId: 1 });
    s.setCLP(masterKeyOnlyCLP());
  });
}

module.exports = { bootstrapSchemas };
