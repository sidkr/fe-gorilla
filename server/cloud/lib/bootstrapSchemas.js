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
    index(s, e, "org_slug_unique", { slug: 1 });
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
}

module.exports = { bootstrapSchemas };
