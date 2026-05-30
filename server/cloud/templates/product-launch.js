const { block, footerBlock, body } = require("./_helpers");

// ─────────────────────────────────────────────────────────────────────────────
// "Product launches" category — system email templates.
//
// Brand palette: coral #FF4E4E CTAs on #FFFFFF, ink #1A1A1A, muted #5A5A5A.
// Each template uses a tasteful per-template accent. Photos are real Unsplash
// ids, all sized ?w=600&q=80&auto=format&fit=crop. Footer is always last.
// ─────────────────────────────────────────────────────────────────────────────

module.exports = [
  // 1. Product launch — image hero + CTA ────────────────────────────────────
  {
    seedKey: "system/launch-hero-reveal",
    name: "Product launch — hero reveal",
    category: "Product launches",
    subject: "It's here: meet Gorilla 3",
    previewText: "Six months in the making. Today it's yours.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=600&q=80&auto=format&fit=crop", alt: "Gorilla 3 product hero", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Say hello to Gorilla 3", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "The most powerful release we've ever shipped. Faster sends, sharper analytics, and a brand-new automation canvas that turns one good idea into a campaign that runs itself.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("button", { label: "Explore what's new", href: "https://gorilla.email/whats-new", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
      block("spacer", { height: 32 }),
      block("divider", { color: "#EAEAEA", thickness: 1 }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Why teams are upgrading", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Send at scale without the wait. Our rebuilt delivery engine pushes campaigns out up to three times faster, so a million-subscriber blast lands while it's still relevant.", align: "left", color: "#5A5A5A" }),
      block("paragraph", { html: "See the whole story. The new reporting hub stitches opens, clicks, and revenue into a single timeline you can actually act on.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Upgrade your account", href: "https://gorilla.email/upgrade", bg: "#1A1A1A", fg: "#FFFFFF", align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      footerBlock("Gorilla Email, Inc. · 88 Banyan Street, Suite 400, San Francisco, CA 94107"),
    ]),
  },

  // 2. New feature announcement — feature spotlight ─────────────────────────
  {
    seedKey: "system/launch-feature-spotlight",
    name: "Feature announcement — spotlight",
    category: "Product launches",
    subject: "New: Smart Send picks the perfect moment for you",
    previewText: "Stop guessing send times. Let the data decide.",
    body: () => body([
      block("heading", { text: "Introducing Smart Send", level: 1, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Timing makes or breaks an email. Smart Send studies how each of your subscribers reads, then delivers to every inbox at the exact hour they're most likely to open. No spreadsheets, no guesswork.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80&auto=format&fit=crop", alt: "Smart Send analytics dashboard", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 32 }),
      block("heading", { text: "What you get", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Per-subscriber timing. Every contact gets their own optimal delivery window, learned from real engagement history.", align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Higher opens, automatically. Early users are seeing open rates climb double digits with zero extra effort.", align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "One toggle to turn it on. Flip the switch on any campaign and Smart Send handles the rest.", align: "left", color: "#1A1A1A" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Try Smart Send", href: "https://gorilla.email/features/smart-send", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Gorilla Email, Inc. · 88 Banyan Street, Suite 400, San Francisco, CA 94107"),
    ]),
  },

  // 3. Beta / early-access invite — exclusive tone ──────────────────────────
  {
    seedKey: "system/launch-beta-invite",
    name: "Beta invite — early access",
    category: "Product launches",
    subject: "You're invited: early access to Gorilla AI",
    previewText: "A private beta, and your seat is reserved.",
    body: () => body([
      block("spacer", { height: 16 }),
      block("paragraph", { html: "PRIVATE BETA · BY INVITATION", align: "center", color: "#FF4E4E" }),
      block("heading", { text: "Be the first to try Gorilla AI", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "We're opening a small, hand-picked beta for our new AI writing partner, and we'd love for you to be in the room. Describe a campaign in a sentence and watch a full draft appear, on-brand and ready to refine.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=600&q=80&auto=format&fit=crop", alt: "Gorilla AI early access", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 32 }),
      block("paragraph", { html: "Spots are limited and seats fill fast. Your invitation is valid for the next seven days, after which we'll pass it along to the waitlist.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("button", { label: "Claim my beta seat", href: "https://gorilla.email/beta/ai", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 24 }),
      block("spacer", { height: 24 }),
      footerBlock("Gorilla Email, Inc. · 88 Banyan Street, Suite 400, San Francisco, CA 94107"),
    ]),
  },

  // 4. Release notes / "what's new this month" — versioned ──────────────────
  {
    seedKey: "system/launch-release-notes",
    name: "Release notes — what's new this month",
    category: "Product launches",
    subject: "What's new in Gorilla — May 2026",
    previewText: "Release 3.4: faster editor, new segments, and more.",
    body: () => body([
      block("heading", { text: "What's new this month", level: 1, align: "left", color: "#1A1A1A" }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=600&q=80&auto=format&fit=crop", alt: "Gorilla product dashboard showing the new release", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Release 3.4 is rolling out to every account this week. Here's everything we shipped, big and small.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#FF4E4E", thickness: 2 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "New · Behavioral segments", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Build audiences from what people actually do. Combine opens, clicks, purchases, and page visits into living segments that update themselves as subscribers act.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#EAEAEA", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Improved · A faster editor", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "We rewrote the drag-and-drop core. Blocks now snap into place instantly, even on long, image-heavy emails, and autosave is twice as quick.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#EAEAEA", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Fixed · The small stuff", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Squashed a duplicate-send edge case on scheduled campaigns, tightened mobile preview accuracy, and cleaned up dozens of rough edges you told us about. Thank you for the reports.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 32 }),
      block("button", { label: "Read the full changelog", href: "https://gorilla.email/changelog/3-4", bg: "#1A1A1A", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Gorilla Email, Inc. · 88 Banyan Street, Suite 400, San Francisco, CA 94107"),
    ]),
  },

  // 5. Coming soon / waitlist teaser — minimal, intriguing ──────────────────
  {
    seedKey: "system/launch-coming-soon-teaser",
    name: "Coming soon — waitlist teaser",
    category: "Product launches",
    subject: "Something big is almost here",
    previewText: "14 days. One announcement that changes how you send.",
    body: () => body([
      block("spacer", { height: 32 }),
      block("image", { src: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80&auto=format&fit=crop", alt: "Coming soon teaser", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 32 }),
      block("heading", { text: "14 days to go", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "We've been building something quietly for a while now, and we're almost ready to show you. It's the biggest thing we've ever made, and it's going to change the way your team sends.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "No hints yet. Just a promise that it'll be worth the wait. Join the waitlist and you'll be first through the door on launch day.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Join the waitlist", href: "https://gorilla.email/waitlist", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 24 }),
      block("spacer", { height: 32 }),
      block("divider", { color: "#EAEAEA", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "The countdown has started. See you in two weeks.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 8 }),
      footerBlock("Gorilla Email, Inc. · 88 Banyan Street, Suite 400, San Francisco, CA 94107"),
    ]),
  },
];
