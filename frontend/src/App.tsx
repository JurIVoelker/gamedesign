import { useConnectionStore } from "./state/connectionStore";
import { useWebSocket } from "./net/useWebSocket";
import { FarmCanvas } from "./game/FarmCanvas";
import { Lobby } from "./ui/Lobby";
import { HUD } from "./ui/HUD";

export default function App() {
  useWebSocket();

  const isInGame = useConnectionStore((s) => s.status === "in_game");

  return (
    <div className="relative w-full h-screen bg-green-950 flex flex-col items-center justify-center gap-6">
      <FarmCanvas />
      {!isInGame && <Lobby />}
      {isInGame && <HUD />}
    </div>
  );
}
