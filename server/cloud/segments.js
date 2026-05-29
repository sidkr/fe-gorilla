// ─────────────────────────────────────────────────────────────────────────────
// Cloud functions for Segment — a saved rule tree that filters Contacts.
// CommonJS (server/package.json is "type":"commonjs"). See Architecture.md §5.
//
// A Segment persists a rule tree (JSON) which we COMPILE to a Parse.Query
// against `Contact`, always scoped to the caller's org. Two kinds:
//   - "dynamic": store rules only; re-evaluated on demand / at send time.
//   - "static":  snapshot matching contact ids into `staticContacts` at save.
//
// Cloud functions:
//   createSegment({ name, list?, kind, rules })          → { id, ...segment }
//   listSegments()                                       → [{ id, name, ... }]
//   evaluateSegment({ rules | id, preview? })            → { count, sample }
//   updateSegment({ id, name?, list?, kind?, rules? })   → { id, ...segment }
//   deleteSegment({ id })                                → { ok: true }
//
// Tenancy: the org pointer + ACL are stamped automatically by tenantHooks.js on
// new objects. We never set them manually. We DO add an explicit
// `.equalTo("organization", org)` to compiled queries as a second line of
// defence + index locality (ACL is the real boundary).
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg } = require("./lib/tenancy");

// ── Rule DSL ────────────────────────────────────────────────────────────────
//
// MVP shape (Architecture.md §5.1): a SINGLE top-level operator group.
//
//   { op: "and" | "or", conditions: [ { field, operator, value }, ... ] }
//
// Fields:
//   - top-level Contact fields: email, status, firstName, lastName
//   - dotted custom fields:     customFields.<key>
//
// Field types drive the allowed operator set. Top-level text fields are "text".
// Custom field types are inferred from the leaf's `value` at compile time
// (string→text, number→number, boolean→boolean, ISO-date string with a date
// operator→date). This keeps the MVP self-contained without a CustomField
// registry lookup; the operator validation below is the real guard.

const TOP_LEVEL_FIELDS = {
  email: "text",
  status: "text",
  firstName: "text",
  lastName: "text",
  // Date-typed top-level fields (Architecture.md §5.1 uses subscribedAt as the
  // canonical date example; createdAt is Parse's built-in timestamp).
  subscribedAt: "date",
  unsubscribedAt: "date",
  createdAt: "date",
};

const OPERATORS_BY_TYPE = {
  text: [
    "eq",
    "neq",
    "contains",
    "starts_with",
    "ends_with",
    "is_empty",
    "is_not_empty",
    // membership — also serves the "enum" case (Architecture.md §5.1)
    "in",
    "not_in",
  ],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in"],
  date: ["before", "after", "between", "last_n_days"],
  boolean: ["eq"],
};

const DATE_OPERATORS = new Set(["before", "after", "between", "last_n_days"]);

function badRequest(message) {
  return new Parse.Error(Parse.Error.INVALID_QUERY, message);
}

// Is `field` a permitted path? Top-level whitelist OR a customFields.<key> path.
function fieldInfo(field) {
  if (typeof field !== "string" || !field) {
    throw badRequest(`Condition is missing a "field".`);
  }
  if (Object.prototype.hasOwnProperty.call(TOP_LEVEL_FIELDS, field)) {
    return { path: field, type: TOP_LEVEL_FIELDS[field], custom: false };
  }
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    if (!key || key.includes(".")) {
      throw badRequest(`Invalid custom field path "${field}".`);
    }
    return { path: field, type: null, custom: true };
  }
  throw badRequest(`Field "${field}" is not allowed in a segment rule.`);
}

// Infer the value type for a custom-field leaf (top-level fields are fixed-type).
function inferType(operator, value) {
  if (DATE_OPERATORS.has(operator)) return "date";
  // For in/not_in the value is an array; infer from its first element.
  const probe = Array.isArray(value) ? value[0] : value;
  if (typeof probe === "number") return "number";
  if (typeof probe === "boolean") return "boolean";
  return "text";
}

// Parse a date-ish value (ISO string or epoch ms) into a JS Date.
function toDate(value, label) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw badRequest(`${label} expects a valid date, got ${JSON.stringify(value)}.`);
  }
  return d;
}

