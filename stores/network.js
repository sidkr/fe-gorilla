import { defineStore } from "pinia";

export const useNetworkStore = defineStore("network", {
  state: () => ({
    online: typeof navigator === "undefined" ? true : navigator.onLine,
  }),
  getters: {
    isOffline: (s) => !s.online,
  },
  actions: {
    setOnline()  { this.online = true; },
    setOffline() { this.online = false; },
  },
});
