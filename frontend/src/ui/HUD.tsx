import { useConnectionStore } from "../state/connectionStore";

export function HUD() {
  const { slot, playerId } = useConnectionStore();

  return (
    <div className="absolute top-4 left-0 right-0 flex justify-center pointer-events-none">
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-1 text-stone-300 text-xs font-mono flex gap-4">
        <span>
          Slot:{" "}
          <span className="text-amber-300 font-bold">
            {slot === "p1" ? "Spieler 1" : "Spieler 2"}
          </span>
        </span>
        <span className="text-stone-600">|</span>
        <span>
          ID: <span className="text-stone-400">{playerId?.slice(0, 8)}</span>
        </span>
      </div>
    </div>
  );
}
