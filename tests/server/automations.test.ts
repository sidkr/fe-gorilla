// tests/server/automations.test.ts
//
// Coverage for the Automations / Journeys feature (NextPhase.md §6 Phase B).
//
// Two layers:
//
//  1. PURE-LOGIC tests — deterministic building blocks with no live Parse:
//     recipe step-graph construction, branch routing (opened vs not), wait
//     arming/advancement. Always run.
//
//  2. INTEGRATION tests — boot the real Parse harness (startTestParseServer,
//     the fanout.test.ts / campaigns.test.ts pattern), sign up an org, and drive
//     the cloud fns + the automationTick worker handle() directly. They cover:
//     enrollment on trigger, wait advances at nextRunAt, branch routing,
//     runner idempotency, pause halts, and recipe install graph shape.
//
// Run only this file:
//   nvm use 20 && npx vitest run tests/server/automations.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { startTestParseServer, type TestParseServer } from "../setup/parseServer";

// server/ is CommonJS; load its modules with a CJS require.
const require = createRequire(import.meta.url);

const { RECIPES, buildRecipeSteps } = require("../../server/cloud/lib/automationRecipes");
const tick = require("../../server/worker/jobs/automationTick");

const MK = { useMasterKey: true } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Layer 1 — pure logic
// ─────────────────────────────────────────────────────────────────────────────

describe("automation recipes (pure)", () => {
  it("exposes the required recipes", () => {
    expect(RECIPES.welcome_series).toBeTruthy();
    expect(RECIPES.reengagement).toBeTruthy();
  });

  it("welcome series builds 3 send_email steps separated by wait steps", () => {
    const steps = buildRecipeSteps(RECIPES.welcome_series);
    const sends = steps.filter((s: any) => s.type === "send_email");
    const waits = steps.filter((s: any) => s.type === "wait");
    expect(sends.length).toBe(3);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    for (const s of sends) {
      expect(typeof s.config.subject).toBe("string");
      expect(s.config.html).toContain("{{unsubscribeUrl}}");
    }
    const firstSend = steps.findIndex((s: any) => s.type === "send_email");
    expect(steps[firstSend + 1].type).toBe("wait");
  });

  it("buildRecipeSteps returns fresh deep copies (no shared config refs)", () => {
    const a = buildRecipeSteps(RECIPES.welcome_series);
    const b = buildRecipeSteps(RECIPES.welcome_series);
    a[0].config.subject = "MUTATED";
    expect(b[0].config.subject).not.toBe("MUTATED");
  });
});

describe("runWait (pure)", () => {
  function fakeEnrollment(context: Record<string, unknown> = {}) {
    const store: Record<string, unknown> = { context };
    return {
      get: (k: string) => store[k],
      set: (k: string, v: unknown) => {
        store[k] = v;
      },
    };
  }
  function fakeStep(order: number, delayHours: number) {
    const store: Record<string, unknown> = { order, type: "wait", config: { delayHours } };
    return { get: (k: string) => store[k] };
  }

  it("arms the timer on first visit (stay + future nextRunAt)", () => {
    const r = tick.runWait(fakeEnrollment({}), fakeStep(1, 24));
    expect(r.stay).toBe(true);
    expect(r.nextRunAt instanceof Date).toBe(true);
    expect(r.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);
    expect(r.mark.wait_1).toBe(true);
  });

  it("advances once armed (the timer has fired)", () => {
    const r = tick.runWait(fakeEnrollment({ wait_1: true }), fakeStep(1, 24));
    expect(r.advance).toBe(true);
    expect(r.mark.wait_1).toBe(false);
  });
});

