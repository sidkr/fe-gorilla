// @vitest-environment happy-dom
// Component tests for the org general-settings page (pages/app/settings/index.vue).
// Covers the GP-* cases in docs/testing/settings.md: loading / load-error+retry,
// form fill, read-only plan, the client-side empty-name guard, trim-on-submit,
// success + server-error states, the saving lock, and sub-nav presence.
//
// We mock the data seam (~/composables/app/useSettings) so no Parse is involved,
// and supply the Nuxt-auto-imported child components as `global.stubs`. The Nuxt
// macros definePageMeta/useHead are stubbed to no-ops via vi.stubGlobal.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";

vi.stubGlobal("definePageMeta", () => {});
vi.stubGlobal("useHead", () => {});

const getOrgSettings = vi.fn();
const updateOrgSettings = vi.fn();
vi.mock("~/composables/app/useSettings", () => ({
  useSettings: () => ({ getOrgSettings, updateOrgSettings }),
}));

import Page from "../../pages/app/settings/index.vue";
import { mountWithPinia } from "../setup/vueTest";

// A controllable deferred so we can assert the loading state before resolving.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const SAMPLE = {
  id: "org1",
  name: "Acme",
  slug: "acme",
  plan: "pro",
  defaultFromName: "Acme",
  defaultFromEmail: "hi@acme.com",
  replyTo: "",
  timezone: "Europe/London",
  address: "1 St",
  monthlySendCap: 10000,
  monthlySendCount: 0,
};

// Stub the auto-imported primitives. TextInput/SelectInput/TextArea implement a
// real v-model so we can drive + read field values; FormField exposes its label.
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
  SelectInput: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot/></select>',
  },
  TextArea: {
    props: ["modelValue", "rows", "placeholder"],
    emits: ["update:modelValue"],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>',
  },
  Button: {
    props: ["loading", "disabled", "variant", "type"],
    template: '<button :disabled="disabled" :type="type"><slot/></button>',
  },
  NuxtLink: {
    props: ["to"],
    template: '<a :href="to"><slot/></a>',
  },
};

function mountPage() {
  return mountWithPinia(Page, { global: { stubs } });
}

afterEach(() => {
  getOrgSettings.mockReset();
  updateOrgSettings.mockReset();
});

describe("settings/index.vue — load states", () => {
  it("GP-01: shows the loading state and hides the form while getOrgSettings is pending", async () => {
    const d = deferred<typeof SAMPLE>();
    getOrgSettings.mockReturnValue(d.promise);
    const w = mountPage();
    // onMounted has fired but the promise hasn't resolved yet.
    expect(w.text()).toContain("Loading settings…");
    expect(w.find("form").exists()).toBe(false);
    d.resolve(SAMPLE);
    await flushPromises();
    expect(w.text()).not.toContain("Loading settings…");
    expect(w.find("form").exists()).toBe(true);
  });

  it("GP-02: fills the form from the loaded settings", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    const w = mountPage();
    await flushPromises();
    const inputs = w.findAll("input").map((i) => (i.element as HTMLInputElement).value);
    // name, defaultFromName, defaultFromEmail, replyTo (in DOM order).
    expect(inputs).toContain("Acme");
    expect(inputs).toContain("hi@acme.com");
    const tz = (w.find("select").element as HTMLSelectElement).value;
    expect(tz).toBe("Europe/London");
    expect((w.find("textarea").element as HTMLTextAreaElement).value).toBe("1 St");
  });

  it("GP-02: missing timezone defaults to UTC in the form", async () => {
    getOrgSettings.mockResolvedValue({ ...SAMPLE, timezone: "" });
    const w = mountPage();
    await flushPromises();
    expect((w.find("select").element as HTMLSelectElement).value).toBe("UTC");
  });

  it("GP-03: plan is shown read-only with no editable control", async () => {
    getOrgSettings.mockResolvedValue({ ...SAMPLE, plan: "pro" });
    const w = mountPage();
    await flushPromises();
    const readonly = w.find(".set-readonly");
    expect(readonly.exists()).toBe(true);
    expect(readonly.text()).toBe("pro");
  });

  it("GP-04: load error shows a banner; Retry re-invokes getOrgSettings", async () => {
    getOrgSettings.mockRejectedValueOnce(new Error("boom"));
    const w = mountPage();
    await flushPromises();
    expect(w.find(".set-state--error").exists()).toBe(true);
    expect(w.text()).toContain("boom");
    expect(getOrgSettings).toHaveBeenCalledTimes(1);

    getOrgSettings.mockResolvedValueOnce(SAMPLE);
    await w.find(".set-retry").trigger("click");
    await flushPromises();
    expect(getOrgSettings).toHaveBeenCalledTimes(2);
    expect(w.find(".set-state--error").exists()).toBe(false);
    expect(w.find("form").exists()).toBe(true);
  });
});

