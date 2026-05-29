// Parse Node SDK initialization for the worker process.
//
// The API server runs Parse Server, which exposes the SDK in cloud code
// implicitly. The worker is a separate process and needs to initialize the
// SDK explicitly with the master key so it can read/write any class.
//
// Call initParseClient() once at worker boot, then `require("parse/node")`
// anywhere else.
const Parse = require("parse/node");
const { required, optional } = require("./env");

let initialized = false;

function initParseClient() {
  if (initialized) return Parse;
  const appId = optional("PARSE_APP_ID", "gorilla");
  const masterKey = required("PARSE_MASTER_KEY");
  const serverURL = optional("PARSE_SERVER_URL", "http://localhost:8080/api");

  Parse.initialize(appId, null, masterKey);
  Parse.serverURL = serverURL;
  // Master-key mode means every query/save bypasses ACLs. Worker jobs run
  // as a privileged process — they own the right to write Suppression,
  // CampaignSend, EmailEvent, etc. regardless of who owns the campaign.
  Parse.Cloud.useMasterKey?.(); // older SDK no-op; newer SDK respects it
  initialized = true;
  return Parse;
}

module.exports = { initParseClient, Parse };
