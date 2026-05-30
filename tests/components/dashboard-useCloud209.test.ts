// @vitest-environment happy-dom
// D-C10 — the 209 (INVALID_SESSION_TOKEN) → sessionExpired() wiring that the
// dashboard load relies on for clean session boot-out. This exercises useCloud
// directly (the seam useDashboard.load() goes through): a cloud rejection with
// code 209 must call authStore.sessionExpired() and rethrow a normalized Error
// carrying .code === 209.
//
// We mock the two collaborators useCloud auto-imports in Nuxt: useNuxtApp
// (provides $parse) via a global stub, and ~/stores/auth via vi.mock.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionExpired = vi.fn().mockResolvedValue(undefined);
vi.mock("~/stores/auth", () => ({
  useAuthStore: () => ({ sessionExpired }),
}));

import { useCloud } from "../../composables/app/useCloud";

const cloudRun = vi.fn();

beforeEach(() => {
  sessionExpired.mockClear();
  cloudRun.mockReset();
  // useCloud grabs $parse off useNuxtApp(); stub it globally.
  vi.stubGlobal("useNuxtApp", () => ({ $parse: { Cloud: { run: cloudRun } } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCloud — 209 session boot-out (dashboard load path)", () => {
  it("calls sessionExpired and rethrows a normalized Error with code 209", async () => {
    cloudRun.mockRejectedValue({ code: 209, message: "Invalid session token" });
    const { runCloud } = useCloud();

    await expect(runCloud("getDashboardMetrics")).rejects.toMatchObject({
      code: 209,
      message: "Invalid session token",
    });
    expect(sessionExpired).toHaveBeenCalledTimes(1);
  });

  it("does NOT call sessionExpired for a non-209 failure", async () => {
    cloudRun.mockRejectedValue({ code: 141, message: "boom" });
    const { runCloud } = useCloud();

    await expect(runCloud("getDashboardMetrics")).rejects.toMatchObject({
      code: 141,
      message: "boom",
    });
    expect(sessionExpired).not.toHaveBeenCalled();
  });

  it("resolves the value through on success", async () => {
    cloudRun.mockResolvedValue({ audiences: 0 });
    const { runCloud } = useCloud();

    await expect(runCloud("getDashboardMetrics")).resolves.toEqual({ audiences: 0 });
    expect(sessionExpired).not.toHaveBeenCalled();
  });
});
