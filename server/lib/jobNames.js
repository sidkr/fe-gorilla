// ─────────────────────────────────────────────────────────────────────────────
// Agenda job-name constants. CommonJS. The single source of truth shared by
// enqueuers (cloud fns: `getAgenda().now(NAME, data)`) and the handlers that
// `agenda.define(NAME, ...)`. Never inline these strings — import from here so a
// typo can't split an enqueuer from its handler.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  CAMPAIGN_FANOUT: "campaign-fanout",
  SEND_EMAIL: "send-email",
  WEBHOOK_INGEST: "webhook-ingest",
  IMPORT_CSV: "import-csv",
  AUTOMATION_TICK: "automation-tick",
};
