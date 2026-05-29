// Unit tests for the useSettings composable — the typed wrappers over the
// settings cloud functions. We mock useCloud (the only dependency) and assert
// each wrapper forwards the correct cloud-function name + param shape. Mirrors
// tests/components/useSending.test.ts. Covers WR-01..07 in docs/testing/settings.md.
import { afterEach, describe, expect, it, vi } from "vitest";

const runCloud = vi.fn();
vi.mock("~/composables/app/useCloud", () => ({
  useCloud: () => ({ runCloud }),
}));

import { useSettings } from "../../composables/app/useSettings";

afterEach(() => {
  runCloud.mockReset();
});

describe("useSettings wrapper contract", () => {
  it("WR-01: getOrgSettings calls runCloud('getOrgSettings') with no params", async () => {
    runCloud.mockResolvedValue({ id: "org1" });
    const { getOrgSettings } = useSettings();
    await getOrgSettings();
    expect(runCloud).toHaveBeenCalledTimes(1);
    expect(runCloud).toHaveBeenCalledWith("getOrgSettings");
  });

  it("WR-02: updateOrgSettings nests the patch under { patch }", async () => {
    runCloud.mockResolvedValue({ id: "org1", name: "X" });
    const { updateOrgSettings } = useSettings();
    await updateOrgSettings({ name: "X" });
    expect(runCloud).toHaveBeenCalledWith("updateOrgSettings", { patch: { name: "X" } });
  });

  it("WR-03: listSenderIdentities calls runCloud('listSenderIdentities')", async () => {
    runCloud.mockResolvedValue([]);
    const { listSenderIdentities } = useSettings();
    await listSenderIdentities();
    expect(runCloud).toHaveBeenCalledWith("listSenderIdentities");
  });

  it("WR-04: createSenderIdentity spreads input (NOT nested under `input`)", async () => {
    runCloud.mockResolvedValue({ id: "s1" });
    const { createSenderIdentity } = useSettings();
    await createSenderIdentity({ fromName: "A", fromEmail: "a@b.co" });
    expect(runCloud).toHaveBeenCalledWith("createSenderIdentity", {
      fromName: "A",
      fromEmail: "a@b.co",
    });
  });

  it("WR-05: verifySenderIdentity wraps the id under { id }", async () => {
    runCloud.mockResolvedValue({ id: "abc", status: "verified" });
    const { verifySenderIdentity } = useSettings();
    await verifySenderIdentity("abc");
    expect(runCloud).toHaveBeenCalledWith("verifySenderIdentity", { id: "abc" });
  });

  it("WR-06: deleteSenderIdentity wraps the id under { id }", async () => {
    runCloud.mockResolvedValue({ ok: true });
    const { deleteSenderIdentity } = useSettings();
    await deleteSenderIdentity("abc");
    expect(runCloud).toHaveBeenCalledWith("deleteSenderIdentity", { id: "abc" });
  });

  it("WR-07: a runCloud rejection propagates to the wrapper caller", async () => {
    runCloud.mockRejectedValue(new Error("boom"));
    const { updateOrgSettings } = useSettings();
    await expect(updateOrgSettings({ name: "X" })).rejects.toThrow("boom");
  });
});
