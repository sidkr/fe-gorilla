// ─────────────────────────────────────────────────────────────────────────────
// automation-tick worker job. CommonJS. NextPhase.md §6 B4 (enrollment runner).
//
// A repeatable Agenda job (every 60s) that walks every DUE active enrollment one
// step forward. "Due" = AutomationEnrollment with status="active" AND
// nextRunAt <= now, whose Automation is itself status="active" (paused/draft
// automations are skipped — pausing halts forward progress without losing state).
//
// Per enrollment, it executes the CURRENT step then advances:
//
//   send_email → render (merge + tracking + unsubscribe, reusing renderEmail +
//                getSesAdapter, the same libs sendEmail.js uses) → send to the
//                one contact → advance to nextStepId.
//   wait       → set nextRunAt = now + delayHours, stay on this step's "wait
//                satisfied" flag so the NEXT tick advances past it. (We model
//                wait as: first visit arms the timer; when the timer fires we
//                advance.) Implemented as: on entering a wait step we set
//                nextRunAt ahead and mark the step armed in context; when the
//                tick runs and the wait is already armed + due, we advance.
//   branch     → evaluate opened/clicked of the prior send (from enrollment
//                context) or a contact field → route to branchYesStepId /
//                branchNoStepId.
//   exit       → status="completed".
//
// IDEMPOTENT + SAFE TO RE-RUN: every state transition is derived from the
// enrollment's persisted (currentStepOrder, context) and re-fetched fresh, and
// a per-enrollment claim (claimedAt) guards against two ticks grabbing the same
// row. Re-running handle() with no due rows is a no-op.
//
// register(agenda) defines the repeat job; handle() is exported pure so tests
// drive it directly with no live Agenda (see fanout.test.ts pattern).
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getSesAdapter } = require("../../lib/ses");
const {
  resolveMergeFields,
  injectUnsubscribe,
  listUnsubHeaders,
} = require("../../lib/renderEmail");

// jobNames.js is frozen and has no AUTOMATION_TICK — define a local fallback
// (listed in Integration deltas so it can be promoted into jobNames.js later).
let AUTOMATION_TICK = "automation-tick";
try {
  const jobNames = require("../../lib/jobNames");
  if (jobNames && jobNames.AUTOMATION_TICK) AUTOMATION_TICK = jobNames.AUTOMATION_TICK;
} catch (_) {
  /* use the fallback */
}

const MK = { useMasterKey: true };
const HOUR_MS = 60 * 60 * 1000;
// A claim older than this is considered stale (a crashed tick) and reclaimable.
const CLAIM_TTL_MS = 5 * 60 * 1000;
const BATCH = 200;

function now() {
  return new Date();
}

// Build the merge-field map the renderer expects from a Contact. Mirrors the
// shape sendEmail's CampaignSend.mergeFields carries: top-level firstName/etc +
// a nested `custom` object.
function mergeFieldsFor(contact) {
  if (!contact) return {};
  return {
    firstName: contact.get("firstName") || "",
    lastName: contact.get("lastName") || "",
    email: contact.get("email") || "",
    custom: contact.get("customFields") || contact.get("custom") || {},
  };
}

// Resolve the org pointer id off an object (enrollment/automation) without a
// round-trip — pointers carry .id.
function orgOf(object) {
  const p = object.get("organization");
  return p || null;
}

// ── step executors ───────────────────────────────────────────────────────────
// Each returns the NEXT action for the enrollment: an object describing how to
// advance. Pure-ish (the send executor does I/O). Never throws past handleOne —
// a single bad enrollment must not sink the batch.

async function runSendEmail(enrollment, automation, step, contact) {
  const cfg = step.get("config") || {};
  const email = contact && contact.get("email");
  if (!email) {
    // Nothing to send to — treat as done with this step, advance.
    return { advance: true };
  }

  let html = resolveMergeFields(cfg.html || "", mergeFieldsFor(contact));
  // Automations don't have a CampaignSend/tracking-token chain wired yet; we
  // still resolve the unsubscribe placeholder so the email is compliant. (Open/
  // click tracking for branch decisions is read from enrollment.context, which a
  // future tracking hook would populate.)
  const unsubUrl = `${process.env.PUBLIC_BASE_URL || "http://localhost:3001"}/u/auto/${enrollment.id}`;
  html = injectUnsubscribe(html, unsubUrl);
  const headers = listUnsubHeaders(unsubUrl);

  const fromName = cfg.fromName || automation.get("name") || "Gorilla";
  const fromEmail = cfg.fromEmail || "hello@send.gorilla.email";

  await getSesAdapter().sendEmail({
    from: `${fromName} <${fromEmail}>`,
    to: email,
    replyTo: cfg.replyTo || fromEmail,
    subject: cfg.subject || "(no subject)",
    html,
    headers,
    campaignSend: null,
  });

  // Record on context which step last sent, so a following branch can key off it.
  return { advance: true, mark: { lastSentStepOrder: step.get("order") } };
}

