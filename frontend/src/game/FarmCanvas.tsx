import { useEffect, useRef } from "react";
import { GameEngine } from "./GameEngine";

export function FarmCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  useEffect(() => {
    let mounted = true;
    const engine = new GameEngine();
    engineRef.current = engine;

    engine
      .init(containerRef.current!)
      .then(() => {
        if (!mounted) engine.destroy();
      })
      .catch((err) => console.error("[GameEngine] init failed", err));

    return () => {
      mounted = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ imageRendering: "pixelated", position: "absolute", inset: 0 }}
    />
  );
}
