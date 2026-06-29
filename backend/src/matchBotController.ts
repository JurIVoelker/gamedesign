import type { Game } from "./game.js";
import type { BotBrain } from "./botBrain.js";
import type { ToolId, Field } from "@gamedesign/shared";
import {
  CROW_LEVEL_CONFIG,
  CROW_SEND_COST,
  CROW_UPGRADE_COSTS,
  TOOLS_UPGRADE_COSTS,
  FERTILIZER_UPGRADE_COSTS,
  THIEF_UPGRADE_COSTS,
  WEATHER_UPGRADE_COSTS,
  THIEF_LEVELS,
  WEATHER_LEVELS,
} from "@gamedesign/shared";

// ---------------------------------------------------------------------------
// Autonomous opponent for the post-tutorial test match. Unlike BotController
// (scripted, tutorial-only) this bot plays a full game on its own: it farms,
// follows a fixed upgrade plan, attacks, and defends its own farm with
// human-like reaction times. It never touches the merchant or items.
// ---------------------------------------------------------------------------

// Cost to upgrade a tool from its current level to the next, indexed by current
// level (e.g. fertilizer[0] = cost to reach Lv1). Mirrors TOOL_COSTS in game.ts.
const UPGRADE_COSTS: Record<ToolId, readonly number[]> = {
  tools: TOOLS_UPGRADE_COSTS,
  fertilizer: FERTILIZER_UPGRADE_COSTS,
  crows: CROW_UPGRADE_COSTS,
  thief: THIEF_UPGRADE_COSTS,
  weather: WEATHER_UPGRADE_COSTS,
};

// The single fixed strategy: pursue these upgrades greedily, in order, one at a
// time. Economy first (fertilizer L2, tools L2), then unlock the sabotage trio,
// then push crows/weather to L2. When the plan is exhausted the bot stops
// upgrading and just keeps attacking with spare gold.
const UPGRADE_PLAN: { tool: ToolId; level: number }[] = [
  { tool: "fertilizer", level: 1 },
  { tool: "fertilizer", level: 2 },
  { tool: "tools", level: 1 },
  { tool: "tools", level: 2 },
  { tool: "crows", level: 1 },
  { tool: "weather", level: 1 },
  { tool: "thief", level: 1 },
  { tool: "crows", level: 2 },
  { tool: "weather", level: 2 },
];

// Farm loop probabilities per tick (≈1s) so the bot doesn't act with robotic
// regularity. Mirrors the tutorial bot's pacing.
const BOT_SOW_CHANCE_PER_TICK = 0.75;
const BOT_HARVEST_CHANCE_PER_TICK = 0.9;
const BOT_CROP_TYPE = "wheat";

// One villager stays home so the *player's* thief can sneak into the bot's farm
// (server thief entry requires villagersOutside < 4). Lets the human practice
// attacking with the thief.
const BOT_VILLAGERS_OUTSIDE = 3;

// Crows are most punishing on freshly-sown fields: a low-progress field gets
// eaten to nothing fast, destroying the sow before the player can defend. Target
// opponent fields roughly this far into a fresh sow.
const CROW_TARGET_IDEAL_MS = 10_000;
const CROW_TARGET_MIN_MS = 5_000;
const CROW_TARGET_MAX_MS = 20_000;

// Human-like reaction delay before the bot scares crows off its own field.
const CROW_REACT_MIN_MS = 400;
const CROW_REACT_MAX_MS = 1_100;

// Paranoia slows the bot's defenses and costs it gold (fake merchant scam).
const PARANOIA_REACTION_MULTIPLIER = 1.3;
const PARANOIA_GOLD_PENALTY = 30;

