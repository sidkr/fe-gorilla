// Promotions & sales — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // 1) Percentage-off sale
  {
    seedKey: "system/prm-percent-off-sale",
    name: "Percentage-off sale",
    category: "Promotions & sales",
    subject: "Take 30% off your favorites",
    previewText: "Our biggest discount of the season is here — 30% off sitewide.",
    body: () => body([
      block("heading", { text: "30% Off Everything", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, the wait is over. For a limited time, take 30% off every single item in store — no exclusions, no fine print, no catch.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/percentoff/600/360", alt: "Sale banner with discounted products", width: 600, align: "center", linkHref: "https://example.com/sale" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Use code SAVE30 at checkout. Stack it on top of clearance for even deeper savings.", align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("button", { label: "Shop 30% Off", href: "https://example.com/sale", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Offer valid through Sunday. Discount applied automatically with code at checkout.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 2) Flash 24-hour sale
  {
    seedKey: "system/prm-flash-24h-sale",
    name: "Flash 24-hour sale",
    category: "Promotions & sales",
    subject: "24 hours only: flash sale is LIVE",
    previewText: "Doors open for one day only. When the clock runs out, the deals are gone.",
    body: () => body([
      block("heading", { text: "Flash Sale", level: 1, align: "center", color: CORAL }),
      block("heading", { text: "24 Hours. Then It's Over.", level: 2, align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "{{firstName}}, this is a blink-and-you'll-miss-it moment. Our flash sale ends at midnight tonight — set a reminder, because there are no extensions.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop the Flash Sale", href: "https://example.com/flash", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 2 }),
      block("paragraph", { html: "Up to 50% off select styles · Lowest prices we offer all year · While supplies last.", align: "center", color: INK }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 3) BOGO
  {
    seedKey: "system/prm-bogo",
    name: "Buy one, get one free",
    category: "Promotions & sales",
    subject: "Buy one, get one FREE",
    previewText: "Pick two, pay for one. The most generous deal we run.",
    body: () => body([
      block("heading", { text: "Buy One, Get One Free", level: 1, align: "center", color: INK }),
      block("image", { src: "https://picsum.photos/seed/bogodeal/600/360", alt: "Two products bundled together", width: 600, align: "center", linkHref: "https://example.com/bogo" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Hi {{firstName}} — here's the deal: add two of any qualifying item to your cart and the lower-priced one is completely on us. Mix, match, and stock up.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "No code needed — your free item is applied automatically at checkout.", align: "center", color: INK }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop BOGO Deals", href: "https://example.com/bogo", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Offer good while supplies last. Free item is the lower or equal-priced of the two.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 4) Free shipping
  {
    seedKey: "system/prm-free-shipping",
    name: "Free shipping event",
    category: "Promotions & sales",
    subject: "Free shipping on every order today",
    previewText: "Skip the shipping fees — we're covering them this weekend only.",
    body: () => body([
      block("heading", { text: "Free Shipping. No Minimum.", level: 1, align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "{{firstName}}, the cart is calling. For the next 48 hours, every order ships free — no minimum spend, no promo code required.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Start Shopping", href: "https://example.com/shop", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 32 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Why shop now?", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Free standard shipping applied at checkout · Fast 3–5 day delivery · Easy returns if it's not quite right.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 5) Clearance
  {
    seedKey: "system/prm-clearance",
    name: "Clearance blowout",
    category: "Promotions & sales",
    subject: "Clearance: prices slashed up to 70% off",
    previewText: "Final markdowns on everything that's leaving the shelves.",
    body: () => body([
      block("heading", { text: "Clearance Blowout", level: 1, align: "center", color: CORAL }),
      block("paragraph", { html: "Everything must go, {{firstName}}. We're clearing the shelves to make room for what's next — and that means the deepest markdowns of the year.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/clearancerack/600/360", alt: "Clearance rack with markdown tags", width: 600, align: "center", linkHref: "https://example.com/clearance" }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Up to 70% off · Final sale · Once it's gone, it's gone for good.", align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("button", { label: "Shop Clearance", href: "https://example.com/clearance", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "Clearance items are final sale and not eligible for returns or exchanges.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 6) New-customer discount
  {
    seedKey: "system/prm-new-customer-discount",
    name: "New customer welcome discount",
    category: "Promotions & sales",
    subject: "A little welcome gift: 15% off your first order",
    previewText: "Thanks for joining us — here's 15% off to get you started.",
    body: () => body([
      block("heading", { text: "Welcome — Here's 15% Off", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, we're so glad you're here. To say thanks for joining, here's 15% off your very first order with us.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("heading", { text: "WELCOME15", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "Enter this code at checkout to claim your discount.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop Your First Order", href: "https://example.com/new", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Valid on your first purchase only. One use per customer.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 7) Loyalty / VIP early access
  {
    seedKey: "system/prm-vip-early-access",
    name: "VIP early access",
    category: "Promotions & sales",
    subject: "{{firstName}}, you're in early — VIP access starts now",
    previewText: "Shop the sale 24 hours before everyone else. It's a VIP thing.",
    body: () => body([
      block("heading", { text: "VIP Early Access", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Because you're one of our most loyal members, {{firstName}}, you get first dibs. The sale doesn't open to the public until tomorrow — but for you, it's live right now.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/vipaccess/600/360", alt: "VIP early access invitation", width: 600, align: "center", linkHref: "https://example.com/vip" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop Before Anyone Else", href: "https://example.com/vip", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Your 24-hour head start ends tomorrow at 9 AM, when the sale opens to everyone. Shop the best selection while it lasts.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 8) Bundle deal
  {
    seedKey: "system/prm-bundle-deal",
    name: "Bundle deal",
    category: "Promotions & sales",
    subject: "Bundle up and save more",
    previewText: "Buy the set, save the difference. Curated bundles, one great price.",
    body: () => body([
      block("heading", { text: "Better Together", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "{{firstName}}, we did the matching for you. Our curated bundles pair the pieces that work best together — and cost less than buying them on their own.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/bundleset/600/360", alt: "Curated product bundle set", width: 600, align: "center", linkHref: "https://example.com/bundles" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Save up to $40 per bundle", level: 3, align: "center", color: CORAL }),
      block("spacer", { height: 16 }),
      block("button", { label: "Shop the Bundles", href: "https://example.com/bundles", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Bundle savings are reflected automatically when you add a full set to your cart.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 9) Limited-time coupon
  {
    seedKey: "system/prm-limited-time-coupon",
    name: "Limited-time coupon",
    category: "Promotions & sales",
    subject: "A $20 coupon, just for you",
    previewText: "Here's $20 off your next order — but it expires soon.",
    body: () => body([
      block("heading", { text: "Here's $20 Off", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Hi {{firstName}}, treat yourself. We've dropped a $20 coupon into your account — apply it to anything you've had your eye on.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 2 }),
      block("heading", { text: "TAKE20", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "On orders of $75 or more. One coupon per order.", align: "center", color: MUTED }),
      block("divider", { color: RULE, thickness: 2 }),
      block("spacer", { height: 24 }),
      block("button", { label: "Redeem My Coupon", href: "https://example.com/coupon", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Hurry — this coupon expires in 7 days and won't be reissued.", align: "center", color: INK }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 10) Last-chance ending tonight
  {
    seedKey: "system/prm-last-chance-tonight",
    name: "Last chance — ending tonight",
    category: "Promotions & sales",
    subject: "Last chance: the sale ends tonight",
    previewText: "Final hours. When the clock strikes midnight, the deals disappear.",
    body: () => body([
      block("heading", { text: "Last Chance", level: 1, align: "center", color: CORAL }),
      block("heading", { text: "The Sale Ends Tonight", level: 2, align: "center", color: INK }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "{{firstName}}, this is your final reminder. Everything in the sale goes back to full price at midnight — there's no extension and no waitlist.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop Before It's Gone", href: "https://example.com/sale", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 32 }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Final hours · Discounts applied at checkout · Don't say we didn't warn you.", align: "center", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },
];
