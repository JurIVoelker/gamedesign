import { useEffect, useRef } from "react";
import { useGameStore } from "../state/gameStore";
import { useConnectionStore } from "../state/connectionStore";
import { useToastStore } from "../state/toastStore";
import { CRYSTAL_BALL_LEAD_MS } from "@gamedesign/shared";
import { useTutorialStore, getRevealedSurfaces } from "../state/tutorialStore";

const SABOTAGE_TOOLS = ["crows", "thief", "weather"] as const;
type SabotageTool = (typeof SABOTAGE_TOOLS)[number];

const TOOL_WARNINGS: Record<SabotageTool, string> = {
  crows: "Die Krähen des Gegners sind bald wieder bereit!",
  thief: "Demnächst könnte ein Dieb vorbeischauen.",
  weather: "Es könnte ein Unwetter bevorstehen.",
};

export function CrystalBallWatcher() {
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const id = setInterval(() => {
      if (!getRevealedSurfaces(useTutorialStore.getState()).has("crystalBall"))
        return;

      const { game } = useGameStore.getState();
      const { playerId } = useConnectionStore.getState();
      if (!game || !playerId) return;

      const me = game.players[playerId];
      if (!me) return;

      const hasCrystalBall = me.items.some(
        (i) => i.id === "crystal_ball" && i.count > 0,
      );
      if (!hasCrystalBall) return;

      const opponentId = Object.keys(game.players).find(
        (id) => id !== playerId,
      );
      if (!opponentId) return;
      const opponent = game.players[opponentId];
      if (!opponent) return;

      const now = Date.now();
      for (const toolId of SABOTAGE_TOOLS) {
        const tool = opponent.tools.find((t) => t.id === toolId);
        if (!tool || tool.cooldownUntil <= now) continue;
        if (now < tool.cooldownUntil - CRYSTAL_BALL_LEAD_MS) continue;

        const key = `${toolId}:${tool.cooldownUntil}`;
        if (notifiedRef.current.has(key)) continue;

        notifiedRef.current.add(key);
        useToastStore
          .getState()
          .push(TOOL_WARNINGS[toolId], CRYSTAL_BALL_LEAD_MS + 5_000);
      }
    }, 500);

    return () => clearInterval(id);
  }, []);

  return null;
}
