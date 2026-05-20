import { create } from "zustand";

interface TargetingState {
  active: boolean;
  fieldCount: number;
  chosen: number[];
  onComplete: ((indices: number[]) => void) | null;
  start: (fieldCount: number, onComplete: (indices: number[]) => void) => void;
  pick: (fieldIndex: number) => void;
  cancel: () => void;
}

export const useTargetingStore = create<TargetingState>((set, get) => ({
  active: false,
  fieldCount: 0,
  chosen: [],
  onComplete: null,

  start: (fieldCount, onComplete) =>
    set({ active: true, fieldCount, chosen: [], onComplete }),

  pick: (fieldIndex) => {
    const { chosen, fieldCount, onComplete } = get();
    if (chosen.includes(fieldIndex)) return;
    const newChosen = [...chosen, fieldIndex];
    if (newChosen.length >= fieldCount) {
      set({ active: false, fieldCount: 0, chosen: [], onComplete: null });
      onComplete?.(newChosen);
    } else {
      set({ chosen: newChosen });
    }
  },

  cancel: () => set({ active: false, fieldCount: 0, chosen: [], onComplete: null }),
}));
