// Tracking endpoints. Phase 1E agent fills these in.
//
// GET  /t/o/:token  → 1x1 GIF + EmailEvent { type: "open" }
// GET  /t/c/:token  → 302 → originalUrl + EmailEvent { type: "click", linkUrl }
// GET  /u/:token    → confirmation page + unsubscribe
// POST /u/:token    → one-click unsubscribe (no confirmation page; for
//                     List-Unsubscribe-Post header per RFC 8058)
//
// All tokens are HMAC-signed via server/lib/trackingTokens.js. Invalid /
// expired tokens return 404 (cheap to enumerate, but the token is not a
// secret — leaking sendId is acceptable).
module.exports = {
  mount(/* app */) {
    // Phase 1E
  },
};
