// ─────────────────────────────────────────────────────────────────────────────
// Custom-field shared validation + coercion helpers. CommonJS (server side).
//
// THIS IS THE SHARED CONTRACT for the per-org custom-field registry. Three
// consumers import from here, so the signatures below are load-bearing — do not
// change them without updating all three:
//
//   1. contacts.js   → calls `validateCustomFields(contact.customFields, registry)`
//                       to clean a contact's custom data before save (drop unknown
//                       keys, coerce known ones to their declared type).
//   2. segments.js   → uses FIELD_TYPES + coerceValue to validate/normalize the
//                       right-hand side of a segment rule against a field's type.
//   3. the editor    → uses the registry (key/label/type) to offer merge-tags.
//
// A "registry" everywhere in this file means the org's CustomField definitions as
// an array of plain objects:
//     [{ key, label, type, enumValues?, required?, order? }, ...]
// (exactly the shape customFields.js cloud functions return). Only `key` and
// `type` are consulted for coercion; `enumValues` is consulted for enum fields.
//
// There is a matching frontend mirror of FIELD_TYPES + the CustomField shape in
// composables/app/useCustomFields.ts — keep the two in sync.
// ─────────────────────────────────────────────────────────────────────────────

// The closed set of supported data-point types. Order is the UI display order.
//   text    → arbitrary string
//   number  → JS Number (finite)
//   date    → stored as an ISO-8601 string (UTC)
//   boolean → true/false
//   enum    → a string constrained to the field's `enumValues`
const FIELD_TYPES = ["text", "number", "date", "boolean", "enum"];

// ── slugifyKey ────────────────────────────────────────────────────────────────
// Turn a human label into a stable storage key: lowercase, alphanumerics and
// underscores only, runs of other chars collapse to a single underscore, no
// leading/trailing underscores.
//
//   "Plan Tier"        → "plan_tier"
//   "  Lifetime $$$ "  → "lifetime"
//   "Customer-ID #2"   → "customer_id_2"
//
// Returns "" for input that has no alphanumeric content; callers (createCustomField)
// must treat "" as invalid.
function slugifyKey(label) {
  return String(label == null ? "" : label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_") // any non-alphanumeric run → single underscore
    .replace(/^_+|_+$/g, ""); // strip leading/trailing underscores
}

// ── coerceValue ───────────────────────────────────────────────────────────────
// Coerce a single raw value to a field's declared type.
//
//   coerceValue(type, raw, enumValues?) → { ok, value, error }
//
//   - ok=true  → `value` is the coerced value (correct JS type for storage).
//   - ok=false → `error` is a short human string explaining why; `value` is null.
//
// null/undefined raw is treated as "no value" and passes through as
// { ok:true, value:null } for every type (required-ness is enforced elsewhere,
// at the field-registry level, not here).
//
// Type rules:
//   text    → String(raw)
//   number  → Number(raw); rejects NaN / non-finite (e.g. "" or "abc")
//   date    → accepts a Date or a date-parseable string; stored as ISO string
//   boolean → true for true/"true"/1/"1"/"yes"; false for false/"false"/0/"0"/"no";
//             anything else is an error (we don't silently coerce "maybe"→false)
//   enum    → must be a string present in `enumValues` (case-sensitive), else error
function coerceValue(type, raw, enumValues) {
  if (raw === null || raw === undefined || raw === "") {
    // Empty string is "no value" too — an empty text/number/date field is null.
    return { ok: true, value: null, error: null };
  }

  switch (type) {
    case "text":
      return { ok: true, value: String(raw), error: null };

    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, value: null, error: `"${raw}" is not a number.` };
      }
      return { ok: true, value: n, error: null };
    }

    case "date": {
      const d = raw instanceof Date ? raw : new Date(raw);
      if (isNaN(d.getTime())) {
        return { ok: false, value: null, error: `"${raw}" is not a valid date.` };
      }
      return { ok: true, value: d.toISOString(), error: null };
    }

    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw, error: null };
      const s = String(raw).trim().toLowerCase();
      if (["true", "1", "yes"].includes(s)) {
        return { ok: true, value: true, error: null };
      }
      if (["false", "0", "no"].includes(s)) {
        return { ok: true, value: false, error: null };
      }
      return { ok: false, value: null, error: `"${raw}" is not a boolean.` };
    }

    case "enum": {
      const allowed = Array.isArray(enumValues) ? enumValues : [];
      const s = String(raw);
      if (!allowed.includes(s)) {
        return {
          ok: false,
          value: null,
          error: `"${s}" is not one of: ${allowed.join(", ") || "(no values)"}.`,
        };
      }
      return { ok: true, value: s, error: null };
    }

    default:
      return { ok: false, value: null, error: `Unknown field type "${type}".` };
  }
}

// ── validateCustomFields ────────────────────────────────────────────────────--
// Clean a `{ key: value }` map against the org's CustomField registry.
//
//   validateCustomFields(obj, registry) → { cleaned, errors }
//
//   - `obj`      : the raw customFields map off a contact (may be null/undefined).
//   - `registry` : the org's CustomField definitions (array of plain objects;
//                  see the "registry" note at the top of this file).
//
//   - `cleaned`  : a new `{ key: coercedValue }` map containing ONLY known keys
//                  whose value coerced successfully (and is non-null). Safe to
//                  store directly on Contact.customFields.
//   - `errors`   : a `{ key: reason }` map for every key that was either
//                    (a) unknown (not in the registry), or
//                    (b) failed coercion to its declared type.
//
// This NEVER throws — it returns the errors so the caller can decide whether to
// reject the whole save or accept the cleaned subset. contacts.* uses it to clean
// a contact's customFields before save.
function validateCustomFields(obj, registry) {
  const cleaned = {};
  const errors = {};

  const map = obj && typeof obj === "object" ? obj : {};
  // Index the registry by key for O(1) lookup.
  const byKey = Object.create(null);
  for (const def of Array.isArray(registry) ? registry : []) {
    if (def && def.key) byKey[def.key] = def;
  }

  for (const key of Object.keys(map)) {
    const def = byKey[key];
    if (!def) {
      // Unknown data point: not in the registry. Dropped (not added to cleaned),
      // reported in errors. Does NOT throw.
      errors[key] = "Unknown custom field (not in the registry).";
      continue;
    }
    const { ok, value, error } = coerceValue(def.type, map[key], def.enumValues);
    if (!ok) {
      errors[key] = error;
      continue;
    }
    // Only persist non-null values; a coerced-to-null (empty) value is simply
    // omitted from the cleaned map.
    if (value !== null) cleaned[key] = value;
  }

  return { cleaned, errors };
}

module.exports = {
  FIELD_TYPES,
  slugifyKey,
  coerceValue,
  validateCustomFields,
};
