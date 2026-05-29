const envFile = process.env.NODE_ENV === "production" ? "/.env" : "/local.env";
require("dotenv").config({ path: __dirname + envFile });

const express = require("express");
const ParseServer = require("parse-server").ParseServer;
const path = require("path");
const app = express();

app.set("trust proxy", 1);

if (!process.env.PARSE_MASTER_KEY) {
  console.error("FATAL: PARSE_MASTER_KEY environment variable is not set.");
  process.exit(1);
}

const config = {
  databaseURI: process.env.PARSE_DATABASE_URI || "mongodb://localhost:27017/gorilla",
  appId:       process.env.PARSE_APP_ID        || "gorilla",
  masterKey:   process.env.PARSE_MASTER_KEY,
  serverURL:   process.env.PARSE_SERVER_URL    || "http://localhost:8080/api",
  cloud:       path.join(__dirname, "cloud/main.js"),
  liveQuery: {
    classNames: [],
  },
  accountLockout: {
    duration: 5,
    threshold: 5,
    unlockOnPasswordReset: true,
  },
  // Dev-only convenience: let the client create new Parse classes (Campaign,
  // Template, List, Contact, etc.) on first save. Before production, flip this
  // to false and pre-create schemas via cloud-code init or admin tooling.
  allowClientClassCreation: process.env.NODE_ENV !== "production",
};

const api = new ParseServer(config);

const port = 8080;
const httpServer = require("http").createServer(app);

async function start() {
  await api.start();

  app.disable("x-powered-by");

  // Headers go on every response; must be set BEFORE the Parse mount,
  // otherwise Parse sends the body first and we hit ERR_HTTP_HEADERS_SENT.
  app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
    next();
  });

  // Custom Express routes (tracking endpoints, SES webhook ingestion).
  // Mounted BEFORE Parse so any /api/* paths we want to intercept (e.g.
  // /api/webhooks/ses) take precedence over Parse's class router.
  require("./routes").mount(app);

  app.use("/api", api.app);

  const distDir = path.join(__dirname, "../dist");
  app.use(express.static(distDir));

  // HTML5 history fallback: any non-API request that didn't match a static
  // asset gets the SPA shell so deep links work. /api/* is already consumed
  // above; Parse returns its own 404 for unknown API routes.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });

  ParseServer.createLiveQueryServer(httpServer);
  // `app` is already the request listener from http.createServer(app) above —
  // don't bind it again here or every request fires the middleware chain twice
  // and the second pass hits ERR_HTTP_HEADERS_SENT.
  httpServer.listen(port, () => {
    console.log("\x1b[36m%s\x1b[0m", `Server running at http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start Parse server:", err);
  process.exit(1);
});
