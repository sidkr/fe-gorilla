// @vitest-environment happy-dom
// End-to-end proof that real .vue SFCs now compile + mount in the test
// suite (vitest.config.ts registers @vitejs/plugin-vue). If this passes,
// the whole component-test layer is unblocked: SFCs render, props drive
// output, and Nuxt-auto-imported child components can be supplied via the
// `global.components` stub/registration.
//
// StatusPill.vue is a thin SFC that maps a `status` string to a tone and a
// capitalized label, then renders the shared <Pill> primitive (auto-imported
// in the app). We register the real Pill SFC globally so the parent resolves
// it — exercising compilation of TWO real SFCs at once.
import { describe, expect, it } from "vitest";
import StatusPill from "../../components/app/StatusPill.vue";
import Pill from "../../components/shared/Pill.vue";
import { mountWithPinia } from "../setup/vueTest";

function mountPill(status: string) {
  return mountWithPinia(StatusPill, {
    props: { status },
    global: { components: { Pill } },
  });
}

describe("StatusPill.vue (real SFC compilation)", () => {
  it("capitalizes the status into the rendered label", () => {
    const wrapper = mountPill("draft");
    expect(wrapper.text()).toBe("Draft");
  });

  it("maps a known status to its tone class on the underlying Pill", () => {
    const wrapper = mountPill("sent");
    // sent → brand tone → Pill renders `pill--brand`
    expect(wrapper.find("span.pill").classes()).toContain("pill--brand");
    expect(wrapper.text()).toBe("Sent");
  });

  it("maps each known status to the expected tone", () => {
    const cases: Record<string, string> = {
      sent: "brand",
      draft: "neutral",
      scheduled: "success",
      sending: "info",
      failed: "danger",
    };
    for (const [status, tone] of Object.entries(cases)) {
      const wrapper = mountPill(status);
      expect(wrapper.find("span.pill").classes()).toContain(`pill--${tone}`);
    }
  });

  it("falls back to the neutral tone for an unknown status", () => {
    const wrapper = mountPill("bogus");
    expect(wrapper.find("span.pill").classes()).toContain("pill--neutral");
    expect(wrapper.text()).toBe("Bogus");
  });
});
