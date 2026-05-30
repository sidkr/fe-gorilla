import { computed, ref } from "vue";
import { useCloud } from "~/composables/app/useCloud";

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard data — wraps the `getDashboardMetrics` cloud function and exposes a
// loaded ref + a load() action for the dashboard page.
//
//   const { metrics, loading, error, load } = useDashboard();
//   onMounted(load);
//
// The shape mirrors server/cloud/reports.js → getDashboardMetrics. Engagement
// totals are 0 until the send pipeline lands (the page renders empty states for
// those); audiences / contacts / campaigns-by-status are real from day one.
// ─────────────────────────────────────────────────────────────────────────────

export interface OnboardingSteps {
  senderIdentity: boolean;
  audience: boolean;
  contact: boolean;
  campaign: boolean;
  sent: boolean;
}

export interface OnboardingState {
  steps: OnboardingSteps;
  complete: boolean;
}

export interface DashboardMetrics {
  audiences: number;
  contacts: { total: number; subscribed: number };
  campaigns: { total: number; byStatus: Record<string, number> };
  totals: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    unsubscribes: number;
  };
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
  // Setup-checklist booleans, computed server-side from real org data. The page
  // renders a dismissible checklist while `complete` is false.
  onboarding: OnboardingState;
}

// localStorage key for the per-browser "I dismissed the checklist" flag. Scoped
// nowhere in particular — dismissal is a UI nicety, not org state. Once every
// step is genuinely complete the card hides regardless of this flag.
const ONBOARDING_DISMISS_KEY = "gorilla.onboarding.dismissed";

export function useDashboard() {
  const { runCloud } = useCloud();

  const metrics = ref<DashboardMetrics | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Per-browser dismissal of the onboarding card. Read once on the client; the
  // ref is the source of truth for the rest of the session.
  const onboardingDismissed = ref(false);
  if (import.meta.client) {
    try {
      onboardingDismissed.value =
        localStorage.getItem(ONBOARDING_DISMISS_KEY) === "1";
    } catch (_) {
      /* localStorage unavailable (private mode) — treat as not dismissed */
    }
  }

  function dismissOnboarding() {
    onboardingDismissed.value = true;
    if (import.meta.client) {
      try {
        localStorage.setItem(ONBOARDING_DISMISS_KEY, "1");
      } catch (_) {
        /* ignore */
      }
    }
  }

  // Show the checklist only when we have data, it isn't complete, and the user
  // hasn't dismissed it. Drives a single `v-if` on the page.
  const showOnboarding = computed(
    () =>
      !!metrics.value &&
      !metrics.value.onboarding?.complete &&
      !onboardingDismissed.value,
  );

  async function load() {
    loading.value = true;
    error.value = null;
    try {
      metrics.value = await runCloud<DashboardMetrics>("getDashboardMetrics");
    } catch (err: unknown) {
      error.value = (err as Error)?.message || "Failed to load dashboard.";
    } finally {
      loading.value = false;
    }
  }

  return {
    metrics,
    loading,
    error,
    load,
    showOnboarding,
    onboardingDismissed,
    dismissOnboarding,
  };
}