// Wait: model with an armed flag in context keyed by step order. First time we
// reach a wait step (not armed), arm it + push nextRunAt out. When the tick runs
// it again and it's armed + due, advance. This makes "wait advances at nextRunAt"
// exact and idempotent.
function runWait(enrollment, step) {
  const cfg = step.get("config") || {};
  const delayHours = Number(cfg.delayHours);
  const hours = Number.isFinite(delayHours) && delayHours >= 0 ? delayHours : 0;
  const ctx = enrollment.get("context") || {};
  const armedKey = `wait_${step.get("order")}`;

  if (!ctx[armedKey]) {
    // Arm: schedule the wake-up. Stay on this step.
    const wakeAt = new Date(Date.now() + hours * HOUR_MS);
    return { stay: true, nextRunAt: wakeAt, mark: { [armedKey]: true } };
  }
  // Already armed and we're being run → the timer fired. Advance + clear flag.
  return { advance: true, mark: { [armedKey]: false } };
}

// Branch: evaluate condition, return the chosen target step id (or null → exit).
function runBranch(enrollment, step, contact) {
  const cfg = step.get("config") || {};
  const ctx = enrollment.get("context") || {};
  let yes = false;

  if (cfg.on === "opened") {
    yes = !!ctx.lastEmailOpened;
  } else if (cfg.on === "clicked") {
    yes = !!ctx.lastEmailClicked;
  } else if (cfg.on === "field") {
    const fields = mergeFieldsFor(contact);
    const raw =
      cfg.field && cfg.field.startsWith("custom.")
        ? (fields.custom || {})[cfg.field.slice(7)]
        : fields[cfg.field];
    yes = cfg.equals !== undefined ? raw === cfg.equals : !!raw;
  }

  const targetId = yes ? step.get("branchYesStepId") : step.get("branchNoStepId");
  return { branchTo: targetId || null };
}

// ── advance helpers ──────────────────────────────────────────────────────────
// Resolve a step id → its order within this automation (linear graphs use
// order; branch uses explicit ids). Returns the matching step's order or null.
function orderForStepId(steps, stepId) {
  if (!stepId) return null;
  const s = steps.find((x) => x.id === stepId);
  return s ? s.get("order") : null;
}

function mergeContext(enrollment, mark) {
  if (!mark) return;
  const ctx = enrollment.get("context") || {};
  for (const [k, v] of Object.entries(mark)) ctx[k] = v;
  enrollment.set("context", ctx);
}

async function completeEnrollment(enrollment, automation, terminal) {
  enrollment.set("status", terminal); // "completed" | "exited"
  enrollment.unset("nextRunAt");
  await enrollment.save(null, MK);
  const stats = automation.get("stats") || { enrolled: 0, completed: 0, exited: 0 };
  if (terminal === "completed") stats.completed = (stats.completed || 0) + 1;
  else stats.exited = (stats.exited || 0) + 1;
  automation.set("stats", stats);
  await automation.save(null, MK);
}

