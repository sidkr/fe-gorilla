const { block, footerBlock, body } = require("./_helpers");

module.exports = [
  // 1. Flash / 24-hour sale ───────────────────────────────────────────────────
  {
    seedKey: "system/promo-flash-24h",
    name: "Flash sale — 24 hours",
    category: "Promotions & sales",
    subject: "24 hours only: 40% off everything inside",
    previewText: "The clock starts now — code FLASH40 ends at midnight.",
    body: () => body([
      block("heading", { text: "FLASH SALE", level: 1, align: "center", color: "#FF4E4E" }),
      block("heading", { text: "40% off everything — 24 hours only", level: 2, align: "center", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=600&q=80&auto=format&fit=crop", alt: "Flash sale banner", width: 600, align: "center", linkHref: "https://example.com/sale" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "This is the one you've been waiting for. For the next 24 hours, take 40% off every single item in the store — no exclusions, no minimums. When the clock hits midnight, it's gone.", align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Use code FLASH40 at checkout.", align: "center", color: "#FF4E4E" }),
      block("button", { label: "Shop now — 40% off", href: "https://example.com/sale", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("paragraph", { html: "Code FLASH40 · Ends tonight at 11:59pm · Online only · One use per customer.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // 2. Percentage-off storewide ────────────────────────────────────────────────
  {
    seedKey: "system/promo-storewide-percent-off",
    name: "Storewide % off",
    category: "Promotions & sales",
    subject: "Take 25% off your entire order",
    previewText: "Treat yourself — 25% off sitewide with code SAVE25.",
    body: () => body([
      block("heading", { text: "25% off — storewide", level: 1, align: "center", color: "#FF4E4E" }),
      block("paragraph", { html: "Everything you've had in your cart, everything on your wishlist — it's all 25% off right now. From bestsellers to brand-new arrivals, nothing is left out.", align: "center", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=600&q=80&auto=format&fit=crop", alt: "Shopper browsing the storewide sale", width: 600, align: "center", linkHref: "https://example.com/shop" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Your code: SAVE25", level: 3, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Apply it at checkout and watch a quarter of your total melt away. No spend threshold, no fine-print headaches.", align: "center", color: "#1A1A1A" }),
      block("button", { label: "Shop the collection", href: "https://example.com/shop", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Code SAVE25 · Valid through Sunday · Cannot be combined with other offers.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // 3. Free shipping offer ──────────────────────────────────────────────────────
  {
    seedKey: "system/promo-free-shipping",
    name: "Free shipping offer",
    category: "Promotions & sales",
    subject: "Free shipping on every order this week",
    previewText: "No minimum, no catch — we're covering the shipping.",
    body: () => body([
      block("heading", { text: "Free shipping — on us", level: 1, align: "center", color: "#FF4E4E" }),
      block("image", { src: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&q=80&auto=format&fit=crop", alt: "Packages ready to ship", width: 600, align: "center", linkHref: "https://example.com/shop" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "This week only, every order ships free — no minimum spend, no membership required. Stock up on the things you love and let us handle delivery to your door.", align: "center", color: "#1A1A1A" }),
      block("heading", { text: "Use code SHIPFREE", level: 3, align: "center", color: "#1A1A1A" }),
      block("button", { label: "Start shopping", href: "https://example.com/shop", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("divider", { color: "#E5E5E5", thickness: 1 }),
      block("paragraph", { html: "Code SHIPFREE · Ends Sunday at midnight · Applies to standard shipping in the contiguous US.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // 4. BOGO / bundle deal ───────────────────────────────────────────────────────
  {
    seedKey: "system/promo-bogo-bundle",
    name: "Buy one, get one",
    category: "Promotions & sales",
    subject: "Buy one, get one free — your favorites, doubled",
    previewText: "Add two to your cart, pay for one. Code BOGO.",
    body: () => body([
      block("heading", { text: "Buy one, get one FREE", level: 1, align: "center", color: "#FF4E4E" }),
      block("paragraph", { html: "Why stop at one? For a limited time, every item you buy comes with a second one free. Mix, match, share, or keep them both — the choice is yours.", align: "center", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=600&q=80&auto=format&fit=crop", alt: "Two bundled products side by side", width: 600, align: "center", linkHref: "https://example.com/bogo" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "How it works", level: 3, align: "left", color: "#1A1A1A" }),
      block("paragraph", { html: "Add two qualifying items to your cart and enter code BOGO at checkout. The lower-priced item drops to $0 automatically — no rounding, no gimmicks.", align: "left", color: "#1A1A1A" }),
      block("button", { label: "Shop BOGO deals", href: "https://example.com/bogo", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 8 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Code BOGO · While supplies last · Discount applies to the lower-priced item.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // 5. Last chance / sale-ending reminder ───────────────────────────────────────
  {
    seedKey: "system/promo-last-chance",
    name: "Last chance — sale ending",
    category: "Promotions & sales",
    subject: "Last chance: the sale ends tonight",
    previewText: "Final hours — don't let your cart go cold.",
    body: () => body([
      block("heading", { text: "Last chance", level: 1, align: "center", color: "#FF4E4E" }),
      block("heading", { text: "The sale ends tonight at midnight", level: 2, align: "center", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1543168256-418811576931?w=600&q=80&auto=format&fit=crop", alt: "Final hours of the sale", width: 600, align: "center", linkHref: "https://example.com/sale" }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "This is your final reminder. Every deal you've been eyeing disappears the moment the clock strikes twelve. The items in your cart aren't reserved — once they sell out, they're gone for good.", align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "Don't say we didn't warn you.", align: "center", color: "#FF4E4E" }),
      block("button", { label: "Finish my order", href: "https://example.com/sale", bg: "#FF4E4E", fg: "#FFFFFF", align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("divider", { color: "#E5E5E5", thickness: 2 }),
      block("paragraph", { html: "Ends tonight at 11:59pm · Discounts applied automatically at checkout · No rain checks.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },

  // 6. Exclusive member / VIP offer ─────────────────────────────────────────────
  {
    seedKey: "system/promo-vip-exclusive",
    name: "VIP exclusive offer",
    category: "Promotions & sales",
    subject: "A private offer, just for our VIPs",
    previewText: "Early access + an extra 15% — because you're one of ours.",
    body: () => body([
      block("heading", { text: "For our VIPs only", level: 1, align: "center", color: "#1A1A1A" }),
      block("paragraph", { html: "You're part of an inner circle, and this offer never leaves it. Before anyone else gets a chance, you're invited to shop our new collection early — and take an exclusive extra 15% off the entire range.", align: "center", color: "#1A1A1A" }),
      block("image", { src: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600&q=80&auto=format&fit=crop", alt: "Curated VIP collection", width: 600, align: "center", linkHref: "https://example.com/vip" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Your private code: VIP15", level: 3, align: "center", color: "#FF4E4E" }),
      block("paragraph", { html: "Enter it at checkout for your members-only discount, layered on top of early access. This link is tied to your account, so please keep it to yourself.", align: "center", color: "#1A1A1A" }),
      block("button", { label: "Unlock early access", href: "https://example.com/vip", bg: "#1A1A1A", fg: "#FFFFFF", align: "center", radius: 6 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Code VIP15 · Members only · 48-hour early access window · One use per account.", align: "center", color: "#8E8E93" }),
      footerBlock("Maker & Co. · 210 Commerce Blvd, Portland, OR 97204"),
    ]),
  },
];
