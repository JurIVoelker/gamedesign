import type { ToolId } from "@gamedesign/shared";
import { useEffect, useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";
import {
  CROW_LEVEL_CONFIG,
  THIEF_LEVELS,
  WEATHER_LEVELS,
} from "../../../backend/src/constants";

function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// Sow / Harvest constants (mirrored from backend — shared/ is types-only)
const UPGRADE_SPEED_MULTIPLIERS = [1.0, 0.7, 0.4, 0.1];
const MAX_TOOL_LEVEL = 3;
const SOW_UPGRADE_COSTS = [50, 150, 200];
const SOW_GROW_MULTIPLIERS = [1.0, 0.92, 0.84, 0.76];
const HARVEST_UPGRADE_COSTS = [50, 150, 200];
const HARVEST_GOLD_MULTIPLIERS = [1.0, 1.1, 1.2, 1.3];
const BASE_SOW_MS = 5_000;
const BASE_HARVEST_MS = 5_000;

// Fertilizer constants
const FERTILIZER_GROW_MULTIPLIERS = [1.0, 0.88, 0.77, 0.67, 0.57, 0.5];
const FERTILIZER_GOLD_MULTIPLIERS = [1.0, 1.12, 1.25, 1.4, 1.58, 1.8];
const MAX_FERTILIZER_LEVEL = 5;
const FERTILIZER_UPGRADE_COSTS = [100, 250, 500, 900, 1500];
const BASE_GROW_MS = 60_000;
const BASE_GOLD = 40;

// Crows constants
const MAX_CROW_LEVEL = 3;
const CROW_UPGRADE_COSTS = [30, 80, 200];
const CROW_SEND_COST = 10;
const CROW_COOLDOWN_MS = 45_000;
const CROW_EAT_DURATIONS_MS = [12_000, 12_000, 8_000];
const CROW_FIELD_COUNTS = [1, 2, 2];

// Weather constants
const MAX_WEATHER_LEVEL = 3;
const WEATHER_UPGRADE_COSTS = [30, 80, 200];
const WEATHER_SEND_COSTS = [15, 28, 48];
const WEATHER_COOLDOWN_MS = 70_000;
const WEATHER_DURATION_MS = 40_000;
const WEATHER_SLOW_FACTORS = [0.3, 0.5, 0.5];
const WEATHER_ACTION_SLOW_FACTORS = [0.55, 0.7, 0.7];

// Thief constants
const MAX_THIEF_LEVEL = 3;
const THIEF_UPGRADE_COSTS = [40, 100, 250];
const THIEF_SEND_COSTS = [20, 35, 55];
const THIEF_COOLDOWN_MS = 60_000;
const THIEF_WAIT_MAX_MS = [20_000, 25_000, 30_000];
const THIEF_STEAL_DURATION_MS = [15_000, 20_000, 25_000];
const THIEF_STEAL_PER_SEC = [
  THIEF_LEVELS[0].stealPerSecond,
  THIEF_LEVELS[1].stealPerSecond,
  THIEF_LEVELS[2].stealPerSecond,
];
const THIEF_MAX_STOLEN = [45, 90, 150];
const THIEF_DISGUISE_LABELS = ["Keine", "Teilweise", "Vollständig"];

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

function SowHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_TOOL_LEVEL;
  const sowMs = BASE_SOW_MS * UPGRADE_SPEED_MULTIPLIERS[level];
  const growReductionPct = Math.round((1 - SOW_GROW_MULTIPLIERS[level]) * 100);
  const growMs = BASE_GROW_MS * SOW_GROW_MULTIPLIERS[level];

  return (
    <HoverCardWrapper>
      <div className="text-stone-200">
        Säen: <span className="text-amber-300">{formatSeconds(sowMs)}</span>
      </div>
      <div className="text-stone-200 mt-0.5">
        Wachstum:{" "}
        <span className="text-amber-300">
          {growReductionPct > 0 ? `-${growReductionPct}%` : "–"} (
          {formatSeconds(growMs)})
        </span>
      </div>
      {!isMaxed && (
        <div className="text-stone-400 mt-1">
          {"→ "}
          <span className="text-green-400">
            {formatSeconds(BASE_SOW_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1])}
          </span>
          <span className="text-stone-500 ml-1">
            + {Math.round((1 - SOW_GROW_MULTIPLIERS[level + 1]) * 100)}%
            schnelleres Wachstum
          </span>
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function HarvestHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_TOOL_LEVEL;
  const harvestMs = BASE_HARVEST_MS * UPGRADE_SPEED_MULTIPLIERS[level];
  const goldBonusPct = Math.round((HARVEST_GOLD_MULTIPLIERS[level] - 1) * 100);
  const goldPerHarvest = Math.round(
    BASE_GOLD * HARVEST_GOLD_MULTIPLIERS[level],
  );

  return (
    <HoverCardWrapper>
      <div className="text-stone-200">
        Ernten:{" "}
        <span className="text-amber-300">{formatSeconds(harvestMs)}</span>
      </div>
      <div className="text-stone-200 mt-0.5">
        Gold-Bonus:{" "}
        <span className="text-amber-300">
          {goldBonusPct > 0 ? `+${goldBonusPct}%` : "–"} ({goldPerHarvest}g)
        </span>
      </div>
      {!isMaxed && (
        <div className="text-stone-400 mt-1">
          {"→ "}
          <span className="text-green-400">
            {formatSeconds(
              BASE_HARVEST_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1],
            )}
          </span>
          <span className="text-stone-500 ml-1">
            · +{Math.round((HARVEST_GOLD_MULTIPLIERS[level + 1] - 1) * 100)}%
            Gold
          </span>
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
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
        Wachstum:{" "}
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
      <div className="text-stone-500 mt-1 text-[10px]">
        Stapelt mit Säen &amp; Ernte-Upgrades
      </div>
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function CrowsHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_CROW_LEVEL;
  const fieldCount = level > 0 ? CROW_FIELD_COUNTS[level - 1] : 0;
  const eatMs =
    level > 0 ? CROW_EAT_DURATIONS_MS[level - 1] : CROW_EAT_DURATIONS_MS[0];

  return (
    <HoverCardWrapper>
      {level === 0 ? (
        <div className="text-stone-400">
          Freischalten um Krähen auf Gegnerfelder zu senden
        </div>
      ) : (
        <>
          <div className="text-stone-200">
            Ziele:{" "}
            <span className="text-amber-300">
              {fieldCount} Feld{fieldCount > 1 ? "er" : ""}
            </span>
            {level === MAX_CROW_LEVEL && (
              <span className="text-stone-400 ml-1">(reifste zuerst)</span>
            )}
          </div>
          <div className="text-stone-200 mt-0.5">
            Frisst volles Feld in:{" "}
            <span className="text-amber-300">{formatSeconds(eatMs)}</span>
          </div>
          <div className="text-stone-400 mt-0.5 text-[10px]">
            Frisch gesäte Felder (~0%) sofort zerstört
          </div>
          <div className="text-stone-200 mt-0.5">
            Sendekosten:{" "}
            <span className="text-amber-300">{CROW_SEND_COST}g</span>
            <span className="text-stone-500 ml-1">
              · Abklingzeit {formatSeconds(CROW_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-stone-400 mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            frisst in {formatSeconds(CROW_EAT_DURATIONS_MS[level])}
          </span>
          {level + 1 >= 2 && (
            <span className="text-stone-500 ml-1">· 2 Felder</span>
          )}
          {level + 1 === MAX_CROW_LEVEL && (
            <span className="text-stone-500 ml-1">· zielt auf reifste</span>
          )}
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
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
      ) : toolId === "sow" ? (
        <SowHoverCard level={level} />
      ) : toolId === "harvest" ? (
        <HarvestHoverCard level={level} />
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
          {isMaxed ? "MAXIMAL" : `Aufwerten  ${nextCost}g`}
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

  const now = useNow();
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
          <span className="font-bold tracking-widest">KRÄHEN</span>
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
          {isMaxed
            ? "MAXIMAL"
            : level === 0
              ? `Freischalten  ${nextCost}g`
              : `Aufwerten  ${nextCost}g`}
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
              ? `Feld wählen  ${remaining}`
              : onCooldown
                ? `Abkling.  ${cooldownSec}s`
                : `Senden  ${CROW_SEND_COST}g`}
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
        <div className="text-stone-400">
          Freischalten um einen Dieb zu schicken der Gold stiehlt
        </div>
      ) : (
        <>
          <div className="text-stone-200">
            Stiehlt:{" "}
            <span className="text-amber-300">
              {THIEF_STEAL_PER_SEC[lvIdx]}g/s
            </span>
            <span className="text-stone-500 ml-1">
              · max. {THIEF_MAX_STOLEN[lvIdx]}g
            </span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Stehldauer:{" "}
            <span className="text-amber-300">
              {formatSeconds(THIEF_STEAL_DURATION_MS[lvIdx])}
            </span>
            <span className="text-stone-500 ml-1">
              · Eintritt ≤{formatSeconds(THIEF_WAIT_MAX_MS[lvIdx])}
            </span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Tarnung:{" "}
            <span className="text-amber-300">
              {THIEF_DISGUISE_LABELS[lvIdx]}
            </span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Sendekosten:{" "}
            <span className="text-amber-300">{THIEF_SEND_COSTS[lvIdx]}g</span>
            <span className="text-stone-500 ml-1">
              · Abklingzeit {formatSeconds(THIEF_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-stone-400 mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            {THIEF_STEAL_PER_SEC[level]}g/s
          </span>
          {" · "}Tarnung {THIEF_DISGUISE_LABELS[level]}
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
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

  const now = useNow();
  const onCooldown = cooldownUntil > now;
  const cooldownSec = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const sendCost = level > 0 ? THIEF_SEND_COSTS[level - 1] : 0;
  const canSend =
    level > 0 && !onCooldown && gold >= sendCost && !opponentHasThief;

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
          <span className="font-bold tracking-widest">DIEB</span>
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
          {isMaxed
            ? "MAXIMAL"
            : level === 0
              ? `Freischalten  ${nextCost}g`
              : `Aufwerten  ${nextCost}g`}
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
              ? "Besetzt"
              : onCooldown
                ? `Abkling.  ${cooldownSec}s`
                : `Senden  ${sendCost}g`}
          </button>
        )}
      </div>
    </div>
  );
}

function WeatherHoverCard({ level }: { level: number }) {
  const isMaxed = level >= MAX_WEATHER_LEVEL;
  const lvIdx = level - 1;

  return (
    <HoverCardWrapper>
      {level === 0 ? (
        <div className="text-stone-400">
          Freischalten um Stürme zu senden die Gegnerernten verlangsamen
        </div>
      ) : (
        <>
          <div className="text-stone-200">
            Verlangsamt Wachstum:{" "}
            <span className="text-amber-300">
              -{Math.round(WEATHER_SLOW_FACTORS[lvIdx] * 100)}%
            </span>
            {level === MAX_WEATHER_LEVEL && (
              <span className="text-stone-400 ml-1">+ Blitz</span>
            )}
          </div>
          <div className="text-stone-200 mt-0.5">
            Verlangsamt Säen/Ernten:{" "}
            <span className="text-amber-300">
              -{Math.round(WEATHER_ACTION_SLOW_FACTORS[lvIdx] * 100)}%
            </span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Dauer:{" "}
            <span className="text-amber-300">
              {formatSeconds(WEATHER_DURATION_MS)}
            </span>
          </div>
          <div className="text-stone-200 mt-0.5">
            Sendekosten:{" "}
            <span className="text-amber-300">{WEATHER_SEND_COSTS[lvIdx]}g</span>
            <span className="text-stone-500 ml-1">
              · Abklingzeit {formatSeconds(WEATHER_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-stone-400 mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            -{Math.round(WEATHER_SLOW_FACTORS[level] * 100)}% Wachstum
          </span>
          {" · "}-{Math.round(WEATHER_ACTION_SLOW_FACTORS[level] * 100)}%
          Aktionen
          {level + 1 === MAX_WEATHER_LEVEL && (
            <span className="ml-1">· Blitz</span>
          )}
        </div>
      )}
      {isMaxed && <div className="text-amber-300 mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function WeatherCard({
  level,
  gold,
  cooldownUntil,
  opponentHasWeather,
}: {
  level: number;
  gold: number;
  cooldownUntil: number;
  opponentHasWeather: boolean;
}) {
  const isMaxed = level >= MAX_WEATHER_LEVEL;
  const nextCost = isMaxed ? null : WEATHER_UPGRADE_COSTS[level];
  const canAffordUpgrade = nextCost !== null && gold >= nextCost;
  const upgradeDisabled = isMaxed || !canAffordUpgrade;

  const now = useNow();
  const onCooldown = cooldownUntil > now;
  const cooldownSec = onCooldown ? Math.ceil((cooldownUntil - now) / 1000) : 0;
  const sendCost = level > 0 ? WEATHER_SEND_COSTS[level - 1] : 0;
  const canSend =
    level > 0 && !onCooldown && gold >= sendCost && !opponentHasWeather;

  const handleSend = () => {
    useConnectionStore.getState().send?.({
      type: "player_action",
      action: { kind: "SendWeather" },
    });
  };

  return (
    <div className="relative group">
      <WeatherHoverCard level={level} />
      <div className="bg-stone-900/80 border border-stone-600 rounded-lg px-4 py-2 text-stone-300 text-xs font-mono flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="font-bold tracking-widest">STURM</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_WEATHER_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  i < level ? "bg-sky-400" : "bg-stone-700"
                }`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("weather")}
          className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
            upgradeDisabled
              ? "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
              : "border-amber-400 text-amber-300 hover:bg-amber-300/10 cursor-pointer"
          }`}
        >
          {isMaxed
            ? "MAXIMAL"
            : level === 0
              ? `Freischalten  ${nextCost}g`
              : `Aufwerten  ${nextCost}g`}
        </button>

        {level > 0 && (
          <button
            type="button"
            disabled={!canSend}
            onClick={handleSend}
            className={`w-full rounded border px-3 py-1 font-mono text-xs transition-colors ${
              canSend
                ? "border-sky-400 text-sky-300 hover:bg-sky-300/10 cursor-pointer"
                : "border-stone-700 text-stone-500 cursor-not-allowed opacity-50"
            }`}
          >
            {opponentHasWeather
              ? "Aktiv"
              : onCooldown
                ? `Abkling.  ${cooldownSec}s`
                : `Senden  ${sendCost}g`}
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
  const weatherTool = me?.tools.find((t) => t.id === "weather");
  const weatherLevel = weatherTool?.level ?? 0;
  const weatherCooldownUntil = weatherTool?.cooldownUntil ?? 0;
  const opponentHasWeather = opponent?.weatherEffect != null;

  return (
    <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
      <div className="flex gap-3 pointer-events-auto">
        <UpgradeCard
          toolId="sow"
          label="SÄEN"
          level={sowLevel}
          gold={gold}
          costs={SOW_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
        />
        <UpgradeCard
          toolId="harvest"
          label="ERNTEN"
          level={harvestLevel}
          gold={gold}
          costs={HARVEST_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
        />
        <UpgradeCard
          toolId="fertilizer"
          label="DÜNGER"
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
        <WeatherCard
          level={weatherLevel}
          gold={gold}
          cooldownUntil={weatherCooldownUntil}
          opponentHasWeather={opponentHasWeather}
        />
      </div>
    </div>
  );
}
