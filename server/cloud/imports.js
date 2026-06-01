// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for CSV contact import (F-07 + F-29). CommonJS.
//
// Flow:
//   1. Browser POSTs the .csv multipart to /api/imports/upload (see
//      server/routes/imports.js). multer/busboy stores it to /tmp and returns a
//      { token, filePath, preview } the wizard uses for the column-map + consent
//      steps.
//   2. startContactImport({ listId, mapping, consent, hasHeader, filePath })
//      verifies the caller owns the list, creates an ImportJob row (status
//      "pending") carrying the mapping/consent/filePath, and enqueues the
//      import-csv worker job. Returns { jobId }.
//   3. getImportJob({ jobId }) returns the live status + counters for polling
//      (the wizard can also LiveQuery the ImportJob row).
//
// Tenancy: the ImportJob is saved as the user so tenantHooks stamps org + ACL
// (ImportJob must be added to PER_TENANT_CLASSES — see Integration deltas). We
// ALSO set the `organization` pointer explicitly (mirrors createAudience /
// addContact) so the worker, which runs under master key, can scope its queries.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");
const { assertSafeImportPath } = require("../lib/importPaths");

// Job-name constant (jobNames.js is locked in this lane; mirror the worker's
// local fallback). INTEGRATION DELTA: add IMPORT_CSV to server/lib/jobNames.js
// and import it here + in the worker.
let IMPORT_CSV = "import-csv";
try {
  const jobNames = require("../lib/jobNames");
  if (jobNames.IMPORT_CSV) IMPORT_CSV = jobNames.IMPORT_CSV;
} catch (_) {
  /* fall back */
}

const VALID_CONSENT_SOURCES = [
  "signupForm",
  "purchase",
  "event",
  "manuallyEntered",
  "other",
];

function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "You must be signed in.",
    );
  }
  return request.user;
}

async function assertOwnedList(user, listId) {
  if (!listId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "listId is required.");
  }
  try {
    return await new Parse.Query("List").get(listId, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Audience not found.");
  }
}

// Normalize the consent payload from the wizard into the stored shape.
// { source, detail? } where source is one of VALID_CONSENT_SOURCES. The
// per-contact { capturedAt, importJobId } stamp is added by the worker.
function normalizeConsent(raw, requireConsent) {
  if (!raw || typeof raw !== "object" || !raw.source) {
    if (requireConsent) {
      throw new Parse.Error(
        Parse.Error.OTHER_CAUSE,
        "A consent source is required to import contacts.",
      );
    }
    return null;
  }
  if (!VALID_CONSENT_SOURCES.includes(raw.source)) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "Invalid consent source.");
  }
  const out = { source: raw.source };
  if (raw.source === "other" && raw.detail) out.detail = String(raw.detail).slice(0, 200);
  return out;
}

function jobToJSON(job) {
  return {
    id: job.id,
    status: job.get("status") || "pending",
    listId: job.get("listId") || "",
    fileName: job.get("fileName") || "",
    totalRows: job.get("totalRows") || 0,
    processedRows: job.get("processedRows") || 0,
    created: job.get("created") || 0,
    updated: job.get("updated") || 0,
    skippedInvalid: job.get("skippedInvalid") || 0,
    skippedSuppressed: job.get("skippedSuppressed") || 0,
    errorCount: (job.get("errors") || []).length,
    consent: job.get("consent") || null,
    createdAt: job.createdAt ? job.createdAt.toISOString() : null,
    startedAt: job.get("startedAt") ? job.get("startedAt").toISOString() : null,
    finishedAt: job.get("finishedAt") ? job.get("finishedAt").toISOString() : null,
  };
}

// Lazy enqueue so test paths that drive the worker handler directly never open a
// Mongo/Agenda connection. Mirrors campaignFanout's defaultEnqueue.
async function enqueueImport(importJobId) {
  const { getAgenda } = require("../lib/agendaInstance");
  const agenda = await getAgenda();
  await agenda.now(IMPORT_CSV, { importJobId });
}

