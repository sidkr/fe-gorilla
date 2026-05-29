const { block, footerBlock, body } = require("./_helpers");

module.exports = [
  // ───────────────────────────────────────────────────────────────────────────
  // 1. Black Friday — dark, urgent, doorbuster energy
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-black-friday",
    name: "Black Friday",
    category: "Seasonal & holiday",
    subject: "Black Friday starts now — up to 50% off",
    previewText: "Our biggest deals of the year are live.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1607083206968-13611e3d76db?w=600&q=80&auto=format&fit=crop", alt: "Black Friday sale tag", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "BLACK FRIDAY IS HERE", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Up to 50% off everything — our deepest discounts of the year, live now through Monday at midnight.", align: "center", color: "#5A5A5A" }),
      block("button", { label: "Shop Black Friday", href: "https://example.com/black-friday", bg: "#1A1A1A", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Doorbusters drop every hour", level: 3, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Quantities are limited and the best deals sell out fast. Check back hourly for fresh markdowns across the entire store.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Free shipping on every order over $50. No code needed — discounts apply automatically at checkout.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Cyber Monday — online-only, promo code
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-cyber-monday",
    name: "Cyber Monday",
    category: "Seasonal & holiday",
    subject: "Cyber Monday: 40% off online with code CYBER40",
    previewText: "One day only. Online exclusive. Don't miss it.",
    body: () => body([
      block("heading", { text: "Cyber Monday", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Our biggest online-only event of the year. Take 40% off sitewide for the next 24 hours — no in-store equivalent.", align: "center", color: "#5A5A5A" }),
      block("image", { src: "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=600&q=80&auto=format&fit=crop", alt: "Laptop and credit card for online shopping", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Use code CYBER40 at checkout", level: 2, align: "center", color: "#FF4E4E" }),
      block("paragraph", { html: "Apply the code in your cart to unlock 40% off your full order. Valid online only, today through 11:59 PM PT.", align: "center", color: "#5A5A5A" }),
      block("button", { label: "Shop Online Now", href: "https://example.com/cyber-monday", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Bonus: spend over $100 and we'll upgrade you to express shipping, free. Cart updates the moment you qualify.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Holiday greeting — warm, gratitude, low-sell
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-holiday-thanks",
    name: "Holiday Greeting & Thanks",
    category: "Seasonal & holiday",
    subject: "Thank you — and happy holidays from all of us",
    previewText: "A note of gratitude as the year draws to a close.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1543589077-47d81606c1bf?w=600&q=80&auto=format&fit=crop", alt: "Cozy holiday lights and decorations", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Happy Holidays", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "As the year winds down, we wanted to pause and simply say thank you. None of what we do would matter without you.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Whether you've been with us for years or just discovered us this season, your support means the world to our small team. We're grateful for every order, every message, and every kind word.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "From our family to yours — we wish you warmth, rest, and good company this holiday season. Here's to a bright year ahead.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "With gratitude, The Maker & Co. Team", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 4. New Year — fresh start, year ahead
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-new-year",
    name: "New Year, Fresh Start",
    category: "Seasonal & holiday",
    subject: "New year, new beginnings — let's make it count",
    previewText: "A fresh start, and a little something to kick it off.",
    body: () => body([
      block("heading", { text: "Hello, New Year", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "A brand-new year is a blank page. Whatever you're hoping to build, change, or begin — this is the moment to start.", align: "center", color: "#5A5A5A" }),
      block("image", { src: "https://images.unsplash.com/photo-1467810563316-b5476525c0f9?w=600&q=80&auto=format&fit=crop", alt: "Fireworks lighting up the night sky", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Start the year with 20% off", level: 2, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "To help you begin on the right foot, enjoy 20% off anything that helps you build the year you have in mind. Our gift to your fresh start.", align: "center", color: "#5A5A5A" }),
      block("button", { label: "Begin the Year", href: "https://example.com/new-year", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Thank you for being part of our last year. We can't wait to see what you do with the next one.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Valentine's Day — gift guide, love theme
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-valentines",
    name: "Valentine's Day Gift Guide",
    category: "Seasonal & holiday",
    subject: "Gifts they'll love — your Valentine's guide is here",
    previewText: "Thoughtful picks for the people you adore.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&q=80&auto=format&fit=crop", alt: "Heart-shaped decorations for Valentine's Day", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "With Love", level: 1, align: "center", color: "#FF4E4E" }),
      block("paragraph", { html: "Valentine's Day is almost here. We've gathered our most heartfelt gifts to help you tell someone exactly how much they mean to you.", align: "center", color: "#5A5A5A" }),
      block("button", { label: "Shop the Gift Guide", href: "https://example.com/valentines", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#F5D5D5", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "For the romantic", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Timeless, tender pieces that say it without words — perfect for a partner who loves a classic gesture.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "For your best friend", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Galentine's counts too. Treat the friend who's always there with something playful and thoughtful.", align: "left", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Order by February 11 for guaranteed delivery before the big day. Gift wrapping is on us.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Summer sale — bright, sunny, seasonal
  // ───────────────────────────────────────────────────────────────────────────
  {
    seedKey: "system/season-summer-sale",
    name: "Summer Sale",
    category: "Seasonal & holiday",
    subject: "Summer's here — 30% off to celebrate",
    previewText: "Sun's out, savings out. Shop the summer sale.",
    body: () => body([
      block("image", { src: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&q=80&auto=format&fit=crop", alt: "Sunny beach with clear blue water", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Summer Sale Is On", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Longer days, warmer nights, and 30% off the things that make summer better. Stock up before the season's in full swing.", align: "center", color: "#5A5A5A" }),
      block("button", { label: "Shop Summer", href: "https://example.com/summer-sale", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 24 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Made for the season", level: 3, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "From beach days to backyard evenings, our summer edit has everything you need to make the most of the sunshine.", align: "center", color: "#5A5A5A" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Sale ends when summer heats up — runs through the end of the month. Free shipping on orders over $40.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },
];
