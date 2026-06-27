import { useEffect, useState } from "react";
import type { ItemId } from "@gamedesign/shared";
import { ITEM_DEFS, SPY_REPORT_INTERVAL_MS } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useNow } from "../hooks/useNow";
import { useTutorialStore, useRevealedSurfaces } from "../state/tutorialStore";
import { TUTORIAL_STEPS } from "../tutorial/stages";

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HUD() {
  const { playerId, send, disconnect } = useConnectionStore();
  const game = useGameStore((s) => s.game);
  const now = useNow(500);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const {
    active: tutorialActive,
    stage: tutorialStage,
    stepIndex: tutorialStepIndex,
    exit: tutorialExit,
  } = useTutorialStore();
  const revealed = useRevealedSurfaces();

  const totalSteps = tutorialStage ? TUTORIAL_STEPS[tutorialStage].length : 0;

  const me = game?.players[playerId ?? ""];
  const myTimedEffects = (me?.activeEffects ?? []).filter(
    (e) => e.endsAt !== null && (e.endsAt ?? 0) > now,
  );

  const [spyGold, setSpyGold] = useState<number | null>(null);
  const hasSpyGlass = myTimedEffects.some((e) => e.itemId === "spy_glass");
  useEffect(() => {
    if (!hasSpyGlass) {
      setSpyGold(null);
      return;
    }
    const snapshot = () => {
      const { game: g } = useGameStore.getState();
      const { playerId: pid } = useConnectionStore.getState();
      const oId = Object.keys(g?.players ?? {}).find((id) => id !== pid);
      if (oId && g) setSpyGold(g.players[oId]?.gold ?? null);
    };
    snapshot();
    const id = setInterval(snapshot, SPY_REPORT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasSpyGlass]);

  useEffect(() => {
    if (!game?.endsAt) {
      setRemaining(null);
      return;
    }
    const update = () => {
      const next = Math.max(0, game.endsAt! - Date.now());
      setRemaining(next);
      if (next === 0) clearInterval(id);
    };
    update();
    const id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [game?.endsAt]);

  const gold = me?.gold ?? 0;

  const effectPills = myTimedEffects.flatMap((e) => {
    const secs = Math.max(0, Math.ceil(((e.endsAt ?? 0) - now) / 1000));
    if (secs <= 0) return [];
    const def = ITEM_DEFS[e.itemId as ItemId];
    const isIncoming = e.sourcePlayerId !== (playerId ?? "");

    let label: string;
    if (e.itemId === "blindness_potion") {
      label = `Blind ${secs}s`;
    } else if (e.itemId === "spy_glass") {
      label =
        spyGold !== null ? `Spion ${spyGold}G ${secs}s` : `Spion ${secs}s`;
    } else {
      label = `${def?.name ?? e.itemId} ${secs}s`;
    }

    return [
      <span key={`sep-${e.id}`} className="text-muted-gold">
        |
      </span>,
      <span key={e.id} className={isIncoming ? "text-danger" : "text-gold"}>
        {label}
      </span>,
    ];
  });

  function handleLeaveConfirm() {
    send?.({ type: "leave_game" });
    disconnect?.();
    if (tutorialActive) tutorialExit();
  }

  // Tutorial mode: always-visible bar with step progress + cancel
  if (tutorialActive) {
    return (
      <div className="absolute inset-top-safe left-0 right-0 flex justify-center pointer-events-none z-10">
        <div className="panel-pixel px-4 py-2 text-parchment text-[8px] flex gap-4 items-center pointer-events-auto">
          {confirming ? (
            <span className="flex gap-2 items-center">
              <span className="text-parchment">Tutorial verlassen?</span>
              <button onClick={handleLeaveConfirm} className="btn-pixel-danger">
                Ja
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="btn-pixel-secondary"
              >
                Nein
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="btn-pixel-secondary"
            >
              Tutorial verlassen
            </button>
          )}
          {totalSteps > 0 && (
            <>
              <span className="text-muted-gold">|</span>
              <span>
                Schritt{" "}
                <span className="text-gold">
                  {Math.min(tutorialStepIndex + 1, totalSteps)}/{totalSteps}
                </span>
              </span>
            </>
          )}
          {revealed.has("goldHud") && (
            <>
              <span className="text-muted-gold">|</span>
              <span>
                Gold: <span className="text-gold">{gold}</span>
              </span>
            </>
          )}
        </div>
      </div>
    );
  }

  // PvP mode: only render the panel when there is something to show
  const hasContent =
    revealed.has("goldHud") ||
    (revealed.has("effectsTimeline") && myTimedEffects.length > 0) ||
    (revealed.has("matchTimer") && remaining !== null) ||
    revealed.has("exitButton");

  if (!hasContent) return null;

  return (
    <div className="absolute inset-top-safe left-0 right-0 flex justify-center pointer-events-none z-10">
      <div className="panel-pixel px-4 py-2 text-parchment text-[8px] flex gap-4 items-center pointer-events-auto">
        {revealed.has("goldHud") && (
          <span>
            Gold: <span className="text-gold">{gold}</span>
          </span>
        )}
        {revealed.has("effectsTimeline") && effectPills}
        {revealed.has("matchTimer") && remaining !== null && (
          <>
            <span className="text-muted-gold">|</span>
            <span>
              Zeit:{" "}
              <span
                className={remaining <= 60_000 ? "text-danger" : "text-gold"}
              >
                {formatTime(remaining)}
              </span>
            </span>
          </>
        )}
        {revealed.has("exitButton") && (
          <>
            <span className="text-muted-gold">|</span>
            {confirming ? (
              <span className="flex gap-2 items-center">
                <span className="text-parchment">Aufgeben?</span>
                <button
                  onClick={handleLeaveConfirm}
                  className="btn-pixel-danger"
                >
                  Ja
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="btn-pixel-secondary"
                >
                  Nein
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="btn-pixel-secondary"
              >
                Aufgeben
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
