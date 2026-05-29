import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Templates domain composable. Wraps the Template cloud functions so pages
// don't call runCloud directly. See server/cloud/templates.js + Features F-13/F-14.
//
//   const { listTemplates, useTemplate, saveAsTemplate, deleteTemplate } = useTemplates();
//   const { system, org } = await listTemplates();
//   const { campaignId } = await useTemplate(id);  // → navigate to the editor
// ─────────────────────────────────────────────────────────────────────────────

export interface TemplateBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface TemplateBody {
  version: number;
  blocks: TemplateBlock[];
}

export interface TemplateSummary {
  id: string;
  name: string;
  subject: string | null;
  previewText: string | null;
  isSystem: boolean;
  seedKey: string | null;
  category: string;
  thumbnail: string | null;
  thumbUrl: string | null;
  // Full block tree the gallery uses to render a miniature email preview.
  body: TemplateBody;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ListTemplatesResult {
  system: TemplateSummary[];
  org: TemplateSummary[];
}

export function useTemplates() {
  const { runCloud } = useCloud();

  // Returns the system starters + the caller's org templates.
  function listTemplates() {
    return runCloud<ListTemplatesResult>("listTemplates");
  }

  // Forks a template (system or org) into a NEW Campaign draft. Resolves to the
  // new campaign id; the caller navigates to /app/campaigns/:id/edit.
  function useTemplate(id: string) {
    return runCloud<{ campaignId: string }>("useTemplate", { id });
  }

  // Creates an org-owned Template from a campaign's current body.
  function saveAsTemplate(campaignId: string, name: string) {
    return runCloud<{ id: string }>("saveAsTemplate", { campaignId, name });
  }

  // Deletes an org template (system templates are not deletable server-side).
  function deleteTemplate(id: string) {
    return runCloud<{ ok: boolean }>("deleteTemplate", { id });
  }

  return { listTemplates, useTemplate, saveAsTemplate, deleteTemplate };
}