// Spotting delay before the bot catches a thief stealing from it, scaled by the
// thief's disguise (the attacker's thief level). Higher disguise = slower spot,
// and at full disguise the bot sometimes fails to spot it at all.
const THIEF_SPOT_DELAY_MS: Record<string, number> = {
  none: 1_200,
  partial: 2_800,
  full: 4_800,
};
const THIEF_SPOT_JITTER_MS = 600;
const THIEF_MISS_CHANCE: Record<string, number> = {
  none: 0,
  partial: 0.1,
  full: 0.35,
};

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export class MatchBotController implements BotBrain {
  private game: Game;
  private botId: string;
  private villagersInitialized = false;
  // Reaction tracking, keyed by attack identity so it self-clears between waves.
  private scaredCrowKeys = new Set<string>();
  private handledThiefKeys = new Set<string>();
  private handledParanoiaIds = new Set<string>();
  private pendingTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(game: Game, botId: string) {
    this.game = game;
    this.botId = botId;
  }

  reset(): void {
    for (const t of this.pendingTimers) clearTimeout(t);
    this.pendingTimers.clear();
    this.scaredCrowKeys.clear();
    this.handledThiefKeys.clear();
    this.handledParanoiaIds.clear();
    this.villagersInitialized = false;
  }

  tick(now: number): void {
    const state = this.game.getState();
    if (!state || state.phase !== "playing") return;

    const botState = state.players[this.botId];
    if (!botState) return;

    const playerId = Object.keys(state.players).find((id) => id !== this.botId);
    if (!playerId) return;

    // Keep one villager home so the player's thief can enter the bot's farm.
    if (!this.villagersInitialized) {
      this.game.reportVillagersOutside(this.botId, BOT_VILLAGERS_OUTSIDE);
      this.villagersInitialized = true;
    }

    this.defend(now);
    this.farm();
    this.pursueStrategy(now, playerId);
  }

  // --- Defense ------------------------------------------------------------

  private isBlinded(): boolean {
    return (
      this.game
        .getState()
        ?.players[this.botId]?.activeEffects.some(
          (e) => e.itemId === "blindness_potion",
        ) ?? false
    );
  }

  private hasParanoia(): boolean {
    return (
      this.game
        .getState()
        ?.players[this.botId]?.activeEffects.some(
          (e) => e.itemId === "paranoia_curse",
        ) ?? false
    );
  }

  private defend(now: number): void {
    const state = this.game.getState();
    if (!state) return;
    const botState = state.players[this.botId];
    if (!botState) return;

    // Paranoia: charge 30g for each new activation (fake merchant scam).
    for (const effect of botState.activeEffects) {
      if (effect.itemId !== "paranoia_curse") continue;
      if (this.handledParanoiaIds.has(effect.id)) continue;
      this.handledParanoiaIds.add(effect.id);
      this.game.deductGold(this.botId, PARANOIA_GOLD_PENALTY);
    }

    // Scare crows off the bot's own fields after a human reaction delay.
    // Paranoia makes the bot slower to notice the attack.
    const crowMultiplier = this.hasParanoia() ? PARANOIA_REACTION_MULTIPLIER : 1;
    for (const field of botState.fields) {
      const crow = field.crowAttack;
      if (!crow) continue;
      const key = `${field.index}:${crow.startedAt}`;
      if (this.scaredCrowKeys.has(key)) continue;
      this.scaredCrowKeys.add(key);
      const fieldIndex = field.index;
      this.schedule(
        randBetween(CROW_REACT_MIN_MS, CROW_REACT_MAX_MS) * crowMultiplier,
        () => {
          const s = this.game.getState();
          if (!s || s.phase !== "playing") return;
          const f = s.players[this.botId]?.fields[fieldIndex];
          if (f?.crowAttack) this.game.scareCrow(this.botId, fieldIndex);
        },
      );
    }

    // Catch a thief once it's actually stealing, after a disguise-scaled spot
    // delay. Skip entirely while blinded — don't mark as handled so the bot
    // retries on the next tick once blindness wears off.
    const thief = botState.thiefAttack;
    if (thief && thief.phase === "stealing" && !this.isBlinded()) {
      const key = `${thief.deployedAt}`;
      if (!this.handledThiefKeys.has(key)) {
        this.handledThiefKeys.add(key);
        if (Math.random() >= (THIEF_MISS_CHANCE[thief.disguise] ?? 0)) {
          const base =
            THIEF_SPOT_DELAY_MS[thief.disguise] ?? THIEF_SPOT_DELAY_MS.none;
          const delay = base + randBetween(0, THIEF_SPOT_JITTER_MS);
          this.schedule(delay, () => {
            const s = this.game.getState();
            if (!s || s.phase !== "playing") return;
            const t = s.players[this.botId]?.thiefAttack;
            if (t && t.phase === "stealing") this.game.catchThief(this.botId);
          });
        }
      }
    }
  }

  private schedule(delayMs: number, fn: () => void): void {
    const timer = setTimeout(() => {
      this.pendingTimers.delete(timer);
      fn();
    }, delayMs);
    this.pendingTimers.add(timer);
  }

  // --- Farming ------------------------------------------------------------

  private farm(): void {
    const state = this.game.getState();
    if (!state) return;
    const botState = state.players[this.botId];
    if (!botState) return;
    for (const field of botState.fields) {
      if (field.stage === "empty" && Math.random() < BOT_SOW_CHANCE_PER_TICK) {
        this.game.sowField(this.botId, field.index, BOT_CROP_TYPE);
      } else if (
        field.stage === "ready" &&
        Math.random() < BOT_HARVEST_CHANCE_PER_TICK
      ) {
        this.game.harvestField(this.botId, field.index);
      }
    }
  }

  // --- Strategy: upgrades + attacks --------------------------------------

  private toolLevel(toolId: ToolId): number {
    const state = this.game.getState();
    return (
      state?.players[this.botId]?.tools.find((t) => t.id === toolId)?.level ?? 0
    );
  }

  private gold(): number {
    return this.game.getState()?.players[this.botId]?.gold ?? 0;
  }

  // The next unmet upgrade in the plan and its immediate cost, or null when the
  // plan is complete.
  private nextGoal(): { tool: ToolId; cost: number } | null {
    for (const step of UPGRADE_PLAN) {
      const level = this.toolLevel(step.tool);
      if (level < step.level) {
        return { tool: step.tool, cost: UPGRADE_COSTS[step.tool][level] };
      }
    }
    return null;
  }

  private pursueStrategy(now: number, playerId: string): void {
    const goal = this.nextGoal();

    // Buy the next planned upgrade as soon as it's affordable; one per tick.
    if (goal && this.gold() >= goal.cost) {
      this.game.upgradeTool(this.botId, goal.tool);
      return;
    }

    // Reserve enough gold to still afford the next upgrade — only spend the
    // surplus on attacks. With no goal left, attack freely.
    const reserve = goal ? goal.cost : 0;
    this.attack(now, playerId, reserve);
  }

  private canSpend(cost: number, reserve: number): boolean {
    return this.gold() - cost >= reserve;
  }

  private attack(now: number, playerId: string, reserve: number): void {
    const state = this.game.getState();
    if (!state) return;
    const botState = state.players[this.botId];
    const playerState = state.players[playerId];
    if (!botState || !playerState) return;

    // Weather — spam whenever possible.
    const weather = botState.tools.find((t) => t.id === "weather");
    if (
      weather &&
      weather.level > 0 &&
      weather.cooldownUntil <= now &&
      playerState.weatherEffect === null &&
      this.canSpend(WEATHER_LEVELS[weather.level - 1].cost, reserve)
    ) {
      this.game.sendWeather(this.botId);
    }

    // Thief — spam whenever possible. Entry depends on the player's real
    // villager state (no cheating), matching normal PvP.
    const thief = botState.tools.find((t) => t.id === "thief");
    if (
      thief &&
      thief.level > 0 &&
      thief.cooldownUntil <= now &&
      playerState.thiefAttack === null &&
      this.canSpend(THIEF_LEVELS[thief.level - 1].cost, reserve)
    ) {
      this.game.sendThief(this.botId);
    }

    // Crows — bomb the player's freshly-sown fields.
    const crows = botState.tools.find((t) => t.id === "crows");
    if (
      crows &&
      crows.level > 0 &&
      crows.cooldownUntil <= now &&
      this.canSpend(CROW_SEND_COST, reserve)
    ) {
      const cfg = CROW_LEVEL_CONFIG[crows.level - 1];
      const targets = this.pickFreshCrowTargets(
        playerState.fields,
        cfg.fieldCount,
        now,
      );
      if (targets.length > 0) this.game.sendCrows(this.botId, targets);
    }
  }

  // Growing fields ≈10s into a fresh sow, no active crow, closest to the ideal
  // first, up to fieldCount.
  private pickFreshCrowTargets(
    fields: Field[],
    fieldCount: number,
    now: number,
  ): number[] {
    return fields
      .filter((f) => {
        if (f.stage !== "growing" || f.crowAttack !== null || f.sowedAt === null)
          return false;
        const elapsed = now - f.sowedAt;
        return elapsed >= CROW_TARGET_MIN_MS && elapsed <= CROW_TARGET_MAX_MS;
      })
      .sort(
        (a, b) =>
          Math.abs(now - (a.sowedAt ?? 0) - CROW_TARGET_IDEAL_MS) -
          Math.abs(now - (b.sowedAt ?? 0) - CROW_TARGET_IDEAL_MS),
      )
      .slice(0, fieldCount)
      .map((f) => f.index);
  }
}
