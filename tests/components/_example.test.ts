// @vitest-environment happy-dom
// Proves tests/setup/vueTest.ts mounts a component with a fresh Pinia.
// Copy this shape for SFC tests. Define a tiny inline component rather
// than dragging in a real one — keeps the harness check self-contained.
import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mountWithPinia } from "../setup/vueTest";

const Hello = defineComponent({
  props: { who: { type: String, default: "world" } },
  setup(props) {
    return () => h("p", { class: "hello" }, `hello, ${props.who}`);
  },
});

describe("vue test harness", () => {
  it("mounts a component and renders props", () => {
    const wrapper = mountWithPinia(Hello, { props: { who: "gorilla" } });
    expect(wrapper.find("p.hello").text()).toBe("hello, gorilla");
  });
});
