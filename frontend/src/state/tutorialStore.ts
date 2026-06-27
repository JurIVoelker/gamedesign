import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TutorialStageId } from "@gamedesign/shared";
import type { TutorialSurface } from "../tutorial/types";
import { TUTORIAL_STEPS } from "../tutorial/stages";

const ALL_SURFACES: Set<TutorialSurface> = new Set([
  "goldHud",
  "effectsTimeline",
  "matchTimer",
  "exitButton",
  "toolsCard",
  "fertilizerCard",
  "crowsCard",
  "thiefCard",
  "weatherCard",
  "itemBar",
  "opponentFarm",
  "villagers",
  "villagerAccuse",
  "thiefEntity",
  "merchant",
  "crystalBall",
]);

interface TutorialState {
  active: boolean;
  stage: TutorialStageId | null;
  stepIndex: number;
  highlightField: { owner: "player" | "opponent"; index: number } | null;
  start: (stage: TutorialStageId) => void;
  advance: () => void;
  exit: () => void;
  setHighlightField: (
    field: { owner: "player" | "opponent"; index: number } | null,
  ) => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      active: false,
      stage: null,
      stepIndex: 0,
      highlightField: null,
      start: (stage) => set({ active: true, stage, stepIndex: 0 }),
      advance: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
      exit: () =>
        set({ active: false, stage: null, stepIndex: 0, highlightField: null }),
      setHighlightField: (field) => set({ highlightField: field }),
    }),
    {
      name: "farmyard-tutorial",
      partialize: (state) => ({
        active: state.active,
        stage: state.stage,
        stepIndex: state.stepIndex,
      }),
    },
  ),
);

/** Pure function — safe to call outside React components (e.g. in setInterval). */
export function getRevealedSurfaces(state: {
  active: boolean;
  stage: TutorialStageId | null;
  stepIndex: number;
}): Set<TutorialSurface> {
  const { active, stage, stepIndex } = state;
  if (!active || stage === null) return ALL_SURFACES;
  const steps = TUTORIAL_STEPS[stage] ?? [];
  const revealed = new Set<TutorialSurface>();
  for (let i = 0; i <= stepIndex && i < steps.length; i++) {
    for (const surface of steps[i].reveals ?? []) {
      revealed.add(surface);
    }
  }
  return revealed;
}

export function useRevealedSurfaces(): Set<TutorialSurface> {
  const active = useTutorialStore((s) => s.active);
  const stage = useTutorialStore((s) => s.stage);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  return getRevealedSurfaces({ active, stage, stepIndex });
}
