// Unit tests for the production-config fail-hard guard (server/lib/env.js).
// Pure logic — exercises missingProductionConfig() directly (no process spawn).
import { describe, it, expect } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { missingProductionConfig } = require("../../server/lib/env");

const FULL = {
  NODE_ENV: "production",
  PARSE_MASTER_KEY: "mk",
  TRACKING_SECRET: "ts",
  PUBLIC_BASE_URL: "https://app.gorilla.email",
  AWS_SES_MODE: "mock",
};

describe("missingProductionConfig", () => {
  it("is a no-op outside production (returns nothing even if all unset)", () => {
    expect(missingProductionConfig({ NODE_ENV: "development" })).toEqual([]);
    expect(missingProductionConfig({ NODE_ENV: "test" })).toEqual([]);
    expect(missingProductionConfig({})).toEqual([]);
  });

  it("passes a fully-configured production env", () => {
    expect(missingProductionConfig(FULL)).toEqual([]);
  });

  it("flags a missing TRACKING_SECRET (forgeable tokens)", () => {
    const { TRACKING_SECRET, ...rest } = FULL;
    const miss = missingProductionConfig(rest);
    expect(miss.some((m: string) => m.startsWith("TRACKING_SECRET"))).toBe(true);
  });

  it("accepts the legacy TRACKING_TOKEN_SECRET alias", () => {
    const { TRACKING_SECRET, ...rest } = FULL;
    expect(missingProductionConfig({ ...rest, TRACKING_TOKEN_SECRET: "legacy" })).toEqual([]);
  });

  it("flags a missing PUBLIC_BASE_URL (localhost links)", () => {
    const { PUBLIC_BASE_URL, ...rest } = FULL;
    const miss = missingProductionConfig(rest);
    expect(miss.some((m: string) => m.startsWith("PUBLIC_BASE_URL"))).toBe(true);
  });

  it("requires AWS creds only when AWS_SES_MODE=real", () => {
    expect(missingProductionConfig({ ...FULL, AWS_SES_MODE: "real" })).toEqual([
      "AWS_REGION — AWS region for SES",
      "AWS_ACCESS_KEY_ID — AWS credentials for SES",
      "AWS_SECRET_ACCESS_KEY — AWS credentials for SES",
    ]);
    // Real mode WITH creds is fine.
    expect(
      missingProductionConfig({
        ...FULL,
        AWS_SES_MODE: "real",
        AWS_REGION: "us-east-1",
        AWS_ACCESS_KEY_ID: "AKIA",
        AWS_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual([]);
  });

  it("collects ALL missing vars at once (not just the first)", () => {
    const miss = missingProductionConfig({ NODE_ENV: "production" });
    expect(miss.length).toBeGreaterThanOrEqual(3); // master key + tracking + base url
  });
});
