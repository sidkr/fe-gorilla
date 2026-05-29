import { useAuthStore } from "~/stores/auth";

// Applied to /login and /signup. If the visitor is already authenticated,
// bounce them into the app instead of showing the auth form. Other marketing
// pages (/, /pricing, /changelog, etc.) deliberately do NOT use this — a
// logged-in user can still read marketing pages.
//
// Server-skipped because both pages are prerendered; the redirect must happen
// in the browser after the auth store has hydrated from Parse.
export default defineNuxtRouteMiddleware(() => {
  if (import.meta.server) return;
  const auth = useAuthStore();
  if (auth.isAuthenticated) {
    return navigateTo("/app/dashboard");
  }
});
