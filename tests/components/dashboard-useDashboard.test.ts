// @vitest-environment happy-dom
// Composable tests for useDashboard (docs/testing/dashboard.md §3c, D-C01–C10).
//
// The composable's only real dependency is useCloud().runCloud — we mock that
// module so we feed metrics (or rejections) without a Parse backend.
//
// TOOLING LIMITATION (load-bearing): the composable guards its localStorage
// read/write behind `if (import.meta.client)`. In Nuxt that's a build-time
// constant (true in the browser bundle); in plain vitest it is `undefined` and
// each module owns its OWN `import.meta`, so a test cannot flip the composable's
// copy (verified: cross-module `import.meta` writes don't propagate). Making it
// true would require a vite `define` in vitest.config — out of scope here (tests
// only, no config edits). So the *ref-level* behavior (showOnboarding gating,
// dismissOnboarding flipping the ref) is fully tested below; the *localStorage
// persistence* path (D-C07 storage write, D-C08 prior-read, D-C09 throw-guard)
// is unreachable under this config and is marked it.skip with this rationale.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The single seam. vi.mock matches the import specifier (the `~` alias resolves
// via vitest.config), so useDashboard sees this spy instead of the Parse-backed
// implementation.
const runCloud = vi.fn();
vi.mock("~/composables/app/useCloud", () => ({
  useCloud: () => ({ runCloud }),
}));

import { useDashboard } from "../../composables/app/useDashboard";

const ZERO = {
  audiences: 0,
  contacts: { total: 0, subscribed: 0 },
  campaigns: { total: 0, byStatus: { draft: 0, scheduled: 0, sending: 0, sent: 0, paused: 0, failed: 0 } },
  totals: { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubscribes: 0 },
  rates: { open: 0, click: 0, bounce: 0, unsubscribe: 0 },
  onboarding: {
    steps: { senderIdentity: false, audience: false, contact: false, campaign: false, sent: false },
    complete: false,
  },
};

const DISMISS_KEY = "gorilla.onboarding.dismissed";

beforeEach(() => {
  runCloud.mockReset();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDashboard.load", () => {
  // D-C01
  it("populates metrics and toggles loading on success", async () => {
    runCloud.mockResolvedValue(ZERO);
    const { metrics, loading, error, load } = useDashboard();

    expect(metrics.value).toBeNull();
    const p = load();
    expect(loading.value).toBe(true);
    await p;

    expect(runCloud).toHaveBeenCalledWith("getDashboardMetrics");
    expect(metrics.value).toEqual(ZERO);
    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  // D-C02
  it("surfaces the error message and keeps metrics null on failure", async () => {
    runCloud.mockRejectedValue(new Error("boom"));
    const { metrics, loading, error, load } = useDashboard();

    await load();

    expect(error.value).toBe("boom");
    expect(metrics.value).toBeNull();
    expect(loading.value).toBe(false);
  });

  // D-C03
  it("falls back to a default message when the rejection has none", async () => {
    runCloud.mockRejectedValue({});
    const { error, load } = useDashboard();

    await load();

    expect(error.value).toBe("Failed to load dashboard.");
  });

  it("clears a prior error on a subsequent successful load", async () => {
    const { error, metrics, load } = useDashboard();

    runCloud.mockRejectedValueOnce(new Error("boom"));
    await load();
    expect(error.value).toBe("boom");

    runCloud.mockResolvedValueOnce(ZERO);
    await load();
    expect(error.value).toBeNull();
    expect(metrics.value).toEqual(ZERO);
  });
});

describe("useDashboard.showOnboarding gating", () => {
  // D-C05
  it("is false before any data has loaded", () => {
    const { showOnboarding } = useDashboard();
    expect(showOnboarding.value).toBe(false);
  });

  // D-C04
  it("is true when data is present, incomplete, and not dismissed", async () => {
    runCloud.mockResolvedValue({ ...ZERO }); // onboarding.complete:false
    const { showOnboarding, load } = useDashboard();
    await load();
    expect(showOnboarding.value).toBe(true);
  });

  // D-C06
  it("auto-hides when onboarding is complete (even if not dismissed)", async () => {
    runCloud.mockResolvedValue({
      ...ZERO,
      onboarding: { steps: ZERO.onboarding.steps, complete: true },
    });
    const { showOnboarding, load } = useDashboard();
    await load();
    expect(showOnboarding.value).toBe(false);
  });

  // D-C08 — reads the persisted flag on init. Gated by `import.meta.client`,
  // which is false under this vitest config (see file header). Skipped, not
  // deleted, so it runs once a vite `define` makes the branch reachable.
  it.skip("respects a prior dismissal read from localStorage on init (needs import.meta.client)", async () => {
    localStorage.setItem(DISMISS_KEY, "1");
    runCloud.mockResolvedValue({ ...ZERO });
    const { showOnboarding, load } = useDashboard();
    await load();
    expect(showOnboarding.value).toBe(false);
  });
});

describe("useDashboard.dismissOnboarding", () => {
  // D-C07 (ref behavior — reachable). The composable flips onboardingDismissed
  // and thus showOnboarding regardless of `import.meta.client`; that's the part
  // the page's v-if depends on within the session.
  it("hides the checklist by flipping the dismissed ref", async () => {
    runCloud.mockResolvedValue({ ...ZERO });
    const { showOnboarding, onboardingDismissed, dismissOnboarding, load } =
      useDashboard();
    await load();
    expect(showOnboarding.value).toBe(true);

    dismissOnboarding();

    expect(onboardingDismissed.value).toBe(true);
    expect(showOnboarding.value).toBe(false);
  });

  // D-C07 (persistence) — the localStorage write is behind `import.meta.client`
  // (false under this config). Skipped with the same rationale as D-C08.
  it.skip("persists the dismissal flag to localStorage (needs import.meta.client)", () => {
    const { dismissOnboarding } = useDashboard();
    dismissOnboarding();
    expect(localStorage.getItem(DISMISS_KEY)).toBe("1");
  });

  // D-C09 — graceful degradation when localStorage throws. The try/catch is
  // also inside the `import.meta.client` guard, so the throwing path is
  // unreachable under this config. Skipped; the reachable invariant (dismiss
  // never throws and still flips the ref) is asserted in the D-C07 test above.
  it.skip("degrades gracefully when localStorage throws (needs import.meta.client)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    let dash: ReturnType<typeof useDashboard>;
    expect(() => {
      dash = useDashboard();
    }).not.toThrow();
    expect(dash!.onboardingDismissed.value).toBe(false);
    expect(() => dash!.dismissOnboarding()).not.toThrow();
  });
});