describe("runBranch (pure)", () => {
  function fakeStep(cfg: any, yesId: string, noId: string) {
    const store: Record<string, unknown> = {
      type: "branch",
      config: cfg,
      branchYesStepId: yesId,
      branchNoStepId: noId,
    };
    return { get: (k: string) => store[k] };
  }
  function fakeEnrollment(context: Record<string, unknown>) {
    return { get: (k: string) => (k === "context" ? context : undefined) };
  }
  function fakeContact(fields: Record<string, unknown>) {
    return { get: (k: string) => fields[k] };
  }

  it("routes to YES when the prior email was opened", () => {
    const r = tick.runBranch(
      fakeEnrollment({ lastEmailOpened: true }),
      fakeStep({ on: "opened" }, "YES", "NO"),
      fakeContact({}),
    );
    expect(r.branchTo).toBe("YES");
  });

  it("routes to NO when the prior email was NOT opened", () => {
    const r = tick.runBranch(
      fakeEnrollment({ lastEmailOpened: false }),
      fakeStep({ on: "opened" }, "YES", "NO"),
      fakeContact({}),
    );
    expect(r.branchTo).toBe("NO");
  });

  it("routes on a contact field equality", () => {
    const r = tick.runBranch(
      fakeEnrollment({}),
      fakeStep({ on: "field", field: "firstName", equals: "Ada" }, "YES", "NO"),
      fakeContact({ firstName: "Ada" }),
    );
    expect(r.branchTo).toBe("YES");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2 — integration (live Parse harness)
// ─────────────────────────────────────────────────────────────────────────────

describe("automations integration", () => {
  let ctx: TestParseServer;
  let Parse: TestParseServer["Parse"];
  let automations: any; // server/cloud/automations.js exports (enrollByTrigger…)

  function as(token: string) {
    return { sessionToken: token };
  }

  // Sign up a fresh org and return { sessionToken, orgId, org, contact, listId }.
  async function makeOrgWithContact() {
    const suffix = Math.random().toString(36).slice(2, 8);
    const r = (await Parse.Cloud.run("signUpWithOrg", {
      username: `auto-${suffix}@example.com`,
      password: "hunter2hunter2",
      company: `Auto ${suffix}`,
    })) as { sessionToken: string; orgId: string };

    const Organization = Parse.Object.extend("Organization");
    const org = await new Parse.Query(Organization).get(r.orgId, MK);

    const list = (await Parse.Cloud.run(
      "createAudience",
      { name: "Auto list" },
      as(r.sessionToken),
    )) as { id: string };

    const c = (await Parse.Cloud.run(
      "addContact",
      { audienceId: list.id, email: `c-${suffix}@example.com`, firstName: "Ada" },
      as(r.sessionToken),
    )) as { id: string };
    const contact = await new Parse.Query("Contact").get(c.id, MK);

    return { sessionToken: r.sessionToken, orgId: r.orgId, org, contact, listId: list.id };
  }

  beforeAll(async () => {
    ctx = await startTestParseServer();
    Parse = ctx.Parse;
    automations = require("../../server/cloud/automations");
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it("installRecipe builds the correct linked step graph", async () => {
    const { sessionToken } = await makeOrgWithContact();
    const res: any = await Parse.Cloud.run(
      "installRecipe",
      { recipe: "welcome_series" },
      as(sessionToken),
    );
    expect(res.ok).toBe(true);
    const full: any = await Parse.Cloud.run("getAutomation", { id: res.id }, as(sessionToken));
    expect(full.steps.length).toBe(buildRecipeSteps(RECIPES.welcome_series).length);

    const ordered = [...full.steps].sort((a: any, b: any) => a.order - b.order);
    for (let i = 0; i < ordered.length - 1; i++) {
      if (ordered[i].type === "exit") continue;
      expect(ordered[i].nextStepId).toBe(ordered[i + 1].id);
    }
  });

  it("enrolls a contact via enrollByTrigger for a matching active automation (idempotent)", async () => {
    const { sessionToken, org, contact, listId } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Welcome", triggerType: "contact_added_to_list" },
      as(sessionToken),
    );
    await Parse.Cloud.run(
      "addStep",
      { automationId: a.id, type: "send_email", config: { subject: "Hi", html: "<p>Hi {{firstName}}</p>" } },
      as(sessionToken),
    );
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "exit", config: {} }, as(sessionToken));
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));

    // Fire the trigger helper directly — this is what Contact.afterSave would do.
    const out = await automations.enrollByTrigger(org, "contact_added_to_list", contact, {
      listId,
    });
    expect(out.enrolled.length).toBe(1);

    // Second fire while still active → no double-enroll.
    const out2 = await automations.enrollByTrigger(org, "contact_added_to_list", contact, {
      listId,
    });
    expect(out2.enrolled.length).toBe(0);
  });

  it("does NOT enroll for a non-matching list gate", async () => {
    const { sessionToken, org, contact } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Gated", triggerType: "contact_added_to_list", triggerConfig: { listId: "OTHER" } },
      as(sessionToken),
    );
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "exit", config: {} }, as(sessionToken));
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));

    const out = await automations.enrollByTrigger(org, "contact_added_to_list", contact, {
      listId: "SOMETHING_ELSE",
    });
    expect(out.enrolled.length).toBe(0);
  });

  it("runner sends the first email then advances; wait advances only at nextRunAt; idempotent", async () => {
    const { sessionToken, org, contact } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Send+Wait flow", triggerType: "manual" },
      as(sessionToken),
    );
    await Parse.Cloud.run(
      "addStep",
      { automationId: a.id, type: "send_email", config: { subject: "Welcome", html: "<p>Hi {{firstName}}</p>" } },
      as(sessionToken),
    );
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "wait", config: { delayHours: 24 } }, as(sessionToken));
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "exit", config: {} }, as(sessionToken));
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));
    await Parse.Cloud.run("enrollContact", { automationId: a.id, contactId: contact.id }, as(sessionToken));

    function enrollmentQ() {
      return new Parse.Query("AutomationEnrollment").equalTo("organization", org);
    }

    // Tick 1: executes send_email (step 0), advances to wait (step 1), due now.
    await tick.handle({});
    let e = await enrollmentQ().first(MK);
    expect(e!.get("currentStepOrder")).toBe(1);

    // A mock email was "sent".
    const sentCount = await new Parse.Query("MockSentMessage")
      .equalTo("subject", "Welcome")
      .count(MK);
    expect(sentCount).toBeGreaterThanOrEqual(1);

    // Tick 2: enters wait, arms it, pushes nextRunAt ~24h out, stays on step 1.
    await tick.handle({});
    e = await enrollmentQ().first(MK);
    expect(e!.get("currentStepOrder")).toBe(1);
    expect(e!.get("nextRunAt").getTime()).toBeGreaterThan(Date.now());

    // Idempotent: re-running now (nothing due) processes nothing.
    const r = await tick.handle({});
    expect(r.processed).toBe(0);

    // Simulate the wait elapsing → tick advances to exit → completes.
    e!.set("nextRunAt", new Date(Date.now() - 1000));
    e!.unset("claimedAt");
    await e!.save(null, MK);
    await tick.handle({}); // wait fires → advance to exit
    await tick.handle({}); // exit → complete (in case exit lands on its own tick)
    e = await enrollmentQ().first(MK);
    expect(["completed", "exited"]).toContain(e!.get("status"));
  });

  it("branch routes to YES when the prior email is marked opened", async () => {
    const { sessionToken, org, contact } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Branchy", triggerType: "manual" },
      as(sessionToken),
    );
    // step0 branch, step1 = YES target (send), step2 = NO target (exit)
    const branch: any = await Parse.Cloud.run(
      "addStep",
      { automationId: a.id, type: "branch", config: { on: "opened" } },
      as(sessionToken),
    );
    const yes: any = await Parse.Cloud.run(
      "addStep",
      { automationId: a.id, type: "send_email", config: { subject: "Opened-yes", html: "<p>hi</p>" } },
      as(sessionToken),
    );
    const no: any = await Parse.Cloud.run(
      "addStep",
      { automationId: a.id, type: "exit", config: {} },
      as(sessionToken),
    );
    // Wire the branch targets explicitly.
    await Parse.Cloud.run(
      "updateStep",
      { stepId: branch.step.id, branchYesStepId: yes.step.id, branchNoStepId: no.step.id },
      as(sessionToken),
    );
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));
    await Parse.Cloud.run("enrollContact", { automationId: a.id, contactId: contact.id }, as(sessionToken));

    // Mark the enrollment context as "opened" so the branch routes YES.
    let e = await new Parse.Query("AutomationEnrollment").equalTo("organization", org).first(MK);
    e!.set("context", { ...(e!.get("context") || {}), lastEmailOpened: true });
    await e!.save(null, MK);

    await tick.handle({}); // branch evaluates → routes to YES (send step)
    e = await new Parse.Query("AutomationEnrollment").equalTo("organization", org).first(MK);
    expect(e!.get("currentStepOrder")).toBe(yes.step.order);
  });

  it("pausing the automation halts the runner", async () => {
    const { sessionToken, org, contact } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Pausable", triggerType: "manual" },
      as(sessionToken),
    );
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "wait", config: { delayHours: 0 } }, as(sessionToken));
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "exit", config: {} }, as(sessionToken));
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));
    await Parse.Cloud.run("enrollContact", { automationId: a.id, contactId: contact.id }, as(sessionToken));

    // Pause before ticking → the runner must not advance the enrollment.
    await Parse.Cloud.run("pauseAutomation", { id: a.id }, as(sessionToken));
    await tick.handle({});

    const e = await new Parse.Query("AutomationEnrollment").equalTo("organization", org).first(MK);
    expect(e!.get("currentStepOrder")).toBe(0);
    expect(e!.get("status")).toBe("active");
  });

  it("getAutomationStats reflects enrolled / live counts", async () => {
    const { sessionToken, contact } = await makeOrgWithContact();
    const a: any = await Parse.Cloud.run(
      "createAutomation",
      { name: "Stats", triggerType: "manual" },
      as(sessionToken),
    );
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "wait", config: { delayHours: 24 } }, as(sessionToken));
    await Parse.Cloud.run("addStep", { automationId: a.id, type: "exit", config: {} }, as(sessionToken));
    await Parse.Cloud.run("activateAutomation", { id: a.id }, as(sessionToken));
    await Parse.Cloud.run("enrollContact", { automationId: a.id, contactId: contact.id }, as(sessionToken));

    const stats: any = await Parse.Cloud.run("getAutomationStats", { id: a.id }, as(sessionToken));
    expect(stats.stats.enrolled).toBe(1);
    expect(stats.live.total).toBe(1);
    expect(stats.live.active).toBe(1);
  });
});
