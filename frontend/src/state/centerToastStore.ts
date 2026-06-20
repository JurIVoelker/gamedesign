import { create } from "zustand";

interface CenterToast {
  id: string;
  text: string;
}

interface CenterToastStoreState {
  toasts: CenterToast[];
  push: (text: string, durationMs?: number) => void;
  remove: (id: string) => void;
}

let _counter = 0;

export const useCenterToastStore = create<CenterToastStoreState>((set) => ({
  toasts: [],
  push: (text, durationMs = 4_000) => {
    const id = `ct${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },
  remove: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
