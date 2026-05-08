import { CSSProperties, useEffect, useRef } from "react";
import { GameEngine } from "./GameEngine";

const labelStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  color: "#f0e8c0",
  fontFamily: "monospace",
  fontSize: 13,
  fontWeight: "bold",
  letterSpacing: 1,
  pointerEvents: "none",
  userSelect: "none",
};

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
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        ref={containerRef}
        style={{ imageRendering: "pixelated", position: "absolute", inset: 0 }}
      />
      <span style={{ ...labelStyle, left: 16 }}>Your Farm</span>
      <span style={{ ...labelStyle, right: 16 }}>Opponent</span>
    </div>
  );
}
