import { CSSProperties, useEffect, useRef } from "react";
import { GameEngine } from "./GameEngine";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";

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

  const game = useGameStore((s) => s.game);
  const { playerId } = useConnectionStore();

  useEffect(() => {
    let mounted = true;
    const engine = new GameEngine();
    engineRef.current = engine;

    const onHarvest = (fieldIndex: number) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "HarvestField", fieldIndex },
      });
    };

    engine
      .init(containerRef.current!, onHarvest)
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

  useEffect(() => {
    if (game && playerId && engineRef.current) {
      engineRef.current.updateGameState(game, playerId);
    }
  }, [game, playerId]);

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
