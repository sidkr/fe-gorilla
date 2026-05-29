// Shared types + module-level constants for the editor.
// Vue's <script setup> doesn't expose `export` declarations to importers,
// and the two-script-block alternative is fragile across compiler versions.
// One file, imported wherever needed.

export interface Audience {
  id: string;
  name: string;
  count: number;
}

// Mock audiences. Replace with `new Parse.Query("List")` when Audiences ships
// (see Editor-phase1.md §2). The contract — id, name, count — stays the same.
export const MOCK_AUDIENCES: ReadonlyArray<Audience> = [
  { id: "a_all",        name: "All subscribers",     count: 12847 },
  { id: "a_engaged",    name: "Engaged subscribers", count: 8234 },
  { id: "a_newsletter", name: "Newsletter list",     count: 3201 },
];

export type SetupField =
  | "subject"
  | "preheader"
  | "fromName"
  | "fromEmail"
  | "replyTo"
  | "audience"
  | "name";

export interface SetupValues {
  name: string;
  subject: string;
  preheader: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
  audienceId: string | null;
  // Workspace background behind the email card (Editor canvas §11).
  // Hex string. Empty / null means "use default" (--color-surface-2).
  bodyBg: string;
}

export type PreflightStatus = "ok" | "warn" | "fail";

export interface PreflightCheck {
  id: string;
  status: PreflightStatus;
  label: string;
  description: string;
  // The setup field to focus when the user clicks "Edit →" on a failing
  // row. Null = no actionable deep-link (e.g. "Email has content" surfaces
  // an inline hint instead).
  fixField: SetupField | null;
}
