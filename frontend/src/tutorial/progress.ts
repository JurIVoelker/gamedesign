import type { TutorialStageId } from "@gamedesign/shared";
import { TUTORIAL_STEPS } from "./stages";

const PROGRESS_KEY = "tutorial_progress";

const STAGES: TutorialStageId[] = [1, 2, 3];

interface TutorialProgress {
  completed: TutorialStageId[];
  highestUnlocked: TutorialStageId;
}

function getProgress(): TutorialProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as TutorialProgress;
  } catch {
    // localStorage unavailable or corrupt — fall through to default
  }
  return { completed: [], highestUnlocked: 1 };
}

function saveProgress(progress: TutorialProgress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

export function isStageCompleted(stage: TutorialStageId): boolean {
  return getProgress().completed.includes(stage);
}

export function isStageUnlocked(stage: TutorialStageId): boolean {
  if (stage === 1) return true;
  return getProgress().highestUnlocked >= stage;
}

export function markStageCompleted(stage: TutorialStageId): void {
  const progress = getProgress();
  if (!progress.completed.includes(stage)) {
    progress.completed.push(stage);
  }
  const nextStage = (stage + 1) as TutorialStageId;
  if (nextStage <= 3 && progress.highestUnlocked < nextStage) {
    progress.highestUnlocked = nextStage;
  }
  saveProgress(progress);
}

/** Highest tutorial stage that actually has steps (the final "real" stage). */
export function lastStageWithSteps(): TutorialStageId {
  let last: TutorialStageId = 1;
  for (const stage of STAGES) {
    if ((TUTORIAL_STEPS[stage] ?? []).length > 0) last = stage;
  }
  return last;
}

/** True once the player has completed the final stage that has content. */
export function isTutorialComplete(): boolean {
  return isStageCompleted(lastStageWithSteps());
}
