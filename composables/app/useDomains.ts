import Parse from "parse/dist/parse.min.js";

/**
 * useDomains — sending-domain verification (F-04).
 * Mirrors the cloud functions in server/cloud/domains.js.
 */
export function useDomains() {
  async function createSendingDomain(domain: string) {
    return await Parse.Cloud.run("createSendingDomain", { domain });
  }

  async function listSendingDomains() {
    return await Parse.Cloud.run("listSendingDomains");
  }

  async function verifyDomain(id: string) {
    return await Parse.Cloud.run("verifyDomain", { id });
  }

  async function deleteSendingDomain(id: string) {
    return await Parse.Cloud.run("deleteSendingDomain", { id });
  }

  return { createSendingDomain, listSendingDomains, verifyDomain, deleteSendingDomain };
}