// Process ONE enrollment one step forward. Master key. Catches its own errors.
async function handleOne(enrollmentId, automationCache) {
  // Re-fetch authoritative state.
  const enrollment = await new Parse.Query("AutomationEnrollment")
    .include("contact")
    .get(enrollmentId, MK)
    .catch(() => null);
  if (!enrollment) return;
  if (enrollment.get("status") !== "active") return;

  const automationPtr = enrollment.get("automation");
  if (!automationPtr) return;
  const aid = automationPtr.id;

  // Cache automation + its steps across the batch.
  let entry = automationCache.get(aid);
  if (!entry) {
    const automation = await new Parse.Query("Automation").get(aid, MK).catch(() => null);
    if (!automation) {
      automationCache.set(aid, null);
      return;
    }
    const sq = new Parse.Query("AutomationStep");
    sq.equalTo("automation", automation);
    sq.ascending("order");
    sq.limit(1000);
    const steps = await sq.find(MK);
    entry = { automation, steps };
    automationCache.set(aid, entry);
  }
  if (!entry) return;
  const { automation, steps } = entry;

  // Skip if the automation isn't active (paused/draft halts the journey).
  if (automation.get("status") !== "active") return;

  const order = enrollment.get("currentStepOrder") || 0;
  const step = steps.find((s) => s.get("order") === order);
  if (!step) {
    // Ran off the end of the graph → complete.
    await completeEnrollment(enrollment, automation, "completed");
    return;
  }

  const contact = enrollment.get("contact");
  const type = step.get("type");

  let result;
  try {
    if (type === "send_email") {
      result = await runSendEmail(enrollment, automation, step, contact);
    } else if (type === "wait") {
      result = runWait(enrollment, step);
    } else if (type === "branch") {
      result = runBranch(enrollment, step, contact);
    } else if (type === "exit") {
      result = { exit: true };
    } else {
      // Unknown step type → advance past it defensively.
      result = { advance: true };
    }
  } catch (err) {
    // Step execution failed (e.g. SES error). Leave the enrollment active and
    // bump nextRunAt so the next tick retries — never throw past here.
    console.error(
      `[automationTick] step ${type} failed for enrollment ${enrollment.id}:`,
      err && err.message,
    );
    enrollment.set("nextRunAt", new Date(Date.now() + 5 * 60 * 1000));
    enrollment.unset("claimedAt");
    await enrollment.save(null, MK).catch(() => {});
    return;
  }

  // ── apply the result ────────────────────────────────────────────────────────
  mergeContext(enrollment, result.mark);

  if (result.exit) {
    await completeEnrollment(enrollment, automation, "exited");
    return;
  }

  if (result.stay) {
    // Wait armed: stay on this step, wake later.
    enrollment.set("nextRunAt", result.nextRunAt || new Date());
    enrollment.unset("claimedAt");
    await enrollment.save(null, MK);
    return;
  }

  if (result.branchTo !== undefined) {
    const targetOrder = orderForStepId(steps, result.branchTo);
    if (targetOrder == null) {
      // No branch target → end the journey.
      await completeEnrollment(enrollment, automation, "completed");
      return;
    }
    enrollment.set("currentStepOrder", targetOrder);
    enrollment.set("nextRunAt", new Date()); // due immediately
    enrollment.unset("claimedAt");
    await enrollment.save(null, MK);
    return;
  }

  if (result.advance) {
    // Follow nextStepId when present (handles non-contiguous graphs); else the
    // next order. Running off the end completes the journey.
    let nextOrder;
    const nextId = step.get("nextStepId");
    if (nextId) {
      nextOrder = orderForStepId(steps, nextId);
    } else {
      const candidate = order + 1;
      nextOrder = steps.some((s) => s.get("order") === candidate) ? candidate : null;
    }
    if (nextOrder == null) {
      await completeEnrollment(enrollment, automation, "completed");
      return;
    }
    enrollment.set("currentStepOrder", nextOrder);
    enrollment.set("nextRunAt", new Date()); // due immediately for the next tick
    enrollment.unset("claimedAt");
    await enrollment.save(null, MK);
    return;
  }
}

// ── handle ───────────────────────────────────────────────────────────────────
// Select due active enrollments and walk each one step. Returns a small summary
// so tests/observability can assert on it. Idempotent: re-running with nothing
// due processes zero rows.
async function handle(data) {
  const limit = (data && data.limit) || BATCH;
  const at = now();

  // Candidate enrollments: active + due. (We filter automation-active inside
  // handleOne to avoid a join here.) Claim each before processing so a parallel
  // tick won't double-run it.
  const q = new Parse.Query("AutomationEnrollment");
  q.equalTo("status", "active");
  q.lessThanOrEqualTo("nextRunAt", at);
  q.ascending("nextRunAt");
  q.limit(limit);
  const due = await q.find(MK);

  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS);
  const claimed = [];
  for (const e of due) {
    const c = e.get("claimedAt");
    if (c && c > staleBefore) continue; // someone else is on it
    e.set("claimedAt", at);
    try {
      await e.save(null, MK);
      claimed.push(e.id);
    } catch (_) {
      /* lost the claim race — skip */
    }
  }

  const automationCache = new Map();
  let processed = 0;
  for (const id of claimed) {
    await handleOne(id, automationCache);
    processed++;
  }

  return { found: due.length, claimed: claimed.length, processed };
}

function register(agenda) {
  agenda.define(AUTOMATION_TICK, { concurrency: 1, lockLifetime: 55000 }, (job) =>
    handle(job.attrs.data || {}),
  );
  // Repeat every 60s. every() is idempotent on the job name.
  agenda.every("60 seconds", AUTOMATION_TICK, {}, { skipImmediate: false });
}

module.exports = {
  register,
  handle,
  handleOne,
  // exported for tests
  AUTOMATION_TICK,
  runWait,
  runBranch,
  mergeFieldsFor,
};
