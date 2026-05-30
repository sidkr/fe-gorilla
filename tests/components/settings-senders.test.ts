// @vitest-environment happy-dom
// Component tests for the sender-identities page (pages/app/settings/senders.vue).
// Covers the SP-* cases in docs/testing/settings.md: loading / empty / list +
// status pills, verify-only-on-pending, the create modal (open, required-field
// guards, success → toast + reload, error stays in modal, mid-save dismiss lock),
// verify badge flip + error, the delete confirm gate (cancel / accept), the
// per-row busy lock, and sub-nav presence.
//
// Mocks the data seam (~/composables/app/useSettings) and the toast seam
// (~/composables/shared/useToast). Nuxt macros are stubbed to no-ops.
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

const listSenderIdentities = vi.fn();
const createSenderIdentity = vi.fn();
const verifySenderIdentity = vi.fn();
const deleteSenderIdentity = vi.fn();
vi.mock("~/composables/app/useSettings", () => ({
  useSettings: () => ({
    listSenderIdentities,
    createSenderIdentity,
    verifySenderIdentity,
    deleteSenderIdentity,
  }),
}));

const toastPush = vi.fn();
vi.mock("~/composables/shared/useToast", () => ({
  useToast: () => ({ push: toastPush }),
}));

import Page from "../../pages/app/settings/senders.vue";
import { mountWithPinia } from "../setup/vueTest";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SENDERS = [
  {
    id: "s1",
    fromName: "A",
    fromEmail: "a@acme.com",
    status: "pending" as const,
    createdAt: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "s2",
    fromName: "B",
    fromEmail: "b@acme.com",
    status: "verified" as const,
    createdAt: "2026-05-02T00:00:00.000Z",
  },
];

// The Modal stub renders its default + footer slots and binds open via a
// `data-open` attr so we can assert the mid-save dismiss lock. It exposes a
// `close` trigger that emits the same `@close` the real Modal does.
const stubs = {
  FormField: {
    props: ["label"],
    template: '<label class="ff"><span class="ff-label">{{ label }}</span><slot/></label>',
  },
  TextInput: {
    props: ["modelValue", "type", "placeholder"],
    emits: ["update:modelValue"],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  Button: {
    props: ["loading", "disabled", "variant", "type"],
    template: '<button :disabled="disabled" :type="type"><slot/></button>',
  },
  Pill: {
    props: ["tone"],
    template: '<span class="pill" :class="`pill--${tone}`"><slot/></span>',
  },
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot/></a>',
  },
  TableShell: {
    template: '<table><thead><tr><slot name="head"/></tr></thead><tbody><slot name="body"/></tbody></table>',
  },
  Modal: {
    name: "Modal",
    props: ["open", "title"],
    emits: ["update:open", "close"],
    template:
      '<div v-if="open" class="modal" data-open="true"><h3>{{ title }}</h3><slot/><div class="modal-footer"><slot name="footer"/></div></div>',
  },
};

function mountPage() {
  return mountWithPinia(Page, { global: { stubs } });
}

afterEach(() => {
  listSenderIdentities.mockReset();
  createSenderIdentity.mockReset();
  verifySenderIdentity.mockReset();
  deleteSenderIdentity.mockReset();
  toastPush.mockReset();
  vi.restoreAllMocks();
});

describe("settings/senders.vue — load + render", () => {
  it("SP-01: shows the loading state while listSenderIdentities is pending", async () => {
    const d = deferred<typeof SENDERS>();
    listSenderIdentities.mockReturnValue(d.promise);
    const w = mountPage();
    expect(w.text()).toContain("Loading senders…");
    d.resolve([]);
    await flushPromises();
    expect(w.text()).not.toContain("Loading senders…");
  });

  it("SP-02: empty state renders the no-senders card with an Add-sender CTA", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const w = mountPage();
    await flushPromises();
    expect(w.find(".snd-empty").exists()).toBe(true);
    expect(w.text()).toContain("No sender identities yet");
    expect(w.find("table").exists()).toBe(false);
  });

  it("SP-03: list renders a row per sender with status pills (neutral / success)", async () => {
    listSenderIdentities.mockResolvedValue(SENDERS);
    const w = mountPage();
    await flushPromises();
    const rows = w.findAll("tbody tr");
    expect(rows).toHaveLength(2);
    expect(w.text()).toContain("a@acme.com");
    expect(w.text()).toContain("b@acme.com");
    const pills = w.findAll(".pill");
    // First row pending → neutral "Pending"; second verified → success "Verified".
    expect(pills[0].classes()).toContain("pill--neutral");
    expect(pills[0].text()).toBe("Pending");
    expect(pills[1].classes()).toContain("pill--success");
    expect(pills[1].text()).toBe("Verified");
  });

  it("SP-04: Verify action appears only on the pending row", async () => {
    listSenderIdentities.mockResolvedValue(SENDERS);
    const w = mountPage();
    await flushPromises();
    const rows = w.findAll("tbody tr");
    const pendingVerify = rows[0].findAll("button").find((b) => b.text() === "Verify");
    const verifiedVerify = rows[1].findAll("button").find((b) => b.text() === "Verify");
    expect(pendingVerify).toBeTruthy();
    expect(verifiedVerify).toBeUndefined();
  });
});

