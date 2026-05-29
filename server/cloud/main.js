// Cloud code entry. Loaded by Parse Server via the `cloud` key in
// server/index.js.
//
// Domain-grouped submodules: each file registers Parse.Cloud.define(...) and
// Parse.Cloud.beforeSave(...) handlers at require time. Add a new domain by
// creating a sibling file and listing it here.
require("./audiences");
require("./contacts");
require("./segments");
require("./campaigns");
require("./sending");
