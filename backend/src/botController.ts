import type { Game } from "./game.js";
import type { ToolId, Field } from "@gamedesign/shared";
import { CROW_LEVEL_CONFIG, CROW_TUTORIAL_MIN_GROWTH } from "./constants.js";

// Linear grow progress (0..1) of a field from sow → ready. Mirrors the
// frontend's fieldGrowthFraction; used to keep scripted crows off ≈0% crops.
function cropGrowthFraction(f: Field, now: number): number {
  if (f.stage === "ready") return 1;
  if (f.stage !== "growing" || f.sowedAt === null || f.readyAt === null) {
    return 0;
  }
  const span = f.readyAt - f.sowedAt;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (now - f.sowedAt) / span));
}

// Bot tuning constants
const BOT_SOW_CHANCE_PER_TICK = 0.75;
const BOT_HARVEST_CHANCE_PER_TICK = 0.9;
const BOT_DEFAULT_CROP_TYPE = "wheat";
const BOT_FREE_PLAY_ATTACK_INTERVAL_MS = 25_000;
// Total villagers on a farm.
const BOT_VILLAGERS = 4;
// villagersOutside value that keeps exactly one villager inside a house — the
// minimum for a thief to sneak in (server entry needs villagersOutside < total).
// Used both for the bot's own farm (so the player's thief can enter) and for the
// player's farm before the bot sends a thief (so the bot's thief can enter).
const VILLAGERS_OUTSIDE_FOR_THIEF_ENTRY = 3;

export class BotController {
  private game: Game;
  private botId: string;
  private pendingCue: { cue: string; level?: number } | null = null;
  private freePlayActive = false;
  private lastFreePlayAttackAt = 0;

  constructor(game: Game, botId: string) {
    this.game = game;
    this.botId = botId;
  }

  tick(now: number): void {
    const state = this.game.getState();
    if (!state || state.phase !== "playing") return;

    const botState = state.players[this.botId];
    if (!botState) return;

    // The bot has no villager client to report house entries, so its
    // villagersOutside would stay at 4 forever — and an incoming thief can only
    // enter when a villager is inside (villagersOutside < 4). Keep one bot
    // villager inside so the player's own thief can always sneak in and steal.
    // Guarded on === 4 so this fires (and broadcasts) at most once.
    if (this.game.isTutorial() && botState.villagersOutside >= BOT_VILLAGERS) {
      this.game.reportVillagersOutside(
        this.botId,
        VILLAGERS_OUTSIDE_FOR_THIEF_ENTRY,
      );
    }

    const playerId = Object.keys(state.players).find((id) => id !== this.botId);

    // Farm loop: sow empty fields, harvest ready fields
    for (const field of botState.fields) {
      if (field.stage === "empty" && Math.random() < BOT_SOW_CHANCE_PER_TICK) {
        this.game.sowField(this.botId, field.index, BOT_DEFAULT_CROP_TYPE);
      } else if (
        field.stage === "ready" &&
        Math.random() < BOT_HARVEST_CHANCE_PER_TICK
      ) {
        this.game.harvestField(this.botId, field.index);
      }
    }

    // Tutorial stage 2+: auto-farm the player's fields so they focus on sabotage.
    // Stage 1 is the farming tutorial — the player must sow/harvest themselves.
    if (playerId && this.game.isTutorial() && this.game.isSabotageEnabled()) {
      const playerState = state.players[playerId];
      if (playerState) {
        // While a scripted crow attack is pending (a crow-defense step), stop
        // harvesting the player's fields — otherwise the bot can harvest every
        // crop away, leaving no target to attack and stalling the step. Sowing
        // still runs so harvested/eaten fields mature back into targets.
        const suppressHarvest = this.pendingCue?.cue === "bot_send_crows";
        for (const field of playerState.fields) {
          if (
            field.stage === "empty" &&
            field.crowAttack === null &&
            Math.random() < BOT_SOW_CHANCE_PER_TICK
          ) {
            this.game.sowField(playerId, field.index, BOT_DEFAULT_CROP_TYPE);
          } else if (
            field.stage === "ready" &&
            !suppressHarvest &&
            Math.random() < BOT_HARVEST_CHANCE_PER_TICK
          ) {
            this.game.harvestField(playerId, field.index);
          }
        }
      }
    }

    // Retry a pending scripted cue until it succeeds
    if (this.pendingCue !== null) {
      const done = this.executeCue(this.pendingCue.cue, this.pendingCue.level);
      if (done) this.pendingCue = null;
    }

    // Free-play gentle attacks on a fixed interval
    if (
      this.freePlayActive &&
      now - this.lastFreePlayAttackAt >= BOT_FREE_PLAY_ATTACK_INTERVAL_MS
    ) {
      this.executeRandomAttack(now);
    }
  }

