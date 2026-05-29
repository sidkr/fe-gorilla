import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Typed wrapper over the custom-field registry cloud functions. The contacts
// form, the segment rule builder, and the editor merge-tag picker all import the
// `CustomField` shape + `FIELD_TYPES` from HERE so there is one source of truth
// on the frontend. (The server mirror is server/cloud/lib/customFields.js — keep
// the two FIELD_TYPES lists in sync.)
//
// Nested composables are NOT auto-imported in this project, so import explicitly:
//   import { useCustomFields, type CustomField } from "~/composables/app/useCustomFields";
// ─────────────────────────────────────────────────────────────────────────────

// The closed set of supported data-point types (mirrors the server).
export const FIELD_TYPES = ["text", "number", "date", "boolean", "enum"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

// The single shape every consumer reads. Matches fieldToJSON in
// server/cloud/customFields.js exactly.
export interface CustomField {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  enumValues: string[];
  required: boolean;
  order: number;
}

// Params for createCustomField. `key` is optional — the server derives it from
// `label` via slugify when omitted.
export interface CreateCustomFieldInput {
  label: string;
  type: FieldType;
  enumValues?: string[];
  required?: boolean;
  key?: string;
}

// Patchable subset for updateCustomField. `key` and `type` are intentionally
// absent — the server rejects changing them (that's a data migration).
export interface UpdateCustomFieldPatch {
  label?: string;
  enumValues?: string[];
  required?: boolean;
  order?: number;
}

export function useCustomFields() {
  const { runCloud } = useCloud();

  // Full registry for the caller's org, ordered by `order` then label.
  function listCustomFields(): Promise<CustomField[]> {
    return runCloud<CustomField[]>("listCustomFields");
  }

  // Create a new data-point definition. Throws (CloudError) on duplicate key,
  // bad type, or an enum without enumValues.
  function createCustomField(input: CreateCustomFieldInput): Promise<CustomField> {
    return runCloud<CustomField>("createCustomField", { ...input });
  }

  // Patch label / enumValues / required / order. Key + type are immutable.
  function updateCustomField(
    id: string,
    patch: UpdateCustomFieldPatch,
  ): Promise<CustomField> {
    return runCloud<CustomField>("updateCustomField", { id, patch });
  }

  // Delete the definition (MVP: contact values are left in place).
  function deleteCustomField(id: string): Promise<{ ok: boolean }> {
    return runCloud<{ ok: boolean }>("deleteCustomField", { id });
  }

  return {
    listCustomFields,
    createCustomField,
    updateCustomField,
    deleteCustomField,
  };
}
