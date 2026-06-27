import type { TutorialStageId } from "@gamedesign/shared";

const PROGRESS_KEY = "tutorial_progress";

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
