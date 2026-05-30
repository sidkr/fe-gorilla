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
const { FIELD_TYPES } = require("./lib/customFields");

// ── Rule DSL ────────────────────────────────────────────────────────────────
//
// MVP shape (Architecture.md §5.1): a SINGLE top-level operator group.
//
//   { op: "and" | "or", conditions: [ { field, operator, value }, ... ] }
//
// Fields:
//   - top-level Contact std fields: email, status, firstName, lastName,
//     company, phone, city, country, timezone (text), subscribedAt,
//     unsubscribedAt, createdAt (date)
//   - tags (Array)             → membership operators contains/not_contains
//   - dotted custom fields:    customFields.<key>
//
// Field types drive the allowed operator set. Top-level text fields are "text".
// Custom field types are resolved from the org's CustomField REGISTRY when one
// is supplied to compileRules (the registry is the authoritative source of a
// field's type). When no registry is available (e.g. a unit-level compile call
// without an org context), we fall back to inferring the type from the leaf's
// `value`. The operator validation below is the real guard either way.

const TOP_LEVEL_FIELDS = {
  email: "text",
  status: "text",
  firstName: "text",
  lastName: "text",
  // Std rich contact fields (added with the contact rich-field work).
  company: "text",
  phone: "text",
  city: "text",
  country: "text",
  timezone: "text",
  // Date-typed top-level fields (Architecture.md §5.1 uses subscribedAt as the
  // canonical date example; createdAt is Parse's built-in timestamp).
  subscribedAt: "date",
  unsubscribedAt: "date",
  createdAt: "date",
};

// `tags` is an Array<string> on Contact. Mongo matches equalTo/notEqualTo on an
// array as element membership, so we model it as a dedicated "tags" type with
// just membership operators.
const TAGS_FIELD = "tags";

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
  // enum custom fields behave like a constrained text field for filtering.
  enum: ["eq", "neq", "in", "not_in", "is_empty", "is_not_empty"],
  // Array membership — contains/not_contains test for an element in the array.
  tags: ["contains", "not_contains", "is_empty", "is_not_empty"],
};

const DATE_OPERATORS = new Set(["before", "after", "between", "last_n_days"]);

function badRequest(message) {
  return new Parse.Error(Parse.Error.INVALID_QUERY, message);
}

// Resolve `field` → { path, type, custom }.
//
// `registry` (optional) is the org's CustomField definitions as plain objects
// [{ key, type, ... }]. When present, a customFields.<key> path's type is taken
// from the registry (and an unknown key is rejected). When absent, the custom
// field's type is inferred from the leaf value at applyLeaf time.
function fieldInfo(field, registry) {
  if (typeof field !== "string" || !field) {
    throw badRequest(`Condition is missing a "field".`);
  }
  if (field === TAGS_FIELD) {
    return { path: TAGS_FIELD, type: "tags", custom: false };
  }
  if (Object.prototype.hasOwnProperty.call(TOP_LEVEL_FIELDS, field)) {
    return { path: field, type: TOP_LEVEL_FIELDS[field], custom: false };
  }
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    if (!key || key.includes(".")) {
      throw badRequest(`Invalid custom field path "${field}".`);
    }
    // Registry available → resolve (and require) the declared type.
    if (registry) {
      const def = registry[key];
      if (!def) {
        throw badRequest(
          `Custom field "${key}" is not defined in this org's registry.`,
        );
      }
      const type = FIELD_TYPES.includes(def.type) ? def.type : "text";
      return { path: field, type, custom: true, def };
    }
    return { path: field, type: null, custom: true };
  }
  throw badRequest(`Field "${field}" is not allowed in a segment rule.`);
}

