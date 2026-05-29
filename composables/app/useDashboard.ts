import { ref } from "vue";
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
}

export function useDashboard() {
  const { runCloud } = useCloud();

  const metrics = ref<DashboardMetrics | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  return { metrics, loading, error, load };
}
