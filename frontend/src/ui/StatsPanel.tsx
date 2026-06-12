import type { MatchStats, PlayerState } from "@gamedesign/shared";
import { useConnectionStore } from "../state/connectionStore";
import { useGameStore } from "../state/gameStore";

const TOOL_LABELS: Record<string, string> = {
  tools: "Werkzeug",
  fertilizer: "Dünger",
  crows: "Krähen",
  thief: "Dieb",
  weather: "Unwetter",
};

const TOOL_DOT_COLOR: Record<string, string> = {
  tools: "filled-gold",
  fertilizer: "filled-gold",
  crows: "filled-red",
  thief: "filled-purple",
  weather: "filled-sky",
};

function emptyStats(): MatchStats {
  return {
    goldEarnedHarvest: 0,
    goldStolenByThief: 0,
    goldLostToThief: 0,
    goldSpentUpgradesByTool: {
      tools: 0,
      fertilizer: 0,
      crows: 0,
      thief: 0,
      weather: 0,
    },
    goldSpentCrows: 0,
    goldSpentThief: 0,
    goldSpentWeather: 0,
    goldSpentMerchant: 0,
    crowGoldDestroyed: 0,
    weatherGoldDestroyed: 0,
    upgradeExtraProfitFertilizer: 0,
    upgradeExtraProfitSpeed: 0,
    fieldsHarvested: 0,
    crowsSent: 0,
    thievesSent: 0,
    weatherSent: 0,
    itemsBought: {},
    itemsUsed: 0,
    finalToolLevels: {
      tools: 0,
      fertilizer: 0,
      crows: 0,
      thief: 0,
      weather: 0,
    },
  };
}

function fmt(n: number) {
  return Math.round(n).toString();
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[7px] text-muted-gold tracking-widest mt-3 mb-1 px-1">
      {label}
    </div>
  );
}

function ColHeaders() {
  return (
    <div
      className="text-[7px] text-muted-gold flex justify-end gap-2 px-1 mb-1"
      style={{ paddingRight: 14 }}
    >
      <span style={{ minWidth: 48, textAlign: "right" }}>DU</span>
      <span style={{ minWidth: 48, textAlign: "right" }}>GEGNER</span>
    </div>
  );
}

function StatRow({
  label,
  myVal,
  oppVal,
  estimated = false,
  myColor = "text-gold",
  oppColor = "text-parchment",
}: {
  label: string;
  myVal: number;
  oppVal: number;
  estimated?: boolean;
  myColor?: string;
  oppColor?: string;
}) {
  const display = (v: number) => (estimated ? `≈${fmt(v)}` : fmt(v));
  return (
    <div className="score-row text-[7px] flex justify-between items-center gap-2">
      <span className="text-muted-gold flex-1">
        {label}
        {estimated && (
          <span className="text-[6px]" style={{ opacity: 0.6 }}>
            {" "}
            (gesch.)
          </span>
        )}
      </span>
      <span
        className={`${myColor}`}
        style={{ minWidth: 48, textAlign: "right" }}
      >
        {display(myVal)}
      </span>
      <span
        className={`${oppColor}`}
        style={{ minWidth: 48, textAlign: "right" }}
      >
        {display(oppVal)}
      </span>
    </div>
  );
}

function ToolLevelRow({
  toolId,
  myLevel,
  oppLevel,
}: {
  toolId: string;
  myLevel: number;
  oppLevel: number;
}) {
  const dotColor = TOOL_DOT_COLOR[toolId] ?? "filled-gold";
  const dots = (level: number) =>
    [1, 2, 3].map((i) => (
      <div key={i} className={`level-dot ${i <= level ? dotColor : ""}`} />
    ));

  return (
    <div className="score-row text-[7px] flex justify-between items-center gap-2">
      <span className="text-muted-gold flex-1">
        {TOOL_LABELS[toolId] ?? toolId}
      </span>
      <div
        className="flex gap-1"
        style={{ minWidth: 48, justifyContent: "flex-end" }}
      >
        {dots(myLevel)}
      </div>
      <div
        className="flex gap-1"
        style={{ minWidth: 48, justifyContent: "flex-end" }}
      >
        {dots(oppLevel)}
      </div>
    </div>
  );
}

function RentRow({
  label,
  ausgaben,
  profit,
  schaden,
  estimated = false,
}: {
  label: string;
  ausgaben: number;
  profit: number | null;
  schaden: number | null;
  estimated?: boolean;
}) {
  return (
    <div className="score-row text-[7px] flex justify-between items-center gap-1">
      <span className="text-muted-gold" style={{ minWidth: 80 }}>
        {label}
      </span>
      <span
        className="text-danger"
        style={{ minWidth: 40, textAlign: "right" }}
      >
        -{fmt(ausgaben)}
      </span>
      <span className="text-gold" style={{ minWidth: 40, textAlign: "right" }}>
        {profit !== null ? `${estimated ? "≈" : "+"}${fmt(profit)}` : "—"}
      </span>
      <span
        className="text-parchment"
        style={{ minWidth: 40, textAlign: "right" }}
      >
        {schaden !== null ? fmt(schaden) : "—"}
      </span>
    </div>
  );
}

function totalUpgradeSpend(stats: MatchStats): number {
  return Object.values(stats.goldSpentUpgradesByTool).reduce(
    (s, v) => s + v,
    0,
  );
}

function totalSpent(stats: MatchStats): number {
  return (
    stats.goldSpentCrows +
    stats.goldSpentThief +
    stats.goldSpentWeather +
    stats.goldSpentMerchant +
    totalUpgradeSpend(stats)
  );
}

