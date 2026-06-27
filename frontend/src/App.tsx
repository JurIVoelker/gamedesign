import { useConnectionStore } from "./state/connectionStore";
import { useGameStore } from "./state/gameStore";
import { useTutorialStore } from "./state/tutorialStore";
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
import { TutorialOverlay } from "./ui/TutorialOverlay";
import { TutorialSpotlight } from "./ui/TutorialSpotlight";

export default function App() {
  useWebSocket();

  const isInGame = useConnectionStore((s) => s.status === "in_game");
  const gamePhase = useGameStore((s) => s.game?.phase);
  const tutorialActive = useTutorialStore((s) => s.active);

  return (
    <div className="relative w-full h-dvh bg-green-950 flex flex-col items-center justify-center gap-6">
      <FarmCanvas />
      {!isInGame && <Lobby />}
      {isInGame && <HUD />}
      {isInGame && gamePhase !== "ended" && <UpgradePanel />}
      {isInGame && gamePhase !== "ended" && <ItemBar />}
      {isInGame && gamePhase === "ended" && !tutorialActive && <EndScreen />}
      <ToastStack />
      <CenterToastStack />
      <CrystalBallWatcher />
      {tutorialActive && <TutorialOverlay />}
      <TutorialSpotlight />
    </div>
  );
}
