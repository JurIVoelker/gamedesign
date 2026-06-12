import { create } from "zustand";

interface TargetingState {
  active: boolean;
  fieldCount: number;
  chosen: number[];
  ownFarm: boolean;
  onComplete: ((indices: number[]) => void) | null;
  start: (
    fieldCount: number,
    onComplete: (indices: number[]) => void,
    ownFarm?: boolean,
  ) => void;
  pick: (fieldIndex: number) => void;
  cancel: () => void;
}

const IDLE = {
  active: false,
  fieldCount: 0,
  chosen: [] as number[],
  onComplete: null as ((indices: number[]) => void) | null,
  ownFarm: false,
};

export const useTargetingStore = create<TargetingState>((set, get) => ({
  ...IDLE,

  start: (fieldCount, onComplete, ownFarm = false) =>
    set({ active: true, fieldCount, chosen: [], onComplete, ownFarm }),

  pick: (fieldIndex) => {
    const { chosen, fieldCount, onComplete } = get();
    if (chosen.includes(fieldIndex)) return;
    const newChosen = [...chosen, fieldIndex];
    if (newChosen.length >= fieldCount) {
      set(IDLE);
      onComplete?.(newChosen);
    } else {
      set({ chosen: newChosen });
    }
  },

  cancel: () => set(IDLE),
}));
