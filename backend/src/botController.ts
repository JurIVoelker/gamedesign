import type { Game } from "./game.js";
import type { ToolId, Field } from "@gamedesign/shared";
import { CROW_LEVEL_CONFIG } from "./constants.js";

// Bot tuning constants
const BOT_SOW_CHANCE_PER_TICK = 0.75;
const BOT_HARVEST_CHANCE_PER_TICK = 0.9;
const BOT_DEFAULT_CROP_TYPE = "wheat";
const BOT_FREE_PLAY_ATTACK_INTERVAL_MS = 25_000;

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
        for (const field of playerState.fields) {
          if (
            field.stage === "empty" &&
            field.crowAttack === null &&
            Math.random() < BOT_SOW_CHANCE_PER_TICK
          ) {
            this.game.sowField(playerId, field.index, BOT_DEFAULT_CROP_TYPE);
          } else if (
            field.stage === "ready" &&
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
  // active crow, most-grown first (lowest readyAt = closest to ready).
  private pickCrowTargets(fields: Field[], fieldCount: number): number[] {
    const now = Date.now();
    return fields
      .filter(
        (f) =>
          (f.stage === "growing" || f.stage === "ready") &&
          f.crowAttack === null,
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
    const eligible = this.pickCrowTargets(
      playerState.fields,
      config.fieldCount,
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
    const playerState = state.players[playerId];
    if (!playerState || playerState.thiefAttack !== null) return false;
    // Keep one villager inside so the thief can enter after minWaitMs
    this.game.reportVillagersOutside(playerId, 3);
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
        this.game.reportVillagersOutside(playerId, 3);
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
