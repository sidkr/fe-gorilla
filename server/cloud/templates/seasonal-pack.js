// Seasonal & holiday — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // 1. New Year kickoff ────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-new-year-kickoff",
    name: "New Year kickoff",
    category: "Seasonal & holiday",
    subject: "A fresh start: here's to your best year yet",
    previewText: "New goals, new beginnings — let's make this year count, {{firstName}}.",
    body: () => body([
      block("heading", { text: "Happy New Year, {{firstName}}", level: 1, align: "center", color: INK }),
      block("heading", { text: "Here's to a fresh start", level: 3, align: "center", color: MUTED }),
      block("image", { src: "https://picsum.photos/seed/newyear-confetti/600/360", alt: "Confetti celebrating the new year", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "A brand-new year is the perfect moment to set your sights higher. Whatever you're planning for the months ahead, we're here to help you start strong and stay on track.", align: "center", color: INK }),
      block("button", { label: "Plan your year", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Thank you for being part of our community. Onward to a great year.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 2. Valentine's promo ───────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-valentines-promo",
    name: "Valentine's Day promo",
    category: "Seasonal & holiday",
    subject: "Show a little love — 20% off this Valentine's",
    previewText: "Something special for someone special. Use code LOVE20.",
    body: () => body([
      block("heading", { text: "From us, with love", level: 1, align: "center", color: CORAL }),
      block("image", { src: "https://picsum.photos/seed/valentines-hearts/600/360", alt: "Valentine's Day gift wrapped with a ribbon", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Valentine's Day is around the corner, and we've got just the thing to make it memorable. For a limited time, take 20% off when you treat someone you love — including yourself.", align: "center", color: INK }),
      block("heading", { text: "Use code LOVE20 at checkout", level: 3, align: "center", color: INK }),
      block("button", { label: "Shop the Valentine's edit", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Code LOVE20 · Valid through February 14 · Cannot be combined with other offers.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 3. Spring refresh ──────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-spring-refresh",
    name: "Spring refresh",
    category: "Seasonal & holiday",
    subject: "Spring is here — time for a fresh look",
    previewText: "Lighter days, new arrivals, and a clean slate for the season.",
    body: () => body([
      block("heading", { text: "Spring has arrived", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "The days are getting longer and everything feels a little brighter. It's the perfect time to refresh your routine and welcome the new season with open arms.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/spring-blossom/600/360", alt: "Spring blossoms in bloom", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "What's new this season", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "We've rolled out fresh arrivals inspired by the colors and energy of spring. Come see what caught our eye — there's something for everyone.", align: "left", color: MUTED }),
      block("button", { label: "Explore spring arrivals", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 24 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 4. Summer sale ─────────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-summer-sale",
    name: "Summer sale",
    category: "Seasonal & holiday",
    subject: "Summer sale is on — up to 50% off",
    previewText: "Sun's out, savings out. The summer sale starts now.",
    body: () => body([
      block("heading", { text: "SUMMER SALE", level: 1, align: "center", color: CORAL }),
      block("heading", { text: "Up to 50% off your summer favorites", level: 2, align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/summer-beach/600/360", alt: "Bright summer beach scene", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Make the most of the warm weather with savings as big as the season. From beach-ready essentials to everyday staples, you'll find up to half off across the store.", align: "center", color: INK }),
      block("button", { label: "Shop the summer sale", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("divider", { color: RULE, thickness: 2 }),
      block("paragraph", { html: "Sale ends Labor Day · While supplies last · Online and in store.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 5. Black Friday ────────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-black-friday",
    name: "Black Friday doorbusters",
    category: "Seasonal & holiday",
    subject: "Black Friday is here: our biggest deals of the year",
    previewText: "Doorbusters are live. Don't wait — they won't last.",
    body: () => body([
      block("heading", { text: "BLACK FRIDAY", level: 1, align: "center", color: INK }),
      block("heading", { text: "Our biggest deals of the year are live", level: 3, align: "center", color: CORAL }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/blackfriday-deals/600/360", alt: "Black Friday sale tags", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "The wait is over. Our Black Friday doorbusters are officially live with the deepest discounts we offer all year. These prices won't stick around, so grab what you love before it's gone.", align: "center", color: INK }),
      block("button", { label: "Shop doorbusters", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Limited quantities · Today only · No rain checks.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 6. Cyber Monday ────────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-cyber-monday",
    name: "Cyber Monday online deals",
    category: "Seasonal & holiday",
    subject: "Cyber Monday: online-only deals end at midnight",
    previewText: "Skip the lines — our best online deals are live today only.",
    body: () => body([
      block("heading", { text: "Cyber Monday", level: 1, align: "center", color: CORAL }),
      block("heading", { text: "Online-only deals, today only", level: 3, align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "No crowds, no lines — just our best deals delivered straight to your screen. Shop from the couch and save big before the clock strikes midnight.", align: "center", color: INK }),
      block("heading", { text: "Extra 15% off with code CYBER15", level: 2, align: "center", color: CORAL }),
      block("button", { label: "Shop Cyber Monday", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Code CYBER15 · Ends tonight at 11:59pm · Online exclusive.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 7. Holiday gift guide ──────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-holiday-gift-guide",
    name: "Holiday gift guide",
    category: "Seasonal & holiday",
    subject: "Your holiday gift guide is here",
    previewText: "Hand-picked ideas for everyone on your list this season.",
    body: () => body([
      block("heading", { text: "The holiday gift guide", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Stuck on what to give? We've done the hard part for you. Browse our curated picks for every person and every budget — thoughtful gifts made easy.", align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/holiday-gifts/600/360", alt: "Wrapped holiday gifts under festive lights", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "For the homebody", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Cozy comforts that make staying in feel like a treat.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "For the adventurer", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Gear and gadgets for the ones who never sit still.", align: "left", color: MUTED }),
      block("spacer", { height: 16 }),
      block("button", { label: "See the full guide", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 8. Year in review / thank-you ──────────────────────────────────────────────
  {
    seedKey: "system/ssn-year-in-review",
    name: "Year in review thank-you",
    category: "Seasonal & holiday",
    subject: "Looking back on an amazing year — thank you",
    previewText: "A heartfelt thank you for being part of our year, {{firstName}}.",
    body: () => body([
      block("heading", { text: "What a year it's been", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "As the year winds down, we wanted to pause and say thank you. None of what we accomplished this year would have been possible without you, {{firstName}}.", align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/yearreview-sparkler/600/360", alt: "A sparkler glowing at year's end", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "A few highlights", level: 2, align: "center", color: INK }),
      block("paragraph", { html: "We welcomed thousands of new faces, launched things we're proud of, and learned so much along the way. Here's to carrying that momentum forward.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "From all of us — thank you, and happy holidays.", align: "center", color: CORAL }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 9. Back-to-school ──────────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-back-to-school",
    name: "Back-to-school ready",
    category: "Seasonal & holiday",
    subject: "Back-to-school season: everything on your list",
    previewText: "Get set for the new school year with deals on the essentials.",
    body: () => body([
      block("heading", { text: "Back to school, sorted", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "The new school year is right around the corner. Whether you're stocking up for the kids or heading back yourself, we've got the essentials to start the term off right.", align: "left", color: INK }),
      block("image", { src: "https://picsum.photos/seed/backtoschool-supplies/600/360", alt: "Colorful back-to-school supplies", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Save 15% on supplies", level: 3, align: "left", color: CORAL }),
      block("paragraph", { html: "From notebooks to backpacks, knock out your list in one trip and keep a little extra in your pocket.", align: "left", color: MUTED }),
      block("button", { label: "Shop the school list", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 8 }),
      block("spacer", { height: 24 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 10. End-of-year giving ─────────────────────────────────────────────────────
  {
    seedKey: "system/ssn-end-of-year-giving",
    name: "End-of-year giving",
    category: "Seasonal & holiday",
    subject: "Make your year-end gift count",
    previewText: "There's still time to give back before the year is out.",
    body: () => body([
      block("heading", { text: "Give back this season", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "As the year comes to a close, it's a meaningful time to support the causes you care about. Every contribution, no matter the size, makes a real difference.", align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/giving-hands/600/360", alt: "Hands joined together in support", width: 600, align: "center", linkHref: "https://example.com" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Year-end gifts may be tax-deductible, and they help us keep doing the work that matters. Thank you for considering a gift before December 31.", align: "center", color: MUTED }),
      block("button", { label: "Make a gift", href: "https://example.com", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Thank you for your generosity and for being part of our community.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },
];
