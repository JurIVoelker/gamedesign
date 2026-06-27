import { create } from "zustand";

interface Toast {
  id: string;
  text: string;
}

interface ToastStoreState {
  toasts: Toast[];
  push: (text: string, durationMs?: number) => void;
  remove: (id: string) => void;
}

let _counter = 0;

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  push: (text, durationMs = 4_000) => {
    const id = `t${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
