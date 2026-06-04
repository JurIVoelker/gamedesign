import { useState, useEffect } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { OnboardingModal } from "./OnboardingModal";

export function Lobby() {
  const {
    status,
    roomCode,
    error,
    send,
    playerId,
    disconnect,
    setRoomCode,
  } = useConnectionStore();
  const [joinCode, setJoinCode] = useState("");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("onboarding_seen")) {
      setShowOnboarding(true);
    }
  }, []);

  function handleCloseOnboarding() {
    localStorage.setItem("onboarding_seen", "true");
    setShowOnboarding(false);
  }

  function handleCreateRoom() {
    send?.({ type: "create_room" });
  }

  function handleJoinRoom() {
    const code = joinCode.trim().toUpperCase();
    if (!code || !playerId) return;
    localStorage.setItem("roomCode", code);
    setRoomCode(code);
    send?.({ type: "hello", playerId, roomCode: code });
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <OnboardingModal open={showOnboarding} onClose={handleCloseOnboarding} />
      <div className="panel-pixel lobby-panel flex flex-col gap-4 text-parchment">
        <div className="flex items-center justify-between">
          <h1 className="text-gold text-[12px] tracking-wide">Farmyard Duel</h1>
          <button
            onClick={() => setShowOnboarding(true)}
            className="btn-pixel-secondary"
            title="Spielanleitung"
          >
            ?
          </button>
        </div>

        {(status === "disconnected" || status === "connecting") && (
          <>
            <p className="text-center text-muted-gold text-[8px] animate-pulse">
              Verbinde…
            </p>
            {roomCode && (
              <button
                onClick={() => disconnect?.()}
                className="btn-pixel-secondary w-full"
              >
                Abbrechen
              </button>
            )}
          </>
        )}

        {status === "lobby" && (
          <div className="flex flex-col gap-3">
            <button onClick={handleCreateRoom} className="btn-pixel w-full">
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
                className="input-pixel text-center"
              />
              <button
                onClick={handleJoinRoom}
                disabled={joinCode.trim().length < 1}
                className="btn-pixel-secondary w-full"
              >
                Beitreten
              </button>
            </div>
          </div>
        )}

        {status === "waiting" && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-gold text-[8px] text-center">
              Gib deinem Mitspieler diesen Code:
            </p>
            {roomCode && (
              <p className="text-gold text-[22px] tracking-[0.25em]">
                {roomCode}
              </p>
            )}
            <p className="text-muted-gold text-[8px] animate-pulse">
              Warte auf Gegner…
            </p>
            <button
              onClick={() => disconnect?.()}
              className="btn-pixel-secondary w-full"
            >
              Raum verlassen
            </button>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-danger text-[8px] text-center">{error}</p>
            <button
              onClick={() => disconnect?.()}
              className="btn-pixel-secondary"
            >
              Zurück zum Menü
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
