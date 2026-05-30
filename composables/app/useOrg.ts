import Parse from "parse";
import { storeToRefs } from "pinia";
import { useAuthStore } from "~/stores/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Tenant context for building org-scoped Parse.Query's on the client.
//
//   const { orgId, orgName, orgPointer } = useOrg();
//   const q = new Parse.Query("List");
//   q.equalTo("organization", orgPointer());  // explicit org filter
//   const lists = await q.find();
//
// IMPORTANT: ACLs already enforce tenant isolation server-side — a query run
// with the wrong session returns zero rows regardless of this filter. The org
// pointer here is for CONVENIENCE and EXPLICITNESS (and so queries hit the
// (organization, ...) compound indexes), not for security. Never rely on it as
// the boundary.
// ─────────────────────────────────────────────────────────────────────────────

export function useOrg() {
  const auth = useAuthStore();
  const { orgId, orgName } = storeToRefs(auth);

  // Build an unfetched Organization pointer for the current org. Returns null
  // if there is no org loaded yet (e.g. before hydration).
  function orgPointer(): Parse.Object | null {
    const id = orgId.value;
    if (!id) return null;
    const Organization = Parse.Object.extend("Organization");
    return Organization.createWithoutData(id);
  }

  return { orgId, orgName, orgPointer };
}
