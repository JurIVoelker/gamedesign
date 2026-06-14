import { useEffect, useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useNow } from "../hooks/useNow";

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

  const blindnessEffect = game?.players[playerId ?? ""]?.activeEffects.find(
    (e) => e.itemId === "blindness_potion",
  );
  const blindRemaining = blindnessEffect?.endsAt
    ? Math.max(0, Math.ceil((blindnessEffect.endsAt - now) / 1000))
    : null;
  const [confirming, setConfirming] = useState(false);

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

  const gold = game?.players[playerId ?? ""]?.gold ?? 0;

  function handleLeaveConfirm() {
    send?.({ type: "leave_game" });
    disconnect?.();
  }

  return (
    <div className="absolute inset-top-safe left-0 right-0 flex justify-center pointer-events-none z-10">
      <div className="panel-pixel px-4 py-2 text-parchment text-[8px] flex gap-4 items-center pointer-events-auto">
        <span>
          Gold: <span className="text-gold">{gold}</span>
        </span>
        {blindRemaining !== null && blindRemaining > 0 && (
          <>
            <span className="text-muted-gold">|</span>
            <span className="text-danger">
              Blind {blindRemaining}s
            </span>
          </>
        )}
        {remaining !== null && (
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
        <span className="text-muted-gold">|</span>
        {confirming ? (
          <span className="flex gap-2 items-center">
            <span className="text-parchment">Aufgeben?</span>
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
            Aufgeben
          </button>
        )}
      </div>
    </div>
  );
}
