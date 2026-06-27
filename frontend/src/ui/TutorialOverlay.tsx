import { useEffect } from "react";
import { useTutorialStore } from "../state/tutorialStore";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";
import { TUTORIAL_STEPS } from "../tutorial/stages";
import { markStageCompleted } from "../tutorial/progress";

export function TutorialOverlay() {
  const { active, stage, stepIndex, advance, exit } = useTutorialStore();
  const game = useGameStore((s) => s.game);
  const gamePhase = useGameStore((s) => s.game?.phase);
  const send = useConnectionStore((s) => s.send);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const setHighlightField = useTutorialStore((s) => s.setHighlightField);

  const steps = stage ? (TUTORIAL_STEPS[stage] ?? []) : [];
  const currentStep = steps[stepIndex] ?? null;

  // Run onEnter and update field highlight when step changes
  useEffect(() => {
    if (!active || !currentStep) return;
    currentStep.onEnter?.(send);
    if (currentStep.highlight?.kind === "field") {
      setHighlightField({
        owner: currentStep.highlight.owner,
        index: currentStep.highlight.index,
      });
    } else {
      setHighlightField(null);
    }
  }, [active, stepIndex, currentStep, send, setHighlightField]);

  // Check gate on every gameStore update — auto-advance when condition met
  useEffect(() => {
    if (!active || !currentStep?.gate) return;
    if (currentStep.gate(game)) {
      advance();
    }
  }, [active, currentStep, game, advance]);

  // When all steps complete, mark stage done and return to lobby
  useEffect(() => {
    if (!active || stage === null || currentStep !== null) return;
    if (steps.length === 0) return;
    markStageCompleted(stage);
    setHighlightField(null);
    send?.({ type: "leave_game" });
    disconnect?.();
    exit();
  }, [
    active,
    stage,
    currentStep,
    steps.length,
    exit,
    send,
    disconnect,
    setHighlightField,
  ]);

  // When tutorial match ends server-side (time ran out), clean up
  useEffect(() => {
    if (active && gamePhase === "ended") {
      setHighlightField(null);
      send?.({ type: "leave_game" });
      disconnect?.();
      exit();
    }
  }, [active, gamePhase, exit, send, disconnect, setHighlightField]);

  if (!active || !currentStep) return null;

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === steps.length - 1;
  const advanceLabel = isFirstStep
    ? "Los geht's! →"
    : isLastStep
      ? "Fertig"
      : "Weiter →";

  return (
    <div
      style={{
        position: "absolute",
        right: 28,
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: 50,
        pointerEvents: "auto",
        width: 260,
      }}
    >
      <div className="panel-pixel" style={{ padding: "14px 16px" }}>
        <div
          style={{
            fontFamily: "'Press Start 2P', monospace",
            fontSize: 8,
            color: "#c8a84b",
            lineHeight: 1.9,
          }}
        >
          {currentStep.text}
        </div>
        {!currentStep.gate && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={advance}
              className="btn-pixel"
              style={{ fontSize: 7, width: "100%" }}
            >
              {advanceLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
