import { useConnectionStore } from "../state/connectionStore";

export function Lobby() {
  const { status, slot, error } = useConnectionStore();

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-stone-900/90 border border-stone-600 rounded-2xl p-8 w-72 flex flex-col gap-4 text-stone-100 shadow-2xl">
        <h1 className="text-2xl font-bold text-center tracking-wide text-amber-300">
          Farmyard Duel
        </h1>

        {(status === "disconnected" || status === "connecting") && (
          <p className="text-center text-stone-400 text-sm animate-pulse">
            Verbinde…
          </p>
        )}

        {status === "waiting" && (
          <div className="flex flex-col items-center gap-2">
            {slot && (
              <p className="text-stone-400 text-sm">
                Du bist{" "}
                <span className="text-amber-300 font-bold">
                  {slot === "p1" ? "Spieler 1" : "Spieler 2"}
                </span>
              </p>
            )}
            <p className="text-stone-500 text-xs animate-pulse">
              Warte auf Gegner…
            </p>
          </div>
        )}

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
