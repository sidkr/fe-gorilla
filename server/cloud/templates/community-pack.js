// ─────────────────────────────────────────────────────────────────────────────
// Nonprofit & community — system email templates (pack). CommonJS.
//
// Ten distinct, ready-to-send starting points for the "Nonprofit & community"
// category. Warm, mission-driven copy; clear donate / get-involved CTAs.
//   1.  Donation appeal           7.  Membership renewal
//   2.  End-of-year giving        8.  Community event invite
//   3.  Volunteer recruitment     9.  Petition / advocacy CTA
//   4.  Impact report            10.  Monthly community newsletter
//   5.  Fundraising thermometer
//   6.  Thank-you to donors
//
// Brand CTAs are coral (#FF4E4E) on white; body ink #1A1A1A, muted #5A5A5A,
// rules #E5E5E7. {{merge}} tags are used for personalization.
// ─────────────────────────────────────────────────────────────────────────────

const { block, footerBlock, body } = require("./_helpers");

const INK = "#1A1A1A",
  MUTED = "#5A5A5A",
  CORAL = "#FF4E4E",
  WHITE = "#FFFFFF",
  RULE = "#E5E5E7";

module.exports = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. DONATION APPEAL
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-donation-appeal",
    name: "Donation appeal",
    category: "Nonprofit & community",
    subject: "A meal, a bed, a second chance — will you help?",
    previewText: "Your gift today goes straight to the families who need it most.",
    body: () => body([
      block("heading", { text: "One gift changes a family's week", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, last winter we promised no neighbor would go without a warm meal. With your help, we kept that promise 4,200 times. But the need hasn't slowed — and we can't do the next 4,200 without you.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-donation-hands/600/360", alt: "Volunteers handing warm meals to families at a community kitchen", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "$25 provides a week of hot dinners. $60 keeps a family warm through a cold snap. Whatever you can give today, it goes straight to the people who need it most — no detours, no overhead games.", align: "left", color: MUTED }),
      block("button", { label: "Donate today", href: "https://example.com/donate", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Thank you for standing with our neighbors. Every dollar is a door held open.", align: "left", color: MUTED }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. END-OF-YEAR GIVING
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-end-of-year-giving",
    name: "End-of-year giving",
    category: "Nonprofit & community",
    subject: "Before midnight on Dec 31: your gift, doubled",
    previewText: "A matching donor will match every dollar through year-end.",
    body: () => body([
      block("heading", { text: "There's still time to make this year count", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "{{firstName}}, the year is almost out — and so is your chance to give in 2024. A generous board member has pledged to match every gift, dollar for dollar, until the clock strikes midnight on December 31.", align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Give $50, and we receive $100", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "It's the rare moment when your generosity does double the work. Make your year-end gift now and watch your impact instantly double for the families we serve.", align: "center", color: MUTED }),
      block("button", { label: "Double my gift", href: "https://example.com/year-end-match", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Your contribution may be tax-deductible — you'll receive a receipt by email. Thank you for closing out the year with kindness.", align: "center", color: MUTED }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. VOLUNTEER RECRUITMENT
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-volunteer-recruitment",
    name: "Volunteer recruitment",
    category: "Nonprofit & community",
    subject: "We could really use a hand this Saturday",
    previewText: "Three hours, one morning — and a neighborhood that's better for it.",
    body: () => body([
      block("heading", { text: "Lend three hours. Change a corner of your town.", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, you don't need a special skill or a big commitment to make a difference — just a free Saturday morning and a willingness to show up. We're organizing teams across the city and we'd love to have you on one.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-volunteer-crew/600/360", alt: "A cheerful group of volunteers in matching shirts cleaning up a park", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Where we need you", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Sorting donations at the pantry, planting in the community garden, reading with kids at the library, or staffing the welcome table. Pick what fits — every role matters, and no experience is required.", align: "left", color: MUTED }),
      block("button", { label: "Sign up to volunteer", href: "https://example.com/volunteer", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Bring a friend, bring your family — we'll bring the coffee and the good company.", align: "left", color: MUTED }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. IMPACT REPORT
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-impact-report",
    name: "Annual impact report",
    category: "Nonprofit & community",
    subject: "What your support made possible this year",
    previewText: "A year of meals served, doors opened, and lives changed — by the numbers.",
    body: () => body([
      block("heading", { text: "Look what we did together", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "{{firstName}}, behind every number below is a person whose day got a little brighter because you chose to care. Here's the year you helped build.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-impact-year/600/360", alt: "A collage of community members smiling at various program events", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "52,000 meals served", level: 2, align: "left", color: CORAL }),
      block("paragraph", { html: "Up 18% from last year — every plate a promise kept to a hungry neighbor.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "1,300 volunteers mobilized", level: 2, align: "left", color: CORAL }),
      block("paragraph", { html: "Donating more than 9,000 hours of time, talent, and heart to the work.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "240 families housed", level: 2, align: "left", color: CORAL }),
      block("paragraph", { html: "Each one a door that opened onto stability, safety, and a fresh start.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Read the full report", href: "https://example.com/impact-report", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. FUNDRAISING-GOAL THERMOMETER UPDATE
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-fundraising-thermometer",
    name: "Fundraising goal update",
    category: "Nonprofit & community",
    subject: "We're 78% of the way there — help us finish strong",
    previewText: "$39,000 raised of our $50,000 goal. The final stretch is the hardest.",
    body: () => body([
      block("heading", { text: "So close we can almost touch it", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "{{firstName}}, thanks to people like you, we've raised $39,000 toward our $50,000 goal for the new family resource center. That's 78% — and the finish line is in sight.", align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("heading", { text: "$39,000 raised · $11,000 to go", level: 2, align: "center", color: CORAL }),
      block("image", { src: "https://picsum.photos/seed/cmm-thermometer-goal/600/360", alt: "A fundraising thermometer graphic filled to roughly three-quarters", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "The last stretch is always the steepest. A gift of any size — $20, $50, $100 — pushes the needle and gets us closer to opening the doors. Will you help us cross the line?", align: "center", color: MUTED }),
      block("button", { label: "Help us reach the goal", href: "https://example.com/goal", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6. THANK-YOU TO DONORS
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-donor-thank-you",
    name: "Donor thank-you",
    category: "Nonprofit & community",
    subject: "From all of us: thank you, {{firstName}}",
    previewText: "Your generosity is already at work in the community you love.",
    body: () => body([
      block("heading", { text: "Thank you, from the bottom of our hearts", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "{{firstName}}, your gift of {{donationAmount}} arrived safely — and it's already on its way to the families, kids, and neighbors who need it. We don't take a single dollar for granted.", align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-thankyou-note/600/360", alt: "A handwritten thank-you card resting on a wooden table", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Generosity like yours is what keeps the lights on and the doors open. Because of you, someone will sit down to a warm meal, find a safe place to sleep, or get the helping hand they were too proud to ask for.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "With deep gratitude,<br>The whole team", align: "center", color: INK }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 7. MEMBERSHIP RENEWAL
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-membership-renewal",
    name: "Membership renewal",
    category: "Nonprofit & community",
    subject: "Your membership keeps the community thriving — renew today",
    previewText: "It's time to renew. Stay part of the work you helped build.",
    body: () => body([
      block("heading", { text: "Let's keep going, together", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, your membership is up for renewal this month. For the past year you've been more than a supporter — you've been part of the family that makes this community stronger every single day.", align: "left", color: INK }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What your membership powers", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Free programs for kids, a fully stocked pantry, advocacy that gives our neighbors a voice, and the everyday work that rarely makes headlines but always makes a difference.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Renewing takes about a minute, and your members-only perks — event invites, the quarterly newsletter, and your voting voice — pick right back up.", align: "left", color: MUTED }),
      block("button", { label: "Renew my membership", href: "https://example.com/renew", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 8. COMMUNITY EVENT INVITE
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-community-event-invite",
    name: "Community event invite",
    category: "Nonprofit & community",
    subject: "You're invited: our Spring Block Party 🌷",
    previewText: "Food, music, and neighbors — Saturday, May 18 at Riverside Park.",
    body: () => body([
      block("heading", { text: "Come celebrate with us", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "{{firstName}}, the whole neighborhood is getting together and we'd love to see you there. Bring the family, bring an appetite, bring a neighbor — this one's for everyone.", align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-block-party/600/360", alt: "A lively outdoor community gathering with string lights and food tables", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Saturday, May 18 · 11am–3pm", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "Riverside Park, by the great lawn. Free admission. Live music, a kids' zone, local food trucks, and a chance to meet the people behind the programs you support.", align: "center", color: MUTED }),
      block("button", { label: "RSVP — it's free", href: "https://example.com/rsvp", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Rain or shine — we'll have tents up just in case. See you there!", align: "center", color: MUTED }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 9. PETITION / ADVOCACY CALL-TO-ACTION
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-advocacy-petition",
    name: "Advocacy petition",
    category: "Nonprofit & community",
    subject: "Add your name: protect the funding our families rely on",
    previewText: "The vote is next week. Your signature could tip the balance.",
    body: () => body([
      block("heading", { text: "Your name carries weight — lend it now", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "{{firstName}}, next week the city council votes on cuts that would gut the after-school and food programs thousands of families count on. We have one week to make our voices impossible to ignore.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-advocacy-rally/600/360", alt: "Community members holding signs at a peaceful neighborhood rally", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "We're delivering this petition to council chambers on the morning of the vote. Every signature is one more reason for them to think twice. It takes thirty seconds — and it genuinely matters.", align: "left", color: MUTED }),
      block("button", { label: "Sign the petition", href: "https://example.com/petition", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Already signed? Forward this to two neighbors. Momentum is everything in the final stretch.", align: "left", color: MUTED }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 10. MONTHLY COMMUNITY NEWSLETTER
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/cmm-monthly-newsletter",
    name: "Monthly community newsletter",
    category: "Nonprofit & community",
    subject: "This month in the neighborhood 🏡",
    previewText: "Wins, upcoming events, and ways to get involved this month.",
    body: () => body([
      block("heading", { text: "Your monthly community digest", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, here's everything happening around the neighborhood this month — the wins worth celebrating, what's coming up, and a few easy ways to pitch in.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/cmm-monthly-digest/600/360", alt: "A bright community center with neighbors chatting over coffee", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "A win worth sharing", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "The new community garden plots filled up in a single weekend, and the first seedlings are already in the ground. Fresh produce for the pantry is on the way.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Mark your calendar", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Free tax-help clinic on the 12th, the neighborhood cleanup on the 20th, and our monthly potluck on the 27th. All are welcome — no RSVP required.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Ways to help this month", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "We're short on pantry sorters and a few drivers for our meal-delivery route. If you have an hour to spare, we'd be grateful for the hand.", align: "left", color: MUTED }),
      block("button", { label: "See all the ways to help", href: "https://example.com/get-involved", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      footerBlock("Your Organization · 123 Main St, City, ST 00000"),
    ]),
  },
];
