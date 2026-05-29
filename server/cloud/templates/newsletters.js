// ─────────────────────────────────────────────────────────────────────────────
// Newsletter-family system templates. CommonJS.
//
// Five distinct, ready-to-send starting points for the "Newsletters" category:
//   1. Weekly digest        — multi-story, divider-separated rhythm
//   2. Monthly roundup       — "best of the month" recap with imagery
//   3. Founder's note         — warm, text-forward, minimal images
//   4. Curated link roundup   — short sections, each a small text-link button
//   5. Industry insights      — stat-led heading, chart-style image, commentary
//
// Copy is real and polished — no placeholders. Brand CTAs are coral (#FF4E4E)
// on white; body ink #1A1A1A, muted #5A5A5A.
// ─────────────────────────────────────────────────────────────────────────────

const { block, footerBlock, body } = require("./_helpers");

module.exports = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. WEEKLY DIGEST
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/news-weekly-digest",
    name: "Weekly digest",
    category: "Newsletters",
    subject: "Your week in 5 minutes ☕",
    previewText: "The three stories worth your time this week — and nothing else.",
    body: () => body([
      block("heading", { text: "This week, distilled", level: 1, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Five minutes, three stories, zero fluff. Grab a coffee — here's everything that actually mattered this week.", align: "left", color: "#5A5A5A" }),
      block("image", { src: "https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=600&q=80&auto=format&fit=crop", alt: "An open newsroom with morning light across the desks", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "1. The story everyone's talking about", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "The numbers came in higher than anyone forecast, and the ripple effects are already reshaping how teams plan for next quarter. We broke down what changed, who it touches, and the one move smart operators are making right now.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Read the full story", href: "https://example.com/weekly/big-story", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("heading", { text: "2. Quick hits", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "A new tool you'll want on your radar, a policy shift that quietly cleared committee, and a hiring trend reshaping remote teams. Three short reads you can skim before your next meeting.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Skim the quick hits", href: "https://example.com/weekly/quick-hits", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("heading", { text: "3. Worth bookmarking", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "A deep-dive essay that's been making the rounds for good reason. Save it for the weekend — it's the kind of piece that quietly changes how you think about your own work.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Save it for later", href: "https://example.com/weekly/bookmark", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "That's the week. Hit reply and tell us which story landed — we read every response and the best ones shape what we cover next.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      footerBlock("Northwind Media · 500 Howard St, San Francisco, CA 94105"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. MONTHLY ROUNDUP / BEST OF THE MONTH
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/news-monthly-roundup",
    name: "Monthly roundup",
    category: "Newsletters",
    subject: "The best of the month, all in one place",
    previewText: "Our most-read stories, biggest wins, and the moment you missed.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1506765515384-028b60a970df?w=600&q=80&auto=format&fit=crop", alt: "A calendar and notebook laid out on a clean desk", width: 600, align: "center", linkHref: "" }),
      block("heading", { text: "Best of the month", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Another month in the books. Here's everything worth a second look — the stories you loved, the milestones we hit, and a few things you might have scrolled past.", align: "center", color: "#5A5A5A" }),
      block("divider", { color: "#E5E5E7", thickness: 2 }),
      block("heading", { text: "Most-read this month", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "You couldn't get enough of our guide to building habits that actually stick. It racked up more reads than anything we've published all year — and the comments turned into a masterclass of their own.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Catch up on the top story", href: "https://example.com/monthly/top", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 10 }),
      block("spacer", { height: 24 }),
      block("heading", { text: "A milestone worth celebrating", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "We crossed fifty thousand readers this month — a number that felt impossibly far away when we started. Thank you for forwarding, replying, and showing up in our inbox. None of this works without you.", align: "left", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1531058020387-3be344556be6?w=600&q=80&auto=format&fit=crop", alt: "A small team raising glasses in celebration", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "In case you missed it", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Our quiet little interview with a first-time founder turned out to be the sleeper hit of the month. If you only read one thing before next month, make it this one.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Read the interview", href: "https://example.com/monthly/missed", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 10 }),
      block("spacer", { height: 32 }),
      block("paragraph", { html: "See you next month. Until then, forward this to one person who'd enjoy it — that's how we grow.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      footerBlock("Northwind Media · 500 Howard St, San Francisco, CA 94105"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. FOUNDER'S / PERSONAL NOTE — text-forward, warm
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/news-founders-note",
    name: "Founder's note",
    category: "Newsletters",
    subject: "A quick note from me to you",
    previewText: "No pitch this time — just something I've been thinking about.",
    body: () => body([
      block("heading", { text: "A note from the founder", level: 1, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Hi — it's been a while since I wrote to you directly, and not with a product update or an announcement. Just me, thinking out loud. So thank you for opening this.", align: "left", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=600&q=80&auto=format&fit=crop", alt: "A handwritten note and pen resting on a warmly lit wooden desk", width: 600, align: "center", linkHref: "" }),
      block("paragraph", { html: "Three years ago I started this company because I was frustrated. The tools I was handed were either too clever to use or too simple to trust, and I couldn't believe nobody had bridged that gap. So we tried to.", align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "What I didn't expect was how much I'd learn from you. Every reply, every bug report, every honest piece of why-doesn't-this-just-work feedback has shaped where we're headed. You've made this better than I could have on my own.", align: "left", color: "#1A1A1A" }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("paragraph", { html: "Here's what's been on my mind lately: we're growing, and growth has a way of pulling a company away from the people it started for. I don't want that. So we're slowing down on features and speeding up on the thing you tell us matters most — making the basics feel effortless.", align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "If there's one thing you'd fix about working with us, I genuinely want to hear it. Hit reply. It comes straight to me, and I read every single one.", align: "left", color: "#1A1A1A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Warmly, Dana — Founder & CEO", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Reply and say hi", href: "mailto:dana@northwind.example", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("spacer", { height: 16 }),
      footerBlock("Northwind Media · 500 Howard St, San Francisco, CA 94105"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. CURATED CONTENT / LINK ROUNDUP — short sections, text-link buttons
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/news-curated-links",
    name: "Curated link roundup",
    category: "Newsletters",
    subject: "5 links worth your click this week",
    previewText: "Hand-picked reads, tools, and one thing that made us laugh.",
    body: () => body([
      block("heading", { text: "This week's best links", level: 1, align: "left", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1488190211105-8b0e65b80b4e?w=600&q=80&auto=format&fit=crop", alt: "A cozy stack of books and a coffee cup ready for a weekend of reading", width: 600, align: "center", linkHref: "" }),
      block("paragraph", { html: "We read a lot so you don't have to. Here are the five things we couldn't stop thinking about this week, each with a one-line reason it's worth your time.", align: "left", color: "#5A5A5A" }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("heading", { text: "📖 The long read", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "A beautifully reported essay on why the most productive people protect their boredom. It's quietly become the most-shared piece in our team chat.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Read it →", href: "https://example.com/links/long-read", bg: "#FFFFFF", fg: "#FF4E4E", align: "left", radius: 6 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "🛠 The tool", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "A tiny app that turns your messy meeting notes into a clean summary in seconds. Free, no signup, and genuinely good.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Try the tool →", href: "https://example.com/links/tool", bg: "#FFFFFF", fg: "#FF4E4E", align: "left", radius: 6 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "📊 The chart", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "One graph that explains more about remote work than most year-long studies. Stare at it for ten seconds and you'll get it.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "See the chart →", href: "https://example.com/links/chart", bg: "#FFFFFF", fg: "#FF4E4E", align: "left", radius: 6 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "🎧 The listen", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "A forty-minute interview that's basically a free MBA on pricing. Perfect for your next walk or commute.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Press play →", href: "https://example.com/links/listen", bg: "#FFFFFF", fg: "#FF4E4E", align: "left", radius: 6 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "😄 The palate cleanser", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "And finally, the one thing that made the whole team laugh this week. You've earned it.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Treat yourself →", href: "https://example.com/links/fun", bg: "#FFFFFF", fg: "#FF4E4E", align: "left", radius: 6 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("paragraph", { html: "Found something we should feature next week? Reply with the link — we credit every reader who sends one in.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      footerBlock("Northwind Media · 500 Howard St, San Francisco, CA 94105"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. INDUSTRY INSIGHTS / DATA-LED — stat-led heading + chart image + commentary
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/news-industry-insights",
    name: "Industry insights",
    category: "Newsletters",
    subject: "73% of teams got this wrong last quarter",
    previewText: "The data behind the trend everyone's about to overreact to.",
    body: () => body([
      block("heading", { text: "73% of teams scaled their tools faster than their process", level: 1, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "That single number, pulled from this quarter's survey of two thousand operators, explains more about why teams stall than any of the usual culprits. Here's what the data is actually telling us.", align: "left", color: "#5A5A5A" }),
      block("image", { src: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&q=80&auto=format&fit=crop", alt: "A bar chart and analytics dashboard on a laptop screen", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "What the numbers show", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Adoption of new tooling jumped 41% year over year, but the share of teams that documented a matching workflow barely moved. The gap between buying software and actually changing how work gets done has never been wider.", align: "left", color: "#1A1A1A" }),
      block("divider", { color: "#E5E5E7", thickness: 1 }),
      block("heading", { text: "Why it matters", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "More tools without more clarity doesn't speed teams up — it quietly taxes them. The fastest-growing teams in our sample weren't the ones with the biggest stacks. They were the ones who paused to redesign the process first, then bought the tool to fit it.", align: "left", color: "#1A1A1A" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What to do about it", level: 2, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Before your next purchase, write down the workflow it's meant to improve in one sentence. If you can't, you're buying a tool to solve a problem you haven't defined yet — and the data says you'll regret it next quarter.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Get the full report", href: "https://example.com/insights/q-report", bg: "#FF4E4E", fg: "#FFFFFF", align: "left", radius: 8 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Want the underlying dataset? Reply and we'll send the raw numbers, methodology, and the three charts that didn't make the cut.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      footerBlock("Northwind Media · 500 Howard St, San Francisco, CA 94105"),
    ]),
  },
];
