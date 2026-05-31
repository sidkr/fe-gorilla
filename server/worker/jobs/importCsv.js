// import-csv worker job. NextPhase.md §4 A1 / Features F-07 + F-29.
//
// Given { importJobId } it streams the uploaded CSV off disk (no full-file
// buffer), applies the column mapping the user picked in the wizard, validates +
// dedupes + suppression-checks each row, and upserts a Contact per surviving
// row. It $inc's the ImportJob counters as it goes, captures the first 100
// errors, and reconciles List.contactCount at the end.
//
// Lifecycle (ImportJob.status): pending → running → done | failed.
//
// Worker plumbing pattern mirrors campaignFanout/sendEmail: export
// register(agenda) AND a pure handle({ importJobId }, deps) so tests can call
// the handler directly with a plain object (no live Agenda needed). The CSV
// stream source is injectable (`openStream`) so tests can feed an in-memory
// string instead of touching /tmp.
//
// Idempotent-ish on rerun: upsert on (org, email) means a re-run merges rather
// than duplicates. We reset the counters at the start of a run so a retry after
// a partial failure reports honest totals rather than double-counting.
const fs = require("fs");
const Parse = require("parse/node");
const { Readable } = require("stream");

// jobNames.js is locked (can't add IMPORT_CSV there in this lane). Import what
// exists; define a local fallback constant so this worker still registers +
// runs. INTEGRATION DELTA: add `IMPORT_CSV: "import-csv"` to server/lib/jobNames.js
// and switch the line below to destructure it from there.
let IMPORT_CSV = "import-csv";
try {
  const jobNames = require("../../lib/jobNames");
  if (jobNames.IMPORT_CSV) IMPORT_CSV = jobNames.IMPORT_CSV;
} catch (_) {
  /* fall back to the local constant */
}

const { isSuppressed, normalizeEmail } = require("../../lib/suppression");
const { validateCustomFields } = require("../../cloud/lib/customFields");

const MK = { useMasterKey: true };
const MAX_ERRORS = 100;
// Pragmatic RFC-5322-ish check — same as the contacts cloud fns. The unique
// (org, email) index is the real gate; this rejects obvious garbage cheaply.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STD_STRING_FIELDS = ["firstName", "lastName", "company", "phone", "city", "country", "timezone"];

// ── CSV stream parse ──────────────────────────────────────────────────────────
// Prefer csv-parser (present in node_modules); fall back to a tiny streaming
// parser if it's ever missing so the worker never hard-fails on a dep gap.
function parseCsvStream(readable, { hasHeader }, onRow, onDone, onError) {
  let csvParser = null;
  try {
    csvParser = require("csv-parser");
  } catch (_) {
    csvParser = null;
  }

  if (csvParser) {
    // headers:false → rows arrive as { "0": v0, "1": v1, ... } so we always map
    // by column INDEX, which matches how the wizard's mapping is keyed. When the
    // file has a header row we skip the first emitted record.
    let first = true;
    const stream = readable.pipe(
      csvParser({ headers: false, skipLines: 0, mapValues: ({ value }) => value }),
    );
    stream.on("data", (record) => {
      if (hasHeader && first) {
        first = false;
        return;
      }
      first = false;
      const cells = Object.keys(record)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => record[k]);
      onRow(cells);
    });
    stream.on("end", onDone);
    stream.on("error", onError);
    return;
  }

  // Minimal fallback: a small streaming line/quote parser. Not feature-complete
  // (no embedded newlines inside quotes) but handles the common CSV shape.
  let buf = "";
  let first = true;
  readable.setEncoding("utf8");
  const flushLine = (line) => {
    if (hasHeader && first) {
      first = false;
      return;
    }
    first = false;
    if (line === "") return;
    onRow(splitCsvLine(line));
  };
  readable.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      let line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      flushLine(line);
    }
  });
  readable.on("end", () => {
    if (buf.length) {
      let line = buf;
      if (line.endsWith("\r")) line = line.slice(0, -1);
      flushLine(line);
    }
    onDone();
  });
  readable.on("error", onError);
}

// Split a single CSV line honoring double-quoted fields + "" escaping.
function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Strip a UTF-8 BOM off the first cell if present (F-07: UTF-8-with-BOM support).
function stripBom(s) {
  if (typeof s === "string" && s.charCodeAt(0) === 0xfeff) return s.slice(1);
  return s;
}

// ── Mapping ───────────────────────────────────────────────────────────────────
// `mapping` is keyed by CSV column index (as a string) → target:
//   "email" | "firstName" | "lastName" | "company" | "phone" | "city" |
//   "country" | "timezone" | { custom: "<fieldKey>" } | "ignore" (or absent)
// We accept either the object form { custom } or a "custom:<key>" string form so
// the frontend can send whichever is convenient.
function applyMapping(cells, mapping) {
  const out = { customFields: {} };
  for (const key of Object.keys(mapping)) {
    const target = mapping[key];
    if (!target || target === "ignore") continue;
    const idx = Number(key);
    let raw = cells[idx];
    if (idx === 0) raw = stripBom(raw);
    if (raw == null) continue;
    const value = String(raw).trim();

    if (target === "email") {
      out.email = value;
    } else if (STD_STRING_FIELDS.includes(target)) {
      if (value !== "") out[target] = value;
    } else if (typeof target === "object" && target.custom) {
      if (value !== "") out.customFields[target.custom] = value;
    } else if (typeof target === "string" && target.startsWith("custom:")) {
      const fieldKey = target.slice("custom:".length);
      if (fieldKey && value !== "") out.customFields[fieldKey] = value;
    }
  }
  return out;
}

