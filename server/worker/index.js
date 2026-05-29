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

async function start() {
  initParseClient();
  const agenda = await getAgenda();

  // Register job handlers via side-effect imports. Each handler calls
  // agenda.define(...) at load time. New handlers: add a require here.
  // require("./jobs/campaignFanout");
  // require("./jobs/sendEmail");
  // require("./jobs/webhookIngest");

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