// Apply a single leaf condition to a Parse.Query.
function applyLeaf(query, condition) {
  const { field, operator, value } = condition || {};
  const info = fieldInfo(field);
  const type = info.custom ? inferType(operator, value) : info.type;
  const allowed = OPERATORS_BY_TYPE[type] || [];
  if (!allowed.includes(operator)) {
    throw badRequest(
      `Operator "${operator}" is not valid for ${type} field "${field}".`,
    );
  }
  const path = info.path;

  switch (operator) {
    // text
    case "eq":
      query.equalTo(path, value);
      break;
    case "neq":
      query.notEqualTo(path, value);
      break;
    case "contains":
      // Anchored substring match. Escape regex metachars in the value.
      query.matches(path, escapeRegex(String(value)), "i");
      break;
    case "starts_with":
      query.matches(path, "^" + escapeRegex(String(value)), "i");
      break;
    case "ends_with":
      query.matches(path, escapeRegex(String(value)) + "$", "i");
      break;
    case "is_empty":
      // The key is unset / null. (Empty-string vs missing is a known MVP
      // simplification — we treat "empty" as "no value present".)
      query.doesNotExist(path);
      break;
    case "is_not_empty":
      query.exists(path);
      query.notEqualTo(path, "");
      break;

    // number
    case "gt":
      query.greaterThan(path, value);
      break;
    case "gte":
      query.greaterThanOrEqualTo(path, value);
      break;
    case "lt":
      query.lessThan(path, value);
      break;
    case "lte":
      query.lessThanOrEqualTo(path, value);
      break;
    case "in":
      query.containedIn(path, asArray(value));
      break;
    case "not_in":
      query.notContainedIn(path, asArray(value));
      break;

    // date
    case "before":
      query.lessThan(path, toDate(value, "before"));
      break;
    case "after":
      query.greaterThan(path, toDate(value, "after"));
      break;
    case "between": {
      const arr = asArray(value);
      if (arr.length !== 2) {
        throw badRequest(`"between" expects a [start, end] pair.`);
      }
      query.greaterThanOrEqualTo(path, toDate(arr[0], "between.start"));
      query.lessThanOrEqualTo(path, toDate(arr[1], "between.end"));
      break;
    }
    case "last_n_days": {
      // Compile to an ABSOLUTE gte timestamp so eval and send-time agree.
      // (Letting Mongo see "now" relative to its own clock breaks determinism.)
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw badRequest(`"last_n_days" expects a positive number of days.`);
      }
      const cutoff = new Date(Date.now() - n * 86400000);
      query.greaterThanOrEqualTo(path, cutoff);
      break;
    }

    // boolean
    // (eq handled above)

    default:
      throw badRequest(`Unhandled operator "${operator}".`);
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  throw badRequest(`Operator expects an array value, got ${JSON.stringify(value)}.`);
}

// Compile the rule tree → Parse.Query("Contact"), ALWAYS scoped to `org`.
// MVP: a single top-level group of leaf conditions (no nested groups required,
// but a nested group is tolerated by recursing one level via Parse.Query.and/or).
function compileRules(rules, org) {
  if (!rules || typeof rules !== "object") {
    throw badRequest("rules must be an object { op, conditions }.");
  }
  const op = rules.op;
  if (op !== "and" && op !== "or") {
    throw badRequest(`rules.op must be "and" or "or", got ${JSON.stringify(op)}.`);
  }
  const conditions = rules.conditions;
  if (!Array.isArray(conditions)) {
    throw badRequest("rules.conditions must be an array.");
  }

  const buildLeafQuery = (cond) => {
    const q = new Parse.Query("Contact");
    applyLeaf(q, cond);
    return q;
  };

  // Build one sub-query per condition. A condition is either a leaf
  // {field, operator, value} or a nested {op, conditions} group.
  const subQueries = conditions.map((cond) => {
    if (cond && (cond.op === "and" || cond.op === "or")) {
      // Nested group — recurse (one extra level). Returns a Parse.Query.
      return compileGroup(cond);
    }
    return buildLeafQuery(cond);
  });

  let compiled;
  if (subQueries.length === 0) {
    // Empty group → match nothing meaningful beyond the org scope. We still
    // return a plain Contact query so the org filter applies and count works.
    compiled = new Parse.Query("Contact");
  } else if (subQueries.length === 1) {
    compiled = subQueries[0];
  } else {
    compiled = op === "and"
      ? Parse.Query.and(...subQueries)
      : Parse.Query.or(...subQueries);
  }

  // Tenancy: scope to org at the root. Second line of defence after the ACL.
  compiled.equalTo("organization", org);
  return compiled;
}