// Load the org's CustomField registry (plain shape validateCustomFields wants).
async function loadRegistry(org) {
  const q = new Parse.Query("CustomField");
  q.equalTo("organization", org);
  q.ascending("order");
  q.limit(1000);
  const rows = await q.find(MK);
  return rows.map((f) => ({
    key: f.get("key"),
    type: f.get("type"),
    enumValues: f.get("enumValues") || [],
  }));
}

async function findContactByEmail(org, email) {
  const q = new Parse.Query("Contact");
  q.equalTo("organization", org);
  q.equalTo("email", email);
  return (await q.first(MK)) || null;
}

// ── Counter persistence ─────────────────────────────────────────────────────--
// Flush accumulated counter deltas to the ImportJob with an atomic $inc, plus
// processedRows. We flush in batches (every N rows) rather than per-row to keep
// the write rate sane on a big file — the acceptance criterion is "progress
// every 500 rows".
const FLUSH_EVERY = 500;

async function flushCounters(jobId, deltas) {
  const job = Parse.Object.extend("ImportJob").createWithoutData(jobId);
  for (const k of Object.keys(deltas)) {
    if (deltas[k]) job.increment(k, deltas[k]);
  }
  await job.save(null, MK);
  for (const k of Object.keys(deltas)) deltas[k] = 0;
}

