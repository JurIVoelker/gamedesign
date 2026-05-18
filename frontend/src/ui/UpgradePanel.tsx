import type { ToolId } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

// Sow / Harvest tool constants (mirrored from backend — shared/ is types-only)
const UPGRADE_SPEED_MULTIPLIERS = [1.0, 0.7, 0.4, 0.1];
const MAX_TOOL_LEVEL = 3;
const SOW_UPGRADE_COSTS = [50, 150, 400];
const HARVEST_UPGRADE_COSTS = [50, 150, 400];
const BASE_SOW_MS = 5_000;
const BASE_HARVEST_MS = 5_000;

// Fertilizer constants
const FERTILIZER_GROW_MULTIPLIERS = [1.0, 0.88, 0.77, 0.67, 0.57, 0.5];
const FERTILIZER_GOLD_MULTIPLIERS = [1.0, 1.12, 1.25, 1.4, 1.58, 1.8];
const MAX_FERTILIZER_LEVEL = 5;
const FERTILIZER_UPGRADE_COSTS = [100, 250, 500, 900, 1500];
const BASE_GROW_MS = 60_000;
const BASE_GOLD = 25;

function dispatchUpgrade(toolId: ToolId): void {
  useConnectionStore.getState().send?.({
    type: "player_action",
    action: { kind: "UpgradeTool", toolId },
  });
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function HoverCardWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10">
      <div className="bg-stone-900 border border-stone-600 rounded-lg px-3 py-2 text-xs font-mono shadow-lg">
        {children}
      </div>
      <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-stone-900 border-r border-b border-stone-600 rotate-45" />
    </div>
  );
}

function SpeedHoverCard({
  toolId,
  level,
}: {
  toolId: "sow" | "harvest";
  level: number;
}) {
  const baseMs = toolId === "sow" ? BASE_SOW_MS : BASE_HARVEST_MS;
  const currentMs = baseMs * UPGRADE_SPEED_MULTIPLIERS[level];
  const isMaxed = level >= MAX_TOOL_LEVEL;

  return (
    <HoverCardWrapper>
      <div className="text-stone-200">
        Now: <span className="text-amber-300">{formatSeconds(currentMs)}</span>
      </div>
      {!isMaxed && (
        <div className="text-stone-400 mt-1">
          {"→ "}
          <span className="text-green-400">
            {formatSeconds(baseMs * UPGRADE_SPEED_MULTIPLIERS[level + 1])}
          </span>
          <span className="text-stone-500 ml-1">
            (
            {Math.round(
              (1 -
                UPGRADE_SPEED_MULTIPLIERS[level + 1] /
                  UPGRADE_SPEED_MULTIPLIERS[level]) *
                100,
            )}
            % faster)
          </span>
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max level</div>}
    </HoverCardWrapper>
  );
}

function FertilizerHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_FERTILIZER_LEVEL;
  const currentGrowMs = BASE_GROW_MS * FERTILIZER_GROW_MULTIPLIERS[level];
  const currentGold = Math.round(
    BASE_GOLD * FERTILIZER_GOLD_MULTIPLIERS[level],
  );

  return (
    <HoverCardWrapper>
      <div className="text-stone-200">
        Grow:{" "}
        <span className="text-amber-300">{formatSeconds(currentGrowMs)}</span>
        {!isMaxed && (
          <>
            {" → "}
            <span className="text-green-400">
              {formatSeconds(
                BASE_GROW_MS * FERTILIZER_GROW_MULTIPLIERS[level + 1],
              )}
            </span>
          </>
        )}
      </div>
      <div className="text-stone-200 mt-0.5">
        Gold: <span className="text-amber-300">{currentGold}g</span>
        {!isMaxed && (
          <>
            {" → "}
            <span className="text-green-400">
              {Math.round(BASE_GOLD * FERTILIZER_GOLD_MULTIPLIERS[level + 1])}g
            </span>
          </>
        )}
      </div>
      {isMaxed && <div className="text-amber-300 mt-1">Max level</div>}
    </HoverCardWrapper>
  );
}

interface UpgradeCardProps {
  toolId: ToolId;
  label: string;
  level: number;
  gold: number;
  costs: number[];
  maxLevel: number;
}

function UpgradeCard({
  toolId,
  label,
  level,
  gold,
  costs,
  maxLevel,
}: UpgradeCardProps) {
  const isMaxed = level >= maxLevel;
  const nextCost = isMaxed ? null : costs[level];
  const canAfford = nextCost !== null && gold >= nextCost;
  const disabled = isMaxed || !canAfford;

  return (
    <div className="relative group">
      {toolId === "fertilizer" ? (
        <FertilizerHoverCard level={level} />
      ) : (
        <SpeedHoverCard toolId={toolId} level={level} />
      )}
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-2 text-stone-300 text-xs font-mono flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="font-bold tracking-widest">{label}</span>
          <span className="flex gap-1">
            {Array.from({ length: maxLevel }, (_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < level ? "bg-amber-300" : "bg-stone-700"
                }`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => dispatchUpgrade(toolId)}
          className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
            disabled
              ? "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
              : "border-amber-400 text-amber-300 hover:bg-amber-300/10 cursor-pointer"
          }`}
        >
          {isMaxed ? "MAXED" : `Upgrade  ${nextCost}g`}
        </button>
      </div>
    </div>
  );
}

export function UpgradePanel() {
  const game = useGameStore((s) => s.game);
  const playerId = useConnectionStore((s) => s.playerId);

  const me = playerId ? game?.players[playerId] : null;
  const gold = me?.gold ?? 0;
  const sowLevel = me?.tools.find((t) => t.id === "sow")?.level ?? 0;
  const harvestLevel = me?.tools.find((t) => t.id === "harvest")?.level ?? 0;
  const fertilizerLevel =
    me?.tools.find((t) => t.id === "fertilizer")?.level ?? 0;

  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
      <div className="flex gap-3 pointer-events-auto">
        <UpgradeCard
          toolId="sow"
          label="SOW"
          level={sowLevel}
          gold={gold}
          costs={SOW_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
        />
        <UpgradeCard
          toolId="harvest"
          label="HARVEST"
          level={harvestLevel}
          gold={gold}
          costs={HARVEST_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
        />
        <UpgradeCard
          toolId="fertilizer"
          label="FERTILIZER"
          level={fertilizerLevel}
          gold={gold}
          costs={FERTILIZER_UPGRADE_COSTS}
          maxLevel={MAX_FERTILIZER_LEVEL}
        />
      </div>
    </div>
  );
}
