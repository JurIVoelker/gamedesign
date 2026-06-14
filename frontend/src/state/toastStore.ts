import { create } from "zustand";

interface Toast {
  id: string;
  text: string;
}

interface ToastStoreState {
  toasts: Toast[];
  push: (text: string) => void;
  remove: (id: string) => void;
}

let _counter = 0;

export const useToastStore = create<ToastStoreState>((set) => ({
  toasts: [],
  push: (text) => {
    const id = `t${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, text }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4_000);
  },
  remove: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
