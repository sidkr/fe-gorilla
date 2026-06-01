// ─────────────────────────────────────────────────────────────────────────────
// Ops maintenance tick. CommonJS. Recurring Agenda job (every 30s).
//
// Two responsibilities, both addressing "a dead/wedged worker silently strands
// campaigns" (launch audit P0):
//
//   1. HEARTBEAT — upsert a singleton WorkerHeartbeat row with the current time.
//      The API server's GET /ready reads it to decide whether the worker (and
//      therefore the send/automation queue) is alive. Because this runs THROUGH
//      Agenda, a stalled queue stops the heartbeat too — so it proves end-to-end
//      processing, not just that the process is up.
//
//   2. STUCK-CAMPAIGN SWEEP — find campaigns parked in "sending" and:
//        a. recover any whose CampaignSend rows are all terminal (a finalize that
//           never ran because the worker died between the last send and the
//           finalize call) by re-invoking finalizeCampaignIfComplete; and
//        b. LOG (for alerting) any still genuinely stuck past STUCK_AFTER_MS.
//      We never auto-fail a "sending" campaign — a large list can legitimately
//      take a long time; we only recover provably-complete ones and surface the
//      rest.
//
// handle() is exported pure (deps-injectable) so tests can drive it without
// Agenda. register(agenda) wires the recurring schedule.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { finalizeCampaignIfComplete } = require("../../lib/campaignCounters");

let OPS_TICK = "ops-tick";
try {
  const j = require("../../lib/jobNames");
  if (j.OPS_TICK) OPS_TICK = j.OPS_TICK;
} catch (_) {
  /* fall back to the local constant */
}

const MK = { useMasterKey: true };
const HEARTBEAT_NAME = "worker";
const STUCK_AFTER_MS = 30 * 60 * 1000; // 30 minutes with no progress → alert

async function writeHeartbeat(now) {
  const q = new Parse.Query("WorkerHeartbeat");
  q.equalTo("name", HEARTBEAT_NAME);
  let hb = await q.first(MK);
  if (!hb) {
    hb = new (Parse.Object.extend("WorkerHeartbeat"))();
    hb.set("name", HEARTBEAT_NAME);
  }
  hb.set("beatAt", now);
  await hb.save(null, MK);
}

async function sweepStuckCampaigns(now, log) {
  const q = new Parse.Query("Campaign");
  q.equalTo("status", "sending");
  q.limit(1000);
  const sending = await q.find(MK);

  let recovered = 0;
  const stuck = [];
  for (const c of sending) {
    // All rows terminal? finalize flips it sending→sent and returns true.
    if (await finalizeCampaignIfComplete(c.id)) {
      recovered++;
      continue;
    }
    // Still has queued rows. Flag if there's been no progress for a long time
    // (updatedAt advances as counters are bumped during an active send).
    const last = c.updatedAt ? c.updatedAt.getTime() : 0;
    if (now.getTime() - last > STUCK_AFTER_MS) stuck.push(c.id);
  }

  if (recovered) {
    log(`[opsTick] recovered ${recovered} campaign(s) stranded in "sending".`);
  }
  if (stuck.length) {
    log(
      `[opsTick] WARNING: ${stuck.length} campaign(s) stuck in "sending" for ` +
        `>${Math.round(STUCK_AFTER_MS / 60000)}m: ${stuck.join(", ")}. ` +
        "Check worker liveness + queue depth.",
    );
  }
  return { recovered, stuck };
}

async function handle(_data = {}, deps = {}) {
  const now = deps.now || new Date();
  const log = deps.log || console.warn;
  const out = { heartbeat: false, recovered: 0, stuck: [] };

  try {
    await writeHeartbeat(now);
    out.heartbeat = true;
  } catch (e) {
    log(`[opsTick] heartbeat write failed: ${(e && e.message) || e}`);
  }
  try {
    const r = await sweepStuckCampaigns(now, log);
    out.recovered = r.recovered;
    out.stuck = r.stuck;
  } catch (e) {
    log(`[opsTick] stuck-campaign sweep failed: ${(e && e.message) || e}`);
  }
  return out;
}

function register(agenda) {
  agenda.define(OPS_TICK, { concurrency: 1, lockLifetime: 25000 }, (job) =>
    handle(job.attrs.data || {}),
  );
  // every() is idempotent on the job name.
  agenda.every("30 seconds", OPS_TICK, {}, { skipImmediate: false });
}

module.exports = {
  register,
  handle,
  writeHeartbeat,
  sweepStuckCampaigns,
  HEARTBEAT_NAME,
  STUCK_AFTER_MS,
};
