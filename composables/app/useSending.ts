// Domain composable for the send pipeline. Thin, typed wrappers over the
// send cloud functions via useCloud — every call is normalized + session
// expiry is handled centrally. Components never call Parse.Cloud.run directly.
//
//   const { scheduleSend, sendTestEmail, cancelScheduledSend } = useSending();
//   await scheduleSend(campaignId, "now");
//   await sendTestEmail(campaignId, ["me@example.com"]);
//
// The cloud-function contract (built server-side):
//   scheduleSend({ campaignId, when })       → { ok, recipientCount, status }
//   sendTestEmail({ campaignId, to })        → { ok, messageId, sentTo }
//   cancelScheduledSend({ campaignId })      → { ok }
import { useCloud } from "~/composables/app/useCloud";

// `when` is either the literal "now" or an ISO-8601 timestamp for a
// scheduled send. Defaults to "now" — scheduling-for-later UI lands later,
// but the wrapper accepts the timestamp form so we don't have to revisit it.
export type SendWhen = "now" | string;

export interface ScheduleSendResult {
  ok: boolean;
  recipientCount: number;
  status: string;
}

export interface SendTestResult {
  ok: boolean;
  messageId: string;
  sentTo: string[];
}

export interface CancelSendResult {
  ok: boolean;
}

export function useSending() {
  const { runCloud } = useCloud();

  function scheduleSend(campaignId: string, when: SendWhen = "now") {
    return runCloud<ScheduleSendResult>("scheduleSend", { campaignId, when });
  }

  function sendTestEmail(campaignId: string, to: string | string[]) {
    return runCloud<SendTestResult>("sendTestEmail", { campaignId, to });
  }

  function cancelScheduledSend(campaignId: string) {
    return runCloud<CancelSendResult>("cancelScheduledSend", { campaignId });
  }

  return { scheduleSend, sendTestEmail, cancelScheduledSend };
}
