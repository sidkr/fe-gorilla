// Domain composable for CSV contact import (F-07).
//
//   uploadCsv(file)                         → multipart POST to /api/imports/upload
//                                             returns { token, filePath, headers, preview }
//   startImport({ listId, mapping, consent, hasHeader, filePath, fileName })
//                                           → runs `startContactImport`, returns { jobId }
//   getImportJob(jobId)                     → status + counters (poll)
//   getImportJobErrors(jobId)               → captured error rows for errors.csv
//   pollImportJob(jobId, onUpdate, opts)    → polls getImportJob until terminal
//   errorsToCsv(rows)                       → build the errors.csv text
//
// The upload goes straight to the Express route (multipart can't ride
// Parse.Cloud.run); everything else is a cloud fn via useCloud.
import { useCloud } from "~/composables/app/useCloud";

// useNuxtApp is a Nuxt auto-import (a global at build time); do NOT import it
// from "#app" — that alias doesn't resolve under vitest. Matches useCloud.ts.
declare function useNuxtApp(): { $parse: typeof import("parse") };

export type ImportStatus = "pending" | "running" | "done" | "failed";

export interface ImportUploadResult {
  token: string;
  filePath: string;
  fileName: string;
  headers: string[];
  preview: string[][];
  columnCount: number;
}

// mapping is keyed by CSV column index (string) → target field.
// Targets: "email" | "firstName" | "lastName" | "company" | "phone" | "city" |
//          "country" | "timezone" | "custom:<fieldKey>" | "ignore"
export type ColumnMapping = Record<string, string>;

export interface ImportConsent {
  source: "signupForm" | "purchase" | "event" | "manuallyEntered" | "other";
  detail?: string;
}

export interface ImportJob {
  id: string;
  status: ImportStatus;
  listId: string;
  fileName: string;
  totalRows: number;
  processedRows: number;
  created: number;
  updated: number;
  skippedInvalid: number;
  skippedSuppressed: number;
  errorCount: number;
  consent: ImportConsent | null;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ImportErrorRow {
  row: number;
  email: string;
  reason: string;
  raw: string[];
}

export function useImports() {
  const { runCloud } = useCloud();
  const { $parse } = useNuxtApp();

  async function uploadCsv(file: File): Promise<ImportUploadResult> {
    const Parse = $parse as typeof import("parse");
    const token = Parse.User.current()?.getSessionToken() || "";
    const form = new FormData();
    form.append("file", file, file.name);

    const res = await fetch("/api/imports/upload", {
      method: "POST",
      headers: { "X-Parse-Session-Token": token },
      body: form,
    });
    if (!res.ok) {
      let msg = "Upload failed.";
      try {
        const body = await res.json();
        if (body && body.error) msg = body.error;
      } catch {
        /* keep default */
      }
      throw new Error(msg);
    }
    return (await res.json()) as ImportUploadResult;
  }

  function startImport(params: {
    listId: string;
    mapping: ColumnMapping;
    consent: ImportConsent;
    hasHeader: boolean;
    filePath: string;
    fileName?: string;
  }) {
    return runCloud<{ jobId: string; status: ImportStatus }>(
      "startContactImport",
      params as unknown as Record<string, unknown>,
    );
  }

  function getImportJob(jobId: string) {
    return runCloud<ImportJob>("getImportJob", { jobId });
  }

  function getImportJobErrors(jobId: string) {
    return runCloud<{ rows: ImportErrorRow[] }>("getImportJobErrors", { jobId });
  }

  // Poll getImportJob until the job reaches a terminal state. Calls onUpdate on
  // every tick. Resolves with the final job. Defaults: 1s interval, 5min cap.
  async function pollImportJob(
    jobId: string,
    onUpdate?: (job: ImportJob) => void,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<ImportJob> {
    const intervalMs = opts.intervalMs ?? 1000;
    const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
    const start = Date.now();
    for (;;) {
      const job = await getImportJob(jobId);
      if (onUpdate) onUpdate(job);
      if (job.status === "done" || job.status === "failed") return job;
      if (Date.now() - start > timeoutMs) return job;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  // Build errors.csv text: original cells + a trailing reason column.
  function errorsToCsv(rows: ImportErrorRow[]): string {
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const maxCols = rows.reduce((m, r) => Math.max(m, (r.raw || []).length), 0);
    const header = [
      ...Array.from({ length: maxCols }, (_, i) => `column_${i + 1}`),
      "reason",
    ];
    const lines = [header.map(esc).join(",")];
    for (const r of rows) {
      const cells = [...(r.raw || []), r.reason];
      lines.push(cells.map(esc).join(","));
    }
    return lines.join("\n");
  }

  return {
    uploadCsv,
    startImport,
    getImportJob,
    getImportJobErrors,
    pollImportJob,
    errorsToCsv,
  };
}
