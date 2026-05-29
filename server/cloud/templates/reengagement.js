const { block, footerBlock, body } = require("./_helpers");

module.exports = [
  // 1) Win-back with offer ──────────────────────────────────────────────────
  {
    seedKey: "system/reengage-we-miss-you",
    name: "We miss you",
    category: "Re-engagement & surveys",
    subject: "We saved your spot",
    previewText: "It's been a while — here's 20% to come back.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=600&q=80&auto=format&fit=crop",
          alt: "Two friends laughing together over coffee",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.app",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "It's been a minute", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", {
          html: "We noticed you haven't stopped by in a while, and honestly, it's not the same without you. We've shipped a lot since you've been gone, and we'd love to show you what's new.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("paragraph", {
          html: "To make it easy, here's 20% off your next order. Pick up right where you left off.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Come back with 20% off",
          href: "https://gorillamail.app/welcome-back",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: "#E5E5E5", thickness: 1 }),
        block("paragraph", {
          html: "Not interested anymore? No hard feelings, you can update your preferences any time using the link below.",
          align: "center",
          color: "#8E8E93",
        }),
        footerBlock("Gorilla, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107"),
      ]),
  },

  // 2) Feedback survey ──────────────────────────────────────────────────────
  {
    seedKey: "system/reengage-feedback-survey",
    name: "Quick feedback survey",
    category: "Re-engagement & surveys",
    subject: "Got 2 minutes? We'd love your take",
    previewText: "Five short questions — and yes, we actually read every one.",
    body: () =>
      body([
        block("heading", { text: "How are we doing?", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", {
          html: "You've been with us for a bit now, so we figure you've got opinions, and we want to hear them. Good, bad, or somewhere in between, your feedback shapes what we build next.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("spacer", { height: 16 }),
        block("image", {
          src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&q=80&auto=format&fit=crop",
          alt: "Person writing notes at a sunlit desk",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.app/survey",
        }),
        block("spacer", { height: 24 }),
        block("paragraph", {
          html: "It's five short questions and takes about two minutes. No login, no fuss.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("button", {
          label: "Start the 2-minute survey",
          href: "https://gorillamail.app/survey",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Thank you for helping us get better. Every answer lands on a real person's desk here.",
          align: "center",
          color: "#8E8E93",
        }),
        footerBlock("Gorilla, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107"),
      ]),
  },

  // 3) NPS / one-question rating ─────────────────────────────────────────────
  {
    seedKey: "system/reengage-nps-one-question",
    name: "One-question rating",
    category: "Re-engagement & surveys",
    subject: "One quick question for you",
    previewText: "How likely are you to recommend us? Tap a number.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1517842645767-c639042777db?w=600&q=80&auto=format&fit=crop",
          alt: "Colorful sticky notes and feedback stars on a bright wall",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Just one question", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", {
          html: "No long form, no scrolling. How likely are you to recommend Gorilla to a friend or colleague?",
          align: "center",
          color: "#5A5A5A",
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Not likely",
          href: "https://gorillamail.app/nps?score=low",
          bg: "#F2F2F2",
          fg: "#1A1A1A",
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "Maybe",
          href: "https://gorillamail.app/nps?score=mid",
          bg: "#F2F2F2",
          fg: "#1A1A1A",
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 8 }),
        block("button", {
          label: "Very likely",
          href: "https://gorillamail.app/nps?score=high",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 8,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: "#E5E5E5", thickness: 1 }),
        block("paragraph", {
          html: "That's it. Your answer takes one tap and helps us know where we stand.",
          align: "center",
          color: "#8E8E93",
        }),
        footerBlock("Gorilla, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107"),
      ]),
  },

  // 4) Subscription / renewal reminder ──────────────────────────────────────
  {
    seedKey: "system/reengage-renewal-reminder",
    name: "Renewal reminder",
    category: "Re-engagement & surveys",
    subject: "Your plan renews soon",
    previewText: "A heads-up before your subscription expires — nothing to do unless you want to.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&q=80&auto=format&fit=crop",
          alt: "Calendar and planner on a clean wooden table",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.app/billing",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Your plan expires in 7 days", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", {
          html: "Just a friendly heads-up: your Gorilla subscription is set to expire on the 5th. We didn't want it to lapse without giving you a chance to keep everything running smoothly.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("paragraph", {
          html: "Renew now and nothing changes, your campaigns, audiences, and reports stay exactly where they are.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("spacer", { height: 16 }),
        block("button", {
          label: "Renew my subscription",
          href: "https://gorillamail.app/billing/renew",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: "#E5E5E5", thickness: 1 }),
        block("paragraph", {
          html: "Questions about your plan or pricing? Reply to this email and a real human will help you sort it out.",
          align: "center",
          color: "#8E8E93",
        }),
        footerBlock("Gorilla, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107"),
      ]),
  },

  // 5) Last-call before we stop emailing ─────────────────────────────────────
  {
    seedKey: "system/reengage-last-call-opt-in",
    name: "Last call before we stop",
    category: "Re-engagement & surveys",
    subject: "Should we keep emailing you?",
    previewText: "We'd rather hear from you than crowd your inbox — confirm to stay subscribed.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1499002238440-d264edd596ec?w=600&q=80&auto=format&fit=crop",
          alt: "Warm cup of coffee held in two hands by a sunny window",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Want to keep hearing from us?", level: 1, align: "center", color: "#1A1A1A" }),
        block("paragraph", {
          html: "We've noticed our emails haven't been getting much love lately, and that's completely okay. We'd much rather stay in touch with people who actually want us in their inbox.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("paragraph", {
          html: "So here's the deal: if we don't hear back, we'll quietly stop emailing you. No drama, no extra reminders.",
          align: "center",
          color: "#5A5A5A",
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Yes, keep me subscribed",
          href: "https://gorillamail.app/opt-in",
          bg: "#FF4E4E",
          fg: "#FFFFFF",
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Prefer fewer emails instead? You can dial down the frequency or pick only the topics you care about.",
          align: "center",
          color: "#8E8E93",
        }),
        block("button", {
          label: "Update my preferences",
          href: "https://gorillamail.app/preferences",
          bg: "#F2F2F2",
          fg: "#1A1A1A",
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: "#E5E5E5", thickness: 1 }),
        block("paragraph", {
          html: "Thanks for being here, whatever you decide. It's been a pleasure showing up in your inbox.",
          align: "center",
          color: "#8E8E93",
        }),
        footerBlock("Gorilla, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107"),
      ]),
  },
];
