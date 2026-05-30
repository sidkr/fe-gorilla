// composables/app/useAutomations.ts
//
// Thin wrapper over the automations cloud functions (server/cloud/automations.js),
// mirroring the shape of useCampaigns: each method calls Parse.Cloud.run with the
// caller's session (Parse holds the session token from localStorage after the
// client plugin initializes). App-only — never imported by marketing pages.
//
// Cloud fns covered:
//   listAutomations()                          → { automations, kpis }
//   getAutomation(id)                          → automation + steps
//   createAutomation({ name, triggerType })    → automation
//   updateAutomation({ id, ... })              → automation
//   deleteAutomation(id)                       → { ok }
//   activateAutomation(id) / pauseAutomation(id)
//   addStep({ automationId, type, config })    → { step, steps }
//   updateStep({ stepId, ... })                → { step }
//   deleteStep({ automationId, stepId })       → { steps }
//   enrollContact({ automationId, contactId }) → { ok, enrollmentId }
//   installRecipe(recipe)                      → { ok, id, stepCount }
//   listRecipes()                              → { recipes }
//   getAutomationStats(id)                     → stats

// useNuxtApp is a Nuxt auto-import (a global at build time); do NOT import it
// from "#app" — that alias doesn't resolve under vitest. Matches useCloud.ts.
declare function useNuxtApp(): { $parse: typeof import("parse") };

export function useAutomations() {
  // The Parse SDK is exposed on the Nuxt app as $parse by plugins/parse.client.ts.
  const { $parse } = useNuxtApp() as unknown as { $parse: any };
  const run = (name: string, params: Record<string, unknown> = {}) =>
    $parse.Cloud.run(name, params);

  return {
    listAutomations: () => run("listAutomations"),
    getAutomation: (id: string) => run("getAutomation", { id }),
    createAutomation: (params: {
      name?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
    }) => run("createAutomation", params),
    updateAutomation: (params: {
      id: string;
      name?: string;
      triggerType?: string;
      triggerConfig?: Record<string, unknown>;
    }) => run("updateAutomation", params),
    deleteAutomation: (id: string) => run("deleteAutomation", { id }),
    activateAutomation: (id: string) => run("activateAutomation", { id }),
    pauseAutomation: (id: string) => run("pauseAutomation", { id }),
    addStep: (params: {
      automationId: string;
      type: string;
      config?: Record<string, unknown>;
    }) => run("addStep", params),
    updateStep: (params: {
      stepId: string;
      config?: Record<string, unknown>;
      nextStepId?: string | null;
      branchYesStepId?: string | null;
      branchNoStepId?: string | null;
    }) => run("updateStep", params),
    deleteStep: (params: { automationId: string; stepId: string }) =>
      run("deleteStep", params),
    enrollContact: (params: { automationId: string; contactId: string }) =>
      run("enrollContact", params),
    installRecipe: (recipe: string) => run("installRecipe", { recipe }),
    listRecipes: () => run("listRecipes"),
    getAutomationStats: (id: string) => run("getAutomationStats", { id }),
  };
}
