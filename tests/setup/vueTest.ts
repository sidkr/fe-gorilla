// Minimal Vue test helper. NO @nuxt/test-utils — Nuxt's test runtime adds
// compile latency and pulls in router/nitro/auto-imports that our isolated
// component tests don't want.
//
// Caller is responsible for opting into happy-dom via the file header:
//   // @vitest-environment happy-dom
import { mount, type MountingOptions } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import type { Component } from "vue";

export function mountWithPinia<T extends Component>(
  component: T,
  options: MountingOptions<any> = {},
) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const { global = {}, ...rest } = options;
  return mount(component, {
    ...rest,
    global: {
      ...global,
      plugins: [...(global.plugins ?? []), pinia],
    },
  });
}