function upgradeCostForCategory(
  stats: MatchStats,
  ...toolIds: string[]
): number {
  return toolIds.reduce(
    (s, id) =>
      s + ((stats.goldSpentUpgradesByTool as Record<string, number>)[id] ?? 0),
    0,
  );
}

export function StatsPanel() {
  const { playerId } = useConnectionStore();
  const game = useGameStore((s) => s.game);

  if (!game) return null;

  const myState: PlayerState | undefined = game.players[playerId ?? ""];
  const oppState: PlayerState | undefined = Object.values(game.players).find(
    (p) => p.id !== playerId,
  );

  const my = myState?.stats ?? emptyStats();
  const opp = oppState?.stats ?? emptyStats();

  const myToolLevels = my.finalToolLevels as Record<string, number>;
  const oppToolLevels = opp.finalToolLevels as Record<string, number>;

  return (
    <div className="flex flex-col gap-0 text-parchment" style={{ fontSize: 7 }}>
      <ColHeaders />

      <SectionHeader label="GOLD" />
      <StatRow
        label="Verdient (Ernten)"
        myVal={my.goldEarnedHarvest}
        oppVal={opp.goldEarnedHarvest}
      />
      <StatRow
        label="Verloren (an Dieb)"
        myVal={my.goldLostToThief}
        oppVal={opp.goldLostToThief}
        myColor="text-danger"
        oppColor="text-danger"
      />
      <StatRow
        label="Ausgaben (gesamt)"
        myVal={totalSpent(my)}
        oppVal={totalSpent(opp)}
        myColor="text-danger"
        oppColor="text-danger"
      />

      <SectionHeader label="SABOTAGE-SCHADEN (angerichtet)" />
      <StatRow
        label="Krähen"
        myVal={my.crowGoldDestroyed}
        oppVal={opp.crowGoldDestroyed}
      />
      <StatRow
        label="Unwetter"
        myVal={my.weatherGoldDestroyed}
        oppVal={opp.weatherGoldDestroyed}
        estimated
      />

      <SectionHeader label="UPGRADE-PROFIT" />
      <StatRow
        label="Dünger-Bonus"
        myVal={my.upgradeExtraProfitFertilizer}
        oppVal={opp.upgradeExtraProfitFertilizer}
      />
      <StatRow
        label="Geschwindigkeit"
        myVal={my.upgradeExtraProfitSpeed}
        oppVal={opp.upgradeExtraProfitSpeed}
        estimated
      />

      <SectionHeader label="HÄNDLER" />
      <StatRow
        label="Händler-Einkäufe"
        myVal={my.goldSpentMerchant}
        oppVal={opp.goldSpentMerchant}
        myColor="text-danger"
        oppColor="text-danger"
      />

      <SectionHeader label="ZÄHLER" />
      <StatRow
        label="Felder geerntet"
        myVal={my.fieldsHarvested}
        oppVal={opp.fieldsHarvested}
        myColor="text-parchment"
        oppColor="text-parchment"
      />
      <StatRow
        label="Krähen gesendet"
        myVal={my.crowsSent}
        oppVal={opp.crowsSent}
        myColor="text-parchment"
        oppColor="text-parchment"
      />
      <StatRow
        label="Diebe gesendet"
        myVal={my.thievesSent}
        oppVal={opp.thievesSent}
        myColor="text-parchment"
        oppColor="text-parchment"
      />
      <StatRow
        label="Unwetter gesendet"
        myVal={my.weatherSent}
        oppVal={opp.weatherSent}
        myColor="text-parchment"
        oppColor="text-parchment"
      />

      <SectionHeader label="UPGRADES (ENDSTAND)" />
      {["tools", "fertilizer", "crows", "thief", "weather"].map((toolId) => (
        <ToolLevelRow
          key={toolId}
          toolId={toolId}
          myLevel={myToolLevels[toolId] ?? 0}
          oppLevel={oppToolLevels[toolId] ?? 0}
        />
      ))}

      <SectionHeader label="RENTABILITÄT" />
      <div className="score-row text-[6px] text-muted-gold flex justify-between items-center gap-1 mb-1">
        <span style={{ minWidth: 80 }}>Kategorie</span>
        <span
          className="text-danger"
          style={{ minWidth: 40, textAlign: "right" }}
        >
          Ausgaben
        </span>
        <span
          className="text-gold"
          style={{ minWidth: 40, textAlign: "right" }}
        >
          Profit
        </span>
        <span
          className="text-parchment"
          style={{ minWidth: 40, textAlign: "right" }}
        >
          Schaden
        </span>
      </div>
      <RentRow
        label="Werkzeug"
        ausgaben={upgradeCostForCategory(my, "tools")}
        profit={my.upgradeExtraProfitSpeed}
        schaden={null}
        estimated
      />
      <RentRow
        label="Dünger"
        ausgaben={upgradeCostForCategory(my, "fertilizer")}
        profit={my.upgradeExtraProfitFertilizer}
        schaden={null}
      />
      <RentRow
        label="Krähen"
        ausgaben={my.goldSpentCrows + upgradeCostForCategory(my, "crows")}
        profit={null}
        schaden={my.crowGoldDestroyed}
      />
      <RentRow
        label="Dieb"
        ausgaben={my.goldSpentThief + upgradeCostForCategory(my, "thief")}
        profit={my.goldStolenByThief}
        schaden={my.goldStolenByThief}
      />
      <RentRow
        label="Unwetter"
        ausgaben={my.goldSpentWeather + upgradeCostForCategory(my, "weather")}
        profit={null}
        schaden={my.weatherGoldDestroyed}
      />
    </div>
  );
}
