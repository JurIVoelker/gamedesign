import { useEffect, useRef } from "react";
import { useTutorialStore } from "../state/tutorialStore";
import { TUTORIAL_STEPS } from "../tutorial/stages";

export function TutorialSpotlight() {
  const { active, stage, stepIndex } = useTutorialStore();
  const steps = stage ? (TUTORIAL_STEPS[stage] ?? []) : [];
  const currentStep = steps[stepIndex] ?? null;

  if (!active || currentStep?.highlight?.kind !== "dom") return null;

  return <SpotlightImpl targetId={currentStep.highlight.id} />;
}

function SpotlightImpl({ targetId }: { targetId: string }) {
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${targetId}"]`,
      );
      if (!target || !ringRef.current) return;
      const rect = target.getBoundingClientRect();
      const ring = ringRef.current;
      ring.style.left = `${rect.left - 4}px`;
      ring.style.top = `${rect.top - 4}px`;
      ring.style.width = `${rect.width + 8}px`;
      ring.style.height = `${rect.height + 8}px`;
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [targetId]);

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          pointerEvents: "none",
          zIndex: 40,
        }}
      />
      <div
        ref={ringRef}
        style={{
          position: "fixed",
          border: "2px solid #c8a84b",
          boxShadow: "0 0 12px 4px rgba(200,168,75,0.5)",
          pointerEvents: "none",
          zIndex: 41,
        }}
      />
    </>
  );
}
