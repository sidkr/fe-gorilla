// Shared types + module-level constants for the editor.
// Vue's <script setup> doesn't expose `export` declarations to importers,
// and the two-script-block alternative is fragile across compiler versions.
// One file, imported wherever needed.

export interface Audience {
  id: string;
  name: string;
  count: number;
}

// Audiences are now loaded live from the `List` class via useAudiences() in
// AudienceSelector.vue. The `Audience` contract above (id, name, count) is the
// shape that component maps each List row onto, so its emit contract — an
// audience id string — is unchanged.

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