  handleCue(cue: string, level?: number): void {
    if (cue === "free_play_start") {
      this.freePlayActive = true;
      this.lastFreePlayAttackAt = Date.now();
      return;
    }
    // Attempt immediately; on failure store for retry on every tick
    this.pendingCue = { cue, level };
    const done = this.executeCue(cue, level);
    if (done) this.pendingCue = null;
  }

  private executeCue(cue: string, level?: number): boolean {
    const state = this.game.getState();
    if (!state) return false;
    const playerId = Object.keys(state.players).find((id) => id !== this.botId);
    if (!playerId) return false;

    if (cue === "bot_send_crows" && level !== undefined) {
      return this.sendCrowsAtLevel(playerId, level);
    }
    if (cue === "bot_send_thief" && level !== undefined) {
      return this.sendThiefAtLevel(playerId, level);
    }
    if (cue === "bot_send_weather" && level !== undefined) {
      return this.sendWeatherAtLevel(playerId, level);
    }
    if (cue === "reset_player_cooldowns") {
      this.game.resetPlayerCooldowns(playerId);
      return true;
    }
    if (cue === "cancel_weather") {
      // Clear any active storm on both farms so the player can re-cast a fresh
      // (stronger) weather at the bot during the tutorial.
      this.game.cancelWeather(this.botId);
      this.game.cancelWeather(playerId);
      return true;
    }
    return true; // unknown cue — don't retry
  }

  // Upgrades the bot's tool to targetLevel in-place. Returns false if any
  // upgrade step fails (e.g. insufficient gold), leaving the tool partially
  // upgraded for the next retry attempt.
  private upgradeBotToolToLevel(toolId: ToolId, targetLevel: number): boolean {
    const state = this.game.getState();
    if (!state) return false;
    const tool = state.players[this.botId]?.tools.find((t) => t.id === toolId);
    if (!tool) return false;
    // tool.level is mutated in-place by upgradeTool, so the while condition
    // re-evaluates on each iteration without re-fetching the state.
    while (tool.level < targetLevel) {
      if (this.game.upgradeTool(this.botId, toolId) !== "ok") return false;
    }
    return true;
  }

  // Pick up to `fieldCount` crow targets: growing/ready fields without an
  // active crow, grown to at least `minGrowth`, most-grown first (lowest
  // readyAt = closest to ready).
  private pickCrowTargets(
    fields: Field[],
    fieldCount: number,
    minGrowth = 0,
  ): number[] {
    const now = Date.now();
    return fields
      .filter(
        (f) =>
          (f.stage === "growing" || f.stage === "ready") &&
          f.crowAttack === null &&
          cropGrowthFraction(f, now) >= minGrowth,
      )
      .sort((a, b) => (a.readyAt ?? now) - (b.readyAt ?? now))
      .slice(0, fieldCount)
      .map((f) => f.index);
  }

  private sendCrowsAtLevel(playerId: string, targetLevel: number): boolean {
    if (!this.upgradeBotToolToLevel("crows", targetLevel)) return false;
    const state = this.game.getState();
    if (!state) return false;
    // Tutorial: bypass cooldown so scripted attacks fire immediately
    if (this.game.isTutorial()) {
      const crowTool = state.players[this.botId]?.tools.find(
        (t) => t.id === "crows",
      );
      if (crowTool) crowTool.cooldownUntil = 0;
    }
    const playerState = state.players[playerId];
    if (!playerState) return false;
    const config = CROW_LEVEL_CONFIG[targetLevel - 1];
    // In tutorial, require crops to have grown enough so crows never land on a
    // near-empty field (invisible / impossible to defend).
    const minGrowth = this.game.isTutorial() ? CROW_TUTORIAL_MIN_GROWTH : 0;
    const eligible = this.pickCrowTargets(
      playerState.fields,
      config.fieldCount,
      minGrowth,
    );
    // In tutorial, wait until enough fields are available so the bot always
    // sends the configured number of crows (prevents under-attack edge cases).
    // pickCrowTargets caps at fieldCount, so a short result means too few.
    if (this.game.isTutorial() && eligible.length < config.fieldCount) {
      return false; // wait for enough mature crops before attacking
    }
    if (eligible.length === 0) return false;
    return this.game.sendCrows(this.botId, eligible) === "ok";
  }

