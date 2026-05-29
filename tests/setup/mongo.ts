// In-memory Mongo for tests. One instance per test file (call from beforeAll).
//
// Why per-file (not global): each forked vitest worker hosts one test file
// (see vitest.config `pool: 'forks'`). A per-file instance gives us a clean
// database without coordinating teardown across files, and parallel files
// don't fight over a shared port.
import { MongoMemoryServer } from "mongodb-memory-server";

export interface InMemoryMongo {
  uri: string;
  stop: () => Promise<void>;
}

export async function startInMemoryMongo(): Promise<InMemoryMongo> {
  const mongod = await MongoMemoryServer.create();
  return {
    uri: mongod.getUri(),
    stop: async () => {
      await mongod.stop();
    },
  };
}
