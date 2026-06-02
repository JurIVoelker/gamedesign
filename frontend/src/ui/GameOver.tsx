import { useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

export function GameOver() {
  const { playerId, slot, send, disconnect } = useConnectionStore();
  const game = useGameStore((s) => s.game);
  const [clicked, setClicked] = useState(false);

  if (!game || game.phase !== "ended") return null;

  const myState = game.players[playerId ?? ""];
  const opponentState = Object.values(game.players).find((p) => p.id !== playerId);
  const iWon = game.winnerId === playerId;
  const isDraw = !game.winnerId;

  function handlePlayAgain() {
    if (clicked) return;
    setClicked(true);
    send?.({ type: "play_again" });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70">
      <div className="bg-stone-900 border border-stone-600 rounded-2xl p-8 w-80 flex flex-col gap-5 text-stone-100 shadow-2xl">
        <h2 className="text-2xl font-bold text-center tracking-wide">
          {isDraw ? (
            <span className="text-stone-300">Unentschieden!</span>
          ) : iWon ? (
            <span className="text-amber-300">Du gewinnst! 🏆</span>
          ) : (
            <span className="text-stone-400">Du verlierst!</span>
          )}
        </h2>

        <div className="flex flex-col gap-2 text-sm">
          <div className="flex justify-between items-center bg-stone-800 rounded-lg px-4 py-2">
            <span className="text-stone-300">
              {slot === "p1" ? "Spieler 1 (Du)" : "Spieler 2 (Du)"}
            </span>
            <span className="text-amber-300 font-bold">{myState?.gold ?? 0} Gold</span>
          </div>
          <div className="flex justify-between items-center bg-stone-800 rounded-lg px-4 py-2">
            <span className="text-stone-400">
              {slot === "p1" ? "Spieler 2 (Gegner)" : "Spieler 1 (Gegner)"}
            </span>
            <span className="text-stone-300 font-bold">{opponentState?.gold ?? 0} Gold</span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePlayAgain}
            disabled={clicked}
            className="flex-1 bg-amber-500 text-stone-900 font-bold py-2 px-4 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed enabled:hover:bg-amber-400"
          >
            {clicked ? "✓ Bereit!" : "Nochmal spielen"}
          </button>
          <button
            onClick={() => disconnect?.()}
            className="bg-stone-700 hover:bg-stone-600 text-stone-300 font-bold py-2 px-4 rounded-lg transition-colors"
          >
            Verlassen
          </button>
        </div>
        <p className="text-stone-600 text-xs text-center">
          Warte, bis beide Spieler bereit sind…
        </p>
      </div>
    </div>
  );
}