  private sendThiefAtLevel(playerId: string, targetLevel: number): boolean {
    if (!this.upgradeBotToolToLevel("thief", targetLevel)) return false;
    const state = this.game.getState();
    if (!state) return false;
    // Tutorial: bypass cooldown so scripted (re-)sends fire immediately, letting
    // the defend gate retry a missed thief without waiting out the 60s cooldown.
    if (this.game.isTutorial()) {
      const thiefTool = state.players[this.botId]?.tools.find(
        (t) => t.id === "thief",
      );
      if (thiefTool) thiefTool.cooldownUntil = 0;
    }
    const playerState = state.players[playerId];
    if (!playerState || playerState.thiefAttack !== null) return false;
    // Keep one villager inside so the thief can enter after minWaitMs
    this.game.reportVillagersOutside(
      playerId,
      VILLAGERS_OUTSIDE_FOR_THIEF_ENTRY,
    );
    return this.game.sendThief(this.botId) === "ok";
  }

  private sendWeatherAtLevel(playerId: string, targetLevel: number): boolean {
    if (!this.upgradeBotToolToLevel("weather", targetLevel)) return false;
    const state = this.game.getState();
    if (!state) return false;
    const playerState = state.players[playerId];
    if (!playerState || playerState.weatherEffect !== null) return false;
    return this.game.sendWeather(this.botId) === "ok";
  }

  private executeRandomAttack(now: number): void {
    const state = this.game.getState();
    if (!state) return;
    const playerId = Object.keys(state.players).find((id) => id !== this.botId);
    if (!playerId) return;
    const botState = state.players[this.botId];
    const playerState = state.players[playerId];
    if (!botState || !playerState) return;

    const candidates: Array<() => boolean> = [];

    const crowsTool = botState.tools.find((t) => t.id === "crows");
    if (crowsTool && crowsTool.level > 0 && crowsTool.cooldownUntil <= now) {
      candidates.push(() => {
        const s = this.game.getState();
        if (!s) return false;
        const ps = s.players[playerId];
        if (!ps) return false;
        const cfg = CROW_LEVEL_CONFIG[crowsTool.level - 1];
        const eligible = this.pickCrowTargets(ps.fields, cfg.fieldCount);
        if (eligible.length === 0) return false;
        return this.game.sendCrows(this.botId, eligible) === "ok";
      });
    }

    const thiefTool = botState.tools.find((t) => t.id === "thief");
    if (
      thiefTool &&
      thiefTool.level > 0 &&
      thiefTool.cooldownUntil <= now &&
      playerState.thiefAttack === null
    ) {
      candidates.push(() => {
        const s = this.game.getState();
        if (!s) return false;
        const ps = s.players[playerId];
        if (!ps || ps.thiefAttack !== null) return false;
        this.game.reportVillagersOutside(
          playerId,
          VILLAGERS_OUTSIDE_FOR_THIEF_ENTRY,
        );
        return this.game.sendThief(this.botId) === "ok";
      });
    }

    const weatherTool = botState.tools.find((t) => t.id === "weather");
    if (
      weatherTool &&
      weatherTool.level > 0 &&
      weatherTool.cooldownUntil <= now &&
      playerState.weatherEffect === null
    ) {
      candidates.push(() => {
        const s = this.game.getState();
        if (!s) return false;
        const ps = s.players[playerId];
        if (!ps || ps.weatherEffect !== null) return false;
        return this.game.sendWeather(this.botId) === "ok";
      });
    }

    if (candidates.length > 0) {
      const attack = candidates[Math.floor(Math.random() * candidates.length)];
      attack();
      this.lastFreePlayAttackAt = now;
    }
  }
}
