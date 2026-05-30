import { useAuthStore } from "~/stores/auth";

// ─────────────────────────────────────────────────────────────────────────────
// THE way feature agents call Parse Cloud functions from the app frontend.
//
//   const { runCloud } = useCloud();
//   const lists = await runCloud<MyList[]>("listAudiences");
//   const created = await runCloud("createAudience", { name });
//
// Why a wrapper and not raw Parse.Cloud.run:
//   - Centralizes error normalization (you always get a real Error with .code).
//   - On Parse error 209 (invalid/expired session token) it calls
//     authStore.sessionExpired() so the app boots back to /login uniformly,
//     instead of every caller re-implementing that check.
//
// Use this for EVERY cloud-function call in /app/*. Do not call
// Parse.Cloud.run directly in feature code.
// ─────────────────────────────────────────────────────────────────────────────

export interface CloudError extends Error {
  code?: number;
}

export function useCloud() {
  // $parse is provided by plugins/parse.client.ts. We grab it via useNuxtApp so
  // this composable works without importing the SDK directly.
  const { $parse } = useNuxtApp() as unknown as { $parse: typeof import("parse") };

  async function runCloud<T = unknown>(
    name: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    try {
      return (await $parse.Cloud.run(name, params)) as T;
    } catch (err: unknown) {
      const e = err as { code?: number; message?: string };
      // 209 = INVALID_SESSION_TOKEN. Boot the session out cleanly.
      if (e && e.code === 209) {
        try {
          await useAuthStore().sessionExpired();
        } catch (_) {
          /* ignore secondary failure */
        }
      }
      const normalized: CloudError = new Error(
        e?.message || `Cloud function "${name}" failed`,
      );
      normalized.code = e?.code;
      throw normalized;
    }
  }

  return { runCloud };
}
