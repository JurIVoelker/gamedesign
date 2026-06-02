import { useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

export function GameOver() {
  const { playerId, slot, send, disconnect } = useConnectionStore();
  const game = useGameStore((s) => s.game);
  const [clicked, setClicked] = useState(false);

  if (!game || game.phase !== "ended") return null;

  const myState = game.players[playerId ?? ""];
  const opponentState = Object.values(game.players).find(
    (p) => p.id !== playerId,
  );
  const iWon = game.winnerId === playerId;
  const isDraw = !game.winnerId;

  function handlePlayAgain() {
    if (clicked) return;
    setClicked(true);
    send?.({ type: "play_again" });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60">
      <div className="panel-pixel lobby-panel flex flex-col gap-5 text-parchment">
        <h2 className="text-center text-[12px] tracking-wide">
          {isDraw ? (
            <span className="text-parchment">Unentschieden!</span>
          ) : iWon ? (
            <span className="text-gold">Du gewinnst! 🏆</span>
          ) : (
            <span className="text-muted-gold">Du verlierst!</span>
          )}
        </h2>

        <div className="flex flex-col gap-2 text-[8px]">
          <div className="score-row">
            <span className="text-parchment">
              {slot === "p1" ? "Spieler 1 (Du)" : "Spieler 2 (Du)"}
            </span>
            <span className="text-gold">
              {myState?.gold ?? 0} Gold
            </span>
          </div>
          <div className="score-row">
            <span className="text-muted-gold">
              {slot === "p1" ? "Spieler 2 (Gegner)" : "Spieler 1 (Gegner)"}
            </span>
            <span className="text-parchment">
              {opponentState?.gold ?? 0} Gold
            </span>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handlePlayAgain}
            disabled={clicked}
            className="btn-pixel flex-1"
          >
            {clicked ? "✓ Bereit!" : "Nochmal spielen"}
          </button>
          <button
            onClick={() => disconnect?.()}
            className="btn-pixel-secondary"
          >
            Verlassen
          </button>
        </div>
        <p className="text-muted-gold text-[7px] text-center">
          Warte, bis beide Spieler bereit sind…
        </p>
      </div>
    </div>
  );
}
