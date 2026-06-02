import { useState, useEffect } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { OnboardingModal } from "./OnboardingModal";

export function Lobby() {
  const {
    status,
    slot,
    roomCode,
    error,
    send,
    playerId,
    disconnect,
    setRoomCode,
  } = useConnectionStore();
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
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

  const inviteUrl = roomCode
    ? `${window.location.origin}/?room=${roomCode}`
    : null;

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

  function handleCopy() {
    if (!inviteUrl) return;
    const confirm = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(inviteUrl)
        .then(confirm)
        .catch(() => {
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
            {slot && (
              <p className="text-muted-gold text-[8px]">
                Du bist{" "}
                <span className="text-gold">
                  {slot === "p1" ? "Spieler 1" : "Spieler 2"}
                </span>
              </p>
            )}
            {inviteUrl && (
              <div className="flex flex-col items-center gap-2 w-full">
                <p className="text-muted-gold text-[8px]">Lade einen Freund ein:</p>
                <div className="flex gap-2 w-full">
                  <input
                    readOnly
                    value={inviteUrl}
                    className="input-pixel flex-1 min-w-0 text-[7px]"
                  />
                  <button
                    onClick={handleCopy}
                    className="btn-pixel-secondary whitespace-nowrap"
                  >
                    {copied ? "✓" : "Kopieren"}
                  </button>
                </div>
                <p className="text-muted-gold text-[9px] tracking-widest">
                  {roomCode}
                </p>
              </div>
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
