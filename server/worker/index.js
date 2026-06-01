// Long-running worker process. Started by `npm run worker` / `dev:worker`.
// Consumes jobs from the Mongo-backed Agenda queue. Talks to Parse via the
// Node SDK with the master key.
//
// Job handlers live in sibling files under server/worker/jobs/. Each file
// requires the shared Agenda instance and calls agenda.define(...). The
// worker requires all handlers (side-effect imports) before calling
// agenda.start() so every handler is registered before processing begins.
const { initParseClient } = require("../lib/parseClient");
const { getAgenda } = require("../lib/agendaInstance");
const { assertProductionConfig } = require("../lib/env");

async function start() {
  // Refuse to boot in production without the secrets/links the send path needs
  // (forgeable tokens / localhost URLs otherwise). No-op in dev/test.
  assertProductionConfig();
  initParseClient();
  const agenda = await getAgenda();

  // Register job handlers. Each handler module exports register(agenda) and
  // calls agenda.define(NAME, ...) using the shared jobNames constants. New
  // handlers: require the module and call register(agenda) here.
  require("./jobs/campaignFanout").register(agenda);
  require("./jobs/sendEmail").register(agenda);
  require("./jobs/webhookIngest").register(agenda);
  // Growth-phase jobs (NextPhase). importCsv is enqueued on demand by the
  // startContactImport cloud fn; automationTick.register() ALSO sets up its own
  // recurring `agenda.every("60 seconds", …)` schedule. Both were defined but
  // never wired into the worker — so CSV imports stayed pending and automations
  // never ran until this registration.
  require("./jobs/importCsv").register(agenda);
  require("./jobs/automationTick").register(agenda);
  require("./jobs/ingestConversion").register(agenda);
  // Ops maintenance: worker heartbeat (for /ready) + stuck-campaign recovery.
  require("./jobs/opsTick").register(agenda);

  await agenda.start();
  console.log(
    "\x1b[33m%s\x1b[0m",
    `Worker started (NODE_ENV=${process.env.NODE_ENV || "development"})`
  );
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});

async function shutdown(signal) {
  console.log(`Worker received ${signal}, draining...`);
  try {
    const agenda = await getAgenda();
    await agenda.stop();
  } catch (e) {
    console.error("Error stopping agenda:", e);
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
