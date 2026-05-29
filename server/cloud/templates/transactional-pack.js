// Transactional & notifications — system email templates (pack).
const { block, footerBlock, body } = require("./_helpers");
const INK = "#1A1A1A", MUTED = "#5A5A5A", CORAL = "#FF4E4E", WHITE = "#FFFFFF", RULE = "#E5E5E7";

module.exports = [
  // 1) Order confirmation
  {
    seedKey: "system/txn-order-confirmation",
    name: "Order confirmation",
    category: "Transactional & notifications",
    subject: "Order {{order_id}} confirmed",
    previewText: "Thanks, {{first_name}} — we've received your order and it's being prepared.",
    body: () => body([
      block("heading", { text: "Your order is confirmed", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, thanks for your order. We've received it and our team is getting everything ready. You'll hear from us again the moment it ships.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("heading", { text: "Order {{order_id}}", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Placed today · Estimated delivery in 3–5 business days · Payment confirmed.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "What happens next", level: 2, align: "left", color: INK }),
      block("paragraph", { html: "We'll pack your order with care, send you a tracking link as soon as it ships, and you'll have it at your door before you know it.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "View your order", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Need to make a change? Reply within 24 hours and we'll do our best before it ships.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 2) Shipping / tracking update
  {
    seedKey: "system/txn-shipping-update",
    name: "Shipping update",
    category: "Transactional & notifications",
    subject: "Your order {{order_id}} has shipped",
    previewText: "Good news, {{first_name}} — your package is on its way.",
    body: () => body([
      block("heading", { text: "It's on the way", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, your order just left our warehouse and is heading straight to you. You can follow its journey with the tracking link below.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Tracking details", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Order {{order_id}} · Carrier: {{carrier}} · Tracking number {{tracking_number}} · Estimated arrival {{delivery_date}}.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Track your package", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Tracking can take a few hours to update after a label is created. If it still isn't moving tomorrow, just reply to this email.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 3) Delivery confirmation
  {
    seedKey: "system/txn-delivery-confirmation",
    name: "Delivery confirmation",
    category: "Transactional & notifications",
    subject: "Your order {{order_id}} has been delivered",
    previewText: "Your package has arrived — we hope you love it.",
    body: () => body([
      block("heading", { text: "Your order has arrived", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, our records show that order {{order_id}} was delivered today. We hope everything's exactly what you were hoping for.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "View your order", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Didn't receive it? Sometimes carriers mark a package as delivered a little early. Give it 24 hours, then reply to this email and we'll track it down for you.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 4) Password reset
  {
    seedKey: "system/txn-password-reset",
    name: "Password reset",
    category: "Transactional & notifications",
    subject: "Reset your password",
    previewText: "Use the secure link below to set a new password.",
    body: () => body([
      block("heading", { text: "Reset your password", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, we received a request to reset the password for your account. Click the button below to choose a new one. This link expires in 60 minutes.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Reset password", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "If you didn't request this, you can safely ignore this email — your password won't change until you create a new one.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 5) Email verification
  {
    seedKey: "system/txn-email-verification",
    name: "Email verification",
    category: "Transactional & notifications",
    subject: "Confirm your email address",
    previewText: "One quick step to verify your account.",
    body: () => body([
      block("heading", { text: "Verify your email address", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Welcome, {{first_name}}! Please confirm this is the right email address by clicking the button below. It helps us keep your account secure and makes sure you get every important update.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Verify email", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 24 }),
      block("paragraph", { html: "This link expires in 24 hours. If you didn't create an account, no action is needed — you can ignore this message.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 6) Receipt / invoice
  {
    seedKey: "system/txn-receipt-invoice",
    name: "Receipt & invoice",
    category: "Transactional & notifications",
    subject: "Your receipt for order {{order_id}}",
    previewText: "Here's your receipt — thanks for your business, {{first_name}}.",
    body: () => body([
      block("heading", { text: "Payment receipt", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, thanks for your payment. This email confirms your transaction and serves as your receipt. A full invoice is available to download below.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Summary", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Order {{order_id}} · Date {{invoice_date}} · Amount paid {{amount}} · Payment method {{payment_method}}.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("spacer", { height: 16 }),
      block("button", { label: "Download invoice", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Keep this receipt for your records. If anything looks off, reply to this email and we'll sort it out right away.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 7) Subscription renewal notice
  {
    seedKey: "system/txn-subscription-renewal",
    name: "Subscription renewal notice",
    category: "Transactional & notifications",
    subject: "Your subscription renews on {{renewal_date}}",
    previewText: "A heads up before your plan renews — nothing to do unless you'd like changes.",
    body: () => body([
      block("heading", { text: "Your subscription is about to renew", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, this is a friendly reminder that your {{plan_name}} plan will automatically renew on {{renewal_date}}. We'll charge {{amount}} to the payment method on file.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "There's nothing you need to do to keep your access — it'll continue uninterrupted. If you'd like to change your plan or update billing, you can do that anytime before the renewal date.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Manage subscription", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "Questions about your plan? Just reply to this email and we'll be glad to help.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 8) Payment failed
  {
    seedKey: "system/txn-payment-failed",
    name: "Payment failed",
    category: "Transactional & notifications",
    subject: "We couldn't process your payment",
    previewText: "Action needed: please update your payment details to keep your account active.",
    body: () => body([
      block("heading", { text: "There was a problem with your payment", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, we tried to charge {{amount}} for your {{plan_name}} plan but the payment didn't go through. This usually happens when a card has expired or has insufficient funds.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "To avoid any interruption to your account, please update your payment method. We'll automatically try the charge again once your details are current.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Update payment method", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      block("spacer", { height: 16 }),
      block("paragraph", { html: "If you've already fixed this, thank you — you can ignore this message. Need a hand? Reply and we'll help.", align: "left", color: MUTED }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 9) Account security alert (new login)
  {
    seedKey: "system/txn-new-login-alert",
    name: "New login alert",
    category: "Transactional & notifications",
    subject: "New sign-in to your account",
    previewText: "We noticed a new sign-in. If this was you, no action is needed.",
    body: () => body([
      block("heading", { text: "New sign-in to your account", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, we detected a new sign-in to your account. We're letting you know so you can be sure it was you.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Sign-in details", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Device: {{device}} · Location: {{location}} · Time: {{login_time}}.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "If this was you, you can safely ignore this email. If you don't recognize this activity, secure your account right away by resetting your password.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Secure your account", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },

  // 10) Appointment / booking confirmation
  {
    seedKey: "system/txn-booking-confirmation",
    name: "Booking confirmation",
    category: "Transactional & notifications",
    subject: "Your booking is confirmed for {{appointment_date}}",
    previewText: "You're all set, {{first_name}} — here are your appointment details.",
    body: () => body([
      block("heading", { text: "Your booking is confirmed", level: 1, align: "left", color: INK }),
      block("paragraph", { html: "Hi {{first_name}}, you're all set. We've reserved your spot and we're looking forward to seeing you. Here are the details for your records.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("heading", { text: "Appointment details", level: 3, align: "left", color: INK }),
      block("paragraph", { html: "Service: {{service_name}} · Date: {{appointment_date}} · Time: {{appointment_time}} · Location: {{location}}.", align: "left", color: MUTED }),
      block("divider", { color: RULE, thickness: 1 }),
      block("paragraph", { html: "Need to reschedule or cancel? You can manage your booking anytime using the button below — we just ask for at least 24 hours' notice.", align: "left", color: MUTED }),
      block("spacer", { height: 24 }),
      block("button", { label: "Manage booking", href: "https://example.com", bg: CORAL, fg: WHITE, align: "left", radius: 10 }),
      footerBlock("Your Company, Inc. · 123 Main St, City, ST 00000"),
    ]),
  },
];
