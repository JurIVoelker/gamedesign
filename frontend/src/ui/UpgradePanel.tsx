import type { ToolId } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";

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

// Crows constants
const MAX_CROW_LEVEL = 3;
const CROW_UPGRADE_COSTS = [30, 80, 200];
const CROW_SEND_COST = 15;
const CROW_COOLDOWN_MS = 45_000;
const CROW_EAT_DURATIONS_MS = [12_000, 12_000, 8_000]; // time to eat a full field per level

// Thief constants
const MAX_THIEF_LEVEL = 3;
const THIEF_UPGRADE_COSTS = [40, 100, 250];
const THIEF_SEND_COSTS = [20, 35, 55];
const THIEF_COOLDOWN_MS = 60_000;
const THIEF_WAIT_MAX_MS = [20_000, 25_000, 30_000];
const THIEF_STEAL_DURATION_MS = [15_000, 20_000, 25_000];
const THIEF_STEAL_PER_SEC = [2, 3, 4.5];
const THIEF_MAX_STOLEN = [30, 60, 112];
const THIEF_DISGUISE_LABELS = ["None", "Partial", "Full"];

function dispatchUpgrade(toolId: ToolId): void {
  useConnectionStore.getState().send?.({
    type: "player_action",
    action: { kind: "UpgradeTool", toolId },
  });
}

// field count per crow level (index = level - 1)
const CROW_FIELD_COUNTS = [1, 2, 2];

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

function CrowsHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_CROW_LEVEL;
  const fieldCount = level > 0 ? CROW_FIELD_COUNTS[level - 1] : 0;
  const eatMs = level > 0 ? CROW_EAT_DURATIONS_MS[level - 1] : CROW_EAT_DURATIONS_MS[0];

  return (
    <HoverCardWrapper>
      {level === 0 ? (
        <div className="text-stone-400">Unlock to send crows to opponent fields</div>
      ) : (
        <>
          <div className="text-stone-200">
            Targets: <span className="text-amber-300">{fieldCount} field{fieldCount > 1 ? "s" : ""}</span>
            {level === MAX_CROW_LEVEL && <span className="text-stone-400 ml-1">(ripest)</span>}
          </div>
          <div className="text-stone-200 mt-0.5">
            Eats full field in:{" "}
            <span className="text-amber-300">{formatSeconds(eatMs)}</span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Send cost: <span className="text-amber-300">{CROW_SEND_COST}g</span>
            <span className="text-stone-500 ml-1">· cooldown {formatSeconds(CROW_COOLDOWN_MS)}</span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-stone-400 mt-1">
          Lv{level + 1}: eats in{" "}
          <span className="text-green-400">{formatSeconds(CROW_EAT_DURATIONS_MS[level])}</span>
          {level + 1 >= 2 && <span className="text-stone-500 ml-1">· 2 fields</span>}
          {level + 1 === MAX_CROW_LEVEL && <span className="text-stone-500 ml-1">· targets ripest</span>}
        </div>
      )}
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
      ) : toolId === "sow" || toolId === "harvest" ? (
        <SpeedHoverCard toolId={toolId} level={level} />
      ) : null}
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

