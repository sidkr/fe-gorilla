import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Campaign domain composable — the frontend entry point for the campaigns
// cloud functions (server/cloud/campaigns.js). Thin wrappers over runCloud so
// pages/components don't reach for Parse.Cloud.run directly.
//
//   const { listCampaigns, getCampaign, duplicateCampaign, archiveCampaign,
//           renameCampaign, updateCampaign, deleteCampaign } = useCampaigns();
//   const { campaigns, kpis } = await listCampaigns();
//
// Row shapes mirror what AppCampaignsTable + the KPI strip on
// /app/campaigns render.
// ─────────────────────────────────────────────────────────────────────────────

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "paused"
  | "archived";

export interface CampaignSummary {
  id: string;
  name: string;
  status: CampaignStatus;
  audienceId: string | null;
  audience: string | null;
  date: string;
  relative: string;
  openRate: string | null;
  clickRate: string | null;
  updatedAt: string | null;
}

export interface CampaignKpis {
  total: number;
  drafts: number;
  sent: number;
  scheduled: number;
  avgOpenRate: string | null;
}

export interface ListCampaignsResult {
  campaigns: CampaignSummary[];
  kpis: CampaignKpis;
}

export interface CampaignDetail {
  id: string;
  name: string;
  status: CampaignStatus;
  subject: string | null;
  preheader: string | null;
  fromName: string | null;
  fromEmail: string | null;
  replyTo: string | null;
  audienceId: string | null;
  bodyBg: string | null;
  body: unknown | null;
  compiledHtml: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

// Metadata fields updateCampaign accepts. Server ignores any other keys.
export interface CampaignPatch {
  name?: string;
  subject?: string | null;
  preheader?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  audienceId?: string | null;
  scheduledAt?: string | number | Date | null;
}

export function useCampaigns() {
  const { runCloud } = useCloud();

  function listCampaigns() {
    return runCloud<ListCampaignsResult>("listCampaigns");
  }

  function getCampaign(id: string) {
    return runCloud<CampaignDetail>("getCampaign", { id });
  }

  function duplicateCampaign(id: string) {
    return runCloud<{ id: string }>("duplicateCampaign", { id });
  }

  function archiveCampaign(id: string) {
    return runCloud<{ ok: boolean }>("archiveCampaign", { id });
  }

  function renameCampaign(id: string, name: string) {
    return runCloud<{ ok: boolean; id: string; name: string }>(
      "renameCampaign",
      { id, name },
    );
  }

  // patch ⊆ { name, subject, preheader, fromName, fromEmail, replyTo,
  //           audienceId, scheduledAt }. Unknown keys are ignored server-side.
  function updateCampaign(id: string, patch: CampaignPatch) {
    return runCloud<{ ok: boolean; id: string; status: CampaignStatus }>(
      "updateCampaign",
      { id, patch },
    );
  }

  // Hard-destroys a draft/scheduled/paused campaign; soft-archives a sent one
  // (deleted === false); rejects deleting a sending one. See campaigns.js.
  function deleteCampaign(id: string) {
    return runCloud<{ ok: boolean; deleted: boolean }>("deleteCampaign", {
      id,
    });
  }

  return {
    listCampaigns,
    getCampaign,
    duplicateCampaign,
    archiveCampaign,
    renameCampaign,
    updateCampaign,
    deleteCampaign,
  };
}
