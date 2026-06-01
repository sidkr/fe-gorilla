// ─────────────────────────────────────────────────────────────────────────────
// Health/readiness endpoints. CommonJS. Mounted by server/routes/index.js BEFORE
// the Parse /api handler and the SPA fallback, so they're plain top-level paths
// (not consumed by Parse, not swallowed by the history fallback).
//
//   GET /health  → liveness. 200 as long as the process serves requests. No deps.
//                  Use this for a container/LB liveness probe.
//   GET /ready   → readiness. 200 only if Mongo is reachable AND the worker
//                  heartbeat is fresh; 503 otherwise. Use for a readiness probe
//                  + alerting (a dead worker → 503 → page).
//
// The worker writes WorkerHeartbeat.beatAt every ~30s (server/worker/jobs/
// opsTick.js). We consider it alive within 3× that window.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const Parse = require("parse/node");
const { initParseClient } = require("../lib/parseClient");

const WORKER_STALE_MS = 90 * 1000; // 3× the 30s ops tick

function mount(app) {
  // /ready runs a master-key query, so the standalone SDK must be initialized.
  initParseClient();
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({ ok: true, ts: new Date().toISOString() });
  });

  router.get("/ready", async (_req, res) => {
    const out = { ok: true, db: false, worker: "unknown" };
    try {
      const q = new Parse.Query("WorkerHeartbeat");
      q.equalTo("name", "worker");
      const hb = await q.first({ useMasterKey: true });
      out.db = true; // the query resolving (even to null) proves Mongo is up
      if (hb && hb.get("beatAt")) {
        const ageMs = Date.now() - hb.get("beatAt").getTime();
        out.workerAgeMs = ageMs;
        out.worker = ageMs <= WORKER_STALE_MS ? "alive" : "stale";
      } else {
        out.worker = "absent";
      }
    } catch (e) {
      out.ok = false;
      out.error = (e && e.message) || "database unreachable";
      return res.status(503).json(out);
    }
    if (out.worker !== "alive") {
      out.ok = false; // stale or never-seen worker → not ready to send
      return res.status(503).json(out);
    }
    return res.json(out);
  });

  app.use(router);
}

module.exports = { mount };
