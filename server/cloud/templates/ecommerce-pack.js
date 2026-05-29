// E-commerce — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // 1) Abandoned-cart reminder
  {
    seedKey: "system/ecm-cart-reminder",
    name: "Cart reminder",
    category: "E-commerce",
    subject: "Your cart is waiting, {{firstName}}",
    previewText: "Still deciding? Your picks are saved — grab them before they're gone.",
    body: () => body([
      block("heading", { text: "You left these behind", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "We held onto your cart so you can finish whenever you're ready. Popular items move fast, so don't wait too long.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-cart-reminder/600/360", alt: "Items saved in your cart", width: 600, align: "center", linkHref: "https://example.com/cart" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Finish checkout", href: "https://example.com/cart", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Free returns within 30 days. Questions? Just reply to this email.", align: "center", color: MUTED }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 2) New-arrivals showcase
  {
    seedKey: "system/ecm-new-arrivals",
    name: "New arrivals showcase",
    category: "E-commerce",
    subject: "Just dropped: this season's new arrivals",
    previewText: "Fresh styles are in. See what landed this week.",
    body: () => body([
      block("heading", { text: "New this week", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Our latest collection just hit the shelves. Here's a first look at the pieces everyone's already talking about.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/ecm-new-arrivals-hero/600/360", alt: "New arrivals collection", width: 600, align: "center", linkHref: "https://example.com/new" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Everyday essentials", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Soft, durable, and made to last — refreshed in three new colorways for the season.", align: "left", color: MUTED }),
      block("image", { src: "https://picsum.photos/seed/ecm-new-arrivals-essentials/600/360", alt: "Everyday essentials lineup", width: 600, align: "center", linkHref: "https://example.com/new/essentials" }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Limited runs", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "Small-batch pieces we won't be restocking. Once they're gone, they're gone.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop new arrivals", href: "https://example.com/new", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 3) Product recommendations — "picked for you"
  {
    seedKey: "system/ecm-picked-for-you",
    name: "Picked for you",
    category: "E-commerce",
    subject: "{{firstName}}, we picked these just for you",
    previewText: "A few things we think you'll love, based on what you've browsed.",
    body: () => body([
      block("heading", { text: "Picked for you", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Based on your recent visits, here are a few pieces we think suit your style perfectly.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/ecm-picked-for-you/600/360", alt: "Recommended products selected for you", width: 600, align: "center", linkHref: "https://example.com/recommended" }),
      block("spacer", { height: 16 }),
      block("heading", { text: "Because you viewed our outerwear", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "These pair beautifully and ship free this week.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "See your picks", href: "https://example.com/recommended", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 4) Back-in-stock alert
  {
    seedKey: "system/ecm-back-in-stock",
    name: "Back in stock alert",
    category: "E-commerce",
    subject: "It's back: {{productName}} is in stock again",
    previewText: "The item you wanted just returned — grab it before it sells out again.",
    body: () => body([
      block("heading", { text: "Good news — it's back!", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "The item you were waiting for is back in stock. We know it goes fast, so we wanted you to be the first to know.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-back-in-stock/600/360", alt: "Back-in-stock product", width: 600, align: "center", linkHref: "https://example.com/product" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Shop it now", href: "https://example.com/product", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Quantities are limited and we can't guarantee another restock.", align: "center", color: MUTED }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 5) Review request post-purchase
  {
    seedKey: "system/ecm-review-request",
    name: "Review request",
    category: "E-commerce",
    subject: "How's your {{productName}} treating you?",
    previewText: "Your feedback helps other shoppers — and helps us get better.",
    body: () => body([
      block("heading", { text: "How did we do?", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Now that you've had a chance to try your order, we'd love to hear what you think. It only takes a minute, and it genuinely helps.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-review-request/600/360", alt: "Your recent purchase", width: 600, align: "center", linkHref: "" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Leave a review", href: "https://example.com/review", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Reviewers are entered into our monthly draw for a store credit. Thank you for being a customer!", align: "center", color: MUTED }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 6) Wishlist price-drop
  {
    seedKey: "system/ecm-wishlist-price-drop",
    name: "Wishlist price drop",
    category: "E-commerce",
    subject: "Price drop on your wishlist item",
    previewText: "Something you saved just got cheaper. Now's the time.",
    body: () => body([
      block("heading", { text: "The price just dropped", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "An item on your wishlist is now {{discountPercent}} off. We thought you'd want to know before the price goes back up.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-wishlist-price-drop/600/360", alt: "Wishlist item now on sale", width: 600, align: "center", linkHref: "https://example.com/wishlist" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Now {{salePrice}}", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "Was {{originalPrice}}. Limited-time pricing while stock lasts.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("button", { label: "Buy before it's gone", href: "https://example.com/wishlist", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 7) Loyalty points update
  {
    seedKey: "system/ecm-loyalty-points",
    name: "Loyalty points update",
    category: "E-commerce",
    subject: "You've got {{pointsBalance}} points to spend",
    previewText: "Your rewards balance is growing — here's how to cash in.",
    body: () => body([
      block("heading", { text: "Your rewards are stacking up", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Thanks for being a member! You've earned {{pointsBalance}} points so far — enough to unlock real savings on your next order.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("divider", { color: RULE, thickness: 2 }),
      block("heading", { text: "{{pointsBalance}} points", level: 2, align: "center", color: CORAL }),
      block("paragraph", { html: "Every 100 points equals $5 off. Points never expire as long as your account stays active.", align: "center", color: MUTED }),
      block("divider", { color: RULE, thickness: 2 }),
      block("spacer", { height: 24 }),
      block("button", { label: "Redeem my points", href: "https://example.com/rewards", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 8) Restock / replenish reminder
  {
    seedKey: "system/ecm-replenish-reminder",
    name: "Replenish reminder",
    category: "E-commerce",
    subject: "Running low on {{productName}}?",
    previewText: "It's about time to reorder — restock in one tap.",
    body: () => body([
      block("heading", { text: "Time to restock?", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Based on your last order, you're probably about to run out of {{productName}}. Reorder now so you never have to go without.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-replenish-reminder/600/360", alt: "Your favorite product, ready to reorder", width: 600, align: "center", linkHref: "https://example.com/reorder" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Reorder in one tap", href: "https://example.com/reorder", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Set up a subscription and save 10% on every recurring delivery.", align: "center", color: MUTED }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 9) Gift guide
  {
    seedKey: "system/ecm-gift-guide",
    name: "Gift guide",
    category: "E-commerce",
    subject: "The gift guide for everyone on your list",
    previewText: "Stuck on what to give? We've sorted it for you.",
    body: () => body([
      block("heading", { text: "Gifts for everyone", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "Whether you're shopping for a friend, a partner, or yourself, we've rounded up our favorites to make gifting effortless.", align: "center", color: MUTED }),
      block("spacer", { height: 24 }),
      block("image", { src: "https://picsum.photos/seed/ecm-gift-guide-hero/600/360", alt: "Curated gift guide", width: 600, align: "center", linkHref: "https://example.com/gifts" }),
      block("spacer", { height: 24 }),
      block("heading", { text: "For the homebody", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Cozy, comforting picks that make any space feel like a retreat.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "For the adventurer", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Rugged gear and travel-ready essentials for the one who's always on the move.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Under $25", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Thoughtful little finds that won't stretch the budget.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Browse the full guide", href: "https://example.com/gifts", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },

  // 10) Free gift with purchase
  {
    seedKey: "system/ecm-free-gift",
    name: "Free gift with purchase",
    category: "E-commerce",
    subject: "A free gift is waiting in your cart",
    previewText: "Spend {{threshold}} and we'll add a little something on us.",
    body: () => body([
      block("heading", { text: "A gift, on us", level: 1, align: "center", color: INK }),
      block("paragraph", { html: "For a limited time, spend {{threshold}} or more and we'll add a complimentary gift to your order automatically — no code needed.", align: "center", color: MUTED }),
      block("spacer", { height: 16 }),
      block("image", { src: "https://picsum.photos/seed/ecm-free-gift/600/360", alt: "Free gift with your purchase", width: 600, align: "center", linkHref: "https://example.com/shop" }),
      block("spacer", { height: 24 }),
      block("button", { label: "Claim your gift", href: "https://example.com/shop", bg: CORAL, fg: WHITE, align: "center", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Offer valid while supplies last. The gift is added at checkout once you reach the threshold.", align: "center", color: MUTED }),
      footerBlock("Maple & Co., Inc. · 88 Market St, Portland, OR 97204"),
    ]),
  },
];
