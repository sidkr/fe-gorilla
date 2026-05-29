// Real SES adapter command-shape test (Sending.md §3.13; testing plan §3.1 SES-real).
//
// real.js builds a SESv2 `SendEmailCommand` and calls `client.send(cmd)`. We
// don't have (and never want, in CI) real AWS creds, so we stub the SDK client's
// `.send` on the prototype to CAPTURE the command instead of dispatching it. The
// command object is the REAL @aws-sdk/client-sesv2 SendEmailCommand, so its
// `.input` is exactly what real.js constructed — that's the contract under test.
//
// server/ is CommonJS; createRequire loads it (vi.mock won't intercept those
// requires — we patch the prototype directly instead).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("real SES adapter — SendEmailCommand shape", () => {
  let createRealAdapter: any;
  let SESv2Client: any;
  let SendEmailCommand: any;
  let GetAccountCommand: any;
  let origSend: any;

  // Captured commands + a programmable response for the stubbed send.
  const sent: any[] = [];
  let sendResponse: any = { MessageId: "real-msg-123" };

  const ORIG_ENV: Record<string, string | undefined> = {};
  function saveEnv(...keys: string[]) {
    for (const k of keys) ORIG_ENV[k] = process.env[k];
  }
  function restoreEnv() {
    for (const k of Object.keys(ORIG_ENV)) {
      if (ORIG_ENV[k] === undefined) delete process.env[k];
      else process.env[k] = ORIG_ENV[k];
    }
  }

  beforeAll(() => {
    saveEnv(
      "AWS_REGION",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "SES_CONFIGURATION_SET",
    );
    const sdk = require("@aws-sdk/client-sesv2");
    SESv2Client = sdk.SESv2Client;
    SendEmailCommand = sdk.SendEmailCommand;
    GetAccountCommand = sdk.GetAccountCommand;

    // Stub the client transport: capture the command, return a canned response.
    // No network, no creds needed.
    origSend = SESv2Client.prototype.send;
    SESv2Client.prototype.send = async function (cmd: any) {
      sent.push(cmd);
      return sendResponse;
    };

    createRealAdapter = require("../../server/lib/ses/real").createRealAdapter;
  });

  afterAll(() => {
    SESv2Client.prototype.send = origSend;
    restoreEnv();
  });

  afterEach(() => {
    sent.length = 0;
    sendResponse = { MessageId: "real-msg-123" };
  });

  it("reports mode 'real'", () => {
    expect(createRealAdapter().mode).toBe("real");
  });

  it("maps sendEmail args → SendEmailCommand input and returns the MessageId", async () => {
    process.env.SES_CONFIGURATION_SET = "gorilla-events";
    const adapter = createRealAdapter();
    const out = await adapter.sendEmail({
      from: '"Alex" <alex@send.gorilla.email>',
      to: "alice@example.com",
      replyTo: "reply@gorilla.email",
      subject: "Hello there",
      html: "<body>Hi</body>",
      headers: {
        "List-Unsubscribe": "<https://gorilla.email/u/abc>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    expect(out).toEqual({ messageId: "real-msg-123" });

    expect(sent.length).toBe(1);
    const cmd = sent[0];
    expect(cmd).toBeInstanceOf(SendEmailCommand);
    const input = cmd.input;

    expect(input.FromEmailAddress).toBe('"Alex" <alex@send.gorilla.email>');
    expect(input.Destination).toEqual({ ToAddresses: ["alice@example.com"] });
    expect(input.ReplyToAddresses).toEqual(["reply@gorilla.email"]);
    expect(input.ConfigurationSetName).toBe("gorilla-events");

    expect(input.Content.Simple.Subject).toEqual({ Data: "Hello there", Charset: "UTF-8" });
    expect(input.Content.Simple.Body).toEqual({ Html: { Data: "<body>Hi</body>", Charset: "UTF-8" } });
    expect(input.Content.Simple.Headers).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://gorilla.email/u/abc>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("normalizes array to/replyTo into address lists", async () => {
    const adapter = createRealAdapter();
    await adapter.sendEmail({
      from: "from@x.com",
      to: ["a@x.com", "b@x.com"],
      replyTo: ["r1@x.com", "r2@x.com"],
      subject: "s",
      html: "<p>h</p>",
    });
    const input = sent[0].input;
    expect(input.Destination.ToAddresses).toEqual(["a@x.com", "b@x.com"]);
    expect(input.ReplyToAddresses).toEqual(["r1@x.com", "r2@x.com"]);
  });

  it("omits ConfigurationSetName when SES_CONFIGURATION_SET is unset", async () => {
    delete process.env.SES_CONFIGURATION_SET;
    const adapter = createRealAdapter();
    await adapter.sendEmail({ from: "from@x.com", to: "a@x.com", subject: "s", html: "h" });
    const input = sent[0].input;
    expect("ConfigurationSetName" in input).toBe(false);
  });

  it("omits Headers when none are provided", async () => {
    const adapter = createRealAdapter();
    await adapter.sendEmail({ from: "from@x.com", to: "a@x.com", subject: "s", html: "h" });
    const input = sent[0].input;
    expect("Headers" in input.Content.Simple).toBe(false);
  });

  it("leaves ReplyToAddresses undefined when no replyTo is given", async () => {
    const adapter = createRealAdapter();
    await adapter.sendEmail({ from: "from@x.com", to: "a@x.com", subject: "s", html: "h" });
    const input = sent[0].input;
    expect(input.ReplyToAddresses).toBeUndefined();
  });

  it("requires no real AWS creds: builds the client + sends with creds absent", async () => {
    // The default credential provider chain is never exercised because .send is
    // stubbed; this asserts construction doesn't blow up without explicit creds.
    delete process.env.AWS_ACCESS_KEY_ID;
    delete process.env.AWS_SECRET_ACCESS_KEY;
    const adapter = createRealAdapter();
    await expect(
      adapter.sendEmail({ from: "from@x.com", to: "a@x.com", subject: "s", html: "h" }),
    ).resolves.toEqual({ messageId: "real-msg-123" });
  });

  it("getSendQuota issues a GetAccountCommand and returns SendQuota", async () => {
    sendResponse = { SendQuota: { Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 10 } };
    const adapter = createRealAdapter();
    const quota = await adapter.getSendQuota();
    expect(sent.length).toBe(1);
    expect(sent[0]).toBeInstanceOf(GetAccountCommand);
    expect(quota).toEqual({ Max24HourSend: 50000, MaxSendRate: 14, SentLast24Hours: 10 });
  });
});