// ── startContactImport ─────────────────────────────────────────────────────--
// Create the ImportJob + enqueue the worker. Returns { jobId }.
Parse.Cloud.define("startContactImport", async (request) => {
  const user = requireUser(request);
  const p = request.params || {};

  const list = await assertOwnedList(user, p.listId);
  const org = await getUserOrg(user, { useMasterKey: true });

  const mapping = p.mapping && typeof p.mapping === "object" ? p.mapping : null;
  if (!mapping) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "A column mapping is required.");
  }
  // Exactly one column must map to email (F-07).
  const emailCols = Object.keys(mapping).filter((k) => mapping[k] === "email");
  if (emailCols.length !== 1) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "Exactly one column must be mapped to the email field.",
    );
  }

  if (!p.filePath) {
    throw new Parse.Error(
      Parse.Error.OTHER_CAUSE,
      "No uploaded file. Upload a CSV first.",
    );
  }
  // SECURITY: never trust a client-supplied path. Constrain it to a freshly
  // uploaded temp file (os.tmpdir()/import-<32hex>.csv) — otherwise a signed-in
  // user could point the worker at /etc/passwd, server/local.env (master key),
  // or another tenant's leftover upload. See server/lib/importPaths.js.
  const safeFilePath = assertSafeImportPath(
    p.filePath,
    (msg) => new Parse.Error(Parse.Error.OTHER_CAUSE, msg),
  );

  // Consent capture is mandatory unless the list opts out (F-29:
  // AudienceList.requireConsent, default on).
  const requireConsent = list.get("requireConsent") !== false;
  const consent = normalizeConsent(p.consent, requireConsent);

  const ImportJob = Parse.Object.extend("ImportJob");
  const job = new ImportJob();
  job.set("organization", org); // explicit (tenantHooks also stamps on create)
  job.set("listId", list.id);
  job.set("filePath", safeFilePath);
  job.set("fileName", p.fileName ? String(p.fileName) : "");
  job.set("hasHeader", p.hasHeader !== false);
  job.set("mapping", mapping);
  job.set("consent", consent);
  job.set("status", "pending");
  job.set("totalRows", Number.isFinite(p.totalRows) ? p.totalRows : 0);
  job.set("processedRows", 0);
  job.set("created", 0);
  job.set("updated", 0);
  job.set("skippedInvalid", 0);
  job.set("skippedSuppressed", 0);
  job.set("errors", []);

  await job.save(null, { sessionToken: user.getSessionToken() });

  await enqueueImport(job.id);

  return { jobId: job.id, status: "pending" };
});

// ── getImportJob ──────────────────────────────────────────────────────────────
// Poll status + counters. Session-scoped read (ACL isolates per org).
Parse.Cloud.define("getImportJob", async (request) => {
  const user = requireUser(request);
  const jobId = request.params && request.params.jobId;
  if (!jobId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "jobId is required.");
  }
  let job;
  try {
    job = await new Parse.Query("ImportJob").get(jobId, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Import job not found.");
  }
  return jobToJSON(job);
});

// ── getImportJobErrors ─────────────────────────────────────────────────────--
// Return the captured error rows for the errors.csv download (first 100 rows,
// each with the original cells + a reason column). Session-scoped.
Parse.Cloud.define("getImportJobErrors", async (request) => {
  const user = requireUser(request);
  const jobId = request.params && request.params.jobId;
  if (!jobId) {
    throw new Parse.Error(Parse.Error.OTHER_CAUSE, "jobId is required.");
  }
  let job;
  try {
    job = await new Parse.Query("ImportJob").get(jobId, {
      sessionToken: user.getSessionToken(),
    });
  } catch (err) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Import job not found.");
  }
  return { rows: job.get("errors") || [] };
});

module.exports = { normalizeConsent, VALID_CONSENT_SOURCES };
