<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useReports } from "~/composables/app/useReports";
import { useReportsSample } from "~/composables/app/useReportsSample";

definePageMeta({ layout: "app", middleware: "auth-required" });
useHead({ title: "Reports" });

// Real per-campaign reports for the org's sent campaigns. Empty for a fresh org
// (no sends yet) → the page drops into DEMO mode: realistic sample data behind a
// tutorial overlay, so the user sees what Reports will look like. Demo auto-ends
// after the first real send (campaignReports becomes non-empty) or on dismiss.
const { reports: campaignReports, loading, error, loadSentCampaignReports, exportCampaignRecipients } = useReports();
const { sample, isDismissed, dismiss } = useReportsSample();

const dismissed = ref(isDismissed());
onMounted(() => loadSentCampaignReports());

const hasRealData = computed(() => campaignReports.value.length > 0);
// Demo = no real data yet AND not dismissed. While the first load is in flight
// we hold demo off to avoid a flash, then resolve once loading settles.
const demo = computed(() => !loading.value && !hasRealData.value && !dismissed.value);

// ── Real-mode slices (same shapes as useReportsSample so widgets are agnostic) ──
const agg = computed(() => {
  const a = { sent: 0, delivered: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0 };
  for (const r of campaignReports.value) {
    a.sent += r.counts.sent;
    a.delivered += r.counts.delivered;
    a.opens += r.counts.opens;
    a.clicks += r.counts.clicks;
    a.bounces += r.counts.bounces;
    a.unsubs += r.counts.unsubscribes;
  }
  return a;
});
const realKpis = computed(() => {
  const a = agg.value;
  return {
    sent: a.sent,
    delivered: a.delivered,
    deliveredRate: a.sent ? a.delivered / a.sent : 0,
    opens: a.opens,
    openRate: a.delivered ? a.opens / a.delivered : 0,
    clicks: a.clicks,
    clickRate: a.delivered ? a.clicks / a.delivered : 0,
    bounces: a.bounces,
    bounceRate: a.sent ? a.bounces / a.sent : 0,
    unsubs: a.unsubs,
    unsubRate: a.delivered ? a.unsubs / a.delivered : 0,
  };
});
const realEngagement = computed(() => ({
  delivered: agg.value.delivered,
  opened: agg.value.opens,
  clicked: agg.value.clicks,
  bounced: agg.value.bounces,
  unsubscribed: agg.value.unsubs,
}));
const realCampaigns = computed(() =>
  campaignReports.value.map((r) => ({
    id: r.id,
    name: r.name || "(untitled)",
    sentAt: r.sentAt,
    recipients: r.counts.sent,
    openRate: r.rates.open,
    clickRate: r.rates.click,
    bounceRate: r.rates.bounce,
    unsubRate: r.rates.unsubscribe,
  })),
);

// ── What the widgets receive (sample when demo, real otherwise) ───────────────
const kpiData = computed(() => (demo.value ? sample.kpis : realKpis.value));
const trendData = computed(() => (demo.value ? sample.trend : [])); // real time-series builds as events arrive
const engagementData = computed(() => (demo.value ? sample.engagement : realEngagement.value));
const tableData = computed(() => (demo.value ? sample.campaigns : realCampaigns.value));

function onDismiss() {
  dismiss();
  dismissed.value = true;
}
// Export every listed (real) campaign's recipients into one CSV, prefixing a
// `campaign` column so rows stay attributable across campaigns. In demo mode
// (no real sends yet) there's nothing to export.
const exporting = ref(false);
async function onExport() {
  if (demo.value || !campaignReports.value.length) return;
  exporting.value = true;
  try {
    const header =
      "campaign,email,status,deliveredAt,openedAt,clickedAt,bounceReason";
    const parts: string[] = [header];
    for (const r of campaignReports.value) {
      const { csv } = await exportCampaignRecipients(r.id);
      const lines = String(csv || "").split(/\r?\n/);
      const camp = csvCell(r.name || "Untitled campaign");
      // Drop the per-campaign header row; prefix the campaign on each data row.
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i]) continue;
        parts.push(`${camp},${lines[i]}`);
      }
    }
    triggerCsvDownload("campaign-recipients.csv", parts.join("\r\n"));
  } catch (e: any) {
    error.value = e?.message || "Couldn't export reports.";
  } finally {
    exporting.value = false;
  }
}

// RFC-4180 cell quoting (mirrors the server) for the prefixed campaign column.
function csvCell(v: unknown) {
  const str = v == null ? "" : String(v);
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

// Browser-only CSV download with a UTF-8 BOM for spreadsheet encoding detection.
function triggerCsvDownload(filename: string, csv: string) {
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="reports">
    <header class="rep-header">
      <div class="rep-header-text">
        <h1>Reports</h1>
        <p class="rep-lede">Campaign performance, audience health, and deliverability at a glance.</p>
      </div>
      <div class="rep-header-actions">
        <NuxtLink to="/app/reports/revenue" class="rep-revenue-link">Revenue report →</NuxtLink>
        <Button variant="ghost" :disabled="exporting || demo" :loading="exporting" @click="onExport">
          <template #leading><Icon name="download" size="sm" /></template>
          {{ exporting ? "Exporting…" : "Export CSV" }}
        </Button>
      </div>
    </header>

    <p v-if="error" class="rep-error">{{ error }}</p>

    <!-- Tutorial / onboarding overlay — only in demo mode. Explains the page,
         offers a dismiss CTA, and notes it vanishes after the first real send. -->
    <AppReportsOnboarding v-if="demo" @dismiss="onDismiss" />

    <!-- Widgets — one component (and one agent) per widget. Each takes its data
         slice + a `demo` flag so it can badge sample data. -->
    <AppReportsKpiStrip :data="kpiData" :demo="demo" />

    <div class="rep-two-col">
      <AppReportsTrend :data="trendData" :demo="demo" />
      <AppReportsEngagement :data="engagementData" :demo="demo" />
    </div>

    <AppReportsTable :data="tableData" :demo="demo" :loading="loading" />
  </div>
</template>

<style scoped>
.reports {
  display: flex;
  flex-direction: column;
  gap: var(--space-7);
}
.rep-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-5);
  flex-wrap: wrap;
}
.rep-header-text { min-width: 0; }
.rep-header-actions { display: flex; align-items: center; gap: var(--space-4); }
.rep-revenue-link {
  font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600;
  color: var(--link-color); text-decoration: none; white-space: nowrap;
}
.rep-revenue-link:hover { text-decoration: underline; }
.rep-header h1 {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: var(--tracking-tight);
  line-height: var(--leading-tight);
  margin: 0 0 var(--space-2);
  color: var(--color-ink);
}
.rep-lede {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-md);
  color: var(--color-ink-soft);
}
.rep-error {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-radius: var(--radius-md);
}
/* Trend + engagement side by side on wide screens, stacked on narrow. */
.rep-two-col {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
  gap: var(--space-5);
}
@media (max-width: 960px) {
  .rep-two-col { grid-template-columns: 1fr; }
}
</style>