// Compile a (possibly nested) group WITHOUT the org scope — used for sub-groups
// inside an and/or. Org scope is applied once at the root in compileRules.
function compileGroup(group) {
  const op = group.op;
  const conditions = Array.isArray(group.conditions) ? group.conditions : [];
  const subQueries = conditions.map((cond) => {
    if (cond && (cond.op === "and" || cond.op === "or")) return compileGroup(cond);
    const q = new Parse.Query("Contact");
    applyLeaf(q, cond);
    return q;
  });
  if (subQueries.length === 0) return new Parse.Query("Contact");
  if (subQueries.length === 1) return subQueries[0];
  return op === "and"
    ? Parse.Query.and(...subQueries)
    : Parse.Query.or(...subQueries);
}

// ── serialization ─────────────────────────────────────────────────────────────

function listPointerFrom(listId) {
  if (!listId) return null;
  const List = Parse.Object.extend("List");
  return List.createWithoutData(listId);
}

// Plain-object shape returned to the client for a Segment.
function serializeSegment(seg) {
  const listPtr = seg.get("list");
  return {
    id: seg.id,
    name: seg.get("name"),
    list: listPtr ? listPtr.id : null,
    kind: seg.get("kind"),
    rules: seg.get("rules") || null,
    staticContacts: (seg.get("staticContacts") || []).map((p) => p.id),
    lastEvaluatedAt: seg.get("lastEvaluatedAt") || null,
    lastCount: seg.get("lastCount") ?? null,
    createdAt: seg.createdAt,
    updatedAt: seg.updatedAt,
  };
}

const SAMPLE_SIZE = 10;

// Run a compiled query → { count, sample }. Sample is a few light contact rows
// for the preview UI. Uses master key (the org filter + ACL already isolate).
async function evaluateQuery(query, opts) {
  const count = await query.count(opts);
  const sampleQuery = Parse.Query.fromJSON("Contact", query.toJSON());
  sampleQuery.limit(SAMPLE_SIZE);
  sampleQuery.select("email", "firstName", "lastName", "status");
  const rows = await sampleQuery.find(opts);
  const sample = rows.map((c) => ({
    id: c.id,
    email: c.get("email"),
    firstName: c.get("firstName") || null,
    lastName: c.get("lastName") || null,
    status: c.get("status") || null,
  }));
  return { count, sample };
}

// ── createSegment ──────────────────────────────────────────────────────────
Parse.Cloud.define("createSegment", async (request) => {
  const org = await getUserOrg(request.user, { useMasterKey: true });
  const { name, list, kind, rules } = request.params || {};

  if (!name || typeof name !== "string") {
    throw badRequest("name is required.");
  }
  const segKind = kind || "dynamic";
  if (segKind !== "dynamic" && segKind !== "static") {
    throw badRequest(`kind must be "dynamic" or "static", got ${JSON.stringify(kind)}.`);
  }

  // Compile up-front to validate the rule tree before we persist anything.
  const compiled = compileRules(rules, org);
  if (list) compiled.equalTo("lists", listPointerFrom(list));

  const Segment = Parse.Object.extend("Segment");
  const seg = new Segment();
  seg.set("name", name);
  seg.set("kind", segKind);
  seg.set("rules", rules);
  seg.set("list", listPointerFrom(list));

  // Static segments snapshot the matching contact ids at save time.
  if (segKind === "static") {
    const matchQuery = Parse.Query.fromJSON("Contact", compiled.toJSON());
    matchQuery.limit(100000); // §5.3 cap
    matchQuery.select([]); // ids only
    const matches = await matchQuery.find({ useMasterKey: true });
    const Contact = Parse.Object.extend("Contact");
    seg.set(
      "staticContacts",
      matches.map((m) => Contact.createWithoutData(m.id)),
    );
    seg.set("lastCount", matches.length);
    seg.set("lastEvaluatedAt", new Date());
  } else {
    const count = await compiled.count({ useMasterKey: true });
    seg.set("lastCount", count);
    seg.set("lastEvaluatedAt", new Date());
  }

  // org + ACL stamped automatically by tenantHooks.js (save as the caller).
  await seg.save(null, { sessionToken: request.user.getSessionToken() });
  return serializeSegment(seg);
});

// ── listSegments ─────────────────────────────────────────────────────────────
Parse.Cloud.define("listSegments", async (request) => {
  const org = await getUserOrg(request.user, { useMasterKey: true });
  const q = new Parse.Query("Segment");
  q.equalTo("organization", org);
  q.include("list");
  q.descending("createdAt");
  q.limit(1000);
  const rows = await q.find({ sessionToken: request.user.getSessionToken() });
  return rows.map((seg) => {
    const out = serializeSegment(seg);
    const listPtr = seg.get("list");
    out.listName = listPtr && listPtr.get ? listPtr.get("name") || null : null;
    return out;
  });
});

