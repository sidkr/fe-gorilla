import { useCloud } from "~/composables/app/useCloud";

/**
 * useSuppression — manual suppression management (F-28).
 * Mirrors the cloud functions in server/cloud/suppression.js. Goes through
 * useCloud().runCloud (NOT Parse.Cloud.run directly) so calls hit the SDK
 * instance the parse.client plugin initialized and get error/session-expiry
 * normalization.
 */
export function useSuppression() {
  const { runCloud } = useCloud();
  return {
    listSuppressions: (params: { search?: string; page?: number } = {}) =>
      runCloud("listSuppressions", params),
    addSuppressions: (payload: { emails: string; reason?: string }) =>
      runCloud("addSuppressions", payload),
    removeSuppression: (id: string) => runCloud("removeSuppression", { id }),
  };
}
