import type { ToolId } from "@gamedesign/shared";
import {
  UPGRADE_SPEED_MULTIPLIERS,
  MAX_TOOL_LEVEL,
  SOW_DURATION_MS,
  SOW_UPGRADE_COSTS,
  SOW_GROW_MULTIPLIERS,
  HARVEST_DURATION_MS,
  HARVEST_UPGRADE_COSTS,
  HARVEST_GOLD_MULTIPLIERS,
  FERTILIZER_GROW_MULTIPLIERS,
  FERTILIZER_GOLD_MULTIPLIERS,
  MAX_FERTILIZER_LEVEL,
  FERTILIZER_UPGRADE_COSTS,
  BASE_GROW_MS,
  GOLD_PER_HARVEST,
  CROW_LEVEL_CONFIG,
  MAX_CROW_LEVEL,
  CROW_UPGRADE_COSTS,
  CROW_SEND_COST,
  CROW_COOLDOWN_MS,
  THIEF_LEVELS,
  MAX_THIEF_LEVEL,
  THIEF_UPGRADE_COSTS,
  WEATHER_LEVELS,
  MAX_WEATHER_LEVEL,
  WEATHER_UPGRADE_COSTS,
} from "@gamedesign/shared";
import { useEffect, useState } from "react";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";
import { useTargetingStore } from "../state/targetingStore";

// Derived display arrays — computed from shared config so they stay in sync.
const CROW_EAT_DURATIONS_MS = CROW_LEVEL_CONFIG.map((c) =>
  Math.round(1 / c.eatRatePerMs),
);
const CROW_FIELD_COUNTS = CROW_LEVEL_CONFIG.map((c) => c.fieldCount);
const WEATHER_SEND_COSTS = WEATHER_LEVELS.map((l) => l.cost);
const WEATHER_SLOW_FACTORS = WEATHER_LEVELS.map((l) => l.slowFactor);
const WEATHER_ACTION_SLOW_FACTORS = WEATHER_LEVELS.map(
  (l) => l.actionSlowFactor,
);
const WEATHER_DURATION_MS = WEATHER_LEVELS[0].durationMs;
const WEATHER_COOLDOWN_MS = WEATHER_LEVELS[0].cooldownMs;
const THIEF_SEND_COSTS = THIEF_LEVELS.map((l) => l.cost);
const THIEF_STEAL_PER_SEC = THIEF_LEVELS.map((l) => l.stealPerSecond);
const THIEF_WAIT_MAX_MS = THIEF_LEVELS.map((l) => l.maxWaitMs);
const THIEF_STEAL_DURATION_MS = THIEF_LEVELS.map((l) => l.durationMs);
const THIEF_MAX_STOLEN = THIEF_LEVELS.map((l) =>
  Math.round((l.stealPerSecond * l.durationMs) / 1_000),
);
const THIEF_COOLDOWN_MS = THIEF_LEVELS[0].cooldownMs;
const DISGUISE_LABEL: Record<string, string> = {
  none: "Keine",
  partial: "Teilweise",
  full: "Vollständig",
};

function useNow(intervalMs = 1_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

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
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max pointer-events-none opacity-0 group-hover:opacity-100 z-10">
      <div className="hover-card-pixel">
        {children}
      </div>
    </div>
  );
}

