// ─────────────────────────────────────────────────────────────────────────────
// Sample ("demo") data for the Reports page. When an org has not sent any
// campaign yet, the Reports page shows this realistic sample data behind a
// tutorial overlay so the user can SEE what the page will look like — instead of
// a blank page of zeros. It disappears automatically after the first real send
// (the page flips out of demo mode) or when the user dismisses it.
//
// This is the SHARED CONTRACT consumed by the per-widget components
// (AppReportsKpiStrip / AppReportsTrend / AppReportsEngagement / AppReportsTable)
// and the AppReportsOnboarding overlay. Each widget receives its slice of this
// object as `:data` plus a `:demo` boolean. Numbers are static + deterministic
// (no RNG) so the demo is stable across renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportsKpis {
  sent: number;
  delivered: number;
  deliveredRate: number; // 0..1
  opens: number;
  openRate: number; // 0..1, unique opens / delivered
  clicks: number;
  clickRate: number; // 0..1, unique clicks / delivered
  bounces: number;
  bounceRate: number; // 0..1
  unsubs: number;
  unsubRate: number; // 0..1
}

export interface TrendPoint {
  label: string; // short date label, e.g. "May 1"
  opens: number;
  clicks: number;
}

export interface EngagementFunnel {
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

export interface SampleCampaignRow {
  id: string;
  name: string;
  sentAt: string; // ISO
  recipients: number;
  openRate: number; // 0..1
  clickRate: number;
  bounceRate: number;
  unsubRate: number;
}

export interface ReportsSample {
  kpis: ReportsKpis;
  trend: TrendPoint[];
  engagement: EngagementFunnel;
  campaigns: SampleCampaignRow[];
}

const SAMPLE: ReportsSample = {
  kpis: {
    sent: 12480,
    delivered: 12106,
    deliveredRate: 12106 / 12480,
    opens: 5447,
    openRate: 5447 / 12106,
    clicks: 1138,
    clickRate: 1138 / 12106,
    bounces: 374,
    bounceRate: 374 / 12480,
    unsubs: 61,
    unsubRate: 61 / 12106,
  },
  // A two-week opens/clicks series with a believable send-day spike + decay.
  trend: [
    { label: "May 1", opens: 60, clicks: 12 },
    { label: "May 2", opens: 940, clicks: 210 },
    { label: "May 3", opens: 1320, clicks: 286 },
    { label: "May 4", opens: 720, clicks: 141 },
    { label: "May 5", opens: 410, clicks: 78 },
    { label: "May 6", opens: 240, clicks: 44 },
    { label: "May 7", opens: 150, clicks: 27 },
    { label: "May 8", opens: 880, clicks: 196 },
    { label: "May 9", opens: 1190, clicks: 244 },
    { label: "May 10", opens: 640, clicks: 120 },
    { label: "May 11", opens: 360, clicks: 66 },
    { label: "May 12", opens: 210, clicks: 38 },
    { label: "May 13", opens: 130, clicks: 22 },
    { label: "May 14", opens: 90, clicks: 15 },
  ],
  engagement: {
    delivered: 12106,
    opened: 5447,
    clicked: 1138,
    bounced: 374,
    unsubscribed: 61,
  },
  campaigns: [
    { id: "sample-1", name: "May Newsletter — Spring Picks", sentAt: "2026-05-12T16:00:00Z", recipients: 4200, openRate: 0.481, clickRate: 0.112, bounceRate: 0.021, unsubRate: 0.004 },
    { id: "sample-2", name: "Flash Sale · 24 hours only", sentAt: "2026-05-09T14:30:00Z", recipients: 3850, openRate: 0.523, clickRate: 0.146, bounceRate: 0.018, unsubRate: 0.006 },
    { id: "sample-3", name: "Product launch: Atlas 2.0", sentAt: "2026-05-05T17:00:00Z", recipients: 2980, openRate: 0.447, clickRate: 0.098, bounceRate: 0.031, unsubRate: 0.005 },
    { id: "sample-4", name: "Welcome series · Email 1", sentAt: "2026-05-02T09:15:00Z", recipients: 1120, openRate: 0.612, clickRate: 0.203, bounceRate: 0.012, unsubRate: 0.003 },
    { id: "sample-5", name: "Re-engagement: We miss you", sentAt: "2026-04-28T15:45:00Z", recipients: 2240, openRate: 0.298, clickRate: 0.061, bounceRate: 0.044, unsubRate: 0.011 },
    { id: "sample-6", name: "April recap & what's next", sentAt: "2026-04-22T16:30:00Z", recipients: 4010, openRate: 0.452, clickRate: 0.104, bounceRate: 0.024, unsubRate: 0.005 },
  ],
};

const DISMISS_KEY = "reports_demo_dismissed";

export function useReportsSample() {
  const sample = SAMPLE;

  function isDismissed(): boolean {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(DISMISS_KEY) === "1";
  }
  function dismiss() {
    if (typeof localStorage !== "undefined") localStorage.setItem(DISMISS_KEY, "1");
  }
  function resetDismiss() {
    if (typeof localStorage !== "undefined") localStorage.removeItem(DISMISS_KEY);
  }

  return { sample, isDismissed, dismiss, resetDismiss };
}

export { SAMPLE };
