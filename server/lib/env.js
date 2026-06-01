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

// Hard-fail at boot (production only) if any configuration required for SAFE,
// non-forgeable sending is missing. In dev/test we intentionally allow localhost
// links + insecure dev defaults, so this is a no-op outside production.
//
// Mirrors the existing PARSE_MASTER_KEY guard but covers the whole set, with one
// message listing everything that's missing. Call ONCE at process start — from
// both the API server (server/index.js) and the worker (server/worker/index.js),
// since the worker is what mints tracking/unsubscribe links and sends mail.
// Pure check: given an env bag, return the list of missing required vars (with a
// reason). Empty when not production or when everything is present. Pure +
// side-effect-free so it's unit-testable without spawning a process.
function missingProductionConfig(env) {
  if (env.NODE_ENV !== "production") return [];

  const missing = [];
  const need = (name, why) => {
    if (!env[name]) missing.push(`${name} — ${why}`);
  };

  need("PARSE_MASTER_KEY", "Parse master key");
  if (!env.TRACKING_SECRET && !env.TRACKING_TOKEN_SECRET) {
    missing.push(
      "TRACKING_SECRET — HMAC secret for tracking/unsubscribe tokens; without it every token is forgeable",
    );
  }
  need(
    "PUBLIC_BASE_URL",
    "public origin for tracking/unsubscribe links; without it emails ship unclickable localhost URLs",
  );

  // Real SES needs real credentials or every send throws.
  if (String(env.AWS_SES_MODE || "").toLowerCase() === "real") {
    need("AWS_REGION", "AWS region for SES");
    need("AWS_ACCESS_KEY_ID", "AWS credentials for SES");
    need("AWS_SECRET_ACCESS_KEY", "AWS credentials for SES");
  }

  return missing;
}

// Hard-fail at boot (production only) if any configuration required for SAFE,
// non-forgeable sending is missing. No-op outside production. Call ONCE at
// process start — from both the API server and the worker, since the worker is
// what mints tracking/unsubscribe links and sends mail.
function assertProductionConfig() {
  loadEnv();
  const missing = missingProductionConfig(process.env);
  if (missing.length) {
    console.error(
      "FATAL: production startup blocked — required configuration is missing:\n  - " +
        missing.join("\n  - "),
    );
    process.exit(1);
  }
}

module.exports = {
  loadEnv,
  required,
  optional,
  assertProductionConfig,
  missingProductionConfig,
};