function SowHoverCard({
  level,
  fertLevel = 0,
}: {
  level: number;
  fertLevel?: number;
}) {
  const isMaxed = level >= MAX_TOOL_LEVEL;
  const sowMs = SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level];
  const growMs =
    BASE_GROW_MS *
    SOW_GROW_MULTIPLIERS[level] *
    FERTILIZER_GROW_MULTIPLIERS[fertLevel];

  return (
    <HoverCardWrapper>
      <div className="text-parchment">
        Säen: <span className="text-gold">{formatSeconds(sowMs)}</span>
      </div>
      <div className="text-parchment mt-0.5">
        Wachstum:{" "}
        <span className="text-gold">{formatSeconds(growMs)}</span>
      </div>
      {!isMaxed && (
        <div className="text-muted-gold mt-1">
          {"→ "}
          <span className="text-green-400">
            {formatSeconds(
              SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1],
            )}
          </span>
          <span className="text-muted-gold ml-1">
            {"· Wachstum "}
            {formatSeconds(
              BASE_GROW_MS *
                SOW_GROW_MULTIPLIERS[level + 1] *
                FERTILIZER_GROW_MULTIPLIERS[fertLevel],
            )}
          </span>
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function HarvestHoverCard({
  level,
  fertLevel = 0,
}: {
  level: number;
  fertLevel?: number;
}) {
  const isMaxed = level >= MAX_TOOL_LEVEL;
  const harvestMs = HARVEST_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level];
  const goldPerHarvest = Math.round(
    GOLD_PER_HARVEST *
      HARVEST_GOLD_MULTIPLIERS[level] *
      FERTILIZER_GOLD_MULTIPLIERS[fertLevel],
  );
  const nextGold = Math.round(
    GOLD_PER_HARVEST *
      HARVEST_GOLD_MULTIPLIERS[level + 1] *
      FERTILIZER_GOLD_MULTIPLIERS[fertLevel],
  );

  return (
    <HoverCardWrapper>
      <div className="text-parchment">
        Ernten:{" "}
        <span className="text-gold">{formatSeconds(harvestMs)}</span>
      </div>
      <div className="text-parchment mt-0.5">
        Gold: <span className="text-gold">{goldPerHarvest}g</span>
      </div>
      {!isMaxed && (
        <div className="text-muted-gold mt-1">
          {"→ "}
          <span className="text-green-400">
            {formatSeconds(
              HARVEST_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1],
            )}
          </span>
          <span className="text-muted-gold ml-1">
            {"· "}
            {nextGold}g
          </span>
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function FertilizerHoverCard({
  level,
  sowLevel = 0,
  harvestLevel = 0,
}: {
  level: number;
  sowLevel?: number;
  harvestLevel?: number;
}) {
  const isMaxed = level >= MAX_FERTILIZER_LEVEL;
  const currentGrowMs =
    BASE_GROW_MS *
    FERTILIZER_GROW_MULTIPLIERS[level] *
    SOW_GROW_MULTIPLIERS[sowLevel];
  const currentGold = Math.round(
    GOLD_PER_HARVEST *
      FERTILIZER_GOLD_MULTIPLIERS[level] *
      HARVEST_GOLD_MULTIPLIERS[harvestLevel],
  );
  const nextGrowMs =
    BASE_GROW_MS *
    FERTILIZER_GROW_MULTIPLIERS[level + 1] *
    SOW_GROW_MULTIPLIERS[sowLevel];
  const nextGold = Math.round(
    GOLD_PER_HARVEST *
      FERTILIZER_GOLD_MULTIPLIERS[level + 1] *
      HARVEST_GOLD_MULTIPLIERS[harvestLevel],
  );

  return (
    <HoverCardWrapper>
      <div className="text-parchment">
        Wachstum:{" "}
        <span className="text-gold">{formatSeconds(currentGrowMs)}</span>
        {!isMaxed && (
          <>
            {" → "}
            <span className="text-green-400">{formatSeconds(nextGrowMs)}</span>
          </>
        )}
      </div>
      <div className="text-parchment mt-0.5">
        Gold: <span className="text-gold">{currentGold}g</span>
        {!isMaxed && (
          <>
            {" → "}
            <span className="text-green-400">{nextGold}g</span>
          </>
        )}
      </div>
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
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
        <div className="text-muted-gold">
          Freischalten um Krähen auf Gegnerfelder zu senden
        </div>
      ) : (
        <>
          <div className="text-parchment">
            Ziele:{" "}
            <span className="text-gold">
              {fieldCount} Feld{fieldCount > 1 ? "er" : ""}
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Frisst volles Feld in:{" "}
            <span className="text-gold">{formatSeconds(eatMs)}</span>
          </div>
          <div className="text-muted-gold mt-0.5">
            Frisch gesäte Felder (~0%) sofort zerstört
          </div>
          <div className="text-parchment mt-0.5">
            Sendekosten:{" "}
            <span className="text-gold">{CROW_SEND_COST}g</span>
            <span className="text-muted-gold ml-1">
              · Abklingzeit {formatSeconds(CROW_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-muted-gold mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            frisst in {formatSeconds(CROW_EAT_DURATIONS_MS[level])}
          </span>
          {level + 1 >= 2 && (
            <span className="text-muted-gold ml-1">· {CROW_FIELD_COUNTS[level]} Felder</span>
          )}
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
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
  fertLevel?: number;
  sowLevel?: number;
  harvestLevel?: number;
}

function UpgradeCard({
  toolId,
  label,
  level,
  gold,
  costs,
  maxLevel,
  fertLevel = 0,
  sowLevel = 0,
  harvestLevel = 0,
}: UpgradeCardProps) {
  const isMaxed = level >= maxLevel;
  const nextCost = isMaxed ? null : costs[level];
  const canAfford = nextCost !== null && gold >= nextCost;
  const disabled = isMaxed || !canAfford;

  return (
    <div className="relative group">
      {toolId === "fertilizer" ? (
        <FertilizerHoverCard
          level={level}
          sowLevel={sowLevel}
          harvestLevel={harvestLevel}
        />
      ) : toolId === "sow" ? (
        <SowHoverCard level={level} fertLevel={fertLevel} />
      ) : toolId === "harvest" ? (
        <HarvestHoverCard level={level} fertLevel={fertLevel} />
      ) : null}
      <div className="upgrade-card text-parchment flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="text-gold tracking-widest">{label}</span>
          <span className="flex gap-1">
            {Array.from({ length: maxLevel }, (_, i) => (
              <span
                key={i}
                className={`level-dot${i < level ? " filled-gold" : ""}`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => dispatchUpgrade(toolId)}
          className="btn-upgrade"
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
      <div className="upgrade-card text-parchment flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="text-gold tracking-widest">KRÄHEN</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_CROW_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`level-dot${i < level ? " filled-red" : ""}`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("crows")}
          className="btn-upgrade"
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
            className={`btn-upgrade-action${isTargeting ? " targeting" : ""}`}
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
        <div className="text-muted-gold">
          Freischalten um einen Dieb zu schicken der Gold stiehlt
        </div>
      ) : (
        <>
          <div className="text-parchment">
            Stiehlt:{" "}
            <span className="text-gold">
              {THIEF_STEAL_PER_SEC[lvIdx]}g/s
            </span>
            <span className="text-muted-gold ml-1">
              · max. {THIEF_MAX_STOLEN[lvIdx]}g
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Stehldauer:{" "}
            <span className="text-gold">
              {formatSeconds(THIEF_STEAL_DURATION_MS[lvIdx])}
            </span>
            <span className="text-muted-gold ml-1">
              · Eintritt ≤{formatSeconds(THIEF_WAIT_MAX_MS[lvIdx])}
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Tarnung:{" "}
            <span className="text-gold">
              {DISGUISE_LABEL[THIEF_LEVELS[lvIdx].disguise]}
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Sendekosten:{" "}
            <span className="text-gold">{THIEF_SEND_COSTS[lvIdx]}g</span>
            <span className="text-muted-gold ml-1">
              · Abklingzeit {formatSeconds(THIEF_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-muted-gold mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            {THIEF_STEAL_PER_SEC[level]}g/s
          </span>
          {" · "}Tarnung {DISGUISE_LABEL[THIEF_LEVELS[level].disguise]}
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
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
      <div className="upgrade-card text-parchment flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="text-gold tracking-widest">DIEB</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_THIEF_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`level-dot${i < level ? " filled-purple" : ""}`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("thief")}
          className="btn-upgrade"
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
            className="btn-upgrade-action"
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
        <div className="text-muted-gold">
          Freischalten um Stürme zu senden die Gegnerernten verlangsamen
        </div>
      ) : (
        <>
          <div className="text-parchment">
            Verlangsamt Wachstum:{" "}
            <span className="text-gold">
              -{Math.round(WEATHER_SLOW_FACTORS[lvIdx] * 100)}%
            </span>
            {level === MAX_WEATHER_LEVEL && (
              <span className="text-muted-gold ml-1">+ Blitz</span>
            )}
          </div>
          <div className="text-parchment mt-0.5">
            Verlangsamt Säen/Ernten:{" "}
            <span className="text-gold">
              -{Math.round(WEATHER_ACTION_SLOW_FACTORS[lvIdx] * 100)}%
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Dauer:{" "}
            <span className="text-gold">
              {formatSeconds(WEATHER_DURATION_MS)}
            </span>
          </div>
          <div className="text-parchment mt-0.5">
            Sendekosten:{" "}
            <span className="text-gold">{WEATHER_SEND_COSTS[lvIdx]}g</span>
            <span className="text-muted-gold ml-1">
              · Abklingzeit {formatSeconds(WEATHER_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-muted-gold mt-1">
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
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
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
      <div className="upgrade-card text-parchment flex flex-col items-center gap-2 min-w-35">
        <div className="flex items-center justify-between w-full">
          <span className="text-gold tracking-widest">UNWETTER</span>
          <span className="flex gap-1">
            {Array.from({ length: MAX_WEATHER_LEVEL }, (_, i) => (
              <span
                key={i}
                className={`level-dot${i < level ? " filled-sky" : ""}`}
              />
            ))}
          </span>
        </div>

        <button
          type="button"
          disabled={upgradeDisabled}
          onClick={() => dispatchUpgrade("weather")}
          className="btn-upgrade"
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
            className="btn-upgrade-action"
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
    <div className="absolute inset-bottom-safe left-0 right-0 flex justify-center pointer-events-none">
      <div className="flex gap-3 pointer-events-auto">
        <UpgradeCard
          toolId="sow"
          label="SÄEN"
          level={sowLevel}
          gold={gold}
          costs={SOW_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
          fertLevel={fertilizerLevel}
        />
        <UpgradeCard
          toolId="harvest"
          label="ERNTEN"
          level={harvestLevel}
          gold={gold}
          costs={HARVEST_UPGRADE_COSTS}
          maxLevel={MAX_TOOL_LEVEL}
          fertLevel={fertilizerLevel}
        />
        <UpgradeCard
          toolId="fertilizer"
          label="DÜNGER"
          level={fertilizerLevel}
          gold={gold}
          costs={FERTILIZER_UPGRADE_COSTS}
          maxLevel={MAX_FERTILIZER_LEVEL}
          sowLevel={sowLevel}
          harvestLevel={harvestLevel}
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
