// ─────────────────────────────────────────────────────────────────────────────
// Welcome & onboarding — system email templates.
//
// Five distinct, ready-to-fork onboarding emails. Each builds blocks via the
// shared helpers in ./_helpers.js so the editor + MJML compiler understand them.
// Brand: coral CTA #FF4E4E on #FFFFFF, ink #1A1A1A, muted #5A5A5A.
// ─────────────────────────────────────────────────────────────────────────────

const { block, footerBlock, body } = require("./_helpers");

const INK = "#1A1A1A";
const MUTED = "#5A5A5A";
const CORAL = "#FF4E4E";
const WHITE = "#FFFFFF";
const RULE = "#E5E5E7";
const ADDRESS = "Gorilla Mail, Inc. · 410 Townsend St, Suite 200, San Francisco, CA 94107";

module.exports = [
  // 1 ─ Warm welcome ──────────────────────────────────────────────────────────
  {
    seedKey: "system/welcome-warm-hello",
    name: "Welcome — warm hello",
    category: "Welcome & onboarding",
    subject: "Welcome to Gorilla — let's get your first email out",
    previewText: "You're in. Here's the fastest path to your first send.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&q=80&auto=format&fit=crop",
          alt: "A friendly team welcoming a new member",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.com",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Welcome to Gorilla!", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "We're genuinely glad you're here. Gorilla helps you write, design, and send emails your subscribers actually want to open — without the busywork. Let's get your first campaign out the door in under five minutes.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Set up your account",
          href: "https://gorillamail.com/app/dashboard",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),
        block("heading", { text: "Here's what you can do today", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Import your contacts, pick a template you love, and hit send. We handle deliverability, tracking, and the technical heavy lifting so you can focus on the message.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 16 }),
        block("paragraph", {
          html: "Questions along the way? Just reply to this email — a real person on our team reads every one.",
          align: "left",
          color: MUTED,
        }),
        footerBlock(ADDRESS),
      ]),
  },

  // 2 ─ Getting-started checklist ─────────────────────────────────────────────
  {
    seedKey: "system/welcome-getting-started-checklist",
    name: "Welcome — getting-started checklist",
    category: "Welcome & onboarding",
    subject: "Your 4-step checklist to your first Gorilla send",
    previewText: "Knock these out and your first campaign is ready to fly.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1517048676732-d65bc937f952?w=600&q=80&auto=format&fit=crop",
          alt: "A welcoming team collaborating at a bright workspace",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Let's get you set up", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "Four short steps stand between you and your first email. Most folks finish all of them over a coffee. Work through them in order and you'll be ready to send today.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "Step 1 — Import your contacts", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Bring your audience in with a single CSV upload, or sync directly from the tools you already use. We'll automatically tidy up duplicates and bad addresses.",
          align: "left",
          color: INK,
        }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "Step 2 — Verify your sending domain", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Authenticating your domain takes two minutes and dramatically improves whether your emails land in the inbox instead of spam. We'll walk you through each DNS record.",
          align: "left",
          color: INK,
        }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "Step 3 — Design your first email", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Start from one of our polished templates and make it yours with drag-and-drop blocks. No code, no fiddly HTML — what you see is exactly what your subscribers get.",
          align: "left",
          color: INK,
        }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "Step 4 — Send a test, then hit go", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Preview it on desktop and mobile, send a test to yourself, and when it looks great, schedule it or send it right away. That's it — you've shipped your first campaign.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Open my checklist",
          href: "https://gorillamail.com/app/dashboard",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        footerBlock(ADDRESS),
      ]),
  },

  // 3 ─ Tips & best practices ─────────────────────────────────────────────────
  {
    seedKey: "system/welcome-three-tips",
    name: "Welcome — 3 tips & best practices",
    category: "Welcome & onboarding",
    subject: "3 quick tips to get more from every email you send",
    previewText: "Small tweaks, noticeably better open and click rates.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=600&q=80&auto=format&fit=crop",
          alt: "A tidy desk workspace with a laptop and notebook",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.com",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "3 tips to get more from Gorilla", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "You're up and running — now let's make your emails work harder. These three habits separate good campaigns from great ones, and none of them take more than a minute.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "1. Write a subject line worth opening", level: 2, align: "left", color: INK }),
        block("paragraph", {
          html: "Keep it short, specific, and honest — aim for under 50 characters so it doesn't get cut off on phones. Curiosity beats hype, and a clear promise beats a clever pun. Use our subject-line preview to see exactly how it shows up across inboxes.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 16 }),

        block("heading", { text: "2. Send to the right people, not everyone", level: 2, align: "left", color: INK }),
        block("paragraph", {
          html: "Segment your audience by what they care about and you'll see better engagement with fewer unsubscribes. Even a simple split — recent buyers versus longtime subscribers — lets you say something that actually fits.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 16 }),

        block("heading", { text: "3. Let the data guide your next move", level: 2, align: "left", color: INK }),
        block("paragraph", {
          html: "After each send, check your open and click reports to learn what resonated. Try an A/B test on your subject line or send time — small experiments compound into real growth over a few campaigns.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "Explore my reports",
          href: "https://gorillamail.com/app/reports",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        footerBlock(ADDRESS),
      ]),
  },

  // 4 ─ Account activated / confirm email ─────────────────────────────────────
  {
    seedKey: "system/welcome-confirm-email",
    name: "Welcome — confirm your email",
    category: "Welcome & onboarding",
    subject: "One quick step: confirm your email address",
    previewText: "Tap the button to activate your Gorilla account.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1526554850534-7c78330d5f90?w=600&q=80&auto=format&fit=crop",
          alt: "A row of mailboxes representing email confirmation",
          width: 600,
          align: "center",
          linkHref: "",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "Almost there — confirm your email", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "Thanks for signing up for Gorilla! To keep your account secure and make sure we can reach you, please confirm this is your email address. It only takes one tap.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 32 }),
        block("button", {
          label: "Confirm my email",
          href: "https://gorillamail.com/confirm",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        block("spacer", { height: 32 }),
        block("paragraph", {
          html: "This link is valid for the next 24 hours. Once you confirm, your account is fully activated and you can start building right away.",
          align: "center",
          color: MUTED,
        }),
        block("divider", { color: RULE, thickness: 1 }),
        block("paragraph", {
          html: "Didn't create a Gorilla account? No problem — you can safely ignore this email and nothing will happen. If you have any concerns, just reply and we'll help.",
          align: "left",
          color: MUTED,
        }),
        footerBlock(ADDRESS),
      ]),
  },

  // 5 ─ First-action thank-you ────────────────────────────────────────────────
  {
    seedKey: "system/welcome-first-send-thank-you",
    name: "Welcome — first send thank-you",
    category: "Welcome & onboarding",
    subject: "Nicely done — your first campaign is on its way",
    previewText: "Here's what happens next, and how to make the most of it.",
    body: () =>
      body([
        block("image", {
          src: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=600&q=80&auto=format&fit=crop",
          alt: "A person celebrating at their desk",
          width: 600,
          align: "center",
          linkHref: "https://gorillamail.com",
        }),
        block("spacer", { height: 24 }),
        block("heading", { text: "You did it — first campaign sent!", level: 1, align: "center", color: INK }),
        block("paragraph", {
          html: "Thank you for trusting Gorilla with your first send. That's a real milestone, and we're thrilled to be part of it. Your email is on its way to your subscribers right now.",
          align: "center",
          color: MUTED,
        }),
        block("spacer", { height: 24 }),
        block("divider", { color: RULE, thickness: 1 }),

        block("heading", { text: "What happens next", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "Opens and clicks start rolling in within minutes. Head to your reports to watch the results live, see which links got the most attention, and spot who's most engaged.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 16 }),
        block("heading", { text: "Keep the momentum going", level: 3, align: "left", color: INK }),
        block("paragraph", {
          html: "The best results come from a steady rhythm. Schedule your next email while this one is fresh, or set up an automation so new subscribers always get a warm welcome.",
          align: "left",
          color: INK,
        }),
        block("spacer", { height: 24 }),
        block("button", {
          label: "View my results",
          href: "https://gorillamail.com/app/reports",
          bg: CORAL,
          fg: WHITE,
          align: "center",
          radius: 10,
        }),
        footerBlock(ADDRESS),
      ]),
  },
];
