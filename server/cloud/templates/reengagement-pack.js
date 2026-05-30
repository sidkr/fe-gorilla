// Re-engagement & surveys — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // 1) "We miss you" win-back ─────────────────────────────────────────────────
  {
    seedKey: "system/ren-we-miss-you",
    name: "We miss you",
    category: "Re-engagement & surveys",
    subject: "{{first_name}}, it hasn't been the same without you",
    previewText: "It's been a while — come see what's new.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/wemissyou-window/600/360",
          alt: "Sunlit window with a warm cup of coffee",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "We've missed you, {{first_name}}", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "It's been a little quiet since we last saw you, and honestly, the place isn't the same without you in it. A lot has changed, and we think you'll like where things are headed.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Pick up where you left off",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "No pressure at all — we just wanted you to know the door's still open.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 2) Special come-back offer ────────────────────────────────────────────────
  {
    seedKey: "system/ren-comeback-offer",
    name: "Come-back offer",
    category: "Re-engagement & surveys",
    subject: "A little something to welcome you back",
    previewText: "Here's 25% off — our way of saying we'd love to see you again.",
    body: () =>
      body([
        block("heading", { text: "Welcome back, on us", level: 1, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("image", {
          src: "https://picsum.photos/seed/comeback-gift/600/360",
          alt: "A wrapped gift on a clean tabletop",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "25% off your next order", level: 2, align: "center", color: CORAL }),
        block("paragraph", {
          html: "We saved a little something for you, {{first_name}}. Use the code below at checkout and treat yourself to whatever you've been eyeing.",
          align: "center",
          color: MUTED,
        }),
        block("heading", { text: "WELCOME25", level: 3, align: "center", color: INK }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Redeem 25% off",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "Offer good for the next 14 days. One use per customer — no fine print games.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 3) "Is this goodbye?" sunset ──────────────────────────────────────────────
  {
    seedKey: "system/ren-is-this-goodbye",
    name: "Is this goodbye?",
    category: "Re-engagement & surveys",
    subject: "Is this goodbye, {{first_name}}?",
    previewText: "We'd rather not crowd your inbox — but we'd hate to lose you too.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/goodbye-path/600/360",
          alt: "A quiet path winding into the distance",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "We don't want to overstay", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "Our emails haven't gotten much of your attention lately, and that's completely fair. We'd rather show up for people who actually want us around.",
          align: "center",
          color: MUTED,
        }),
        block("paragraph", {
          html: "If we don't hear from you, we'll quietly step back and stop sending. No hard feelings either way.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Keep me on the list",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 2 }),
        block("paragraph", {
          html: "Whatever you decide, thank you for the time we've had together.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 4) NPS survey ─────────────────────────────────────────────────────────────
  {
    seedKey: "system/ren-nps-survey",
    name: "NPS survey",
    category: "Re-engagement & surveys",
    subject: "How likely are you to recommend us?",
    previewText: "One question, one tap — and yes, a real person reads it.",
    body: () =>
      body([
        block("heading", { text: "Just one question", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "On a scale of 0 to 10, how likely are you to recommend us to a friend or colleague? Tap the option that fits.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "0 – 6  ·  Not really",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "7 – 8  ·  It's good",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "9 – 10  ·  Absolutely",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "That's the whole survey. Your answer helps us know exactly where we stand.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 5) Quick feedback survey ──────────────────────────────────────────────────
  {
    seedKey: "system/ren-quick-feedback",
    name: "Quick feedback survey",
    category: "Re-engagement & surveys",
    subject: "Got 2 minutes? We'd love your take",
    previewText: "Five short questions — no login, no fuss.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/feedback-desk/600/360",
          alt: "Person jotting notes at a sunlit desk",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "How are we doing?", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "You've been around a while, so you've probably formed an opinion or two. Good or bad, we genuinely want to hear it — your answers shape what we build next.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Start the 2-minute survey",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "Five short questions, about two minutes, no account required.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 6) Product feedback request ───────────────────────────────────────────────
  {
    seedKey: "system/ren-product-feedback",
    name: "Product feedback request",
    category: "Re-engagement & surveys",
    subject: "What should we build next, {{first_name}}?",
    previewText: "You use it every day — help us decide where it goes.",
    body: () =>
      body([
        block("heading", { text: "Help shape what's next", level: 1, align: "left", color: INK }),
        block("paragraph", {
          html: "You're one of the people who actually lives in the product, which means your take is worth more than any roadmap meeting we could run without you.",
          align: "left",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("image", {
          src: "https://picsum.photos/seed/product-sketch/600/360",
          alt: "Sketches and wireframes spread across a workbench",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Tell us one thing", level: 2, align: "left", color: INK }),
        block("paragraph", {
          html: "If you could change, add, or fix just one thing, what would it be? Hit the button and tell us in your own words.",
          align: "left",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Share your idea",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "left",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "Every suggestion lands on a real person's desk here. We read them all.",
          align: "left",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 7) Preference-center update ───────────────────────────────────────────────
  {
    seedKey: "system/ren-preference-update",
    name: "Preference center update",
    category: "Re-engagement & surveys",
    subject: "You're in control of what we send",
    previewText: "New options to choose exactly the emails you want.",
    body: () =>
      body([
        block("heading", { text: "Your inbox, your rules", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "We've refreshed your preference center, {{first_name}}. You can now pick the topics you care about and set how often you'd like to hear from us.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("spacer", { height: 16 }),
        block("heading", { text: "Choose your topics", level: 3, align: "center", color: INK }),
        block("paragraph", {
          html: "Product updates, tips and how-tos, offers and promotions — turn on only what's useful to you.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 8 }),
        block("heading", { text: "Set your frequency", level: 3, align: "center", color: INK }),
        block("paragraph", {
          html: "Weekly, monthly, or only the big stuff. You can change it any time.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Update my preferences",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 8) Re-opt-in confirmation ─────────────────────────────────────────────────
  {
    seedKey: "system/ren-reopt-in-confirm",
    name: "Re-opt-in confirmation",
    category: "Re-engagement & surveys",
    subject: "You're all set — thanks for staying",
    previewText: "Confirmed: you'll keep getting the emails you signed up for.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/optin-confirmed/600/360",
          alt: "A green checkmark on a soft, bright background",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "You're confirmed, {{first_name}}", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "Thanks for letting us know you'd like to stay subscribed. We'll keep showing up with the things you actually want to read — and nothing you don't.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "See what's new",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "Changed your mind later? You can update your preferences or unsubscribe at any time.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 9) "Still want to hear from us?" ──────────────────────────────────────────
  {
    seedKey: "system/ren-still-want-to-hear",
    name: "Still want to hear from us?",
    category: "Re-engagement & surveys",
    subject: "Still want to hear from us?",
    previewText: "A quick check-in — stay subscribed, or let us know if you'd rather not.",
    body: () =>
      body([
        block("heading", { text: "Quick check-in", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "It's been a while since you opened one of our emails, so we wanted to ask directly instead of guessing: are we still welcome in your inbox?",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Yes, keep them coming",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Prefer fewer emails? You can dial down the frequency or unsubscribe entirely — your call, no questions asked.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "If we don't hear back, we'll take the hint and stop sending. Thanks for being here either way.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },

  // 10) Customer satisfaction (CSAT) check ────────────────────────────────────
  {
    seedKey: "system/ren-csat-check",
    name: "Satisfaction check (CSAT)",
    category: "Re-engagement & surveys",
    subject: "How was your recent experience?",
    previewText: "Rate your last interaction — it takes one tap.",
    body: () =>
      body([
        block("image", {
          src: "https://picsum.photos/seed/csat-faces/600/360",
          alt: "Row of simple rating faces from frown to smile",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "How did we do?", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "We want to make sure your recent experience with us hit the mark. How satisfied were you, {{first_name}}?",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Not satisfied",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "It was okay",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "Very satisfied",
          href: "https://example.com",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "Thanks for the moment — your rating goes straight to the team that handled your request.",
          align: "center",
          color: MUTED,
        }),
        footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
      ]),
  },
];
