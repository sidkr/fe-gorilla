// Boots a Parse Server bound to a fresh in-memory Mongo on an OS-assigned
// port. Returns the Parse Node SDK already initialized to talk to it.
//
// Why per-file: Parse Server keeps process-global state (schema cache,
// Parse.CoreManager). vitest's `pool: 'forks'` gives each test file its own
// process — boot in beforeAll, tear down in afterAll. Do NOT reuse across
// describe blocks within a file: schema mutations from earlier tests leak.
import http from "node:http";
import path from "node:path";
import express from "express";
import { ParseServer } from "parse-server";
import Parse from "parse/node.js";
import { startInMemoryMongo, type InMemoryMongo } from "./mongo";

const APP_ID = "gorilla-test";
const MASTER_KEY = "test-master-key";
const DEFAULT_CLOUD = path.resolve(__dirname, "../../server/cloud/main.js");

export interface TestParseServer {
  Parse: typeof Parse;
  baseURL: string;
  mongoUri: string;
  stop: () => Promise<void>;
}

export interface StartTestParseServerOptions {
  cloud?: string;
}

export async function startTestParseServer(
  opts: StartTestParseServerOptions = {},
): Promise<TestParseServer> {
  const mongo: InMemoryMongo = await startInMemoryMongo();
  const app = express();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  const port = address.port;
  const serverURL = `http://127.0.0.1:${port}/api`;

  const api = new ParseServer({
    databaseURI: mongo.uri,
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL,
    cloud: opts.cloud ?? DEFAULT_CLOUD,
    allowClientClassCreation: true,
    // Silence parse-server's "logs writes outside this dir" boot noise.
    silent: true,
  });
  await api.start();
  app.use("/api", api.app);

  Parse.initialize(APP_ID, null, MASTER_KEY);
  // @ts-expect-error - serverURL is a runtime field on the SDK
  Parse.serverURL = serverURL;

  return {
    Parse,
    baseURL: serverURL,
    mongoUri: mongo.uri,
    stop: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      await mongo.stop();
    },
  };
}
