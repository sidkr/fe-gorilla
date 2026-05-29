// Unit tests for the useSending composable — the typed wrappers over the
// send cloud functions. We mock useCloud (the only dependency) and assert
// that each wrapper calls runCloud with the correct cloud-function name and
// params. The actual send path is covered by server tests + live checks;
// this just pins the frontend contract.
import { afterEach, describe, expect, it, vi } from "vitest";

// runCloud is the single seam. Mock the useCloud module so useSending sees
// our spy instead of the real Parse-backed implementation. vi.mock matches
// on the import specifier, so this works without the `~` alias resolving.
const runCloud = vi.fn();
vi.mock("~/composables/app/useCloud", () => ({
  useCloud: () => ({ runCloud }),
}));

import { useSending } from "../../composables/app/useSending";

afterEach(() => {
  runCloud.mockReset();
});

describe("useSending.scheduleSend", () => {
  it('calls scheduleSend with campaignId and defaults when="now"', async () => {
    runCloud.mockResolvedValue({ ok: true, recipientCount: 42, status: "sending" });
    const { scheduleSend } = useSending();

    const res = await scheduleSend("camp123");

    expect(runCloud).toHaveBeenCalledTimes(1);
    expect(runCloud).toHaveBeenCalledWith("scheduleSend", {
      campaignId: "camp123",
      when: "now",
    });
    expect(res).toEqual({ ok: true, recipientCount: 42, status: "sending" });
  });

  it("passes an explicit when through", async () => {
    runCloud.mockResolvedValue({ ok: true, recipientCount: 0, status: "scheduled" });
    const { scheduleSend } = useSending();

    await scheduleSend("camp123", "2026-06-01T10:00:00.000Z");

    expect(runCloud).toHaveBeenCalledWith("scheduleSend", {
      campaignId: "camp123",
      when: "2026-06-01T10:00:00.000Z",
    });
  });

  it("propagates errors from runCloud (validation surfaces to the caller)", async () => {
    runCloud.mockRejectedValue(new Error("no verified recipients"));
    const { scheduleSend } = useSending();

    await expect(scheduleSend("camp123")).rejects.toThrow("no verified recipients");
  });
});

describe("useSending.sendTestEmail", () => {
  it("calls sendTestEmail with campaignId and the recipient list", async () => {
    runCloud.mockResolvedValue({
      ok: true,
      messageId: "msg-1",
      sentTo: ["me@example.com"],
    });
    const { sendTestEmail } = useSending();

    const res = await sendTestEmail("camp123", ["me@example.com"]);

    expect(runCloud).toHaveBeenCalledWith("sendTestEmail", {
      campaignId: "camp123",
      to: ["me@example.com"],
    });
    expect(res.messageId).toBe("msg-1");
    expect(res.sentTo).toEqual(["me@example.com"]);
  });

  it("passes a single string recipient through unchanged", async () => {
    runCloud.mockResolvedValue({ ok: true, messageId: "m", sentTo: ["a@b.com"] });
    const { sendTestEmail } = useSending();

    await sendTestEmail("camp123", "a@b.com");

    expect(runCloud).toHaveBeenCalledWith("sendTestEmail", {
      campaignId: "camp123",
      to: "a@b.com",
    });
  });
});

describe("useSending.cancelScheduledSend", () => {
  it("calls cancelScheduledSend with campaignId", async () => {
    runCloud.mockResolvedValue({ ok: true });
    const { cancelScheduledSend } = useSending();

    const res = await cancelScheduledSend("camp123");

    expect(runCloud).toHaveBeenCalledWith("cancelScheduledSend", {
      campaignId: "camp123",
    });
    expect(res).toEqual({ ok: true });
  });
});