// Infer the value type for a custom-field leaf when no registry type is known.
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
//
// `registry` (optional) is a { key -> CustomFieldDef } map; when present the
// custom field's type comes from the registry rather than value-inference.
function applyLeaf(query, condition, registry) {
  const { field, operator, value } = condition || {};
  const info = fieldInfo(field, registry);
  // Type resolution: top-level/tags are fixed; custom fields use the registry
  // type when known, else inference from the value.
  const type = info.type != null ? info.type : inferType(operator, value);
  const allowed = OPERATORS_BY_TYPE[type] || [];
  if (!allowed.includes(operator)) {
    throw badRequest(
      `Operator "${operator}" is not valid for ${type} field "${field}".`,
    );
  }
  const path = info.path;

  // For a registry-backed date custom field, the stored value is an ISO string;
  // date operators still work via lexicographic compare on ISO strings, but to
  // keep semantics identical to top-level Date fields we coerce date operands to
  // ISO strings below (in toOperand) when the field is a stored-ISO date.
  const isoDate = type === "date" && info.custom === true;

  // tags membership: contains/not_contains compile to equalTo/notEqualTo on the
  // array field — Mongo treats that as "array contains this element".
  if (type === "tags") {
    switch (operator) {
      case "contains":
        query.equalTo(path, value);
        return;
      case "not_contains":
        query.notEqualTo(path, value);
        return;
      case "is_empty":
        // "No tags" → the tags key is unset (the common case: contacts without
        // tags simply don't carry the array). Mirrors text is_empty semantics.
        query.doesNotExist(path);
        return;
      case "is_not_empty":
        // Has at least one tag → the array key exists.
        query.exists(path);
        return;
      default:
        throw badRequest(`Unhandled tags operator "${operator}".`);
    }
  }

  // Coerce a date operand for a stored-ISO custom date field to an ISO string so
  // the comparison aligns with how the value is stored.
  const dateOperand = (v, label) => (isoDate ? toDate(v, label).toISOString() : toDate(v, label));

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
      query.lessThan(path, dateOperand(value, "before"));
      break;
    case "after":
      query.greaterThan(path, dateOperand(value, "after"));
      break;
    case "between": {
      const arr = asArray(value);
      if (arr.length !== 2) {
        throw badRequest(`"between" expects a [start, end] pair.`);
      }
      query.greaterThanOrEqualTo(path, dateOperand(arr[0], "between.start"));
      query.lessThanOrEqualTo(path, dateOperand(arr[1], "between.end"));
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
      query.greaterThanOrEqualTo(path, isoDate ? cutoff.toISOString() : cutoff);
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

// Load the org's CustomField registry as a { key -> { key, type, enumValues } }
// map for type-resolving customFields.<key> rule leaves. Master key: this is
// definition metadata, the compiled Contact query is what enforces tenancy.
async function loadRegistry(org) {
  const rows = await new Parse.Query("CustomField")
    .equalTo("organization", org)
    .limit(1000)
    .find({ useMasterKey: true });
  const map = Object.create(null);
  for (const r of rows) {
    const key = r.get("key");
    if (key) {
      map[key] = {
        key,
        type: r.get("type") || "text",
        enumValues: r.get("enumValues") || [],
      };
    }
  }
  return map;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  throw badRequest(`Operator expects an array value, got ${JSON.stringify(value)}.`);
}

// Compile the rule tree → Parse.Query("Contact"), ALWAYS scoped to `org`.
// MVP: a single top-level group of leaf conditions (no nested groups required,
// but a nested group is tolerated by recursing one level via Parse.Query.and/or).
//
// `registry` (optional) is a { key -> CustomFieldDef } map used to resolve and
// validate custom-field types. Pass it whenever an org context is available.
function compileRules(rules, org, registry) {
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
    applyLeaf(q, cond, registry);
    return q;
  };

  // Build one sub-query per condition. A condition is either a leaf
  // {field, operator, value} or a nested {op, conditions} group.
  const subQueries = conditions.map((cond) => {
    if (cond && (cond.op === "and" || cond.op === "or")) {
      // Nested group — recurse (one extra level). Returns a Parse.Query.
      return compileGroup(cond, registry);
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
function compileGroup(group, registry) {
  const op = group.op;
  const conditions = Array.isArray(group.conditions) ? group.conditions : [];
  const subQueries = conditions.map((cond) => {
    if (cond && (cond.op === "and" || cond.op === "or")) return compileGroup(cond, registry);
    const q = new Parse.Query("Contact");
    applyLeaf(q, cond, registry);
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
  const registry = await loadRegistry(org);
  const compiled = compileRules(rules, org, registry);
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

// ── getSegment ───────────────────────────────────────────────────────────────
// Fetch a single segment by id (for the editor page). ACL isolates by session.
Parse.Cloud.define("getSegment", async (request) => {
  await getUserOrg(request.user, { useMasterKey: true });
  const { id } = request.params || {};
  if (!id) throw badRequest("getSegment requires an `id`.");
  const q = new Parse.Query("Segment");
  q.include("list");
  const seg = await q.get(id, {
    sessionToken: request.user.getSessionToken(),
  });
  const out = serializeSegment(seg);
  const listPtr = seg.get("list");
  out.listName = listPtr && listPtr.get ? listPtr.get("name") || null : null;
  return out;
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
    const registry = await loadRegistry(org);
    const compiled = compileRules(rules, org, registry);
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
  const registry = await loadRegistry(org);
  const compiled = compileRules(seg.get("rules"), org, registry);
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
  const registry = await loadRegistry(org);
  const compiled = compileRules(seg.get("rules"), org, registry);
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

// ── resolveSegmentContacts ─────────────────────────────────────────────────
// Resolve a Segment (a Parse Segment object OR a plain object with the same
// shape: { rules, kind, list, staticContacts }) to its matching Contact objects
// for `org`. This is the send-fanout entry point — it lets a campaign target a
// segment instead of a whole list.
//
//   - static segment  → fetch the snapshotted staticContacts (org-scoped).
//   - dynamic segment → compile its rules (+ optional list scope) and find().
//
// Always org-scoped: the static path filters Contacts by `organization`; the
// dynamic path's compiled query already calls `.equalTo("organization", org)`.
//
// opts.subscribedOnly (default true) additionally restricts to subscribed,
// non-deleted, non-unsubscribed contacts so a send never targets unsubscribed/
// cleaned addresses (matches campaignFanout's audience predicate). opts.limit
// caps the result (default 100000, per Architecture §5.3). Uses the master key
// (the org filter + ACL isolate the tenant).
async function resolveSegmentContacts(segment, org, opts = {}) {
  if (!segment) throw badRequest("resolveSegmentContacts requires a segment.");
  if (!org) throw badRequest("resolveSegmentContacts requires an org.");

  const subscribedOnly = opts.subscribedOnly !== false;
  const limit = Number.isFinite(opts.limit) ? opts.limit : 100000;

  // Field accessor that works for both a Parse object and a plain object.
  const read = (key) =>
    typeof segment.get === "function" ? segment.get(key) : segment[key];

  const kind = read("kind") || "dynamic";

  const applySubscribed = (q) => {
    if (!subscribedOnly) return;
    q.equalTo("status", "subscribed");
    q.notEqualTo("deleted", true);
    q.notEqualTo("unsubscribed", true);
  };

  // ── static: the snapshot IS the answer. ──────────────────────────────────
  if (kind === "static") {
    const ptrs = read("staticContacts") || [];
    const ids = ptrs
      .map((p) => (p && p.id ? p.id : typeof p === "string" ? p : null))
      .filter(Boolean);
    if (!ids.length) return [];
    const out = [];
    const CHUNK = 1000; // bound containedIn by index size
    for (let i = 0; i < ids.length && out.length < limit; i += CHUNK) {
      const q = new Parse.Query("Contact");
      q.equalTo("organization", org);
      q.containedIn("objectId", ids.slice(i, i + CHUNK));
      applySubscribed(q);
      q.limit(CHUNK);
      const rows = await q.find({ useMasterKey: true });
      for (const r of rows) {
        out.push(r);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // ── dynamic: compile the rule tree → Contact query. ──────────────────────
  const registry = await loadRegistry(org);
  const compiled = compileRules(read("rules"), org, registry);

  // Optional list scope (a segment may be constrained to one list).
  const listVal = read("list");
  if (listVal) {
    const listPtr =
      listVal && listVal.id
        ? listVal
        : typeof listVal === "string"
          ? listPointerFrom(listVal)
          : null;
    if (listPtr) compiled.equalTo("lists", listPtr);
  }

  applySubscribed(compiled);
  compiled.limit(limit);
  return compiled.find({ useMasterKey: true });
}

// Exported: the compiler/applyLeaf for unit tests, and resolveSegmentContacts
// for the send fanout's segment-targeting path.
module.exports = { compileRules, applyLeaf, resolveSegmentContacts };
