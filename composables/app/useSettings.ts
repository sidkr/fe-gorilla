import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Typed wrapper over the settings cloud functions: org general settings + sender
// identities. The settings pages import the shapes from HERE so there is one
// source of truth on the frontend. (Server mirror: server/cloud/settings.js.)
//
// Nested composables are NOT auto-imported in this project, so import explicitly:
//   import { useSettings, type OrgSettings } from "~/composables/app/useSettings";
// ─────────────────────────────────────────────────────────────────────────────

// Matches orgToJSON in server/cloud/settings.js exactly.
export interface OrgSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  defaultFromName: string;
  defaultFromEmail: string;
  replyTo: string;
  timezone: string;
  address: string;
  monthlySendCap: number;
  monthlySendCount: number;
}

// Editable subset for updateOrgSettings. slug/plan/counters are not patchable.
export interface OrgSettingsPatch {
  name?: string;
  defaultFromName?: string;
  defaultFromEmail?: string;
  replyTo?: string;
  timezone?: string;
  address?: string;
}

// Closed set of sender statuses (mirrors the server). "pending" until verified.
export type SenderStatus = "pending" | "verified";

// Matches senderToJSON in server/cloud/settings.js exactly.
export interface SenderIdentity {
  id: string;
  fromName: string;
  fromEmail: string;
  status: SenderStatus;
  createdAt: string | null;
}

export interface CreateSenderInput {
  fromName: string;
  fromEmail: string;
}

export function useSettings() {
  const { runCloud } = useCloud();

  // ── Org general settings ────────────────────────────────────────────────--
  function getOrgSettings(): Promise<OrgSettings> {
    return runCloud<OrgSettings>("getOrgSettings");
  }

  // Patch editable org fields. Throws (CloudError) on invalid email / empty name.
  function updateOrgSettings(patch: OrgSettingsPatch): Promise<OrgSettings> {
    return runCloud<OrgSettings>("updateOrgSettings", { patch });
  }

  // ── Sender identities ───────────────────────────────────────────────────--
  function listSenderIdentities(): Promise<SenderIdentity[]> {
    return runCloud<SenderIdentity[]>("listSenderIdentities");
  }

  // Create a sender pair (status defaults "pending"). Throws on bad email /
  // duplicate email in the org.
  function createSenderIdentity(input: CreateSenderInput): Promise<SenderIdentity> {
    return runCloud<SenderIdentity>("createSenderIdentity", { ...input });
  }

  // MVP stub: flips status to "verified".
  function verifySenderIdentity(id: string): Promise<SenderIdentity> {
    return runCloud<SenderIdentity>("verifySenderIdentity", { id });
  }

  function deleteSenderIdentity(id: string): Promise<{ ok: boolean }> {
    return runCloud<{ ok: boolean }>("deleteSenderIdentity", { id });
  }

  return {
    getOrgSettings,
    updateOrgSettings,
    listSenderIdentities,
    createSenderIdentity,
    verifySenderIdentity,
    deleteSenderIdentity,
  };
}
