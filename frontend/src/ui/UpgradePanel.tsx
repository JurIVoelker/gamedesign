import type { ToolId } from "@gamedesign/shared";
import {
  UPGRADE_SPEED_MULTIPLIERS,
  MAX_TOOL_LEVEL,
  SOW_DURATION_MS,
  HARVEST_DURATION_MS,
  TOOLS_UPGRADE_COSTS,
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
import { useRevealedSurfaces } from "../state/tutorialStore";

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

function HoverCardWrapper({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-max pointer-events-none opacity-0 group-hover:opacity-100 z-10">
      <div className="hover-card-pixel">
        <div className="hover-card-header">{title}</div>
        <div className="hover-card-body">{children}</div>
      </div>
    </div>
  );
}

function ToolsHoverCard({ level, title }: { level: number; title: string }) {
  const isMaxed = level >= MAX_TOOL_LEVEL;
  const sowMs = SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level];
  const harvestMs = HARVEST_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level];

  return (
    <HoverCardWrapper title={title}>
      <div className="text-parchment">
        Säen: <span className="text-gold">{formatSeconds(sowMs)}</span>
      </div>
      <div className="text-parchment mt-0.5">
        Ernten: <span className="text-gold">{formatSeconds(harvestMs)}</span>
      </div>
      {!isMaxed && (
        <div className="text-green-400 mt-1">
          {"Lv" + (level + 1) + ": Säen "}
          <span className="text-green-400">
            {formatSeconds(
              SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1],
            )}
          </span>
          {", Ernten "}
          <span className="text-green-400">
            {formatSeconds(
              HARVEST_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level + 1],
            )}
          </span>
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function FertilizerHoverCard({
  level,
  title,
}: {
  level: number;
  title: string;
}) {
  const isMaxed = level >= MAX_FERTILIZER_LEVEL;
  const currentGrowMs = BASE_GROW_MS * FERTILIZER_GROW_MULTIPLIERS[level];
  const currentGold = Math.round(
    GOLD_PER_HARVEST * FERTILIZER_GOLD_MULTIPLIERS[level],
  );
  const nextGrowMs = BASE_GROW_MS * FERTILIZER_GROW_MULTIPLIERS[level + 1];
  const nextGold = Math.round(
    GOLD_PER_HARVEST * FERTILIZER_GOLD_MULTIPLIERS[level + 1],
  );

  return (
    <HoverCardWrapper title={title}>
      <div className="text-parchment">
        Wachstum:{" "}
        <span className="text-gold">{formatSeconds(currentGrowMs)}</span>
      </div>
      <div className="text-parchment mt-0.5">
        Gold: <span className="text-gold">{currentGold}g</span>
      </div>
      {!isMaxed && (
        <div className="text-green-400 mt-1">
          {"Lv" + (level + 1) + ": Wachstum "}
          <span className="text-green-400">{formatSeconds(nextGrowMs)}</span>
          {", Gold "}
          <span className="text-green-400">{nextGold}g</span>
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function CrowsHoverCard({ level, title }: { level: number; title: string }) {
  const isMaxed = level >= MAX_CROW_LEVEL;
  const fieldCount = level > 0 ? CROW_FIELD_COUNTS[level - 1] : 0;
  const eatMs =
    level > 0 ? CROW_EAT_DURATIONS_MS[level - 1] : CROW_EAT_DURATIONS_MS[0];

  return (
    <HoverCardWrapper title={title}>
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
            Sendekosten: <span className="text-gold">{CROW_SEND_COST}g</span>
            <span className="text-muted-gold ml-1">
              · Abklingzeit {formatSeconds(CROW_COOLDOWN_MS)}
            </span>
          </div>
        </>
      )}
      {!isMaxed && level > 0 && (
        <div className="text-green-400 mt-1">
          Lv{level + 1}:{" "}
          <span className="text-green-400">
            frisst in {formatSeconds(CROW_EAT_DURATIONS_MS[level])}
          </span>
          {level + 1 >= 2 && (
            <span className="ml-1">· {CROW_FIELD_COUNTS[level]} Felder</span>
          )}
        </div>
      )}
      {isMaxed && <div className="text-gold mt-1">Max. Stufe</div>}
    </HoverCardWrapper>
  );
}

function ThiefHoverCard({ level, title }: { level: number; title: string }) {
  const isMaxed = level >= MAX_THIEF_LEVEL;
  const lvIdx = level - 1;

  return (
    <HoverCardWrapper title={title}>
      {level === 0 ? (
        <div className="text-muted-gold">
          Freischalten um einen Dieb zu schicken der Gold stiehlt
        </div>
      ) : (
        <>
          <div className="text-parchment">
            Stiehlt:{" "}
            <span className="text-gold">{THIEF_STEAL_PER_SEC[lvIdx]}g/s</span>
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
        <div className="text-green-400 mt-1">
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

function WeatherHoverCard({ level, title }: { level: number; title: string }) {
  const isMaxed = level >= MAX_WEATHER_LEVEL;
  const lvIdx = level - 1;

  return (
    <HoverCardWrapper title={title}>
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
        <div className="text-green-400 mt-1">
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

// ── Layout helpers ────────────────────────────────────────────────────────────

function LevelSegs({
  maxLevel,
  level,
  color,
}: {
  maxLevel: number;
  level: number;
  color: "gold" | "red" | "purple" | "sky";
}) {
  return (
    <div className="level-segs">
      {Array.from({ length: maxLevel }, (_, i) => (
        <div
          key={i}
          className={`level-seg${i < level ? ` seg-${color}` : ""}`}
        />
      ))}
    </div>
  );
}

function CooldownPanel({
  cooldownUntil,
  now,
  totalMs,
}: {
  cooldownUntil: number;
  now: number;
  totalMs: number;
}) {
  const remaining = Math.max(0, cooldownUntil - now);
  return (
    <div className="cooldown-panel">
      <div className="cooldown-top">
        <span className="cooldown-label">ABKLINGZEIT</span>
        <span className="cooldown-secs">{(remaining / 1000).toFixed(1)}s</span>
      </div>
      <div className="cooldown-track">
        <div
          className="cooldown-fill"
          style={{ width: `${Math.max(0, (remaining / totalMs) * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ── Cards ─────────────────────────────────────────────────────────────────────

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

  let statText: string;
  if (toolId === "tools") {
    const speedMs = SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[level];
    statText = `SÄEN/ERNTEN: ${(speedMs / 1000).toFixed(1)}S`;
  } else {
    const gold = Math.round(
      GOLD_PER_HARVEST * FERTILIZER_GOLD_MULTIPLIERS[level],
    );
    const growSec = Math.round(
      (BASE_GROW_MS * FERTILIZER_GROW_MULTIPLIERS[level]) / 1000,
    );
    statText = `${gold}g IN ${growSec}s`;
  }

  return (
    <div className="relative group">
      {toolId === "fertilizer" ? (
        <FertilizerHoverCard level={level} title={label} />
      ) : toolId === "tools" ? (
        <ToolsHoverCard level={level} title={label} />
      ) : null}
      <div className="upgrade-card">
        <div className="card-header-bar">
          <span className="card-title">{label}</span>
          <span className={`lv-label${level === 0 ? " zero" : ""}`}>
            LV {level}/{maxLevel}
          </span>
        </div>
        <LevelSegs maxLevel={maxLevel} level={level} color="gold" />
        <div className="card-body">
          <div className="stat-line">{statText}</div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => dispatchUpgrade(toolId)}
            className="btn-upgrade"
          >
            {isMaxed ? "MAXIMAL" : `▲ AUFWERTEN  ${nextCost}g`}
          </button>
        </div>
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

  const now = useNow(100);
  const onCooldown = cooldownUntil > now;
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

  let statText: string;
  if (level === 0) {
    statText = "▪ NOCH GESPERRT";
  } else {
    const fc = CROW_FIELD_COUNTS[level - 1];
    const eatSec = (CROW_EAT_DURATIONS_MS[level - 1] / 1000).toFixed(1);
    statText = `FRISST ${fc} FELD${fc > 1 ? "ER" : ""} IN ${eatSec}S`;
  }

  return (
    <div className="relative group">
      <CrowsHoverCard level={level} title="KRÄHEN" />
      <div className="upgrade-card">
        <div className="card-header-bar">
          <span className="card-title">KRÄHEN</span>
          <span className={`lv-label${level === 0 ? " zero" : ""}`}>
            LV {level}/{MAX_CROW_LEVEL}
          </span>
        </div>
        <LevelSegs maxLevel={MAX_CROW_LEVEL} level={level} color="red" />
        <div className="card-body">
          <div className="stat-line">{statText}</div>
          {level === 0 ? (
            <>
              <button
                type="button"
                disabled={!canAffordUpgrade}
                onClick={() => dispatchUpgrade("crows")}
                className="btn-unlock"
              >
                FREISCHALTEN {nextCost}g
              </button>
              <button type="button" disabled className="btn-upgrade-action">
                ▶ SENDEN {CROW_SEND_COST}g
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={upgradeDisabled}
                onClick={() => dispatchUpgrade("crows")}
                className="btn-upgrade"
              >
                {isMaxed ? "MAXIMAL" : `▲ AUFWERTEN  ${nextCost}g`}
              </button>
              {onCooldown ? (
                <CooldownPanel
                  cooldownUntil={cooldownUntil}
                  now={now}
                  totalMs={CROW_COOLDOWN_MS}
                />
              ) : (
                <button
                  type="button"
                  disabled={!isTargeting && !canSend}
                  onClick={handleSendClick}
                  className={`btn-upgrade-action${isTargeting ? " targeting" : ""}`}
                >
                  {isTargeting
                    ? `FELD WÄHLEN  ${remaining}`
                    : `▶ SENDEN  ${CROW_SEND_COST}g`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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

  const now = useNow(100);
  const onCooldown = cooldownUntil > now;
  const sendCost = level > 0 ? THIEF_SEND_COSTS[level - 1] : 0;
  const canSend =
    level > 0 && !onCooldown && gold >= sendCost && !opponentHasThief;

  const handleSend = () => {
    useConnectionStore.getState().send?.({
      type: "player_action",
      action: { kind: "SendThief" },
    });
  };

  let statText: string;
  if (level === 0) {
    statText = "▪ NOCH GESPERRT";
  } else {
    const lvIdx = level - 1;
    statText = `STIEHLT ${THIEF_STEAL_PER_SEC[lvIdx]}G/S · MAX ${THIEF_MAX_STOLEN[lvIdx]}G`;
  }

  return (
    <div className="relative group">
      <ThiefHoverCard level={level} title="DIEB" />
      <div className="upgrade-card">
        <div className="card-header-bar">
          <span className="card-title">DIEB</span>
          <span className={`lv-label${level === 0 ? " zero" : ""}`}>
            LV {level}/{MAX_THIEF_LEVEL}
          </span>
        </div>
        <LevelSegs maxLevel={MAX_THIEF_LEVEL} level={level} color="purple" />
        <div className="card-body">
          <div className="stat-line">{statText}</div>
          {level === 0 ? (
            <>
              <button
                type="button"
                disabled={!canAffordUpgrade}
                onClick={() => dispatchUpgrade("thief")}
                className="btn-unlock"
              >
                FREISCHALTEN {nextCost}g
              </button>
              <button type="button" disabled className="btn-upgrade-action">
                ▶ SENDEN {THIEF_SEND_COSTS[0]}g
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={upgradeDisabled}
                onClick={() => dispatchUpgrade("thief")}
                className="btn-upgrade"
              >
                {isMaxed ? "MAXIMAL" : `▲ AUFWERTEN  ${nextCost}g`}
              </button>
              {onCooldown ? (
                <CooldownPanel
                  cooldownUntil={cooldownUntil}
                  now={now}
                  totalMs={THIEF_COOLDOWN_MS}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={handleSend}
                  className="btn-upgrade-action"
                >
                  {opponentHasThief ? "BESETZT" : `▶ SENDEN  ${sendCost}g`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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

  const now = useNow(100);
  const onCooldown = cooldownUntil > now;
  const sendCost = level > 0 ? WEATHER_SEND_COSTS[level - 1] : 0;
  const canSend =
    level > 0 && !onCooldown && gold >= sendCost && !opponentHasWeather;

  const handleSend = () => {
    useConnectionStore.getState().send?.({
      type: "player_action",
      action: { kind: "SendWeather" },
    });
  };

  let statText: string;
  if (level === 0) {
    statText = "▪ NOCH GESPERRT";
  } else {
    const lvIdx = level - 1;
    const slowPct = Math.round(WEATHER_SLOW_FACTORS[lvIdx] * 100);
    const durSec = Math.round(WEATHER_DURATION_MS / 1000);
    statText = `VERLANGSAMT -${slowPct}% · ${durSec}S DAUER`;
  }

  return (
    <div className="relative group">
      <WeatherHoverCard level={level} title="UNWETTER" />
      <div className="upgrade-card">
        <div className="card-header-bar">
          <span className="card-title">UNWETTER</span>
          <span className={`lv-label${level === 0 ? " zero" : ""}`}>
            LV {level}/{MAX_WEATHER_LEVEL}
          </span>
        </div>
        <LevelSegs maxLevel={MAX_WEATHER_LEVEL} level={level} color="sky" />
        <div className="card-body">
          <div className="stat-line">{statText}</div>
          {level === 0 ? (
            <>
              <button
                type="button"
                disabled={!canAffordUpgrade}
                onClick={() => dispatchUpgrade("weather")}
                className="btn-unlock"
              >
                FREISCHALTEN {nextCost}g
              </button>
              <button type="button" disabled className="btn-upgrade-action">
                ▶ SENDEN {WEATHER_SEND_COSTS[0]}g
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={upgradeDisabled}
                onClick={() => dispatchUpgrade("weather")}
                className="btn-upgrade"
              >
                {isMaxed ? "MAXIMAL" : `▲ AUFWERTEN  ${nextCost}g`}
              </button>
              {onCooldown ? (
                <CooldownPanel
                  cooldownUntil={cooldownUntil}
                  now={now}
                  totalMs={WEATHER_COOLDOWN_MS}
                />
              ) : (
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={handleSend}
                  className="btn-upgrade-action"
                >
                  {opponentHasWeather ? "AKTIV" : `▶ SENDEN  ${sendCost}g`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function UpgradePanel() {
  const game = useGameStore((s) => s.game);
  const playerId = useConnectionStore((s) => s.playerId);
  const revealed = useRevealedSurfaces();

  const me = playerId ? game?.players[playerId] : null;
  const opponent = playerId
    ? Object.values(game?.players ?? {}).find((p) => p.id !== playerId)
    : null;
  const gold = me?.gold ?? 0;
  const toolsLevel = me?.tools.find((t) => t.id === "tools")?.level ?? 0;
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
        {revealed.has("toolsCard") && (
          <div data-tutorial-id="toolsCard">
            <UpgradeCard
              toolId="tools"
              label="WERKZEUG"
              level={toolsLevel}
              gold={gold}
              costs={TOOLS_UPGRADE_COSTS}
              maxLevel={MAX_TOOL_LEVEL}
            />
          </div>
        )}
        {revealed.has("fertilizerCard") && (
          <div data-tutorial-id="fertilizerCard">
            <UpgradeCard
              toolId="fertilizer"
              label="DÜNGER"
              level={fertilizerLevel}
              gold={gold}
              costs={FERTILIZER_UPGRADE_COSTS}
              maxLevel={MAX_FERTILIZER_LEVEL}
            />
          </div>
        )}
        {revealed.has("crowsCard") && (
          <div data-tutorial-id="crowsCard">
            <CrowsCard
              level={crowsLevel}
              gold={gold}
              cooldownUntil={crowsCooldownUntil}
            />
          </div>
        )}
        {revealed.has("thiefCard") && (
          <div data-tutorial-id="thiefCard">
            <ThiefCard
              level={thiefLevel}
              gold={gold}
              cooldownUntil={thiefCooldownUntil}
              opponentHasThief={opponentHasThief}
            />
          </div>
        )}
        {revealed.has("weatherCard") && (
          <div data-tutorial-id="weatherCard">
            <WeatherCard
              level={weatherLevel}
              gold={gold}
              cooldownUntil={weatherCooldownUntil}
              opponentHasWeather={opponentHasWeather}
            />
          </div>
        )}
      </div>
    </div>
  );
}
