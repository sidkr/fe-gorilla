// ─────────────────────────────────────────────────────────────────────────────
// Real SES adapter. CommonJS. Selected only when AWS_SES_MODE=real.
//
// Uses @aws-sdk/client-sesv2 (already a dependency). Reads region + creds +
// configuration set from env. The SDK client is constructed LAZILY inside
// sendEmail/getSendQuota so this file requires cleanly even with no AWS creds in
// the environment (the mock path must not pay for AWS config it never uses).
// ─────────────────────────────────────────────────────────────────────────────

const { optional } = require("../env");

let client = null;
let sdk = null;

function loadSdk() {
  if (!sdk) {
    // Lazy require: only pulled in when AWS_SES_MODE=real actually sends.
    sdk = require("@aws-sdk/client-sesv2");
  }
  return sdk;
}

function getClient() {
  if (client) return client;
  const { SESv2Client } = loadSdk();
  const region = optional("AWS_REGION", "us-east-1");
  const accessKeyId = optional("AWS_ACCESS_KEY_ID", undefined);
  const secretAccessKey = optional("AWS_SECRET_ACCESS_KEY", undefined);

  const config = { region };
  // If explicit creds are present use them; otherwise fall back to the default
  // AWS credential provider chain (IAM role / shared config / env).
  if (accessKeyId && secretAccessKey) {
    config.credentials = { accessKeyId, secretAccessKey };
  }
  client = new SESv2Client(config);
  return client;
}

function toAddressList(v) {
  if (v == null) return undefined;
  return Array.isArray(v) ? v : [v];
}

function toSesHeaders(headers) {
  if (!headers) return undefined;
  const entries = Object.entries(headers);
  if (!entries.length) return undefined;
  return entries.map(([Name, Value]) => ({ Name, Value: String(Value) }));
}

function createRealAdapter() {
  return {
    mode: "real",

    async sendEmail({ from, to, replyTo, subject, html, headers }) {
      const { SendEmailCommand } = loadSdk();
      const configurationSet = optional("SES_CONFIGURATION_SET", undefined);

      const cmd = new SendEmailCommand({
        FromEmailAddress: from,
        Destination: { ToAddresses: toAddressList(to) },
        ReplyToAddresses: toAddressList(replyTo),
        ...(configurationSet ? { ConfigurationSetName: configurationSet } : {}),
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Html: { Data: html, Charset: "UTF-8" } },
            ...(toSesHeaders(headers) ? { Headers: toSesHeaders(headers) } : {}),
          },
        },
      });

      const res = await getClient().send(cmd);
      return { messageId: res.MessageId };
    },

    async getSendQuota() {
      const { GetAccountCommand } = loadSdk();
      const res = await getClient().send(new GetAccountCommand({}));
      return res.SendQuota || res;
    },
  };
}

module.exports = { createRealAdapter };
