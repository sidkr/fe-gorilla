import Parse from "parse";
import { useAuthStore } from "~/stores/auth";

// Initializes the Parse JS SDK on the client and syncs the current user into
// the auth store. Client-only because Parse stores its session token in
// localStorage. Expose Parse via $parse: `const { $parse } = useNuxtApp();`
export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig();
  Parse.initialize(config.public.parseAppId as string);
  Parse.serverURL = config.public.apiUrl as string;

  // Hydrate the auth store from Parse's in-memory current-user (which itself
  // is read from localStorage on import). Skipping this would mean the first
  // navigation guard runs with an empty store even when the user is signed in.
  useAuthStore().hydrateFromParse();

  return {
    provide: { parse: Parse },
  };
});