// ── evaluateSegment ────────────────────────────────────────────────────────
// Accepts either an ad-hoc rule tree ({ rules }) for the live editor preview,
// or a saved segment id ({ id }). Returns { count, sample }. When `id` points
// at a saved DYNAMIC segment, the cached lastCount/lastEvaluatedAt are refreshed.
Parse.Cloud.define("evaluateSegment", async (request) => {
  const org = await getUserOrg(request.user, { useMasterKey: true });
  const { id, rules, preview } = request.params || {};
  const opts = { useMasterKey: true };

  if (!id && !rules) {
    throw badRequest("evaluateSegment requires either `rules` or `id`.");
  }

  // Ad-hoc preview path: compile the passed rule tree directly.
  if (rules && !id) {
    const compiled = compileRules(rules, org);
    return evaluateQuery(compiled, opts);
  }

  // Saved-segment path.
  const seg = await new Parse.Query("Segment").get(id, {
    sessionToken: request.user.getSessionToken(),
  });

  // Static segment: the snapshot IS the answer.
  if (seg.get("kind") === "static") {
    const ptrs = seg.get("staticContacts") || [];
    const count = ptrs.length;
    let sample = [];
    if (count > 0) {
      const sampleQ = new Parse.Query("Contact");
      sampleQ.containedIn(
        "objectId",
        ptrs.slice(0, SAMPLE_SIZE).map((p) => p.id),
      );
      sampleQ.equalTo("organization", org);
      sampleQ.select("email", "firstName", "lastName", "status");
      const rows = await sampleQ.find(opts);
      sample = rows.map((c) => ({
        id: c.id,
        email: c.get("email"),
        firstName: c.get("firstName") || null,
        lastName: c.get("lastName") || null,
        status: c.get("status") || null,
      }));
    }
    return { count, sample };
  }

  // Dynamic segment: compile its stored rules and (optionally) refresh cache.
  const compiled = compileRules(seg.get("rules"), org);
  const listPtr = seg.get("list");
  if (listPtr) compiled.equalTo("lists", listPtr);
  const result = await evaluateQuery(compiled, opts);

  if (!preview) {
    seg.set("lastCount", result.count);
    seg.set("lastEvaluatedAt", new Date());
    await seg.save(null, { sessionToken: request.user.getSessionToken() });
  }
  return result;
});

// ── updateSegment ────────────────────────────────────────────────────────────
Parse.Cloud.define("updateSegment", async (request) => {
  const org = await getUserOrg(request.user, { useMasterKey: true });
  const { id, name, list, kind, rules } = request.params || {};
  if (!id) throw badRequest("updateSegment requires an `id`.");

  const sessionToken = request.user.getSessionToken();
  const seg = await new Parse.Query("Segment").get(id, { sessionToken });

  if (typeof name === "string" && name) seg.set("name", name);
  if (kind !== undefined) {
    if (kind !== "dynamic" && kind !== "static") {
      throw badRequest(`kind must be "dynamic" or "static".`);
    }
    seg.set("kind", kind);
  }
  if (list !== undefined) seg.set("list", listPointerFrom(list));
  if (rules !== undefined) seg.set("rules", rules);

  // Recompile + refresh the cached count/snapshot with the effective values.
  const effectiveKind = seg.get("kind");
  const compiled = compileRules(seg.get("rules"), org);
  const effectiveList = seg.get("list");
  if (effectiveList) compiled.equalTo("lists", effectiveList);

  if (effectiveKind === "static") {
    const matchQuery = Parse.Query.fromJSON("Contact", compiled.toJSON());
    matchQuery.limit(100000);
    matchQuery.select([]);
    const matches = await matchQuery.find({ useMasterKey: true });
    const Contact = Parse.Object.extend("Contact");
    seg.set("staticContacts", matches.map((m) => Contact.createWithoutData(m.id)));
    seg.set("lastCount", matches.length);
  } else {
    seg.unset("staticContacts");
    seg.set("lastCount", await compiled.count({ useMasterKey: true }));
  }
  seg.set("lastEvaluatedAt", new Date());

  await seg.save(null, { sessionToken });
  return serializeSegment(seg);
});

// ── deleteSegment ────────────────────────────────────────────────────────────
Parse.Cloud.define("deleteSegment", async (request) => {
  await getUserOrg(request.user, { useMasterKey: true });
  const { id } = request.params || {};
  if (!id) throw badRequest("deleteSegment requires an `id`.");
  const sessionToken = request.user.getSessionToken();
  const seg = await new Parse.Query("Segment").get(id, { sessionToken });
  await seg.destroy({ sessionToken });
  return { ok: true };
});

// Exported for unit-level testing of the compiler if ever needed.
module.exports = { compileRules, applyLeaf };
