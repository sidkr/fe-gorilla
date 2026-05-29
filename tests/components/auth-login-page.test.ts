// @vitest-environment happy-dom
// Component tests for pages/login.vue (LOGIN-01..10 from
// docs/testing/auth-marketing.md). Mounts the real SFC and drives the form.
//
// The page uses Nuxt auto-imports that don't exist in the bare harness:
//   definePageMeta, useHead, useRoute, navigateTo, ref  (and useAuthStore).
// We install Vue's real ref + controllable stubs for the rest as globals before
// mount. The auth store is the real Pinia store but its `login` action is
// replaced with a spy per test so we assert call args + drive resolve/reject.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import { nextTick, ref, computed } from "vue";
import { useAuthStore } from "../../stores/auth";
import { mountWithPinia } from "../setup/vueTest";

// Lightweight child stubs. We deliberately do NOT mount the real Button (it
// calls resolveComponent("NuxtLink") and renders a polymorphic <component :is>
// that recurses under the bare test runtime) — these tests assert page
// behavior, not child internals. The Button stub renders a real <button> with
// the resolved type/disabled so `button[type=submit]` selectors + the loading
// label assertions still work.
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
// TextInput stub: a real <input> with v-model so id selectors + setValue work.
const TextInput = {
  name: "TextInput",
  props: ["modelValue", "id", "type", "placeholder", "autocomplete"],
  emits: ["update:modelValue"],
  template:
    '<input :id="id" :type="type" :value="modelValue" ' +
    '@input="$emit(\'update:modelValue\', $event.target.value)" />',
};

// Stubs that change per test.
let capturedHead: any = null;
let capturedPageMeta: any = null;
const navigateTo = vi.fn();
let routeQuery: Record<string, unknown> = {};

// Install the Nuxt/Vue auto-imports the SFC expects as globals.
function installGlobals() {
  (globalThis as any).ref = ref;
  (globalThis as any).computed = computed;
  (globalThis as any).useHead = (arg: any) => { capturedHead = arg; };
  (globalThis as any).definePageMeta = (arg: any) => { capturedPageMeta = arg; };
  (globalThis as any).navigateTo = navigateTo;
  (globalThis as any).useRoute = () => ({ query: routeQuery });
  (globalThis as any).useAuthStore = useAuthStore;
}

// NuxtLink stub so the template resolves it without the router.
const NuxtLink = {
  name: "NuxtLink",
  props: ["to"],
  template: '<a :href="to"><slot /></a>',
};

