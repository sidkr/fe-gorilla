import { ref } from "vue";
import type { CustomField, FieldType } from "~/composables/app/useCustomFields";

// ─────────────────────────────────────────────────────────────────────────────
// Merge tags — personalization tokens the editor can insert into any text
// surface (block text/html, button label, subject, preheader) and resolve
// against a sample contact for the in-editor preview.
//
// THE TAG CONVENTION
// ------------------
//   Standard contact fields:   {{firstName}} {{lastName}} {{email}}
//                              {{company}} {{phone}} {{city}} {{country}}
//                              {{timezone}}
//   Custom fields:             {{custom.<key>}}    e.g. {{custom.plan}}
//   Optional default value:    {{firstName|there}} → "there" when the
//                              contact has no firstName.
//
// This is a CLIENT-SIDE preview convention. The token strings are left
// verbatim in Campaign.body — the server compile/send pipeline owns the
// authoritative substitution. resolveMergeTags() below is ONLY for the
// editor's "Preview with sample data" affordance. Footer tokens
// ({{unsubscribeUrl}} / {{webVersionUrl}}) are intentionally NOT merge
// tags here — they are link placeholders the footer block injects and the
// server resolves; we leave them untouched.
//
// Nested composables are not auto-imported — import explicitly:
//   import { useMergeTags, resolveMergeTags } from "~/composables/app/useMergeTags";
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeTag {
  // The token WITHOUT braces, e.g. "firstName" or "custom.plan".
  token: string;
  // Human label for the picker, e.g. "First name".
  label: string;
  // Where it came from — drives the picker's grouping.
  group: "standard" | "custom";
  // For custom tags, the underlying field type (drives sample values).
  type?: FieldType;
}

// The standard Contact fields available as merge tags. Order is the order
// they appear in the picker's "Standard" group.
export const STANDARD_MERGE_TAGS: MergeTag[] = [
  { token: "firstName", label: "First name", group: "standard" },
  { token: "lastName", label: "Last name", group: "standard" },
  { token: "email", label: "Email", group: "standard" },
  { token: "company", label: "Company", group: "standard" },
  { token: "phone", label: "Phone", group: "standard" },
  { token: "city", label: "City", group: "standard" },
  { token: "country", label: "Country", group: "standard" },
  { token: "timezone", label: "Timezone", group: "standard" },
];

// A sample contact used by the editor preview. Standard fields get
// realistic placeholder values; custom fields are resolved from
// `customFields` by key (see sampleValueForField for type-based fallbacks).
export interface SampleContact {
  firstName?: string;
  lastName?: string;
  email?: string;
  company?: string;
  phone?: string;
  city?: string;
  country?: string;
  timezone?: string;
  // Custom-field values keyed by the field `key`.
  customFields?: Record<string, unknown>;
}

export const SAMPLE_CONTACT: SampleContact = {
  firstName: "Avery",
  lastName: "Diaz",
  email: "avery.diaz@example.com",
  company: "Northwind Studio",
  phone: "+1 (555) 0142",
  city: "Portland",
  country: "United States",
  timezone: "America/Los_Angeles",
  customFields: {},
};

// A sensible sample value for a custom field by type, used when the
// SAMPLE_CONTACT has no explicit value for that field's key. Keeps the
// preview readable instead of falling back to the bracket placeholder.
export function sampleValueForField(field: CustomField): string {
  switch (field.type) {
    case "number":
      return "42";
    case "date":
      return "May 29, 2026";
    case "boolean":
      return "Yes";
    case "enum":
      return field.enumValues?.[0] ?? "Option A";
    case "text":
    default:
      return `Sample ${field.label.toLowerCase()}`;
  }
}

// Build the full available-tags list: standard fields + one tag per
// custom field. Pure given the field list — the composable wrapper below
// fetches the list and memoizes the build.
export function buildMergeTags(customFields: CustomField[]): MergeTag[] {
  const custom: MergeTag[] = (customFields ?? []).map((f) => ({
    token: `custom.${f.key}`,
    label: f.label,
    group: "custom" as const,
    type: f.type,
  }));
  return [...STANDARD_MERGE_TAGS, ...custom];
}