function CrowsCard({
  level,
  gold,
  cooldownUntil,
}: {
  level: number;
  gold: number;
  cooldownUntil: number;
}) {
  const isMaxed = level >= MAX_CROW_LEVEL;
  const nextCost = isMaxed ? null : CROW_UPGRADE_COSTS[level];
  const canAffordUpgrade = nextCost !== null && gold >= nextCost;
  const upgradeDisabled = isMaxed || !canAffordUpgrade;

  const now = Date.now();
  const onCooldown = cooldownUntil > now;
  const cooldownSec = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const canSend = level > 0 && !onCooldown && gold >= CROW_SEND_COST;

  const isTargeting = useTargetingStore((s) => s.active);
  const chosenCount = useTargetingStore((s) => s.chosen.length);
  const targetingStart = useTargetingStore((s) => s.start);
  const targetingCancel = useTargetingStore((s) => s.cancel);
  const fieldCount = level > 0 ? CROW_FIELD_COUNTS[level - 1] : 0;
  const remaining = fieldCount - chosenCount;

  const handleSendClick = () => {
    if (isTargeting) {
      targetingCancel();
      return;
    }
    targetingStart(fieldCount, (indices) => {
      useConnectionStore.getState().send?.({
        type: "player_action",
        action: { kind: "SendCrows", targetFieldIndices: indices },
      });
    });
  };

  return (
    <div className="relative group">
      <CrowsHoverCard level={level} />
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-2 text-stone-300 text-xs font-mono flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="font-bold tracking-widest">CROWS</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_CROW_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < level ? "bg-red-400" : "bg-stone-700"
                }`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("crows")}
          className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
            upgradeDisabled
              ? "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
              : "border-amber-400 text-amber-300 hover:bg-amber-300/10 cursor-pointer"
          }`}
        >
          {isMaxed ? "MAXED" : level === 0 ? `Unlock  ${nextCost}g` : `Upgrade  ${nextCost}g`}
        </button>

        {level > 0 && (
          <button
            type="button"
            disabled={!isTargeting && !canSend}
            onClick={handleSendClick}
            className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
              isTargeting
                ? "border-orange-400 text-orange-300 hover:bg-orange-300/10 cursor-pointer animate-pulse"
                : canSend
                  ? "border-red-400 text-red-300 hover:bg-red-300/10 cursor-pointer"
                  : "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
            }`}
          >
            {isTargeting
              ? `Pick field  ${remaining}`
              : onCooldown
                ? `Send  ${cooldownSec}s`
                : `Send  ${CROW_SEND_COST}g`}
          </button>
        )}
      </div>
    </div>
  );
}

function ThiefHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_THIEF_LEVEL;
  const lvIdx = level - 1;

  return (
    <HoverCardWrapper>
      {level === 0 ? (
        <div className="text-stone-400">Unlock to send a thief to steal opponent gold</div>
      ) : (
        <>
          <div className="text-stone-200">
            Steals: <span className="text-amber-300">{THIEF_STEAL_PER_SEC[lvIdx]}g/s</span>
            <span className="text-stone-500 ml-1">· max {THIEF_MAX_STOLEN[lvIdx]}g</span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Window: <span className="text-amber-300">{formatSeconds(THIEF_STEAL_DURATION_MS[lvIdx])}</span>
            <span className="text-stone-500 ml-1">· entry ≤{formatSeconds(THIEF_WAIT_MAX_MS[lvIdx])}</span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Disguise: <span className="text-amber-300">{THIEF_DISGUISE_LABELS[lvIdx]}</span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Send cost: <span className="text-amber-300">{THIEF_SEND_COSTS[lvIdx]}g</span>
            <span className="text-stone-500 ml-1">· cooldown {formatSeconds(THIEF_COOLDOWN_MS)}</span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-stone-400 mt-1">
          Lv{level + 1}: {THIEF_STEAL_PER_SEC[level]}g/s · disguise {THIEF_DISGUISE_LABELS[level]}
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max level</div>}
    </HoverCardWrapper>
  );
}

function ThiefCard({
  level,
  gold,
  cooldownUntil,
  opponentHasThief,
}: {
  level: number;
  gold: number;
  cooldownUntil: number;
  opponentHasThief: boolean;
}) {
  const isMaxed = level >= MAX_THIEF_LEVEL;
  const nextCost = isMaxed ? null : THIEF_UPGRADE_COSTS[level];
  const canAffordUpgrade = nextCost !== null && gold >= nextCost;
  const upgradeDisabled = isMaxed || !canAffordUpgrade;

  const now = Date.now();
  const onCooldown = cooldownUntil > now;
  const cooldownSec = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const sendCost = level > 0 ? THIEF_SEND_COSTS[level - 1] : 0;
  const canSend = level > 0 && !onCooldown && gold >= sendCost && !opponentHasThief;

  const handleSend = () => {
    useConnectionStore.getState().send?.({
      type: "player_action",
      action: { kind: "SendThief" },
    });
  };

  return (
    <div className="relative group">
      <ThiefHoverCard level={level} />
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-2 text-stone-300 text-xs font-mono flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="font-bold tracking-widest">THIEF</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_THIEF_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < level ? "bg-purple-400" : "bg-stone-700"
                }`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("thief")}
          className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
            upgradeDisabled
              ? "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
              : "border-amber-400 text-amber-300 hover:bg-amber-300/10 cursor-pointer"
          }`}
        >
          {isMaxed ? "MAXED" : level === 0 ? `Unlock  ${nextCost}g` : `Upgrade  ${nextCost}g`}
        </button>

        {level > 0 && (
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
              canSend
                ? "border-purple-400 text-purple-300 hover:bg-purple-300/10 cursor-pointer"
                : "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
            }`}
          >
            {opponentHasThief
              ? "Busy"
              : onCooldown
                ? `Send  ${cooldownSec}s`
                : `Send  ${sendCost}g`}
          </button>
        )}
      </div>
    </div>
  );
}

export function UpgradePanel() {
  const game = useGameStore((s) => s.game);
  const playerId = useConnectionStore((s) => s.playerId);

  const me = playerId ? game?.players[playerId] : null;
  const opponent = playerId
    ? Object.values(game?.players ?? {}).find((p) => p.id !== playerId)
    : null;
  const gold = me?.gold ?? 0;
  const sowLevel = me?.tools.find((t) => t.id === "sow")?.level ?? 0;
  const harvestLevel = me?.tools.find((t) => t.id === "harvest")?.level ?? 0;
  const fertilizerLevel =
    me?.tools.find((t) => t.id === "fertilizer")?.level ?? 0;
  const crowsTool = me?.tools.find((t) => t.id === "crows");
  const crowsLevel = crowsTool?.level ?? 0;
  const crowsCooldownUntil = crowsTool?.cooldownUntil ?? 0;
  const thiefTool = me?.tools.find((t) => t.id === "thief");
  const thiefLevel = thiefTool?.level ?? 0;
  const thiefCooldownUntil = thiefTool?.cooldownUntil ?? 0;
  const opponentHasThief = opponent?.thiefAttack != null;

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
        <CrowsCard
          level={crowsLevel}
          gold={gold}
          cooldownUntil={crowsCooldownUntil}
        />
        <ThiefCard
          level={thiefLevel}
          gold={gold}
          cooldownUntil={thiefCooldownUntil}
          opponentHasThief={opponentHasThief}
        />
      </div>
    </div>
  );
}
