// Custom Express routes, mounted by server/index.js BEFORE the Parse /api
// handler. Each domain owns a sibling file that exports `mount(app)`.
// Add a new domain by creating the file and listing it here.
module.exports = {
  mount(app) {
    require("./tracking").mount(app);
    require("./webhooks").mount(app);
    require("./imports").mount(app);
    require("./forms").mount(app);
  },
};
