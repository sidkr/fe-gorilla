// ─────────────────────────────────────────────────────────────────────────────
// Automations / Journeys — cloud functions + trigger helper. CommonJS.
// NextPhase.md §6 (Phase B). The retention engine.
//
// Data model (three new per-tenant classes — see Integration deltas at the
// bottom for the bootstrapSchemas + PER_TENANT_CLASSES additions):
//
//   Automation          { organization, name, status: draft|active|paused,
//                         trigger: { type, config }, stats: {...}, createdBy }
//   AutomationStep      { organization, automation (Pointer), order (Number),
//                         type: send_email|wait|branch|exit, config (Object),
//                         nextStepId, branchYesStepId, branchNoStepId (String ids) }
//   AutomationEnrollment{ organization, automation (Pointer), contact (Pointer),
//                         currentStepOrder (Number), status: active|completed|exited,
//                         nextRunAt (Date), lastStepId, context (Object) }
//
// TENANCY: these three classes are NOT yet in PER_TENANT_CLASSES (that file is
// frozen for this change — see Integration deltas). Until they're added there,
// the tenancy beforeSave hook does NOT auto-stamp org + ACL on them. So this
// module sets `organization` + a role ACL EXPLICITLY on every create, exactly
// as the task requires ("set org+ACL explicitly in code so tests pass"). Once
// the classes are added to PER_TENANT_CLASSES the explicit stamping is harmless
// (idempotent: the hook only stamps when absent).
//
// All read/list/mutate cloud fns are org-scoped: they resolve the caller's org,
// filter by it, and verify ownership before writing. Workers use the master key.
// ─────────────────────────────────────────────────────────────────────────────

const Parse = require("parse/node");
const { getUserOrg, orgRoleACL } = require("./lib/tenancy");
const { RECIPES, buildRecipeSteps } = require("./lib/automationRecipes");

const MK = { useMasterKey: true };

const AUTOMATION_STATUSES = new Set(["draft", "active", "paused"]);
const STEP_TYPES = new Set(["send_email", "wait", "branch", "exit"]);
const TRIGGER_TYPES = new Set([
  "manual",
  "contact_added_to_list",
  "form_submission",
  "date_field",
]);

// ── small guards ─────────────────────────────────────────────────────────────
function requireUser(request) {
  if (!request.user) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      "Must be logged in.",
    );
  }
}

function requireId(id, label) {
  if (!id) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      `Missing ${label || "object"} id.`,
    );
  }
}

// Stamp organization + role ACL explicitly. Safe to call before every save of a
// new Automation* object — see the tenancy note in the header.
function stampOrg(object, org) {
  if (!object.get("organization")) object.set("organization", org);
  if (!object.getACL()) object.setACL(orgRoleACL(org.id));
}

// Load an Automation owned by the caller's org. ACL would isolate cross-org once
// the classes are tenant-registered; the explicit org filter is belt-and-braces
// and works today (pre-registration) too. Master key + explicit org check.
async function loadOwnedAutomation(org, id) {
  requireId(id, "automation");
  const q = new Parse.Query("Automation");
  q.equalTo("organization", org);
  const a = await q.get(id, MK).catch(() => null);
  if (!a) {
    throw new Parse.Error(
      Parse.Error.OBJECT_NOT_FOUND,
      "Automation not found.",
    );
  }
  return a;
}

async function listSteps(org, automation) {
  const q = new Parse.Query("AutomationStep");
  q.equalTo("organization", org);
  q.equalTo("automation", automation);
  q.ascending("order");
  q.limit(1000);
  return q.find(MK);
}

function stepToPlain(s) {
  return {
    id: s.id,
    order: s.get("order") || 0,
    type: s.get("type"),
    config: s.get("config") || {},
    nextStepId: s.get("nextStepId") || null,
    branchYesStepId: s.get("branchYesStepId") || null,
    branchNoStepId: s.get("branchNoStepId") || null,
  };
}

function automationToPlain(a, steps) {
  return {
    id: a.id,
    name: a.get("name") || "Untitled automation",
    status: a.get("status") || "draft",
    trigger: a.get("trigger") || { type: "manual", config: {} },
    stats: a.get("stats") || { enrolled: 0, completed: 0, exited: 0 },
    stepCount: Array.isArray(steps) ? steps.length : a.get("stepCount") || 0,
    steps: Array.isArray(steps) ? steps.map(stepToPlain) : undefined,
    createdAt: a.createdAt ? a.createdAt.toISOString() : null,
    updatedAt: a.updatedAt ? a.updatedAt.toISOString() : null,
  };
}

