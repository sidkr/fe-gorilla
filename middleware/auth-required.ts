import { useAuthStore } from "~/stores/auth";

// Guards /app/* routes: anonymous visitors get bounced to /login with a
// `next` param so we can return them to wherever they were going.
// Skips on server because /app/* is ssr:false; runs purely in the browser.
export default defineNuxtRouteMiddleware((to) => {
  if (import.meta.server) return;
  const auth = useAuthStore();
  if (!auth.isAuthenticated) {
    return navigateTo(`/login?next=${encodeURIComponent(to.fullPath)}`);
  }
});
