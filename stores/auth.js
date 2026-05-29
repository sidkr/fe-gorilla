import { defineStore } from "pinia";
import Parse from "parse";
import { markSessionInvalid, purgeSession } from "~/utils/sessionGuard.client";

// Auth store. Pinia composables-style. Lives client-side only — Parse session
// tokens are in localStorage. Pages under /app/* are ssr:false so this store
// always boots in a browser context.
//
// Multi-tenant: signup goes through the `signUpWithOrg` cloud function (creates
// User + Organization + members role transactionally). The org is hydrated into
// `organization` so views can read org name / defaults / send cap without a
// re-query. See DECISIONS #10.
export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
    organization: null, // plain object from getMyOrg: {id,name,slug,plan,...}
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    username: (s) => s.user?.get("username") ?? null,
    name: (s) => s.user?.get("name") ?? null,
    orgId: (s) => s.organization?.id ?? null,
    orgName: (s) => s.organization?.name ?? null,
  },
  actions: {
    hydrateFromParse() {
      // Called once after Parse SDK init. Picks up an existing session
      // from localStorage if there is one, then loads the org.
      this.user = Parse.User.current();
      if (this.user) {
        // Fire-and-forget; org hydration shouldn't block first paint.
        this.hydrateOrg();
      }
    },
    // Loads the caller's Organization into `this.organization` via the
    // getMyOrg cloud function. Safe to call repeatedly.
    async hydrateOrg() {
      if (!this.user) {
        this.organization = null;
        return null;
      }
      try {
        this.organization = await Parse.Cloud.run("getMyOrg");
      } catch (e) {
        // Session may have expired between the user check and the call.
        this.organization = null;
      }
      return this.organization;
    },
    async login(username, password) {
      const u = await Parse.User.logIn(username, password);
      this.user = u;
      await this.hydrateOrg();
      return u;
    },
    async signup({ username, password, email, name, company }) {
      const r = await Parse.Cloud.run("signUpWithOrg", {
        username,
        password,
        email,
        name,
        company,
      });
      // Become the freshly-created session so the SDK + localStorage hold it.
      await Parse.User.become(r.sessionToken);
      this.user = Parse.User.current();
      await this.hydrateOrg();
      return this.user;
    },
    async logout() {
      await purgeSession();
      this.user = null;
      this.organization = null;
    },
    async sessionExpired() {
      markSessionInvalid();
      await purgeSession();
      this.user = null;
      this.organization = null;
    },
  },
});
