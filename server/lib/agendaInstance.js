// Shared Agenda instance. Singleton per-process.
//
// Both the API server (which enqueues jobs from Cloud Functions) and the
// worker (which processes them) call getAgenda(). Each process gets its own
// connection; Agenda coordinates job ownership via Mongo's atomic findAndModify
// (locking documents in the agendaJobs collection).
//
// The API server NEVER calls agenda.start() — it only enqueues. Only the
// worker calls start(), which begins consuming.
const Agenda = require("agenda");
const { optional } = require("./env");

let agenda = null;
let starting = null;

function makeAgenda() {
  const mongoUri = optional("PARSE_DATABASE_URI", "mongodb://localhost:27017/gorilla");
  return new Agenda({
    db: { address: mongoUri, collection: "agendaJobs" },
    processEvery: "5 seconds",
    maxConcurrency: 50,
    defaultConcurrency: 5,
    defaultLockLifetime: 60_000,
  });
}

async function getAgenda() {
  if (agenda) return agenda;
  if (starting) return starting;
  starting = (async () => {
    const a = makeAgenda();
    // Agenda emits 'ready' once Mongo is connected. Don't return before then —
    // a.define() / a.now() before connection silently no-op in some versions.
    await new Promise((resolve, reject) => {
      a.once("ready", resolve);
      a.once("error", reject);
    });
    agenda = a;
    starting = null;
    return a;
  })();
  return starting;
}

module.exports = { getAgenda };
