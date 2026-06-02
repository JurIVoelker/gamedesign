import { useState } from "react";
import { useConnectionStore } from "../state/connectionStore";

export function Lobby() {
  const { status, slot, roomCode, error, send, playerId } = useConnectionStore();
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const inviteUrl = roomCode
    ? `${window.location.origin}/?room=${roomCode}`
    : null;

  function handleCreateRoom() {
    send?.({ type: "create_room" });
  }

  function handleJoinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code || !playerId) return;
    send?.({ type: "hello", playerId, roomCode: code });
  }

  function handleCopy() {
    if (!inviteUrl) return;
    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(inviteUrl).then(confirm).catch(() => {
        fallbackCopy(inviteUrl);
        confirm();
      });
    } else {
      fallbackCopy(inviteUrl);
      confirm();
    }
  }

  function fallbackCopy(text: string) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="bg-stone-900/90 border border-stone-600 rounded-2xl p-8 w-80 flex flex-col gap-4 text-stone-100 shadow-2xl">
        <h1 className="text-2xl font-bold text-center tracking-wide text-amber-300">
          Farmyard Duel
        </h1>

        {(status === "disconnected" || status === "connecting") && (
          <p className="text-center text-stone-400 text-sm animate-pulse">
            Verbinde…
          </p>
        )}

        {status === "lobby" && (
          <div className="flex flex-col gap-3">
            <button
              onClick={handleCreateRoom}
              className="bg-amber-500 hover:bg-amber-400 text-stone-900 font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Raum erstellen
            </button>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                maxLength={6}
                placeholder="Raumcode eingeben"
                className="bg-stone-800 border border-stone-600 rounded-lg px-3 py-2 text-center text-sm tracking-widest placeholder:tracking-normal placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={handleJoinRoom}
                disabled={joinCode.trim().length < 1}
                className="bg-stone-700 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold py-2 px-4 rounded-lg transition-colors"
              >
                Beitreten
              </button>
            </div>
          </div>
        )}

        {status === "waiting" && (
          <div className="flex flex-col items-center gap-3">
            {slot && (
              <p className="text-stone-400 text-sm">
                Du bist{" "}
                <span className="text-amber-300 font-bold">
                  {slot === "p1" ? "Spieler 1" : "Spieler 2"}
                </span>
              </p>
            )}
            {inviteUrl && (
              <div className="flex flex-col items-center gap-2 w-full">
                <p className="text-stone-400 text-xs">Lade einen Freund ein:</p>
                <div className="flex gap-2 w-full">
                  <input
                    readOnly
                    value={inviteUrl}
                    className="bg-stone-800 border border-stone-600 rounded-lg px-2 py-1 text-xs flex-1 min-w-0 text-stone-300 focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="bg-stone-700 hover:bg-stone-600 px-2 py-1 rounded-lg text-xs whitespace-nowrap transition-colors"
                  >
                    {copied ? "✓" : "Kopieren"}
                  </button>
                </div>
                <p className="text-stone-500 text-xs font-mono tracking-widest">{roomCode}</p>
              </div>
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
