import { useConnectionStore } from "./state/connectionStore";
import { useGameStore } from "./state/gameStore";
import { useWebSocket } from "./net/useWebSocket";
import { FarmCanvas } from "./game/FarmCanvas";
import { Lobby } from "./ui/Lobby";
import { HUD } from "./ui/HUD";
import { UpgradePanel } from "./ui/UpgradePanel";
import { ItemBar } from "./ui/ItemBar";
import { EndScreen } from "./ui/EndScreen";
import { ToastStack } from "./ui/ToastStack";
import { CenterToastStack } from "./ui/CenterToastStack";
import { CrystalBallWatcher } from "./ui/CrystalBallWatcher";

export default function App() {
  useWebSocket();

  const isInGame = useConnectionStore((s) => s.status === "in_game");
  const gamePhase = useGameStore((s) => s.game?.phase);

  return (
    <div className="relative w-full h-dvh bg-green-950 flex flex-col items-center justify-center gap-6">
      <FarmCanvas />
      {!isInGame && <Lobby />}
      {isInGame && <HUD />}
      {isInGame && gamePhase !== "ended" && <UpgradePanel />}
      {isInGame && gamePhase !== "ended" && <ItemBar />}
      {isInGame && gamePhase === "ended" && <EndScreen />}
      <ToastStack />
      <CenterToastStack />
      <CrystalBallWatcher />
    </div>
  );
}
