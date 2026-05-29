import { defineStore } from "pinia";
import Parse from "parse";
import { markSessionInvalid, purgeSession } from "~/utils/sessionGuard.client";

// Auth store. Pinia composables-style. Lives client-side only — Parse session
// tokens are in localStorage. Pages under /app/* are ssr:false so this store
// always boots in a browser context.
export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null,
  }),
  getters: {
    isAuthenticated: (s) => !!s.user,
    username: (s) => s.user?.get("username") ?? null,
    name: (s) => s.user?.get("name") ?? null,
  },
  actions: {
    hydrateFromParse() {
      // Called once after Parse SDK init. Picks up an existing session
      // from localStorage if there is one.
      this.user = Parse.User.current();
    },
    async login(username, password) {
      const u = await Parse.User.logIn(username, password);
      this.user = u;
      return u;
    },
    async signup({ username, password, email, name, company }) {
      const u = new Parse.User();
      u.set("username", username);
      u.set("password", password);
      if (email)   u.set("email", email);
      if (name)    u.set("name", name);
      if (company) u.set("company", company);
      await u.signUp();
      this.user = u;
      return u;
    },
    async logout() {
      await purgeSession();
      this.user = null;
    },
    async sessionExpired() {
      markSessionInvalid();
      await purgeSession();
      this.user = null;
    },
  },
});