describe("settings/senders.vue — create modal", () => {
  it("SP-05: clicking Add sender opens the modal with cleared fields", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const w = mountPage();
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(false);
    // The empty-state Add-sender button.
    await w.find(".snd-empty button").trigger("click");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(true);
    const inputs = w.findAll(".modal input");
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
    expect((inputs[1].element as HTMLInputElement).value).toBe("");
  });

  it("SP-06: create requires a from-name; createSenderIdentity is not called", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const w = mountPage();
    await flushPromises();
    await w.find(".snd-empty button").trigger("click");
    await w.find(".modal form").trigger("submit.prevent");
    await flushPromises();
    expect(createSenderIdentity).not.toHaveBeenCalled();
    expect(w.find(".snd-modal-error").text()).toBe("A from-name is required.");
  });

  it("SP-07: create requires a from-email when only the name is filled", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const w = mountPage();
    await flushPromises();
    await w.find(".snd-empty button").trigger("click");
    const inputs = w.findAll(".modal input");
    await inputs[0].setValue("Acme Team");
    await w.find(".modal form").trigger("submit.prevent");
    await flushPromises();
    expect(createSenderIdentity).not.toHaveBeenCalled();
    expect(w.find(".snd-modal-error").text()).toBe("A from-email is required.");
  });

  it("SP-08: a successful create trims input, closes the modal, toasts, and reloads", async () => {
    listSenderIdentities.mockResolvedValue([]);
    createSenderIdentity.mockResolvedValue(SENDERS[0]);
    const w = mountPage();
    await flushPromises();
    expect(listSenderIdentities).toHaveBeenCalledTimes(1);

    await w.find(".snd-empty button").trigger("click");
    const inputs = w.findAll(".modal input");
    await inputs[0].setValue("  Acme Team  ");
    await inputs[1].setValue("  hello@acme.com  ");
    await w.find(".modal form").trigger("submit.prevent");
    await flushPromises();

    expect(createSenderIdentity).toHaveBeenCalledWith({
      fromName: "Acme Team",
      fromEmail: "hello@acme.com",
    });
    expect(w.find(".modal").exists()).toBe(false); // closed
    expect(toastPush).toHaveBeenCalledWith("Sender identity added.", { tone: "success" });
    expect(listSenderIdentities).toHaveBeenCalledTimes(2); // reloaded
  });

  it("SP-09: a create error stays in the modal with no toast", async () => {
    listSenderIdentities.mockResolvedValue([]);
    createSenderIdentity.mockRejectedValue(new Error("A sender identity already exists."));
    const w = mountPage();
    await flushPromises();
    await w.find(".snd-empty button").trigger("click");
    const inputs = w.findAll(".modal input");
    await inputs[0].setValue("Acme Team");
    await inputs[1].setValue("dup@acme.com");
    await w.find(".modal form").trigger("submit.prevent");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(true); // stays open
    expect(w.find(".snd-modal-error").text()).toBe("A sender identity already exists.");
    expect(toastPush).not.toHaveBeenCalled();
  });

  it("SP-10: the modal cannot be dismissed mid-save (close re-asserts open)", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const d = deferred<typeof SENDERS[0]>();
    createSenderIdentity.mockReturnValue(d.promise);
    const w = mountPage();
    await flushPromises();
    await w.find(".snd-empty button").trigger("click");
    const inputs = w.findAll(".modal input");
    await inputs[0].setValue("Acme Team");
    await inputs[1].setValue("hello@acme.com");
    await w.find(".modal form").trigger("submit.prevent");
    await flushPromises();
    // Save in flight. Trigger the modal's close (Cancel button or @close).
    expect(w.find(".modal").exists()).toBe(true);
    await w.findComponent({ name: "Modal" }).vm.$emit("close");
    await flushPromises();
    expect(w.find(".modal").exists()).toBe(true); // still open mid-save
    d.resolve(SENDERS[0]);
    await flushPromises();
  });
});

