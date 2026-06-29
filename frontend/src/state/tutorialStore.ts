import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TutorialStageId } from "@gamedesign/shared";
import type { TutorialSurface, TutorialInteraction } from "../tutorial/types";
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
  // Ephemeral assist flag: when true, the incoming tutorial thief is revealed
  // with a blinking outline (set by the defend gate after repeated failures).
  // Deliberately not persisted — it's per-wave UI state, not tutorial progress.
  thiefHintActive: boolean;
  start: (stage: TutorialStageId) => void;
  advance: () => void;
  exit: () => void;
  setHighlightField: (
    field: { owner: "player" | "opponent"; index: number } | null,
  ) => void;
  setThiefHintActive: (active: boolean) => void;
}

export const useTutorialStore = create<TutorialState>()(
  persist(
    (set) => ({
      active: false,
      stage: null,
      stepIndex: 0,
      highlightField: null,
      thiefHintActive: false,
      start: (stage) =>
        set({ active: true, stage, stepIndex: 0, thiefHintActive: false }),
      advance: () =>
        set((s) => ({ stepIndex: s.stepIndex + 1, thiefHintActive: false })),
      exit: () =>
        set({
          active: false,
          stage: null,
          stepIndex: 0,
          highlightField: null,
          thiefHintActive: false,
        }),
      setHighlightField: (field) => set({ highlightField: field }),
      setThiefHintActive: (active) => set({ thiefHintActive: active }),
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

/**
 * The current step's `allow` list, or null when the tutorial is inactive or the
 * step is unrestricted (`allow` undefined). Pure — safe outside React.
 */
function currentAllowList(state: {
  active: boolean;
  stage: TutorialStageId | null;
  stepIndex: number;
}): TutorialInteraction[] | null {
  const { active, stage, stepIndex } = state;
  if (!active || stage === null) return null;
  const step = (TUTORIAL_STEPS[stage] ?? [])[stepIndex];
  return step?.allow ?? null;
}

export interface TutorialStateSlice {
  active: boolean;
  stage: TutorialStageId | null;
  stepIndex: number;
}

/**
 * Whether an interaction is currently permitted. True when the tutorial is
 * inactive or the step is unrestricted; otherwise only if explicitly listed.
 * Pure — safe to call from PixiJS / event handlers.
 */
export function isInteractionAllowed(
  state: TutorialStateSlice,
  interaction: TutorialInteraction,
): boolean {
  const allow = currentAllowList(state);
  if (allow === null) return true;
  return allow.includes(interaction);
}

/**
 * Whether this interaction is the step's *required* action — i.e. the step is
 * restricted (`allow` defined) and lists it. Used to pulse the relevant button.
 * Unrestricted steps (free-play) never pulse. Pure.
 */
export function isTutorialAction(
  state: TutorialStateSlice,
  interaction: TutorialInteraction,
): boolean {
  const allow = currentAllowList(state);
  return allow !== null && allow.includes(interaction);
}

/** Subscribe to the step-identifying slice (one subscription per primitive). */
export function useTutorialState(): TutorialStateSlice {
  const active = useTutorialStore((s) => s.active);
  const stage = useTutorialStore((s) => s.stage);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  return { active, stage, stepIndex };
}

/** The `merchantItemId` of the current tutorial step, or undefined outside tutorial / non-merchant steps. */
export function useTutorialMerchantItemId(): string | undefined {
  const active = useTutorialStore((s) => s.active);
  const stage = useTutorialStore((s) => s.stage);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  if (!active || stage === null) return undefined;
  return (TUTORIAL_STEPS[stage] ?? [])[stepIndex]?.merchantItemId;
}
