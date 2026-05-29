// Domain composable for Audiences (the `List` class). Thin wrapper over the
// audiences.* cloud functions via useCloud — every call is normalized + session
// expiry is handled centrally. Components never call Parse.Cloud.run directly.
import { useCloud } from "~/composables/app/useCloud";

export interface Audience {
  id: string;
  name: string;
  description: string;
  contactCount: number;
  archived: boolean;
  createdAt: string | null;
}

export interface AudienceRecipient {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export function useAudiences() {
  const { runCloud } = useCloud();

  function listAudiences(includeArchived = false) {
    return runCloud<Audience[]>("listAudiences", { includeArchived });
  }

  function getAudience(id: string) {
    return runCloud<Audience>("getAudience", { id });
  }

  function createAudience(name: string, description = "") {
    return runCloud<Audience>("createAudience", { name, description });
  }

  function archiveAudience(id: string) {
    return runCloud<{ ok: boolean }>("archiveAudience", { id });
  }

  function resolveAudienceRecipients(id: string, excludeSuppressed = true) {
    return runCloud<AudienceRecipient[]>("resolveAudienceRecipients", {
      id,
      excludeSuppressed,
    });
  }

  return {
    listAudiences,
    getAudience,
    createAudience,
    archiveAudience,
    resolveAudienceRecipients,
  };
}