describe("settings/senders.vue — verify + delete", () => {
  it("SP-11: Verify calls verifySenderIdentity(id) and reloads the list", async () => {
    listSenderIdentities.mockResolvedValueOnce(SENDERS);
    verifySenderIdentity.mockResolvedValue({ ...SENDERS[0], status: "verified" });
    const reloaded = [{ ...SENDERS[0], status: "verified" as const }, SENDERS[1]];
    listSenderIdentities.mockResolvedValueOnce(reloaded);
    const w = mountPage();
    await flushPromises();
    const verifyBtn = w.findAll("tbody tr")[0].findAll("button").find((b) => b.text() === "Verify");
    await verifyBtn!.trigger("click");
    await flushPromises();
    expect(verifySenderIdentity).toHaveBeenCalledWith("s1");
    expect(listSenderIdentities).toHaveBeenCalledTimes(2);
    // Both rows now verified → no Verify button anywhere.
    expect(w.findAll("button").some((b) => b.text() === "Verify")).toBe(false);
  });

  it("SP-12: a verify error surfaces in the load-error banner", async () => {
    listSenderIdentities.mockResolvedValue(SENDERS);
    verifySenderIdentity.mockRejectedValue(new Error("Could not verify."));
    const w = mountPage();
    await flushPromises();
    const verifyBtn = w.findAll("tbody tr")[0].findAll("button").find((b) => b.text() === "Verify");
    await verifyBtn!.trigger("click");
    await flushPromises();
    expect(w.find(".snd-state--error").exists()).toBe(true);
    expect(w.text()).toContain("Could not verify.");
  });

  it("SP-13: delete confirm gate — cancel: deleteSenderIdentity is not called", async () => {
    listSenderIdentities.mockResolvedValue(SENDERS);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const w = mountPage();
    await flushPromises();
    const removeBtn = w.findAll("tbody tr")[0].findAll("button").find((b) => b.text() === "Remove");
    await removeBtn!.trigger("click");
    await flushPromises();
    expect(deleteSenderIdentity).not.toHaveBeenCalled();
  });

  it("SP-14: delete confirm gate — accept: deletes by id and reloads", async () => {
    listSenderIdentities.mockResolvedValueOnce(SENDERS);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteSenderIdentity.mockResolvedValue({ ok: true });
    listSenderIdentities.mockResolvedValueOnce([SENDERS[1]]);
    const w = mountPage();
    await flushPromises();
    const removeBtn = w.findAll("tbody tr")[0].findAll("button").find((b) => b.text() === "Remove");
    await removeBtn!.trigger("click");
    await flushPromises();
    expect(deleteSenderIdentity).toHaveBeenCalledWith("s1");
    expect(listSenderIdentities).toHaveBeenCalledTimes(2);
    expect(w.findAll("tbody tr")).toHaveLength(1);
    expect(w.text()).not.toContain("a@acme.com");
  });

  it("SP-15: a row's Verify/Remove are disabled while that row is busy", async () => {
    listSenderIdentities.mockResolvedValue(SENDERS);
    const d = deferred<unknown>();
    verifySenderIdentity.mockReturnValue(d.promise);
    const w = mountPage();
    await flushPromises();
    const row = w.findAll("tbody tr")[0];
    const verifyBtn = row.findAll("button").find((b) => b.text() === "Verify");
    await verifyBtn!.trigger("click");
    await flushPromises();
    const busyRow = w.findAll("tbody tr")[0];
    const verifying = busyRow.findAll("button").find((b) => b.text() === "Verifying…");
    expect(verifying).toBeTruthy();
    expect(verifying!.attributes("disabled")).toBeDefined();
    const remove = busyRow.findAll("button").find((b) => b.text() === "Remove");
    expect(remove!.attributes("disabled")).toBeDefined();
    d.resolve({ ...SENDERS[0], status: "verified" });
    await flushPromises();
  });
});

describe("settings/senders.vue — navigation", () => {
  it("SP-16: sub-nav links to General + Sender identities are present", async () => {
    listSenderIdentities.mockResolvedValue([]);
    const w = mountPage();
    await flushPromises();
    const links = w.findAll("a");
    const general = links.find((a) => a.text() === "General");
    const senders = links.find((a) => a.text() === "Sender identities");
    expect(general?.attributes("href")).toBe("/app/settings");
    expect(senders?.attributes("href")).toBe("/app/settings/senders");
  });
});
