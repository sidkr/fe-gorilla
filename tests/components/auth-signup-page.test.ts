// @vitest-environment happy-dom
// Component tests for pages/signup.vue (SIGNUP-01..10 from
// docs/testing/auth-marketing.md). Mounts the real SFC and drives the form.
//
// Same harness style as auth-login-page.test.ts: install the Nuxt/Vue
// auto-imports the SFC expects as globals (ref, computed, definePageMeta,
// useHead, useRoute, navigateTo, useAuthStore, safeNextPath), stub the child
// components, and replace the auth store's `signup` action with a spy per test.
//
// NOTE on GAP-3: the plan flagged signup.vue as missing login's open-redirect
// guard. The code under test now imports `safeNextPath` and applies it (see
// pages/signup.vue), so SIGNUP-05 asserts the SAME guarding behavior as login —
// a same-origin next is honored and an absolute URL falls back to the default.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { nextTick, ref, computed } from "vue";
import { useAuthStore } from "../../stores/auth";
import { safeNextPath } from "../../utils/safeNext";
import { mountWithPinia } from "../setup/vueTest";

// ── child stubs ───────────────────────────────────────────────────────────────
const Button = {
  name: "Button",
  props: ["variant", "size", "block", "disabled", "loading", "type", "to", "href"],
  template:
    '<button :type="type || \'button\'" :disabled="disabled || loading || undefined">' +
    '<slot name="leading" /><slot /><slot name="trailing" /></button>',
};
const FormField = {
  name: "FormField",
  props: ["label", "inputId", "hint", "error", "required"],
  template: "<div><slot /></div>",
};
// TextInput stub mirrors the real defineModel contract. The signup page binds
// some inputs without an `id`; we set the placeholder so selectors can target
// the email field by placeholder, and accept an optional id.
const TextInput = {
  name: "TextInput",
  props: ["modelValue", "id", "type", "placeholder", "class"],
  emits: ["update:modelValue"],
  template:
    '<input :id="id" :type="type" :placeholder="placeholder" :value="modelValue" ' +
    '@input="$emit(\'update:modelValue\', $event.target.value)" />',
};
const Checkbox = {
  name: "Checkbox",
  props: ["modelValue", "disabled"],
  emits: ["update:modelValue"],
  template:
    '<label><input type="checkbox" :checked="modelValue" ' +
    '@change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>',
};
const NuxtLink = {
  name: "NuxtLink",
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

let capturedHead: any = null;
let capturedPageMeta: any = null;
const navigateTo = vi.fn();
let routeQuery: Record<string, unknown> = {};

function installGlobals() {
  (globalThis as any).ref = ref;
  (globalThis as any).computed = computed;
  (globalThis as any).useHead = (arg: any) => { capturedHead = arg; };
  (globalThis as any).definePageMeta = (arg: any) => { capturedPageMeta = arg; };
  (globalThis as any).navigateTo = navigateTo;
  (globalThis as any).useRoute = () => ({ query: routeQuery });
  (globalThis as any).useAuthStore = useAuthStore;
  // safeNextPath is an auto-imported util in the app; the SFC references it bare.
  (globalThis as any).safeNextPath = safeNextPath;
}

async function mountSignup() {
  const wrapper = mountWithPinia(
    (await import("../../pages/signup.vue")).default,
    {
      global: {
        components: { Button, FormField, TextInput, Checkbox, NuxtLink },
      },
    },
  );
  const auth = useAuthStore();
  return { wrapper, auth };
}

beforeEach(() => {
  installGlobals();
  navigateTo.mockReset();
  capturedHead = null;
  capturedPageMeta = null;
  routeQuery = {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

// The signup template renders inputs in order: name, email, company, password.
// The email input is the only type="email" one; password the only type=password.
function inputs(wrapper: any) {
  return {
    email: wrapper.find('input[type="email"]'),
    password: wrapper.find('input[type="password"]'),
    name: wrapper.findAll('input[type="text"]')[0],
    company: wrapper.findAll('input[type="text"]')[1],
    terms: wrapper.find('input[type="checkbox"]'),
  };
}

async function submit(wrapper: any) {
  await wrapper.find("form").trigger("submit.prevent");
  await nextTick();
}

describe("signup.vue", () => {
  it("SIGNUP-01: invalid email is blocked; auth.signup not called", async () => {
    const { wrapper, auth } = await mountSignup();
    const spy = vi.spyOn(auth, "signup");
    await inputs(wrapper).email.setValue("notanemail");
    await inputs(wrapper).password.setValue("longenough1");
    await submit(wrapper);

    expect(wrapper.find(".form-error[role='alert']").text()).toBe(
      "Please enter a valid email.",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("SIGNUP-02: short (<8) password is blocked", async () => {
    const { wrapper, auth } = await mountSignup();
    const spy = vi.spyOn(auth, "signup");
    await inputs(wrapper).email.setValue("ok@example.com");
    await inputs(wrapper).password.setValue("short1");
    await submit(wrapper);

    expect(wrapper.find(".form-error").text()).toBe(
      "Password must be at least 8 characters.",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("SIGNUP-03: unticked terms is blocked", async () => {
    const { wrapper, auth } = await mountSignup();
    const spy = vi.spyOn(auth, "signup");
    await inputs(wrapper).email.setValue("ok@example.com");
    await inputs(wrapper).password.setValue("longenough1");
    // terms defaults to true in the page; uncheck it.
    await inputs(wrapper).terms.setValue(false);
    await submit(wrapper);

    expect(wrapper.find(".form-error").text()).toBe(
      "Please agree to the terms to continue.",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("SIGNUP-04: happy signup → calls auth.signup with derived params + redirect", async () => {
    const { wrapper, auth } = await mountSignup();
    const spy = vi.spyOn(auth, "signup").mockResolvedValue({} as any);
    const i = inputs(wrapper);
    await i.name.setValue("  Bob  ");
    await i.email.setValue("  bob@example.com  ");
    await i.company.setValue("  Acme  ");
    await i.password.setValue("longenough1");
    await submit(wrapper);

    // username === trimmed email; all fields trimmed.
    expect(spy).toHaveBeenCalledWith({
      username: "bob@example.com",
      password: "longenough1",
      email: "bob@example.com",
      name: "Bob",
      company: "Acme",
    });
    expect(navigateTo).toHaveBeenCalledWith("/app/dashboard");
  });

  it("SIGNUP-05: next is honored when same-origin, dropped when absolute (safeNextPath)", async () => {
    routeQuery = { next: "/app/audiences" };
    const a = await mountSignup();
    vi.spyOn(a.auth, "signup").mockResolvedValue({} as any);
    await inputs(a.wrapper).email.setValue("x@y.com");
    await inputs(a.wrapper).password.setValue("longenough1");
    await submit(a.wrapper);
    expect(navigateTo).toHaveBeenCalledWith("/app/audiences");

    navigateTo.mockReset();
    routeQuery = { next: "https://evil.com" };
    const b = await mountSignup();
    vi.spyOn(b.auth, "signup").mockResolvedValue({} as any);
    await inputs(b.wrapper).email.setValue("x@y.com");
    await inputs(b.wrapper).password.setValue("longenough1");
    await submit(b.wrapper);
    expect(navigateTo).toHaveBeenCalledWith("/app/dashboard");
  });

  it("SIGNUP-06: server dup-email error surfaces its message; stays on page", async () => {
    const { wrapper, auth } = await mountSignup();
    vi.spyOn(auth, "signup").mockRejectedValue({
      code: 202,
      message: "An account with this email already exists.",
    });
    await inputs(wrapper).email.setValue("dupe@example.com");
    await inputs(wrapper).password.setValue("longenough1");
    await submit(wrapper);

    expect(wrapper.find(".form-error").text()).toBe(
      "An account with this email already exists.",
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("SIGNUP-07: email-valid affix appears for a valid email", async () => {
    const { wrapper } = await mountSignup();
    expect(wrapper.find(".input-affix").exists()).toBe(false);
    await inputs(wrapper).email.setValue("valid@example.com");
    await nextTick();
    expect(wrapper.find(".input-affix").exists()).toBe(true);
  });

  it("SIGNUP-08: password strength meter scores and labels", async () => {
    const { wrapper } = await mountSignup();
    const pw = inputs(wrapper).password;
    const onCount = () => wrapper.findAll(".strength-bar.on").length;
    const label = () => wrapper.find(".strength-label").text();

    await pw.setValue("abc"); // <8, has lower only → score 0
    await nextTick();
    expect(onCount()).toBe(0);

    await pw.setValue("abcd1234"); // >=8, has digit → score 2 (Fair)
    await nextTick();
    expect(onCount()).toBe(2);
    expect(label()).toBe("Fair");

    await pw.setValue("Abcd1234!xyz"); // >=12, mixed case, special → score 4
    await nextTick();
    expect(onCount()).toBe(4);
    expect(label()).toBe("Very strong");
  });

  it("SIGNUP-09: submitting toggles the button label during the call", async () => {
    const { wrapper, auth } = await mountSignup();
    let resolveSignup: (v?: unknown) => void = () => {};
    vi.spyOn(auth, "signup").mockReturnValue(
      new Promise((res) => { resolveSignup = res; }) as any,
    );
    await inputs(wrapper).email.setValue("x@y.com");
    await inputs(wrapper).password.setValue("longenough1");
    wrapper.find("form").trigger("submit.prevent");
    await nextTick();

    const btn = wrapper.find("button[type='submit']");
    expect(btn.text()).toContain("Creating account…");
    expect(btn.attributes("disabled")).toBeDefined();

    resolveSignup();
    await flushPromises();
    await nextTick();
    expect(wrapper.find("button[type='submit']").text()).toContain("Create account");
  });

  it("SIGNUP-10: auth-blocked middleware + SEO head", async () => {
    await mountSignup();
    expect(capturedPageMeta).toMatchObject({ middleware: "auth-blocked" });
    expect(capturedHead.title).toBe("Sign up");
    expect(capturedHead.link).toContainEqual({
      rel: "canonical",
      href: "https://gorilla.email/signup",
    });
    expect(capturedHead.meta).toContainEqual({ name: "robots", content: "index,follow" });
  });
});