async function handle(data, deps = {}) {
  const { importJobId } = data || {};
  if (!importJobId) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "import-csv requires { importJobId }.",
    );
  }

  // openStream lets tests inject CSV content without a temp file. Default: read
  // the ImportJob.filePath off disk.
  const openStream =
    deps.openStream ||
    ((job) => fs.createReadStream(job.get("filePath")));

  const job = await new Parse.Query("ImportJob").get(importJobId, MK);

  // Reset state for an honest (re-runnable) report, then mark running.
  job.set("status", "running");
  job.set("startedAt", new Date());
  for (const c of ["processedRows", "created", "updated", "skippedInvalid", "skippedSuppressed"]) {
    job.set(c, 0);
  }
  job.set("errors", []);
  await job.save(null, MK);

  const org = job.get("organization");
  const listId = job.get("listId");
  const mapping = job.get("mapping") || {};
  const hasHeader = job.get("hasHeader") !== false; // default true
  const consent = job.get("consent") || null;
  const registry = await loadRegistry(org);

  const Contact = Parse.Object.extend("Contact");
  const deltas = {
    processedRows: 0,
    created: 0,
    updated: 0,
    skippedInvalid: 0,
    skippedSuppressed: 0,
  };
  const errors = [];
  // In-file dedupe: collapse duplicate emails to the LAST occurrence (F-07).
  // We process rows sequentially; when we hit an email we've already upserted in
  // THIS run we treat it as an update (merge) rather than a new contact.
  // Map email → the Contact object we saved earlier in THIS run, so a
  // dup-in-file row reuses + overwrites the same object (last-write-wins)
  // without depending on read-after-write visibility of the prior save.
  const seenInFile = new Map();
  let rowNum = 0;

  // We must process rows sequentially (async upserts) but csv-parser pushes
  // synchronously. Bridge with a simple promise queue: pause the stream while a
  // row is in flight. Simpler + robust: collect a bounded buffer and drain.
  const readable = openStream(job);

  await new Promise((resolve, reject) => {
    const pending = [];
    let streamEnded = false;
    let failed = false;
    // Single serial worker chain: exactly one row is in flight at a time. We only
    // (re)start the chain when it's idle (`chain === null`), so there's no
    // re-entrancy and dup-in-file rows are applied strictly in arrival order.
    let chain = null;

    function maybeResolve() {
      if (!chain && streamEnded && pending.length === 0 && !failed) resolve();
    }

    function kick() {
      if (chain || failed) return;
      chain = (async () => {
        while (pending.length) {
          await processRow(pending.shift());
        }
      })()
        .then(() => {
          chain = null;
          if (pending.length) kick();
          else maybeResolve();
        })
        .catch((err) => {
          failed = true;
          reject(err);
        });
    }

    async function processRow(cells) {
      rowNum += 1;
      deltas.processedRows += 1;

      const mapped = applyMapping(cells, mapping);
      const email = normalizeEmail(mapped.email);

      // Invalid / missing email → skip + record.
      if (!email || !EMAIL_RE.test(email)) {
        deltas.skippedInvalid += 1;
        if (errors.length < MAX_ERRORS) {
          errors.push({ row: rowNum, email: mapped.email || "", reason: "invalid_email", raw: cells });
        }
        if (deltas.processedRows % FLUSH_EVERY === 0) await flushCounters(importJobId, deltas);
        return;
      }

      // Suppression → skip (do NOT re-import a suppressed address; F-07).
      if (await isSuppressed(org, email)) {
        deltas.skippedSuppressed += 1;
        if (errors.length < MAX_ERRORS) {
          errors.push({ row: rowNum, email, reason: "suppressed", raw: cells });
        }
        if (deltas.processedRows % FLUSH_EVERY === 0) await flushCounters(importJobId, deltas);
        return;
      }

      // Clean custom fields against the registry (coerce + drop unknown).
      const { cleaned } = validateCustomFields(mapped.customFields || {}, registry);

      const dupInFile = seenInFile.has(email);
      // Reuse the in-memory object from an earlier dup-in-file row; otherwise
      // look up a pre-existing contact in the DB.
      const existing = dupInFile
        ? seenInFile.get(email)
        : await findContactByEmail(org, email);
      let contact;

      if (existing) {
        contact = existing;
        if (contact.get("deleted") === true) contact.set("deleted", false);
        // Merge custom fields rather than clobber; keep existing status (F-07).
        contact.set("customFields", { ...(contact.get("customFields") || {}), ...cleaned });
      } else {
        contact = new Contact();
        contact.set("email", email);
        contact.set("status", "subscribed");
        contact.set("customFields", cleaned);
        // Stamp the tenant explicitly. The worker saves with the master key and
        // no request.user, so the tenancy beforeSave can't infer the org — its
        // master-key path returns early WITHOUT setting organization or the
        // org-role ACL (see server/cloud/tenantHooks.js). Setting organization
        // here makes beforeSave stamp the matching ACL, so imported contacts are
        // both org-scoped and readable by the org's members. Without this, the
        // contacts save but listContacts (org-filtered, ACL-enforced) can't see
        // them — the list shows "No contacts yet" even though the count is right.
        contact.set("organization", org);
      }

      // Standard string fields: set when provided (last-write-wins on dup-in-file).
      for (const f of STD_STRING_FIELDS) {
        if (mapped[f] != null) contact.set(f, String(mapped[f]));
      }

      // Append the target list to membership (dedup).
      const lists = new Set(contact.get("lists") || []);
      lists.add(listId);
      contact.set("lists", Array.from(lists));

      // Consent (F-29): stamp { source, capturedAt, importJobId } on new contacts.
      // Don't overwrite a richer existing consent record on update.
      if (consent && consent.source && !contact.get("consent")) {
        contact.set("consent", {
          source: consent.source,
          ...(consent.detail ? { detail: consent.detail } : {}),
          capturedAt: new Date().toISOString(),
          importJobId,
        });
      }

      await contact.save(null, MK);

      // Counter accounting. A duplicate-within-file row reuses an object from
      // `seenInFile` (existing truthy) and so counts as an update, not a create.
      if (existing) deltas.updated += 1;
      else deltas.created += 1;
      seenInFile.set(email, contact);

      if (deltas.processedRows % FLUSH_EVERY === 0) await flushCounters(importJobId, deltas);
    }

    parseCsvStream(
      readable,
      { hasHeader },
      (cells) => {
        pending.push(cells);
        kick();
      },
      () => {
        streamEnded = true;
        maybeResolve();
        kick();
      },
      (err) => {
        failed = true;
        reject(err);
      },
    );
  });

  // Final counter flush + mark done. Reconcile the list count.
  await flushCounters(importJobId, deltas);

  // Persist captured errors + finalize.
  const finalJob = await new Parse.Query("ImportJob").get(importJobId, MK);
  finalJob.set("errors", errors);
  finalJob.set("status", "done");
  finalJob.set("finishedAt", new Date());
  await finalJob.save(null, MK);

  await recomputeListCount(listId);

  return {
    created: finalJob.get("created") || 0,
    updated: finalJob.get("updated") || 0,
    skippedInvalid: finalJob.get("skippedInvalid") || 0,
    skippedSuppressed: finalJob.get("skippedSuppressed") || 0,
    processedRows: finalJob.get("processedRows") || 0,
  };
}

// Reconcile List.contactCount (mirror of the contacts.js afterSave logic; the
// afterSave hook also fires per Contact save, but recomputing once at the end is
// cheap insurance + keeps the count correct even if a row's afterSave raced).
async function recomputeListCount(listId) {
  if (!listId) return;
  const q = new Parse.Query("Contact");
  q.equalTo("lists", listId);
  q.notEqualTo("deleted", true);
  const count = await q.count(MK);
  let list;
  try {
    list = await new Parse.Query("List").get(listId, MK);
  } catch (_) {
    return;
  }
  list.set("contactCount", count);
  await list.save(null, MK);
}

// Helper exported for tests: build a Readable from a CSV string.
function streamFromString(csv) {
  return Readable.from([csv]);
}

function register(agenda) {
  agenda.define(IMPORT_CSV, { concurrency: 2, lockLifetime: 10 * 60 * 1000 }, (job) =>
    handle(job.attrs.data),
  );
}

module.exports = { register, handle, IMPORT_CSV, applyMapping, streamFromString };
