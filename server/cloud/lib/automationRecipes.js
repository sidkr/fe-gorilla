// ─────────────────────────────────────────────────────────────────────────────
// Pre-built automation recipes. CommonJS. Pure data + a tiny builder — no Parse,
// no I/O — so it's trivially unit-testable and reusable by installRecipe.
//
// A recipe is { name, description, trigger:{type,config}, steps:[stepSpec] }.
// A stepSpec is { type, config }. installRecipe (automations.js) turns the spec
// list into linked AutomationStep rows (order = index, nextStepId chained).
//
// send_email config:  { subject, fromName, fromEmail, html }  (html is the
//                     compiled email body the runner sends as-is, with merge +
//                     tracking applied at send time).
// wait config:        { delayHours }  (the runner sets nextRunAt = now + delay).
// branch config:      { on: "opened"|"clicked"|"field", field?, equals? }.
// exit config:        {} .
// ─────────────────────────────────────────────────────────────────────────────

// A minimal, valid HTML email body. Footer carries the {{unsubscribeUrl}}
// placeholder so the runner's injectUnsubscribe pass has something to fill —
// matching the campaign render contract.
function emailHtml(heading, body) {
  return [
    "<html><body>",
    `<h1>${heading}</h1>`,
    `<p>${body}</p>`,
    '<p style="font-size:12px;color:#888">',
    'You are receiving this because you subscribed. ',
    '<a href="{{unsubscribeUrl}}">Unsubscribe</a>.',
    "</p>",
    "</body></html>",
  ].join("");
}

const RECIPES = {
  welcome_series: {
    name: "Welcome series",
    description:
      "Three onboarding emails over the first week — greet, educate, then nudge to first action.",
    trigger: { type: "contact_added_to_list", config: {} },
    steps: [
      {
        type: "send_email",
        config: {
          subject: "Welcome aboard! 🎉",
          html: emailHtml(
            "Welcome, {{firstName|there}}!",
            "We're thrilled to have you. Here's what to expect from us.",
          ),
        },
      },
      { type: "wait", config: { delayHours: 48 } },
      {
        type: "send_email",
        config: {
          subject: "Getting the most out of Gorilla",
          html: emailHtml(
            "A few tips to get started",
            "Here are the three things our happiest customers do in week one.",
          ),
        },
      },
      { type: "wait", config: { delayHours: 96 } },
      {
        type: "send_email",
        config: {
          subject: "Ready when you are",
          html: emailHtml(
            "Let's make something great",
            "Jump back in whenever you're ready — we'll be here.",
          ),
        },
      },
      { type: "exit", config: {} },
    ],
  },

  reengagement: {
    name: "Re-engagement",
    description:
      "Win back inactive contacts: a check-in, then branch on whether they opened it.",
    trigger: { type: "manual", config: {} },
    steps: [
      {
        type: "send_email",
        config: {
          subject: "We miss you",
          html: emailHtml(
            "It's been a while, {{firstName|friend}}",
            "Here's what you've missed — and a reason to come back.",
          ),
        },
      },
      { type: "wait", config: { delayHours: 72 } },
      {
        // Branch on whether the prior send_email was opened.
        type: "branch",
        config: { on: "opened" },
      },
      // branchYes / branchNo targets are wired by installRecipe to the two
      // steps that follow (last-chance offer vs. exit). For the linear builder
      // we append them in order and set branch targets explicitly below via
      // postLink (see buildRecipeSteps).
      {
        type: "send_email",
        config: {
          subject: "One last thing 👀",
          html: emailHtml(
            "Thanks for stopping by",
            "Since you're still curious, here's an exclusive offer.",
          ),
        },
      },
      { type: "exit", config: {} },
    ],
  },
};

// Turn a recipe into an ordered list of step specs. For now this is identity
// (linear), but it's the single place to expand recipe-level sugar (e.g. branch
// target wiring) so installRecipe stays dumb. Returns a fresh array each call.
function buildRecipeSteps(recipe) {
  if (!recipe || !Array.isArray(recipe.steps)) return [];
  return recipe.steps.map((s) => ({
    type: s.type,
    config: s.config ? JSON.parse(JSON.stringify(s.config)) : {},
  }));
}

module.exports = { RECIPES, buildRecipeSteps, emailHtml };
