import { useEffect, useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HUD() {
  const { slot, playerId, send, disconnect } = useConnectionStore();
  const game = useGameStore((s) => s.game);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!game?.endsAt) {
      setRemaining(null);
      return;
    }
    let id: ReturnType<typeof setInterval>;
    const update = () => {
      const next = Math.max(0, game.endsAt! - Date.now());
      setRemaining(next);
      if (next === 0) clearInterval(id);
    };
    update();
    id = setInterval(update, 1_000);
    return () => clearInterval(id);
  }, [game?.endsAt]);

  const gold = game?.players[playerId ?? ""]?.gold ?? 0;

  function handleLeaveConfirm() {
    send?.({ type: "leave_game" });
    disconnect?.();
  }

  return (
    <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none z-10">
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-1 text-stone-300 text-xs font-mono flex gap-4 items-center pointer-events-auto">
        <span>
          Slot:{" "}
          <span className="text-amber-300 font-bold">
            {slot === "p1" ? "Spieler 1" : "Spieler 2"}
          </span>
        </span>
        <span className="text-stone-600">|</span>
        <span>
          Gold: <span className="text-amber-300 font-bold">{gold}</span>
        </span>
        {remaining !== null && (
          <>
            <span className="text-stone-600">|</span>
            <span>
              Zeit:{" "}
              <span
                className={
                  remaining <= 60_000
                    ? "text-red-400 font-bold"
                    : "text-amber-300 font-bold"
                }
              >
                {formatTime(remaining)}
              </span>
            </span>
          </>
        )}
        <span className="text-stone-600">|</span>
        <span>
          ID: <span className="text-stone-400">{playerId?.slice(0, 8)}</span>
        </span>
        <span className="text-stone-600">|</span>
        {confirming ? (
          <span className="flex gap-2 items-center">
            <span className="text-stone-300">Aufgeben?</span>
            <button
              onClick={handleLeaveConfirm}
              className="bg-red-700 hover:bg-red-600 text-stone-100 font-bold px-2 py-0.5 rounded transition-colors"
            >
              Ja
            </button>
            <button
              onClick={() => setConfirming(false)}
              className="bg-stone-700 hover:bg-stone-600 text-stone-300 font-bold px-2 py-0.5 rounded transition-colors"
            >
              Nein
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-stone-400 hover:text-red-400 transition-colors"
          >
            Aufgeben
          </button>
        )}
      </div>
    </div>
  );
}
