// Product launches & announcements — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // ── Product launches (5) ───────────────────────────────────────────────────

  // 1. Big hero reveal — image-led.
  {
    seedKey: "system/lap-hero-reveal",
    name: "Launch — big hero reveal",
    category: "Product launches",
    subject: "It's finally here, {{firstName}}",
    previewText: "Months in the making. Today it's yours.",
    body: () => body([
      block("image", { src: "https://picsum.photos/seed/lap-hero-reveal/600/360", alt: "The new product, revealed", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Meet the all-new release", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "We rebuilt the thing you use every day from the ground up. Faster, cleaner, and packed with the features you've been asking for. Today, it's live for everyone.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "See what's new", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 32 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Already a customer? The update is rolling out to your account this week.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 2. Feature spotlight — text-led, multi-section.
  {
    seedKey: "system/lap-feature-spotlight",
    name: "Launch — feature spotlight",
    category: "Product launches",
    subject: "New: the one thing that saves you an hour a week",
    previewText: "Stop doing it by hand. Let it run for you.",
    body: () => body([
      block("heading", { text: "Introducing Quick Actions", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "The most-requested feature of the year is here. Quick Actions turns the steps you repeat every day into a single tap, so the busywork takes care of itself.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("divider", { color: CORAL, thickness: 2 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Why you'll love it", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "One tap, done. Bundle the steps you repeat into a single action you can trigger anywhere.", align: "left", color: INK }),
      block("paragraph", { html: "Built for your workflow. Save your own actions and reuse them across every project.", align: "left", color: INK }),
      block("paragraph", { html: "Nothing new to learn. It lives right where you already work, ready when you are.", align: "left", color: INK }),
      block("spacer", { height: 24 }),
      block("button", { label: "Try Quick Actions", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 3. Beta / early-access invite — exclusive tone.
  {
    seedKey: "system/lap-beta-early-access",
    name: "Launch — early-access invite",
    category: "Product launches",
    subject: "You're invited: early access, {{firstName}}",
    previewText: "A private beta, and your seat is reserved.",
    body: () => body([
      block("spacer", { height: 16 }),
      block("paragraph", { html: "PRIVATE BETA · BY INVITATION", align: "center", color: CORAL }),
      block("heading", { text: "Be the first to try it", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "We're opening a small, hand-picked beta and we'd love for you to be in it. You'll get a front-row seat to what we're building, plus a direct line to the team shaping it.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/lap-beta-early-access/600/360", alt: "Early access preview", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Seats are limited and this invitation is valid for the next seven days. After that, we pass it along to the waitlist.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("button", { label: "Claim my seat", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 24 }),
      block("spacer", { height: 24 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 4. Now available — short, confident "it shipped".
  {
    seedKey: "system/lap-now-available",
    name: "Launch — now available",
    category: "Product launches",
    subject: "Now available to everyone",
    previewText: "The wait is over. It's live in your account.",
    body: () => body([
      block("spacer", { height: 16 }),
      block("heading", { text: "It's live", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "The feature you've been waiting for just rolled out to every account, including yours. No upgrade, no setup. It's already in your dashboard.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Open it now", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 32 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Questions? Reply to this email and a real human will help you get started.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 5. Pricing / new plan launch — structured comparison feel.
  {
    seedKey: "system/lap-new-plan-launch",
    name: "Launch — new plan & pricing",
    category: "Product launches",
    subject: "A new plan built for growing teams",
    previewText: "More room to scale, without the enterprise price tag.",
    body: () => body([
      block("heading", { text: "Say hello to Team plan", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "You told us you'd outgrown the basics but weren't ready for enterprise. So we built the plan in between, with the headroom and controls a growing team actually needs.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/lap-new-plan-launch/600/360", alt: "New Team plan overview", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "What's included", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Up to 25 seats with role-based permissions. Shared workspaces, priority support, and advanced reporting baked in.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Simple pricing", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Flat monthly rate, no per-action surprises. Switch any time, and your first month is on us.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Compare plans", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // ── Announcements (5) ──────────────────────────────────────────────────────

  // 6. Company news — funding / milestone story.
  {
    seedKey: "system/lap-company-news",
    name: "Announcement — company news",
    category: "Announcements",
    subject: "A big step forward for our company",
    previewText: "Some news we've been excited to share.",
    body: () => body([
      block("image", { src: "https://picsum.photos/seed/lap-company-news/600/360", alt: "The team celebrating", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "We're growing, and you're part of it", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Today we're sharing some news we've been holding for a while. We've raised a new round of funding to invest in the product, the team, and the experience you have with us every day.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "What does it mean for you? More of what you love, sooner, and a steadier company standing behind it. Thank you for being here since the start.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Read the announcement", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 7. Policy / terms update — plain, trustworthy, text-only.
  {
    seedKey: "system/lap-policy-update",
    name: "Announcement — policy update",
    category: "Announcements",
    subject: "An update to our Terms of Service",
    previewText: "What's changing, and what it means for you.",
    body: () => body([
      block("heading", { text: "We're updating our terms", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "We're writing to let you know that our Terms of Service and Privacy Policy will change on June 30, 2026. We've made them clearer and updated how we describe a few of our newer features.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What's changing", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Plainer language throughout, an updated section on data retention, and clarified terms for accounts on our newer plans.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What you need to do", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Nothing. By continuing to use your account after June 30, you accept the updated terms. If you'd like to review them in full first, you can read everything below.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Review the updated terms", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 8. New partnership — image-led, warm.
  {
    seedKey: "system/lap-new-partnership",
    name: "Announcement — new partnership",
    category: "Announcements",
    subject: "A new partnership you'll want to know about",
    previewText: "Two teams, one better experience for you.",
    body: () => body([
      block("spacer", { height: 16 }),
      block("heading", { text: "Better together", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "We've joined forces with a partner we genuinely admire to bring you something neither of us could build alone. The result is a smoother, more connected experience for everyone.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/lap-new-partnership/600/360", alt: "Two teams shaking hands", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Starting today, the integration is available to all accounts at no extra cost. Connect it once and the two tools you use most finally talk to each other.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Explore the integration", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 9. Milestone / thank-you — celebratory, big number.
  {
    seedKey: "system/lap-milestone-thanks",
    name: "Announcement — milestone & thanks",
    category: "Announcements",
    subject: "We just hit a million, thanks to you",
    previewText: "A milestone worth celebrating together.",
    body: () => body([
      block("spacer", { height: 32 }),
      block("heading", { text: "1,000,000", level: 1, align: "center", color: CORAL }),
      block("heading", { text: "And every one of them matters", level: 2, align: "center", color: INK }),
      block("paragraph", { html: "This week we crossed a million customers. It's a number we never take for granted, because behind it is you, and the trust you put in us every single day.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/lap-milestone-thanks/600/360", alt: "A celebration", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Thank you for being one in a million. Here's to the next chapter, built with you.", align: "center", color: MUTED }),
      block("spacer", { height: 8 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 10. Scheduled maintenance / downtime notice — operational, no image.
  {
    seedKey: "system/lap-maintenance-notice",
    name: "Announcement — maintenance notice",
    category: "Announcements",
    subject: "Scheduled maintenance this Saturday",
    previewText: "A brief window of downtime. Here are the details.",
    body: () => body([
      block("heading", { text: "Scheduled maintenance", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "We're performing planned maintenance to keep things fast and reliable. During this window, your account will be temporarily unavailable.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("divider", { color: CORAL, thickness: 2 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "When", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Saturday, June 14, from 2:00 to 4:00 AM ET. We expect the actual downtime to be much shorter.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What to expect", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "The app and API will be briefly inaccessible. Any work in progress is saved automatically and will be waiting for you when we're back.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Check status updates", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },
];