describe("settings/index.vue — submit", () => {
  it("GP-05: empty-name client guard blocks the submit and does not call updateOrgSettings", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    const w = mountPage();
    await flushPromises();
    // Clear the name field (first input is the org name).
    const nameInput = w.findAll("input")[0];
    await nameInput.setValue("   ");
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(updateOrgSettings).not.toHaveBeenCalled();
    expect(w.find(".set-msg--error").text()).toBe("Organization name is required.");
  });

  it("GP-06: submit trims name/from-name/from-email/reply-to and sends address raw", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    updateOrgSettings.mockResolvedValue(SAMPLE);
    const w = mountPage();
    await flushPromises();

    const [name, fromName, fromEmail, replyTo] = w.findAll("input");
    await name.setValue("  New Name  ");
    await fromName.setValue("  Team  ");
    await fromEmail.setValue("  Hi@Acme.com  ");
    await replyTo.setValue("  reply@acme.com  ");
    await w.find("textarea").setValue("  Line 1\nLine 2  ");

    await w.find("form").trigger("submit.prevent");
    await flushPromises();

    expect(updateOrgSettings).toHaveBeenCalledTimes(1);
    expect(updateOrgSettings).toHaveBeenCalledWith({
      name: "New Name",
      defaultFromName: "Team",
      defaultFromEmail: "Hi@Acme.com",
      replyTo: "reply@acme.com",
      timezone: "Europe/London",
      address: "  Line 1\nLine 2  ", // address sent raw (not trimmed)
    });
  });

  it("GP-07: success message after a save; form re-fills from the returned settings", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    updateOrgSettings.mockResolvedValue({ ...SAMPLE, name: "Returned Co" });
    const w = mountPage();
    await flushPromises();
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.find(".set-msg--ok").text()).toBe("Settings saved.");
    expect((w.findAll("input")[0].element as HTMLInputElement).value).toBe("Returned Co");
  });

  it("GP-08: server error from updateOrgSettings is surfaced; no success state", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    updateOrgSettings.mockRejectedValue(new Error("Default from-email is not a valid email address."));
    const w = mountPage();
    await flushPromises();
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    expect(w.find(".set-msg--error").text()).toBe(
      "Default from-email is not a valid email address.",
    );
    expect(w.find(".set-msg--ok").exists()).toBe(false);
  });

  it("GP-09: in-flight save disables the submit button and shows 'Saving…'", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    const d = deferred<typeof SAMPLE>();
    updateOrgSettings.mockReturnValue(d.promise);
    const w = mountPage();
    await flushPromises();
    await w.find("form").trigger("submit.prevent");
    await flushPromises();
    const btn = w.find('button[type="submit"]');
    expect(btn.attributes("disabled")).toBeDefined();
    expect(btn.text()).toContain("Saving…");
    d.resolve(SAMPLE);
    await flushPromises();
    expect(w.find('button[type="submit"]').text()).toContain("Save changes");
  });
});

describe("settings/index.vue — navigation", () => {
  it("GP-10: sub-nav + inline links to the settings surfaces are present", async () => {
    getOrgSettings.mockResolvedValue(SAMPLE);
    const w = mountPage();
    await flushPromises();
    const links = w.findAll("a");
    const targets = links.map((a) => a.attributes("href"));
    expect(targets).toContain("/app/settings");
    expect(targets).toContain("/app/settings/senders");
    // The General + Sender-identities tabs plus the inline sender link.
    const general = links.find((a) => a.text() === "General");
    const senders = links.find((a) => a.text() === "Sender identities");
    expect(general?.attributes("href")).toBe("/app/settings");
    expect(senders?.attributes("href")).toBe("/app/settings/senders");
  });
});
