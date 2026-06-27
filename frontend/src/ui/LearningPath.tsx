import { useState } from "react";
import { useTutorialStore } from "../state/tutorialStore";
import { useConnectionStore } from "../state/connectionStore";
import { isStageCompleted, isStageUnlocked } from "../tutorial/progress";
import type { TutorialStageId } from "@gamedesign/shared";

const STAGE_LABELS: Record<TutorialStageId, string> = {
  1: "Der Hof",
  2: "Sabotage",
  3: "Markt & Items",
};

const STAGE_DESCRIPTIONS: Record<TutorialStageId, string> = {
  1: "Säen, wachsen, ernten. Werkzeug & Dünger.",
  2: "Krähen, Diebe & Unwetter – angreifen und verteidigen.",
  3: "Den Händler und 9 Items kennenlernen.",
};

const STAGES: TutorialStageId[] = [1, 2, 3];

export function LearningPath({ onDirectPlay }: { onDirectPlay: () => void }) {
  const { start } = useTutorialStore();
  const send = useConnectionStore((s) => s.send);
  const [, tick] = useState(0);

  function handleStartStage(stage: TutorialStageId) {
    if (!isStageUnlocked(stage)) return;
    start(stage);
    send?.({ type: "start_tutorial", stage });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2
        style={{
          fontFamily: "'Press Start 2P', monospace",
          fontSize: 9,
          color: "#c8a84b",
          textAlign: "center",
          marginBottom: 2,
        }}
      >
        Lernpfad
      </h2>

      {STAGES.map((stage) => {
        const unlocked = isStageUnlocked(stage);
        const completed = isStageCompleted(stage);
        return (
          <button
            key={stage}
            disabled={!unlocked}
            onClick={() => {
              tick((n) => n + 1); // force re-render to refresh progress
              handleStartStage(stage);
            }}
            className="panel-pixel"
            style={{
              padding: "8px 12px",
              textAlign: "left",
              cursor: unlocked ? "pointer" : "default",
              opacity: unlocked ? 1 : 0.45,
              background: "none",
              border: "none",
              width: "100%",
            }}
          >
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 8,
                color: completed ? "#6cde6c" : "#c8a84b",
              }}
            >
              {stage}. {STAGE_LABELS[stage]}
              {completed && "  ✓"}
              {!unlocked && "  🔒"}
            </div>
            <div
              style={{
                fontFamily: "'Press Start 2P', monospace",
                fontSize: 6,
                color: "#a08060",
                marginTop: 4,
                lineHeight: 1.5,
              }}
            >
              {STAGE_DESCRIPTIONS[stage]}
            </div>
          </button>
        );
      })}

      <button
        onClick={onDirectPlay}
        className="btn-pixel-secondary w-full"
        style={{ fontSize: 7, marginTop: 2 }}
      >
        Direkt spielen (PvP)
      </button>
    </div>
  );
}
