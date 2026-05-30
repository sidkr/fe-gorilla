// Welcome & onboarding — system email templates (pack).
//
// Ten distinct, ready-to-fork onboarding emails. Each builds blocks via the
// shared helpers in ./_helpers.js so the editor + MJML compiler understand them.
// Brand: coral CTA #FF4E4E on #FFFFFF, ink #1A1A1A, muted #5A5A5A.
const { block, footerBlock, body } = require("./_helpers");

const INK = "#1A1A1A",
  MUTED = "#5A5A5A",
  CORAL = "#FF4E4E",
  WHITE = "#FFFFFF",
  RULE = "#E5E5E7";

const ADDRESS = "Your Company, Inc. · 123 Main St, City, ST 00000";

module.exports = [
  // 1 ─ Warm welcome ──────────────────────────────────────────────────────────
  {
    seedKey: "system/onb-warm-welcome",
    name: "A warm welcome aboard",
    category: "Welcome & onboarding",
    subject: "Welcome, {{firstName}} — we're so glad you're here",
    previewText: "A quick hello and the one thing to do first.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/warm-welcome-hello/600/360",
          alt: "A friendly team waving hello",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Welcome aboard, {{firstName}}!", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "We're genuinely thrilled to have you. You just joined thousands of people who use us to get real work done with a lot less friction. Take a breath — we'll walk you through everything.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Take a look around", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 2 ─ Getting-started checklist ───────────────────────────────────────────────
  {
    seedKey: "system/onb-getting-started-checklist",
    name: "Your getting-started checklist",
    category: "Welcome & onboarding",
    subject: "3 quick steps to get the most out of your account",
    previewText: "A short checklist to set yourself up for success.",
    body: () =>
      body([
        block("heading", { text: "Let's get you set up", level: 1, align: "left", color: INK }),
        block("paragraph", {
          html: "You're minutes away from your first win. Knock out these three steps and you'll be off to the races.",
          align: "left",
          color: MUTED,
        }),
        block("divider", { color: RULE, thickness: 1 }),
        block("spacer", { height: 16 }),
        block("heading", { text: "1. Confirm your details", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "Make sure your name and email are correct so everything lands where it should.", align: "left", color: MUTED }),
        block("spacer", { height: 16 }),
        block("heading", { text: "2. Set your preferences", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "Tell us what you care about and we'll tailor things to fit.", align: "left", color: MUTED }),
        block("spacer", { height: 16 }),
        block("heading", { text: "3. Create something", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "The fastest way to learn is to dive in. Start your first project today.", align: "left", color: MUTED }),
        block("spacer", { height: 24 }),
        block("button", { label: "Start the checklist", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 3 ─ Activate your account ───────────────────────────────────────────────────
  {
    seedKey: "system/onb-activate-account",
    name: "Activate your account",
    category: "Welcome & onboarding",
    subject: "One click to activate your account",
    previewText: "You're almost in — just one step left.",
    body: () =>
      body([
        block("heading", { text: "You're one step away", level: 1, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Thanks for signing up, {{firstName}}. To keep your account secure and unlock everything, please activate it now. This link is just for you.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Activate my account", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "If you didn't create this account, you can safely ignore this email and nothing will happen.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 4 ─ Complete your profile ───────────────────────────────────────────────────
  {
    seedKey: "system/onb-complete-your-profile",
    name: "Complete your profile",
    category: "Welcome & onboarding",
    subject: "Finish your profile — it takes 60 seconds",
    previewText: "A complete profile means a better experience.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/complete-profile-avatar/600/360",
          alt: "An illustration of a profile being filled in",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Your profile is 40% done", level: 2, align: "left", color: INK }),
        block("paragraph", {
          html: "Adding a few more details helps us personalize what you see and connects you with the right people. It only takes a minute.",
          align: "left",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Add a photo, a short bio, and your interests — that's all it takes to round things out.",
          align: "left",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Complete my profile", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 5 ─ First-value nudge ───────────────────────────────────────────────────────
  {
    seedKey: "system/onb-first-value-nudge",
    name: "See your first result",
    category: "Welcome & onboarding",
    subject: "{{firstName}}, here's the quickest way to a first win",
    previewText: "One small action, one big payoff.",
    body: () =>
      body([
        block("heading", { text: "Ready for your first win?", level: 1, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "People who try this one thing in their first week stick around the longest — because they see the value right away. Want to be one of them?",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 2 }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "It takes about two minutes and you'll have something real to show for it. We'll guide you the whole way.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Get my first result", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 6 ─ Feature tour ────────────────────────────────────────────────────────────
  {
    seedKey: "system/onb-feature-tour",
    name: "Take the feature tour",
    category: "Welcome & onboarding",
    subject: "A 2-minute tour of what you can do",
    previewText: "Three features worth knowing from day one.",
    body: () =>
      body([
        block("heading", { text: "What you can do here", level: 1, align: "left", color: INK }),
        block("paragraph", { html: "Here are three things our happiest users reach for every day.", align: "left", color: MUTED }),
        block("spacer", { height: 24 }),
        block("image", {
          src: "https://picsum.photos/seed/feature-tour-map/600/360",
          alt: "A guided map of product features",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Build in minutes", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "Drag, drop, done. No fiddly setup required.", align: "left", color: MUTED }),
        block("spacer", { height: 16 }),
        block("heading", { text: "Collaborate easily", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "Share with your team and work together in real time.", align: "left", color: MUTED }),
        block("spacer", { height: 16 }),
        block("heading", { text: "Measure what matters", level: 3, align: "left", color: INK }),
        block("paragraph", { html: "Clear dashboards show you exactly how things are going.", align: "left", color: MUTED }),
        block("spacer", { height: 24 }),
        block("button", { label: "Start the tour", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 7 ─ Tips for week 1 ─────────────────────────────────────────────────────────
  {
    seedKey: "system/onb-week-one-tips",
    name: "Tips for your first week",
    category: "Welcome & onboarding",
    subject: "5 tips to hit the ground running this week",
    previewText: "Small habits that pay off fast.",
    body: () =>
      body([
        block("heading", { text: "Five tips for week one", level: 1, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("paragraph", { html: "Hi {{firstName}} — a few friendly pointers to help your first week go smoothly.", align: "center", color: MUTED }),
        block("spacer", { height: 24 }),
        block("paragraph", { html: "Tip 1 — Start small. One project beats ten tabs of planning.", align: "left", color: INK }),
        block("spacer", { height: 8 }),
        block("paragraph", { html: "Tip 2 — Explore the templates. They save real time.", align: "left", color: INK }),
        block("spacer", { height: 8 }),
        block("paragraph", { html: "Tip 3 — Invite a teammate so you're not working solo.", align: "left", color: INK }),
        block("spacer", { height: 8 }),
        block("paragraph", { html: "Tip 4 — Check your settings to make it feel like yours.", align: "left", color: INK }),
        block("spacer", { height: 8 }),
        block("paragraph", { html: "Tip 5 — Ask us anything. We reply fast and we're happy to help.", align: "left", color: INK }),
        block("spacer", { height: 24 }),
        block("button", { label: "Put a tip into action", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 8 ─ Invite your team ────────────────────────────────────────────────────────
  {
    seedKey: "system/onb-invite-your-team",
    name: "Invite your team",
    category: "Welcome & onboarding",
    subject: "Better together — bring your team along",
    previewText: "Everything's more useful with teammates.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/invite-team-collab/600/360",
          alt: "Teammates collaborating around a table",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Don't go it alone", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "You get the most out of your account when your whole team is in. Invite a few people now and start collaborating in minutes — shared work is faster work.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Invite teammates", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 9 ─ Free-trial day 1 ────────────────────────────────────────────────────────
  {
    seedKey: "system/onb-free-trial-day-one",
    name: "Day 1 of your free trial",
    category: "Welcome & onboarding",
    subject: "Your free trial starts now — here's how to make it count",
    previewText: "14 days to explore everything, no strings attached.",
    body: () =>
      body([
        block("heading", { text: "Your trial is live", level: 1, align: "left", color: INK }),
        block("paragraph", {
          html: "Welcome to day one, {{firstName}}. For the next 14 days you have full access to everything — no limits, no credit card surprises. Let's make these two weeks count.",
          align: "left",
          color: MUTED,
        }),
        block("divider", { color: RULE, thickness: 1 }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Our advice: pick one real task you want to accomplish and use the trial to get it done. That's how you'll know if we're a fit.",
          align: "left",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Explore everything", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },

  // 10 ─ Account confirmation ───────────────────────────────────────────────────
  {
    seedKey: "system/onb-account-confirmation",
    name: "Your account is confirmed",
    category: "Welcome & onboarding",
    subject: "All set — your account is confirmed",
    previewText: "You're verified and ready to go.",
    body: () =>
      body([
        block("heading", { text: "You're all set, {{firstName}}", level: 1, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Your account has been confirmed and is ready to use. Thanks for verifying — that little step keeps everything secure.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "Jump in whenever you're ready. We've left a few starter ideas waiting on your dashboard.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", { label: "Go to my dashboard", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
        block("spacer", { height: 32 }),
        footerBlock(ADDRESS),
      ]),
  },
];
