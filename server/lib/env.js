// Shared env loading for the server + worker processes.
// Both processes load the same env file (server/local.env in dev,
// server/.env in prod) and surface a small typed-ish helper for reads.
const path = require("path");

let loaded = false;
function loadEnv() {
  if (loaded) return;
  // server/lib/env.js → server/  → server/{local.env,.env}
  const envFile = process.env.NODE_ENV === "production" ? "/../.env" : "/../local.env";
  require("dotenv").config({ path: path.join(__dirname, envFile) });
  loaded = true;
}

function required(name) {
  loadEnv();
  const v = process.env[name];
  if (!v) {
    console.error(`FATAL: ${name} environment variable is not set.`);
    process.exit(1);
  }
  return v;
}

function optional(name, fallback) {
  loadEnv();
  return process.env[name] ?? fallback;
}

module.exports = { loadEnv, required, optional };
