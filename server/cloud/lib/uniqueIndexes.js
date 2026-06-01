// ─────────────────────────────────────────────────────────────────────────────
// Unique-index enforcement. CommonJS. Runs at boot AFTER bootstrapSchemas().
//
// WHY THIS EXISTS: Parse's `Parse.Schema.addIndex(name, spec)` only ever creates
// NON-unique Mongo indexes — the JS schema API has no unique flag. So every index
// bootstrapSchemas names `*_unique` was, in fact, not unique, and the duplicate-
// send / duplicate-contact / suppression-dedupe backstops were illusory (a
// retried or concurrent campaignFanout could email the same contact twice; the
// `DUPLICATE_VALUE` catch in fanout could never fire). This module creates the
// real unique constraints directly via the Mongo driver.
//
// KEY DETAILS:
//   - Mongo field names: Parse stores a Pointer field `foo` as `_p_foo` (value
//     "<ClassName>$<objectId>"), and plain fields under their own name. The keys
//     below are written in MONGO terms (see P() for pointers).
//   - We REUSE the exact index names bootstrapSchemas already registered. Parse
//     checks index existence by name, so a same-named index it finds in Mongo is
//     left untouched — meaning Parse won't fight us by recreating a non-unique
//     twin on the next boot.
//   - MIGRATION: a DB that already ran the old bootstrap has a NON-unique index
//     under that name (or an auto-named twin on the same keys). We detect and
//     DROP the stale one, then recreate it unique. Idempotent: a run against an
//     already-unique index is a no-op.
//   - DUPLICATE DATA: building a unique index on a collection that already holds
//     duplicates fails with E11000. We do NOT crash boot — we log LOUDLY naming
//     the collection + keys so an operator can dedupe and re-run. (No index gets
//     created in that case, i.e. no regression vs. the prior non-unique state.)
//   - `sesMessageId` is SPARSE (null until a row is actually sent — many nulls
//     would otherwise collide). `conversion` is PARTIAL on orderId presence
//     (manual/pixel conversions may have no orderId and must not be forced
//     unique).
// ─────────────────────────────────────────────────────────────────────────────

// Pointer field → its Mongo column name.
const P = (field) => `_p_${field}`;

// className === Mongo collection name for Parse app classes.
const UNIQUE_INDEXES = [
  { collection: "Organization", name: "org_slug_unique", keys: { slug: 1 } },
  { collection: "Contact", name: "contact_org_email_unique", keys: { [P("organization")]: 1, email: 1 } },
  { collection: "CustomField", name: "customfield_org_key_unique", keys: { [P("organization")]: 1, key: 1 } },
  // THE duplicate-send protection: one CampaignSend per (campaign, contact).
  { collection: "CampaignSend", name: "send_campaign_contact_unique", keys: { [P("campaign")]: 1, [P("contact")]: 1 } },
  { collection: "CampaignSend", name: "send_ses_message_id_unique", keys: { sesMessageId: 1 }, options: { sparse: true } },
  { collection: "Suppression", name: "suppression_org_email_unique", keys: { [P("organization")]: 1, email: 1 } },
  { collection: "SendingDomain", name: "sendingdomain_org_domain_unique", keys: { [P("organization")]: 1, domain: 1 } },
  { collection: "ApiKey", name: "apikey_prefix_unique", keys: { keyPrefix: 1 } },
  { collection: "StoreConnection", name: "store_org_provider_domain_unique", keys: { [P("organization")]: 1, provider: 1, shopDomain: 1 } },
  {
    collection: "Conversion",
    name: "conversion_org_order_source_unique",
    keys: { [P("organization")]: 1, orderId: 1, sourceType: 1 },
    // Only enforce uniqueness for conversions that carry an order id (webhook
    // idempotency). Manual/pixel conversions without one are not constrained.
    options: { partialFilterExpression: { orderId: { $exists: true } } },
  },
];

function sameKeyPattern(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k, i) => bk[i] === k && a[k] === b[k]);
}

function isDuplicateKeyError(err) {
  return !!err && (err.code === 11000 || /E11000|duplicate key/i.test(err.message || ""));
}

// Ensure ONE unique index on an already-connected Mongo `db`. Returns a status
// string: "exists" | "created" | "migrated" | "duplicate-data".
async function ensureOne(db, spec, log) {
  const coll = db.collection(spec.collection);
  const options = { name: spec.name, unique: true, background: true, ...(spec.options || {}) };

  // listIndexes throws on a not-yet-existent collection — treat as "none".
  let existing = [];
  try {
    existing = await coll.indexes();
  } catch (_) {
    existing = [];
  }

  const byName = existing.find((i) => i.name === spec.name);
  if (byName) {
    if (byName.unique && sameKeyPattern(byName.key, spec.keys)) return "exists";
    // Stale non-unique (or wrong-key) index under our name → drop + recreate.
    await coll.dropIndex(spec.name);
  }
  // A differently-named, non-unique twin on the same keys (e.g. a Mongo
  // auto-named index) would cause an IndexOptionsConflict — drop it too.
  const twin = existing.find(
    (i) => i.name !== spec.name && !i.unique && sameKeyPattern(i.key, spec.keys),
  );
  if (twin) await coll.dropIndex(twin.name);

  try {
    await coll.createIndex(spec.keys, options);
    return byName || twin ? "migrated" : "created";
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      log(
        `[uniqueIndexes] DUPLICATE DATA in ${spec.collection}: cannot build ${spec.name} ` +
          `over ${JSON.stringify(spec.keys)}. Dedupe the collection and re-run — ` +
          `uniqueness is NOT enforced until you do.`,
      );
      return "duplicate-data";
    }
    throw err;
  }
}

// Core: apply every unique index against an already-connected `db`. Returns a
// { name: status } report. Per-index failures are logged, not thrown, so one bad
// collection never blocks the rest. Exposed for tests (pass an in-memory db).
async function ensureUniqueIndexesOnDb(db, log = console.warn) {
  const report = {};
  for (const spec of UNIQUE_INDEXES) {
    try {
      report[spec.name] = await ensureOne(db, spec, log);
    } catch (err) {
      report[spec.name] = "error";
      log(`[uniqueIndexes] ${spec.name}: ${(err && err.message) || err}`);
    }
  }
  return report;
}

// Boot entry point: connect with the same URI Parse uses, apply, disconnect.
async function ensureUniqueIndexes() {
  const { MongoClient } = require("mongodb");
  const uri = process.env.PARSE_DATABASE_URI || "mongodb://localhost:27017/gorilla";
  const client = new MongoClient(uri);
  try {
    await client.connect();
    return await ensureUniqueIndexesOnDb(client.db());
  } finally {
    await client.close().catch(() => {});
  }
}

module.exports = { ensureUniqueIndexes, ensureUniqueIndexesOnDb, UNIQUE_INDEXES };
