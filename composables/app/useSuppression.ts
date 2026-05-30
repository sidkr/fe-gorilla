import Parse from "parse/dist/parse.min.js";

/**
 * useSuppression — manual suppression management (F-28).
 * Mirrors the cloud functions in server/cloud/suppression.js.
 */
export function useSuppression() {
  async function listSuppressions(params: { search?: string; page?: number } = {}) {
    return await Parse.Cloud.run("listSuppressions", params);
  }

  async function addSuppressions(payload: { emails: string; reason?: string }) {
    return await Parse.Cloud.run("addSuppressions", payload);
  }

  async function removeSuppression(id: string) {
    return await Parse.Cloud.run("removeSuppression", { id });
  }

  return { listSuppressions, addSuppressions, removeSuppression };
}