// ── Resolution ──────────────────────────────────────────────────────────────
// Matches {{ token }} with an optional |default segment. Token chars are
// limited to word chars and a single dot (for custom.<key>) so we never
// swallow other braces or unrelated content. Whitespace inside the braces
// is tolerated: {{ firstName | there }} works.
const TAG_RE = /\{\{\s*([\w]+(?:\.[\w]+)?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;

// Resolve a single token (without braces, e.g. "firstName" or
// "custom.plan") against the sample contact. Returns the resolved string
// or `undefined` if the contact has no value for it.
function resolveToken(
  token: string,
  contact: SampleContact,
  customFields?: CustomField[],
): string | undefined {
  if (token.startsWith("custom.")) {
    const key = token.slice("custom.".length);
    const raw = contact.customFields?.[key];
    if (raw !== undefined && raw !== null && raw !== "") return String(raw);
    // No explicit sample value — derive one from the field definition so
    // the preview still reads naturally for a known custom field.
    const def = customFields?.find((f) => f.key === key);
    if (def) return sampleValueForField(def);
    return undefined;
  }
  const raw = (contact as Record<string, unknown>)[token];
  if (raw !== undefined && raw !== null && raw !== "") return String(raw);
  return undefined;
}

export interface ResolveOptions {
  // Custom-field defs so unknown custom values can derive a typed sample.
  customFields?: CustomField[];
  // What to show when a token resolves to nothing AND has no |default.
  // "placeholder" (default) → "[firstName]" so the user sees the gap.
  // "empty" → "".
  missing?: "placeholder" | "empty";
}

// Replace every merge tag in `text` with its resolved value. Pure — no
// I/O, no Vue. This is the unit-tested core of the preview.
//
// Precedence for an unresolved token:
//   1. the contact's value (if any)
//   2. the inline |default (if the tag declared one)
//   3. the `missing` strategy: a "[token]" placeholder, or ""
export function resolveMergeTags(
  text: string,
  contact: SampleContact = SAMPLE_CONTACT,
  options: ResolveOptions = {},
): string {
  if (typeof text !== "string" || text.length === 0) return text ?? "";
  const missing = options.missing ?? "placeholder";
  return text.replace(TAG_RE, (_match, rawToken: string, rawDefault?: string) => {
    const value = resolveToken(rawToken, contact, options.customFields);
    if (value !== undefined) return value;
    if (rawDefault !== undefined && rawDefault.length > 0) return rawDefault;
    return missing === "empty" ? "" : `[${rawToken}]`;
  });
}

// Wrap a bare token in the editor's brace convention. Used by the picker
// when inserting at the cursor.
export function formatTag(token: string): string {
  return `{{${token}}}`;
}

// Splice `insertText` into the value of an <input>/<textarea> at the current
// caret/selection, returning the new value AND firing a native `input` event
// so any @input v-model binding picks it up. The caret is left right after
// the inserted text. Falls back to appending if the element has no usable
// selection range. Returns the resulting value string.
//
// This is the one piece of DOM glue the picker insertion needs; it lives
// here so the inspector blocks and the setup popover share identical
// behavior. Safe to call with a null element (returns "").
export function insertAtCursor(
  el: HTMLInputElement | HTMLTextAreaElement | null | undefined,
  insertText: string,
): string {
  if (!el) return "";
  const value = el.value ?? "";
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? value.length;
  const next = value.slice(0, start) + insertText + value.slice(end);
  el.value = next;
  // Restore focus + place caret after the inserted token.
  const caret = start + insertText.length;
  el.focus();
  try {
    el.setSelectionRange(caret, caret);
  } catch (_) {
    /* some input types disallow setSelectionRange; ignore */
  }
  // Notify Vue's @input listeners so the model updates through the normal path.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return next;
}

// ── Composable ───────────────────────────────────────────────────────────────
// Loads the org's custom fields and exposes the merge-tag list. The list
// is cached for the lifetime of the composable instance; callers that need
// a refresh can call loadTags() again.
export function useMergeTags() {
  const tags = ref<MergeTag[]>([...STANDARD_MERGE_TAGS]);
  const customFields = ref<CustomField[]>([]);
  const loaded = ref(false);

  async function loadTags(): Promise<MergeTag[]> {
    try {
      // useCustomFields is a Nuxt auto-import in the app runtime. Resolve it
      // lazily (only when tags are actually requested) so the pure exports of
      // this module stay importable without the Nuxt runtime.
      const fields = await useCustomFields().listCustomFields();
      customFields.value = fields;
      tags.value = buildMergeTags(fields);
    } catch (_) {
      // Non-fatal: standard tags still work without the custom registry.
      tags.value = [...STANDARD_MERGE_TAGS];
    } finally {
      loaded.value = true;
    }
    return tags.value;
  }

  // Resolve text using the loaded custom-field defs (so typed sample
  // values work for custom tags without an explicit sample value).
  function resolve(
    text: string,
    contact: SampleContact = SAMPLE_CONTACT,
    missing: ResolveOptions["missing"] = "placeholder",
  ): string {
    return resolveMergeTags(text, contact, {
      customFields: customFields.value,
      missing,
    });
  }

  return { tags, customFields, loaded, loadTags, resolve };
}
