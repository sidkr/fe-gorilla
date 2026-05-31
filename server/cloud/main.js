// Cloud code entry. Loaded by Parse Server via the `cloud` key in
// server/index.js.
//
// Domain-grouped submodules: each file registers Parse.Cloud.define(...) and
// Parse.Cloud.beforeSave(...) handlers at require time. Add a new domain by
// creating a sibling file and listing it here.
// Tenancy spine — MUST load before feature modules so the _User beforeSave and
// per-tenant stamping hooks are registered first. See DECISIONS #10.
require("./organizations");
require("./tenantHooks");

require("./audiences");
require("./contacts");
require("./imports");
require("./customFields");
require("./segments");
require("./campaigns");
require("./templates");
require("./reports");
require("./sending");
require("./settings");
require("./forms");
require("./suppression");
require("./domains");
require("./automations");
require("./revenue");
