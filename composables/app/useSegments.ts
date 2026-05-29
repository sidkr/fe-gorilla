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
  field: string; // "email" | "status" | "firstName" | "lastName" | "customFields.<key>"
  operator: string;
  value?: unknown;
}

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

  return {
    listSegments,
    createSegment,
    updateSegment,
    evaluateSegment,
    deleteSegment,
  };
}
