import { ref } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

const toasts = ref<Toast[]>([]);
let nextId = 1;

export function useToast() {
  function show(kind: ToastKind, message: string, durationMs = 3500): number {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, kind, message }];
    if (durationMs > 0) {
      setTimeout(() => {
        dismiss(id);
      }, durationMs);
    }
    return id;
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }

  return { toasts, show, dismiss };
}