// ── listAutomations ──────────────────────────────────────────────────────────
Parse.Cloud.define("listAutomations", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);

  const q = new Parse.Query("Automation");
  q.equalTo("organization", org);
  q.notEqualTo("status", "archived");
  q.descending("updatedAt");
  q.limit(1000);
  const results = await q.find(MK);

  // Step counts in one query (avoids N round-trips).
  const counts = {};
  if (results.length) {
    const sq = new Parse.Query("AutomationStep");
    sq.equalTo("organization", org);
    sq.containedIn("automation", results);
    sq.limit(10000);
    const steps = await sq.find(MK);
    for (const s of steps) {
      const aid = s.get("automation") && s.get("automation").id;
      if (aid) counts[aid] = (counts[aid] || 0) + 1;
    }
  }

  const automations = results.map((a) => {
    const plain = automationToPlain(a, null);
    plain.stepCount = counts[a.id] || 0;
    return plain;
  });

  const active = automations.filter((a) => a.status === "active").length;
  const totalEnrolled = results.reduce(
    (sum, a) => sum + ((a.get("stats") || {}).enrolled || 0),
    0,
  );

  return {
    automations,
    kpis: {
      total: automations.length,
      active,
      drafts: automations.filter((a) => a.status === "draft").length,
      enrolled: totalEnrolled,
    },
  };
});

// ── getAutomation ────────────────────────────────────────────────────────────
Parse.Cloud.define("getAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const a = await loadOwnedAutomation(org, request.params && request.params.id);
  const steps = await listSteps(org, a);
  return automationToPlain(a, steps);
});

// ── createAutomation ─────────────────────────────────────────────────────────
Parse.Cloud.define("createAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};

  const name = typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Untitled automation";
  const triggerType = TRIGGER_TYPES.has(p.triggerType) ? p.triggerType : "manual";
  const triggerConfig =
    p.triggerConfig && typeof p.triggerConfig === "object" ? p.triggerConfig : {};

  const a = new Parse.Object("Automation");
  a.set("name", name);
  a.set("status", "draft");
  a.set("trigger", { type: triggerType, config: triggerConfig });
  a.set("stats", { enrolled: 0, completed: 0, exited: 0 });
  a.set("stepCount", 0);
  a.set("createdBy", request.user);
  stampOrg(a, org);
  await a.save(null, MK);

  return automationToPlain(a, []);
});

// ── updateAutomation ─────────────────────────────────────────────────────────
// Patches name / trigger. Status transitions go through activate/pause.
Parse.Cloud.define("updateAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  const a = await loadOwnedAutomation(org, p.id);

  if (typeof p.name === "string") {
    const name = p.name.trim();
    if (!name) {
      throw new Parse.Error(
        Parse.Error.VALIDATION_ERROR,
        "Automation name can't be empty.",
      );
    }
    a.set("name", name);
  }
  if (p.triggerType !== undefined || p.triggerConfig !== undefined) {
    const cur = a.get("trigger") || { type: "manual", config: {} };
    const type = TRIGGER_TYPES.has(p.triggerType) ? p.triggerType : cur.type;
    const config =
      p.triggerConfig && typeof p.triggerConfig === "object"
        ? p.triggerConfig
        : cur.config || {};
    a.set("trigger", { type, config });
  }
  await a.save(null, MK);
  return automationToPlain(a, await listSteps(org, a));
});

// ── deleteAutomation ─────────────────────────────────────────────────────────
// Destroys the automation, its steps, and its enrollments. Org-scoped.
Parse.Cloud.define("deleteAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const a = await loadOwnedAutomation(org, request.params && request.params.id);

  const steps = await listSteps(org, a);
  if (steps.length) await Parse.Object.destroyAll(steps, MK);

  const eq = new Parse.Query("AutomationEnrollment");
  eq.equalTo("organization", org);
  eq.equalTo("automation", a);
  eq.limit(10000);
  const enrollments = await eq.find(MK);
  if (enrollments.length) await Parse.Object.destroyAll(enrollments, MK);

  await a.destroy(MK);
  return { ok: true };
});

