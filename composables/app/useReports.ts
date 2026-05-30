import Parse from "parse";
import { ref } from "vue";
import { useCloud } from "~/composables/app/useCloud";
import { useOrg } from "~/composables/app/useOrg";

// ─────────────────────────────────────────────────────────────────────────────
// Campaign reporting — wraps the F-25 / F-26 cloud functions:
//   getCampaignReport, getCampaignLinkBreakdown, getCampaignRecipients.
//
//   const { listSentCampaigns } = useReports();      // table on the reports index
//   const { report, loadReport } = useReports();     // single-campaign headline
//
// Every metric here is REAL where data exists and an honest ZERO / empty array
// otherwise (the send pipeline isn't live yet). See server/cloud/reports.js.
// ─────────────────────────────────────────────────────────────────────────────

export interface CampaignReport {
  id: string;
  name: string;
  subject: string;
  status: string;
  sentAt: string | null;
  counts: {
    sent: number;
    delivered: number;
    opens: number;
    clicks: number;
    bounces: number;
    unsubscribes: number;
  };
  rates: { open: number; click: number; bounce: number; unsubscribe: number };
}

export interface LinkBreakdown {
  campaignId: string;
  delivered: number;
  links: { url: string; uniqueClicks: number; clickRate: number }[];
}

export interface RecipientRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  opened: boolean;
  clicked: boolean;
  openedAt: string | null;
  lastClickedAt: string | null;
  bounceReason: string | null;
}

export interface RecipientsPage {
  campaignId: string;
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  rows: RecipientRow[];
}

export function useReports() {
  const { runCloud } = useCloud();
  const { orgPointer } = useOrg();

  // Discover the campaigns that have a report worth showing on the reports
  // index: status "sent" (or "sending"), newest first. We query Campaign
  // directly via Parse (the documented app data pattern — ACLs isolate the org)
  // rather than depend on another feature's cloud fn. Returns [] for a fresh
  // org. Then loadReportsFor() fetches each campaign's headline numbers.
  async function loadSentCampaignReports(limit = 50) {
    loading.value = true;
    error.value = null;
    try {
      const q = new Parse.Query("Campaign");
      const org = orgPointer();
      if (org) q.equalTo("organization", org);
      q.containedIn("status", ["sent", "sending"]);
      q.descending("createdAt");
      q.limit(limit);
      const rows = await q.find();
      const ids = rows.map((r) => r.id);
      reports.value = await Promise.all(
        ids.map((campaignId) =>
          runCloud<CampaignReport>("getCampaignReport", { campaignId }),
        ),
      );
    } catch (err: unknown) {
      error.value = (err as Error)?.message || "Failed to load reports.";
    } finally {
      loading.value = false;
    }
    return reports.value;
  }

  // List of campaigns to show in the reports table. The reports index needs the
  // headline numbers per campaign, so we fetch each campaign's report. We scope
  // to campaigns with a "sent" status — those are the ones with a report to
  // show. Returns [] for a fresh org.
  const reports = ref<CampaignReport[]>([]);
  const report = ref<CampaignReport | null>(null);
  const recipients = ref<RecipientsPage | null>(null);
  const links = ref<LinkBreakdown | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Load reports for a set of campaign ids (the reports index passes the ids of
  // its sent campaigns). Each is an independent cloud call; we run them in
  // parallel and keep input order.
  async function loadReportsFor(campaignIds: string[]) {
    loading.value = true;
    error.value = null;
    try {
      reports.value = await Promise.all(
        campaignIds.map((campaignId) =>
          runCloud<CampaignReport>("getCampaignReport", { campaignId }),
        ),
      );
    } catch (err: unknown) {
      error.value = (err as Error)?.message || "Failed to load reports.";
    } finally {
      loading.value = false;
    }
  }

  async function loadReport(campaignId: string) {
    loading.value = true;
    error.value = null;
    try {
      report.value = await runCloud<CampaignReport>("getCampaignReport", { campaignId });
    } catch (err: unknown) {
      error.value = (err as Error)?.message || "Failed to load report.";
    } finally {
      loading.value = false;
    }
  }

  async function loadLinkBreakdown(campaignId: string) {
    links.value = await runCloud<LinkBreakdown>("getCampaignLinkBreakdown", { campaignId });
    return links.value;
  }

  async function loadRecipients(
    campaignId: string,
    opts: { page?: number; perPage?: number; filter?: string } = {},
  ) {
    recipients.value = await runCloud<RecipientsPage>("getCampaignRecipients", {
      campaignId,
      ...opts,
    });
    return recipients.value;
  }

  // Server-rendered CSV of one campaign's recipients (email, status, and the
  // delivered/opened/clicked timestamps + bounce reason). `status` optionally
  // filters to a single CampaignSend status. See exportCampaignRecipients.
  async function exportCampaignRecipients(
    campaignId: string,
    opts: { status?: string } = {},
  ) {
    return runCloud<{ filename: string; csv: string }>(
      "exportCampaignRecipients",
      { campaignId, ...opts },
    );
  }

  return {
    reports,
    report,
    recipients,
    links,
    loading,
    error,
    loadReportsFor,
    loadSentCampaignReports,
    loadReport,
    loadLinkBreakdown,
    loadRecipients,
    exportCampaignRecipients,
  };
}
