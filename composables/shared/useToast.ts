// Tiny global toast queue. Module-scoped so every caller shares one stack;
// pair with a single <ToastHost/> mounted in a layout. push() enqueues a toast
// and auto-dismisses after `timeout`; dismiss() removes by id. IDs come from a
// module-scoped counter (deliberately not Date.now()/Math.random()).
import { reactive } from "vue";

export type ToastTone = "neutral" | "success" | "warn" | "danger";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface PushOptions {
  tone?: ToastTone;
  timeout?: number;
}

const toasts = reactive<Toast[]>([]);
let nextId = 0;

function push(message: string, options: PushOptions = {}): number {
  const { tone = "neutral", timeout = 3500 } = options;
  const id = nextId++;
  toasts.push({ id, message, tone });

  if (timeout > 0) {
    setTimeout(() => dismiss(id), timeout);
  }

  return id;
}

function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i !== -1) toasts.splice(i, 1);
}

export function useToast() {
  return { toasts, push, dismiss };
}
