import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Segments domain composable — the app-side wrapper over the segments.* cloud
// functions. Mirrors server/cloud/segments.js. Always goes through useCloud()
// so session-expiry (Parse 209) is handled uniformly.
//
//   const { listSegments, createSegment, evaluateSegment } = useSegments();
//   const segments = await listSegments();
//   const { count, sample } = await evaluateSegment({ rules });
// ─────────────────────────────────────────────────────────────────────────────

// A single leaf condition in the rule DSL (Architecture.md §5.1).
export interface SegmentCondition {
  // "email" | "status" | "firstName" | "lastName" | "company" | "phone" |
  // "city" | "country" | "timezone" | "subscribedAt" | "unsubscribedAt" |
  // "createdAt" | "tags" | "customFields.<key>"
  field: string;
  operator: string;
  value?: unknown;
}

// ── builder field/operator metadata (mirrors server/cloud/segments.js) ─────────
// The rule type drives which operators + value input the builder offers. Keep
// this list in lockstep with OPERATORS_BY_TYPE on the server.
export type RuleType = "text" | "number" | "date" | "boolean" | "enum" | "tags";

export const OPERATORS_BY_TYPE: Record<RuleType, string[]> = {
  text: ["eq", "neq", "contains", "starts_with", "ends_with", "is_empty", "is_not_empty", "in", "not_in"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "not_in"],
  date: ["before", "after", "between", "last_n_days"],
  boolean: ["eq"],
  enum: ["eq", "neq", "in", "not_in", "is_empty", "is_not_empty"],
  tags: ["contains", "not_contains", "is_empty", "is_not_empty"],
};

// Human labels for operators (used by the builder + the list summary).
export const OPERATOR_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  not_contains: "does not contain",
  starts_with: "starts with",
  ends_with: "ends with",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  in: "is any of",
  not_in: "is none of",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  before: "before",
  after: "after",
  between: "between",
  last_n_days: "in the last N days",
};

// Operators that take NO value input (unary).
export const UNARY_OPERATORS = new Set(["is_empty", "is_not_empty"]);
// Operators whose value is a comma/multi list.
export const LIST_OPERATORS = new Set(["in", "not_in"]);

// The fixed standard Contact fields offered in the builder, with their rule type.
export interface StdFieldDef {
  field: string;
  label: string;
  type: RuleType;
}

export const STD_FIELDS: StdFieldDef[] = [
  { field: "email", label: "Email", type: "text" },
  { field: "firstName", label: "First name", type: "text" },
  { field: "lastName", label: "Last name", type: "text" },
  { field: "status", label: "Status", type: "text" },
  { field: "company", label: "Company", type: "text" },
  { field: "phone", label: "Phone", type: "text" },
  { field: "city", label: "City", type: "text" },
  { field: "country", label: "Country", type: "text" },
  { field: "timezone", label: "Timezone", type: "text" },
  { field: "subscribedAt", label: "Subscribed date", type: "date" },
  { field: "unsubscribedAt", label: "Unsubscribed date", type: "date" },
  { field: "createdAt", label: "Created date", type: "date" },
];

// A single top-level operator group (MVP). Nested groups are tolerated server-side.
export interface SegmentRules {
  op: "and" | "or";
  conditions: Array<SegmentCondition | SegmentRules>;
}

export type SegmentKind = "dynamic" | "static";

export interface Segment {
  id: string;
  name: string;
  list: string | null;
  listName?: string | null;
  kind: SegmentKind;
  rules: SegmentRules | null;
  staticContacts: string[];
  lastEvaluatedAt: string | Date | null;
  lastCount: number | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface SegmentSampleRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  status: string | null;
}

export interface EvaluateResult {
  count: number;
  sample: SegmentSampleRow[];
}

export function useSegments() {
  const { runCloud } = useCloud();

  function listSegments() {
    return runCloud<Segment[]>("listSegments");
  }

  // Fetch one segment by id (the editor page loads this to populate the form).
  function getSegment(id: string) {
    return runCloud<Segment>("getSegment", { id });
  }

  function createSegment(input: {
    name: string;
    list?: string | null;
    kind?: SegmentKind;
    rules: SegmentRules;
  }) {
    return runCloud<Segment>("createSegment", input as Record<string, unknown>);
  }

  function updateSegment(input: {
    id: string;
    name?: string;
    list?: string | null;
    kind?: SegmentKind;
    rules?: SegmentRules;
  }) {
    return runCloud<Segment>("updateSegment", input as Record<string, unknown>);
  }

  // Evaluate either an ad-hoc rule tree (live editor preview) or a saved
  // segment by id. `preview: true` skips refreshing the saved cache.
  function evaluateSegment(input: {
    id?: string;
    rules?: SegmentRules;
    preview?: boolean;
  }) {
    return runCloud<EvaluateResult>(
      "evaluateSegment",
      input as Record<string, unknown>,
    );
  }

  function deleteSegment(id: string) {
    return runCloud<{ ok: true }>("deleteSegment", { id });
  }

  // Duplicate an existing segment into a fresh dynamic copy named "… (copy)".
  // Composed client-side from create — the server has no dedicated fn.
  async function duplicateSegment(seg: Segment) {
    return createSegment({
      name: `${seg.name} (copy)`,
      list: seg.list,
      kind: seg.kind,
      rules: seg.rules || { op: "and", conditions: [] },
    });
  }

  return {
    listSegments,
    getSegment,
    createSegment,
    updateSegment,
    evaluateSegment,
    deleteSegment,
    duplicateSegment,
  };
}
