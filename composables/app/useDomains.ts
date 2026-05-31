import { useCloud } from "~/composables/app/useCloud";

/**
 * useDomains — sending-domain verification (F-04).
 * Mirrors the cloud functions in server/cloud/domains.js. Goes through
 * useCloud().runCloud (NOT Parse.Cloud.run directly) so calls hit the SDK
 * instance the parse.client plugin initialized and get error/session-expiry
 * normalization — calling the raw SDK import throws `currentInstallationId`
 * on an un-initialized instance.
 */
export function useDomains() {
  const { runCloud } = useCloud();
  return {
    createSendingDomain: (domain: string) => runCloud("createSendingDomain", { domain }),
    listSendingDomains: () => runCloud("listSendingDomains"),
    verifyDomain: (id: string) => runCloud("verifyDomain", { id }),
    deleteSendingDomain: (id: string) => runCloud("deleteSendingDomain", { id }),
  };
}
