import { CSSProperties, useEffect, useRef } from "react";
import { GameEngine } from "./GameEngine";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";
import { useTargetingStore } from "../state/targetingStore";

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

const targetingHintStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  color: "#ff8800",
  fontFamily: "monospace",
  fontSize: 12,
  fontWeight: "bold",
  letterSpacing: 1,
  pointerEvents: "none",
  userSelect: "none",
  background: "rgba(0,0,0,0.55)",
  borderRadius: 6,
  padding: "4px 10px",
  border: "1px solid #ff6600",
};

export function FarmCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const game = useGameStore((s) => s.game);
  const { playerId } = useConnectionStore();
  const { active: targeting, chosen, fieldCount } = useTargetingStore();

  // Escape cancels targeting mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") useTargetingStore.getState().cancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let mounted = true;
    const engine = new GameEngine();
    engineRef.current = engine;

    const onSow = (fieldIndex: number) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "SowField", fieldIndex, cropType: "wheat" },
      });
    };

    const onHarvest = (fieldIndex: number) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "HarvestField", fieldIndex },
      });
    };

    const onScareCrow = (fieldIndex: number) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "ScareCrow", fieldIndex },
      });
    };

    engine
      .init(containerRef.current!, onSow, onHarvest, onScareCrow)
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

  const remaining = fieldCount - chosen.length;

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        ref={containerRef}
        style={{ imageRendering: "pixelated", position: "absolute", inset: 0 }}
      />
      <span style={{ ...labelStyle, left: 16 }}>Your Farm</span>
      <span style={{ ...labelStyle, right: 16 }}>Opponent</span>
      {targeting && (
        <span style={targetingHintStyle}>
          Click opponent field ({remaining} left) · Esc to cancel
        </span>
      )}
    </div>
  );
}