async function mountLogin() {
  const wrapper = mountWithPinia(
    (await import("../../pages/login.vue")).default,
    {
      global: {
        components: { Button, FormField, TextInput, NuxtLink },
      },
    },
  );
  // The store is created by mountWithPinia's pinia; spy its login action.
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

async function fillAndSubmit(wrapper: any, email: string, password: string) {
  if (email) await wrapper.find("#email").setValue(email);
  if (password) await wrapper.find("#password").setValue(password);
  await wrapper.find("form").trigger("submit.prevent");
  await nextTick();
}

describe("login.vue", () => {
  it("LOGIN-01: blank submit is blocked client-side; auth.login not called", async () => {
    const { wrapper, auth } = await mountLogin();
    const loginSpy = vi.spyOn(auth, "login");

    await fillAndSubmit(wrapper, "", "");

    const err = wrapper.find(".form-error[role='alert']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toBe("Enter your email and password to continue.");
    expect(loginSpy).not.toHaveBeenCalled();
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("LOGIN-02: happy login → default redirect to /app/dashboard", async () => {
    const { wrapper, auth } = await mountLogin();
    const loginSpy = vi.spyOn(auth, "login").mockResolvedValue({} as any);

    await fillAndSubmit(wrapper, "  user@example.com  ", "secretpw");

    // email is trimmed before the call.
    expect(loginSpy).toHaveBeenCalledWith("user@example.com", "secretpw");
    expect(navigateTo).toHaveBeenCalledWith("/app/dashboard");
  });

  it("LOGIN-03: honors a same-origin next path", async () => {
    routeQuery = { next: "/app/campaigns/123" };
    const { wrapper, auth } = await mountLogin();
    vi.spyOn(auth, "login").mockResolvedValue({} as any);

    await fillAndSubmit(wrapper, "user@example.com", "secretpw");

    expect(navigateTo).toHaveBeenCalledWith("/app/campaigns/123");
  });

  it("LOGIN-04: open-redirect guard drops absolute URLs and arrays", async () => {
    routeQuery = { next: "https://evil.com" };
    const { wrapper, auth } = await mountLogin();
    vi.spyOn(auth, "login").mockResolvedValue({} as any);

    await fillAndSubmit(wrapper, "user@example.com", "secretpw");
    expect(navigateTo).toHaveBeenCalledWith("/app/dashboard");

    // Array-valued next (not a string) also falls through to the default.
    navigateTo.mockReset();
    routeQuery = { next: ["/app/x", "/app/y"] };
    const second = await mountLogin();
    vi.spyOn(second.auth, "login").mockResolvedValue({} as any);
    await fillAndSubmit(second.wrapper, "user@example.com", "secretpw");
    expect(navigateTo).toHaveBeenCalledWith("/app/dashboard");
  });

  it("LOGIN-05: wrong creds (code 101) → friendly message, stays on page", async () => {
    const { wrapper, auth } = await mountLogin();
    vi.spyOn(auth, "login").mockRejectedValue({ code: 101 });

    await fillAndSubmit(wrapper, "user@example.com", "wrongpw");

    expect(wrapper.find(".form-error").text()).toBe(
      "That email or password didn't match. Please try again.",
    );
    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("LOGIN-06: lockout (code 219) → friendly message", async () => {
    const { wrapper, auth } = await mountLogin();
    vi.spyOn(auth, "login").mockRejectedValue({ code: 219 });

    await fillAndSubmit(wrapper, "user@example.com", "pw");

    expect(wrapper.find(".form-error").text()).toBe(
      "Too many failed attempts. Try again in a few minutes.",
    );
  });

  it("LOGIN-07: unknown error → message fallback", async () => {
    const { wrapper, auth } = await mountLogin();
    vi.spyOn(auth, "login").mockRejectedValue({ message: "boom" });

    await fillAndSubmit(wrapper, "user@example.com", "pw");

    expect(wrapper.find(".form-error").text()).toBe("boom");
  });

  it("LOGIN-08: submitting toggles the button label/disabled during the call", async () => {
    const { wrapper, auth } = await mountLogin();
    let resolveLogin: (v?: unknown) => void = () => {};
    vi.spyOn(auth, "login").mockReturnValue(
      new Promise((res) => { resolveLogin = res; }) as any,
    );

    await wrapper.find("#email").setValue("user@example.com");
    await wrapper.find("#password").setValue("pw");
    wrapper.find("form").trigger("submit.prevent");
    await nextTick();

    const btn = wrapper.find("button[type='submit']");
    expect(btn.text()).toContain("Logging in…");
    expect(btn.attributes("disabled")).toBeDefined();

    resolveLogin();
    await flushPromises();
    await nextTick();
    expect(wrapper.find("button[type='submit']").text()).toContain("Log in");
  });

  it("LOGIN-09: declares the auth-blocked middleware via definePageMeta", async () => {
    await mountLogin();
    expect(capturedPageMeta).toMatchObject({ middleware: "auth-blocked" });
  });

  it("LOGIN-10: SEO head — title, canonical, robots index,follow", async () => {
    await mountLogin();
    expect(capturedHead.title).toBe("Log in");
    expect(capturedHead.link).toContainEqual({
      rel: "canonical",
      href: "https://gorilla.email/login",
    });
    expect(capturedHead.meta).toContainEqual({ name: "robots", content: "index,follow" });
  });
});
