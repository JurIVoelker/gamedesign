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
    let cleanupTarget: HTMLElement | null = null;
    let prevPosition = "";
    let prevZIndex = "";
    let observed: HTMLElement | null = null;

    const update = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tutorial-id="${targetId}"]`,
      );
      if (!target || !ringRef.current) return;

      if (!cleanupTarget) {
        prevPosition = target.style.position;
        prevZIndex = target.style.zIndex;
        // Only override position if the element is statically positioned;
        // overriding absolute/fixed breaks layout (e.g. the ItemBar).
        if (getComputedStyle(target).position === "static") {
          target.style.position = "relative";
        }
        target.style.zIndex = "42";
        cleanupTarget = target;
      }

      // Track the card's live bounds: its width changes when the level/cost text
      // updates after an upgrade (or when the pixel font finishes loading), and
      // a once-only measurement would leave the ring misaligned.
      if (observed !== target) {
        if (observed) resizeObserver.unobserve(observed);
        resizeObserver.observe(target);
        observed = target;
      }

      const rect = target.getBoundingClientRect();
      const ring = ringRef.current;
      ring.style.left = `${rect.left - 4}px`;
      ring.style.top = `${rect.top - 4}px`;
      ring.style.width = `${rect.width + 8}px`;
      ring.style.height = `${rect.height + 8}px`;
    };

    const resizeObserver = new ResizeObserver(update);
    update();
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("resize", update);
      resizeObserver.disconnect();
      if (cleanupTarget) {
        cleanupTarget.style.position = prevPosition;
        cleanupTarget.style.zIndex = prevZIndex;
      }
    };
  }, [targetId]);

  return (
    <div
      ref={ringRef}
      style={{
        position: "fixed",
        border: "2px solid #c8a84b",
        boxShadow: "0 0 12px 4px rgba(200,168,75,0.5)",
        pointerEvents: "none",
        zIndex: 43,
      }}
    />
  );
}
