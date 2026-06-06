import { useState } from "react";
import { GameOver } from "./GameOver";
import { StatsPanel } from "./StatsPanel";

export function EndScreen() {
  const [tab, setTab] = useState<"result" | "stats">("result");

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-30">
      <div
        className="panel-pixel text-parchment flex flex-col"
        style={{ width: 480, maxHeight: "90dvh", padding: "24px" }}
      >
        <div className="flex gap-2 mb-5">
          <button
            className={tab === "result" ? "btn-pixel" : "btn-pixel-secondary"}
            onClick={() => setTab("result")}
          >
            Ergebnis
          </button>
          <button
            className={tab === "stats" ? "btn-pixel" : "btn-pixel-secondary"}
            onClick={() => setTab("stats")}
          >
            Statistiken
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {tab === "result" ? <GameOver /> : <StatsPanel />}
        </div>
      </div>
    </div>
  );
}