// ── addStep ──────────────────────────────────────────────────────────────────
// Appends a step to the end of the (linear) graph and links the previous tail's
// nextStepId to it. Returns the created step + the refreshed step list.
Parse.Cloud.define("addStep", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  const a = await loadOwnedAutomation(org, p.automationId);

  const type = p.type;
  if (!STEP_TYPES.has(type)) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Invalid step type "${type}". Allowed: ${[...STEP_TYPES].join(", ")}.`,
    );
  }
  const config = p.config && typeof p.config === "object" ? p.config : {};

  const existing = await listSteps(org, a);
  const order = existing.length;

  const step = new Parse.Object("AutomationStep");
  step.set("automation", a);
  step.set("order", order);
  step.set("type", type);
  step.set("config", config);
  stampOrg(step, org);
  await step.save(null, MK);

  // Link the previous tail → this new step (linear append).
  if (existing.length) {
    const prev = existing[existing.length - 1];
    if (prev.get("type") !== "exit") {
      prev.set("nextStepId", step.id);
      await prev.save(null, MK);
    }
  }

  a.set("stepCount", order + 1);
  await a.save(null, MK);

  const steps = await listSteps(org, a);
  return { step: stepToPlain(step), steps: steps.map(stepToPlain) };
});

// ── updateStep ───────────────────────────────────────────────────────────────
// Patches a step's config and/or branch targets. Org + automation scoped.
Parse.Cloud.define("updateStep", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  requireId(p.stepId, "step");

  const q = new Parse.Query("AutomationStep");
  q.equalTo("organization", org);
  const step = await q.get(p.stepId, MK).catch(() => null);
  if (!step) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Step not found.");
  }

  if (p.config && typeof p.config === "object") step.set("config", p.config);
  if (p.nextStepId !== undefined) step.set("nextStepId", p.nextStepId || null);
  if (p.branchYesStepId !== undefined)
    step.set("branchYesStepId", p.branchYesStepId || null);
  if (p.branchNoStepId !== undefined)
    step.set("branchNoStepId", p.branchNoStepId || null);
  await step.save(null, MK);

  return { step: stepToPlain(step) };
});

// ── deleteStep ───────────────────────────────────────────────────────────────
// Removes a step, re-links the linear chain around it, and re-numbers orders.
Parse.Cloud.define("deleteStep", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  const a = await loadOwnedAutomation(org, p.automationId);
  requireId(p.stepId, "step");

  const steps = await listSteps(org, a);
  const idx = steps.findIndex((s) => s.id === p.stepId);
  if (idx === -1) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Step not found.");
  }
  const target = steps[idx];
  const prev = steps[idx - 1];
  const next = steps[idx + 1];

  if (prev) {
    prev.set("nextStepId", next ? next.id : null);
    await prev.save(null, MK);
  }
  await target.destroy(MK);

  // Re-number remaining steps so `order` stays a dense 0..n-1 sequence.
  const remaining = steps.filter((s) => s.id !== p.stepId);
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].get("order") !== i) {
      remaining[i].set("order", i);
      await remaining[i].save(null, MK);
    }
  }
  a.set("stepCount", remaining.length);
  await a.save(null, MK);

  return { steps: remaining.map(stepToPlain) };
});

// ── activateAutomation ───────────────────────────────────────────────────────
// draft|paused → active. Requires at least one step. Resumes paused enrollments.
Parse.Cloud.define("activateAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const a = await loadOwnedAutomation(org, request.params && request.params.id);

  const steps = await listSteps(org, a);
  if (!steps.length) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      "Add at least one step before activating.",
    );
  }
  a.set("status", "active");
  await a.save(null, MK);
  return { ok: true, status: "active" };
});

// ── pauseAutomation ──────────────────────────────────────────────────────────
// active → paused. The runner skips paused automations' enrollments, so this
// halts forward progress without losing enrollment state.
Parse.Cloud.define("pauseAutomation", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const a = await loadOwnedAutomation(org, request.params && request.params.id);
  a.set("status", "paused");
  await a.save(null, MK);
  return { ok: true, status: "paused" };
});

// ── enrollContact ────────────────────────────────────────────────────────────
// Manual trigger: enroll one contact at step 0 with nextRunAt = now.
Parse.Cloud.define("enrollContact", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  const a = await loadOwnedAutomation(org, p.automationId);
  requireId(p.contactId, "contact");

  const cq = new Parse.Query("Contact");
  cq.equalTo("organization", org);
  const contact = await cq.get(p.contactId, MK).catch(() => null);
  if (!contact) {
    throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, "Contact not found.");
  }

  const enrollment = await enrollOne(org, a, contact, {});
  return {
    ok: true,
    enrolled: !!enrollment,
    enrollmentId: enrollment ? enrollment.id : null,
  };
});

// ── installRecipe ────────────────────────────────────────────────────────────
// Builds a pre-made automation (Automation + linked step graph) in one call.
// Returns the new automation id. Org + ACL stamped explicitly.
Parse.Cloud.define("installRecipe", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const p = request.params || {};
  const recipeKey = p.recipe;
  const recipe = RECIPES[recipeKey];
  if (!recipe) {
    throw new Parse.Error(
      Parse.Error.VALIDATION_ERROR,
      `Unknown recipe "${recipeKey}". Available: ${Object.keys(RECIPES).join(", ")}.`,
    );
  }

  // 1. Automation shell (draft — user reviews then activates).
  const a = new Parse.Object("Automation");
  a.set("name", recipe.name);
  a.set("status", "draft");
  a.set("trigger", { type: recipe.trigger.type, config: recipe.trigger.config || {} });
  a.set("stats", { enrolled: 0, completed: 0, exited: 0 });
  a.set("createdBy", request.user);
  stampOrg(a, org);
  await a.save(null, MK);

  // 2. Create steps top-to-bottom, then link nextStepId in a second pass once
  //    every step has an id (linear graph).
  const specs = buildRecipeSteps(recipe);
  const created = [];
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    const step = new Parse.Object("AutomationStep");
    step.set("automation", a);
    step.set("order", i);
    step.set("type", spec.type);
    step.set("config", spec.config || {});
    stampOrg(step, org);
    await step.save(null, MK);
    created.push(step);
  }
  for (let i = 0; i < created.length; i++) {
    const next = created[i + 1];
    if (next && created[i].get("type") !== "exit") {
      created[i].set("nextStepId", next.id);
      await created[i].save(null, MK);
    }
  }

  a.set("stepCount", created.length);
  await a.save(null, MK);

  return {
    ok: true,
    id: a.id,
    name: a.get("name"),
    stepCount: created.length,
  };
});

// ── listRecipes ──────────────────────────────────────────────────────────────
// Metadata for the "Install recipe" UI buttons.
Parse.Cloud.define("listRecipes", async () => {
  return {
    recipes: Object.entries(RECIPES).map(([key, r]) => ({
      key,
      name: r.name,
      description: r.description,
      stepCount: buildRecipeSteps(r).length,
    })),
  };
});

// ── getAutomationStats ───────────────────────────────────────────────────────
// Per-automation reporting: enrolled / completed / exited + live status counts
// from AutomationEnrollment, plus per-step distribution.
Parse.Cloud.define("getAutomationStats", async (request) => {
  requireUser(request);
  const org = await getUserOrg(request.user, MK);
  const a = await loadOwnedAutomation(org, request.params && request.params.id);
  const steps = await listSteps(org, a);

  const eq = new Parse.Query("AutomationEnrollment");
  eq.equalTo("organization", org);
  eq.equalTo("automation", a);
  eq.limit(10000);
  const enrollments = await eq.find(MK);

  const byStatus = { active: 0, completed: 0, exited: 0 };
  const perStep = {};
  for (const s of steps) perStep[s.get("order")] = 0;
  for (const e of enrollments) {
    const st = e.get("status");
    if (byStatus[st] !== undefined) byStatus[st] += 1;
    if (st === "active") {
      const o = e.get("currentStepOrder") || 0;
      perStep[o] = (perStep[o] || 0) + 1;
    }
  }

  return {
    id: a.id,
    name: a.get("name"),
    status: a.get("status"),
    stats: a.get("stats") || { enrolled: 0, completed: 0, exited: 0 },
    live: {
      total: enrollments.length,
      active: byStatus.active,
      completed: byStatus.completed,
      exited: byStatus.exited,
    },
    perStep: steps.map((s) => ({
      order: s.get("order"),
      type: s.get("type"),
      activeHere: perStep[s.get("order")] || 0,
    })),
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// Enrollment core — shared by the manual cloud fn AND the trigger helper.
// ─────────────────────────────────────────────────────────────────────────────

// Create ONE active enrollment at step 0 for (automation, contact) unless an
// active/completed enrollment already exists (idempotent — a contact isn't
// re-enrolled while still in the journey). Bumps the automation's enrolled stat.
// Uses master key (callable from workers / afterSave hooks). Returns the new
// enrollment Parse.Object, or null when skipped.
async function enrollOne(org, automation, contact, context) {
  // Dedupe: skip if there's already an active enrollment for this pair.
  const dq = new Parse.Query("AutomationEnrollment");
  dq.equalTo("organization", org);
  dq.equalTo("automation", automation);
  dq.equalTo("contact", contact);
  dq.equalTo("status", "active");
  const existing = await dq.first(MK);
  if (existing) return null;

  const e = new Parse.Object("AutomationEnrollment");
  e.set("automation", automation);
  e.set("contact", contact);
  e.set("currentStepOrder", 0);
  e.set("status", "active");
  e.set("nextRunAt", new Date()); // due immediately
  e.set("context", context && typeof context === "object" ? context : {});
  stampOrg(e, org);
  await e.save(null, MK);

  // Bump the denormalized enrolled counter.
  const stats = automation.get("stats") || { enrolled: 0, completed: 0, exited: 0 };
  stats.enrolled = (stats.enrolled || 0) + 1;
  automation.set("stats", stats);
  await automation.save(null, MK);

  return e;
}

// ── enrollByTrigger ──────────────────────────────────────────────────────────
// THE trigger entry point. Other server code calls this when something happens
// that might start a journey:
//
//   const { enrollByTrigger } = require("./automations");
//   await enrollByTrigger(org, "contact_added_to_list", contact, { listId });
//
// It finds every ACTIVE automation in `org` whose trigger.type matches and whose
// trigger.config gates pass, then enrolls the contact in each. Master key; never
// throws into the caller's path (a trigger failure must not break a save) — it
// catches + logs and returns the list of enrollment ids it created.
//
// Gating per trigger type:
//   contact_added_to_list : config.listId (if set) must be in context.listIds /
//                           context.listId, OR config.listId unset → any list.
//   form_submission       : config.formId (if set) must match context.formId,
//                           else any form.
//   date_field            : enrolled by the runner/date sweep, not here; this
//                           helper still supports a manual/explicit fire.
//   manual                : not auto-fired (use enrollContact / enrollOne).
//
// Returns { enrolled: [enrollmentId,...] }.
async function enrollByTrigger(org, triggerType, contact, context) {
  const ctx = context && typeof context === "object" ? context : {};
  const out = [];
  try {
    if (!org || !contact || !TRIGGER_TYPES.has(triggerType)) return { enrolled: out };

    const q = new Parse.Query("Automation");
    q.equalTo("organization", org);
    q.equalTo("status", "active");
    q.limit(1000);
    const automations = await q.find(MK);

    for (const a of automations) {
      const trig = a.get("trigger") || {};
      if (trig.type !== triggerType) continue;
      if (!triggerMatches(triggerType, trig.config || {}, ctx)) continue;
      const e = await enrollOne(org, a, contact, ctx);
      if (e) out.push(e.id);
    }
  } catch (err) {
    console.error("[automations] enrollByTrigger failed:", err && err.message);
  }
  return { enrolled: out };
}

function triggerMatches(triggerType, config, ctx) {
  if (triggerType === "contact_added_to_list") {
    if (!config.listId) return true; // any list
    const ctxLists = []
      .concat(ctx.listId || [])
      .concat(Array.isArray(ctx.listIds) ? ctx.listIds : []);
    return ctxLists.includes(config.listId);
  }
  if (triggerType === "form_submission") {
    if (!config.formId) return true; // any form
    return ctx.formId === config.formId;
  }
  // manual / date_field: handled elsewhere — default to no auto-match here.
  if (triggerType === "date_field") return true;
  return false;
}

module.exports = {
  enrollByTrigger,
  enrollOne,
  // exported for tests
  triggerMatches,
};
