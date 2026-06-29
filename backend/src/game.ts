import type {
  ServerMessage,
  GameState,
  Field,
  PlayerState,
  ToolId,
  ThiefAttack,
  MatchStats,
  MerchantVisit,
  MerchantOffer,
  ActiveEffect,
  ItemId,
  TutorialStageId,
} from "@gamedesign/shared";
import { gameConfigForStage } from "@gamedesign/shared";
import { persistMatch } from "./persistence.js";
import { Session, BotSession } from "./session.js";
import type { SessionLike } from "./session.js";
import { BotController } from "./botController.js";
import { MatchBotController } from "./matchBotController.js";
import type { BotBrain } from "./botBrain.js";
import type { GameConfig } from "@gamedesign/shared";
import { DEFAULT_GAME_CONFIG, BOT_MATCH_CONFIG } from "@gamedesign/shared";
import {
  SOW_DURATION_MS,
  HARVEST_DURATION_MS,
  BASE_GROW_MS,
  GROW_VARIANCE,
  GOLD_PER_HARVEST,
  STARTING_GOLD,
  UPGRADE_SPEED_MULTIPLIERS,
  MAX_TOOL_LEVEL,
  TOOLS_UPGRADE_COSTS,
  FERTILIZER_GROW_MULTIPLIERS,
  FERTILIZER_GOLD_MULTIPLIERS,
  MAX_FERTILIZER_LEVEL,
  FERTILIZER_UPGRADE_COSTS,
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
  WEATHER_MAX_EXTRA_MS,
  ACCUSATION_PAUSE_MS,
  LIGHTNING_STRIKE_DELAY_MS,
  ITEM_DEFS,
  MERCHANT_VISITS,
  MERCHANT_STAY_MS,
  MERCHANT_OFFER_COUNT,
  MERCHANT_HEAD_START_MS,
  MERCHANT_DISCOUNT_PCT,
  MERCHANT_MIN_SCORE_GAP,
  MERCHANT_OVERSTAY_MAX_MS,
  MERCHANT_WINDOW_RECHECK_MS,
  MERCHANT_CATCHUP_STAGES,
  PARANOIA_RESPAWN_DELAY_MS,
  FAKE_MERCHANT_PRICE_PCT,
  FAKE_MERCHANT_EXCUSES,
  FAKE_MERCHANT_FEE_SCHEDULE,
  FAKE_MERCHANT_POST_REAL_DELAY_MS,
} from "./constants.js";
import { ITEM_HANDLERS } from "./items.js";

type Slot = "p1" | "p2";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

// Stage-3 tutorial merchant arrives almost immediately after its cue so the
// lesson flows without a wall-clock wait.
const MERCHANT_TUTORIAL_ARRIVE_MS = 1_500;

// Fields start a new match already sown and partially grown, so players have
// crops to tend immediately instead of an empty opening sow phase.
const PRESOW_PROGRESS = 0.3;
const PRESOW_CROP_TYPE = "wheat";

const TOOL_COSTS: Record<ToolId, readonly number[]> = {
  tools: TOOLS_UPGRADE_COSTS,
  fertilizer: FERTILIZER_UPGRADE_COSTS,
  crows: CROW_UPGRADE_COSTS,
  thief: THIEF_UPGRADE_COSTS,
  weather: WEATHER_UPGRADE_COSTS,
};

function weatherExtra(remaining: number, slowFactor: number): number {
  return Math.min(
    (remaining * slowFactor) / (1 - slowFactor),
    WEATHER_MAX_EXTRA_MS,
  );
}

function itemsHeld(ps: PlayerState, itemId: ItemId): number {
  const bought = (ps.stats.itemsBought as Record<string, number>)[itemId] ?? 0;
  const inInventory = ps.items.find((i) => i.id === itemId)?.count ?? 0;
  const effectActive = ps.activeEffects.some((e) => e.itemId === itemId)
    ? 1
    : 0;
  return bought + inInventory + effectActive;
}

function createEmptyStats(): MatchStats {
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
    thievesCaught: 0,
    weatherSent: 0,
    itemsBought: {},
    itemsUsedByType: {},
    goldGainedItems: 0,
    goldDrainedFakeMerchant: 0,
    goldLostHalvingBrew: 0,
    finalToolLevels: {
      tools: 0,
      fertilizer: 0,
      crows: 0,
      thief: 0,
      weather: 0,
    },
  };
}

function createField(index: number): Field {
  return {
    index,
    stage: "empty",
    cropType: null,
    sowedAt: null,
    readyAt: null,
    crowAttack: null,
    scaringAt: null,
  };
}

function createPlayerState(
  playerId: string,
  startingGold: number,
): PlayerState {
  return {
    id: playerId,
    gold: startingGold,
    score: 0,
    fields: [0, 1, 2, 3].map(createField),
    tools: [
      { id: "tools", level: 0, cooldownUntil: 0 },
      { id: "fertilizer", level: 0, cooldownUntil: 0 },
      { id: "crows", level: 0, cooldownUntil: 0 },
      { id: "thief", level: 0, cooldownUntil: 0 },
      { id: "weather", level: 0, cooldownUntil: 0 },
    ],
    items: [],
    thiefAttack: null,
    weatherEffect: null,
    villagersOutside: 4,
    wrongAccusationCount: 0,
    stats: createEmptyStats(),
    merchant: null,
    activeEffects: [],
  };
}

export class Game {
  readonly id: string;
  private config: GameConfig;
  private slots: { p1: SessionLike | null; p2: SessionLike | null } = {
    p1: null,
    p2: null,
  };
  private state: GameState | null = null;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private persisted = false;
  private effectCounter = 0;
  private tutorialMerchantVisits = 0;
  botController?: BotBrain;

  constructor(id: string, config: GameConfig = DEFAULT_GAME_CONFIG) {
    this.id = id;
    this.config = config;
  }

  isTutorial(): boolean {
    return this.config.tutorial;
  }

  isBotMatch(): boolean {
    return this.config.botMatch;
  }

  isSabotageEnabled(): boolean {
    return (
      this.config.enabled.crows ||
      this.config.enabled.thief ||
      this.config.enabled.weather
    );
  }

  setBotController(controller: BotBrain): void {
    this.botController = controller;
  }

  tickBot(now: number): void {
    this.botController?.tick(now);
  }

  join(session: SessionLike): Slot | null {
    if (!this.slots.p1) {
      this.slots.p1 = session;
      return "p1";
    }
    if (!this.slots.p2) {
      this.slots.p2 = session;
      return "p2";
    }
    return null;
  }

  rejoin(session: SessionLike, slot: Slot): void {
    this.slots[slot] = session;
  }

  leave(playerId: string): Slot | null {
    for (const slot of ["p1", "p2"] as Slot[]) {
      if (this.slots[slot]?.playerId === playerId) {
        this.slots[slot] = null;
        // Reset merchant window on disconnect so departure is not pinned
        if (this.state?.players[playerId]?.merchant) {
          this.state.players[playerId].merchant!.windowOpen = false;
        }
        return slot;
      }
    }
    return null;
  }

  getSlotOf(playerId: string): Slot | null {
    for (const slot of ["p1", "p2"] as Slot[]) {
      if (this.slots[slot]?.playerId === playerId) return slot;
    }
    return null;
  }

  getOpponent(slot: Slot): SessionLike | null {
    return slot === "p1" ? this.slots.p2 : this.slots.p1;
  }

  isFull(): boolean {
    return this.slots.p1 !== null && this.slots.p2 !== null;
  }

  isEmpty(): boolean {
    return this.slots.p1 === null && this.slots.p2 === null;
  }

  getSessions(): SessionLike[] {
    return [this.slots.p1, this.slots.p2].filter(
      (s): s is SessionLike => s !== null,
    );
  }

  broadcast(msg: ServerMessage): void {
    for (const session of this.getSessions()) {
      session.send(msg);
    }
  }

  broadcastExcept(playerId: string, msg: ServerMessage): void {
    for (const session of this.getSessions()) {
      if (session.playerId !== playerId) {
        session.send(msg);
      }
    }
  }

  getState(): GameState | null {
    return this.state;
  }

  startGame(): void {
    this.persisted = false;
    const p1Id = this.slots.p1!.playerId;
    const p2Id = this.slots.p2!.playerId;
    const startedAt = Date.now();

    this.state = {
      roomCode: this.id,
      phase: "playing",
      startedAt,
      endsAt: startedAt + this.config.matchDurationMs,
      players: {
        [p1Id]: createPlayerState(p1Id, this.config.startingGold),
        [p2Id]: createPlayerState(p2Id, this.config.startingGold),
      },
      winnerId: null,
    };

    // Give both players crops in progress from the very first second (PvP only).
    if (!this.isTutorial()) {
      for (const playerState of Object.values(this.state.players)) {
        for (const field of playerState.fields) {
          this.presowField(playerState.id, field, startedAt);
        }
      }
    }

    this.scheduleTimer(
      "match_end",
      startedAt + this.config.matchDurationMs,
      () => this.endMatch(),
    );

    // Schedule merchant visits only if merchant is enabled
    if (this.config.enabled.merchant) {
      for (let i = 0; i < this.config.merchantVisits.length; i++) {
        const visit = this.config.merchantVisits[i];
        const jitter = (Math.random() * 2 - 1) * visit.jitterMs;
        const firesAt = startedAt + visit.atMs + jitter;
        this.scheduleTimer(`merchant_visit:${i}`, firesAt, () =>
          this.beginMerchantVisit(i),
        );
      }
    }

    this.broadcastState();
  }

  private endMatch(): void {
    if (!this.state || this.state.phase !== "playing") return;
    this.cleanupOnEnd();
    const [a, b] = Object.values(this.state.players);
    for (const ps of [a, b]) {
      for (const tool of ps.tools) {
        (ps.stats.finalToolLevels as Record<string, number>)[tool.id] =
          tool.level;
      }
    }
    this.state.phase = "ended";
    this.state.winnerId =
      a.gold > b.gold ? a.id : b.gold > a.gold ? b.id : null;
    if (!this.persisted && this.config.persist) {
      this.persisted = true;
      void persistMatch(this.state, this.getSlotMap()).catch(console.error);
    }
    this.broadcastState();
  }

  private getSlotMap(): Record<string, string> {
    const map: Record<string, string> = {};
    if (this.slots.p1) map[this.slots.p1.playerId] = "p1";
    if (this.slots.p2) map[this.slots.p2.playerId] = "p2";
    return map;
  }

  private playAgainVotes: Set<string> = new Set();

  votePlayAgain(playerId: string): void {
    this.playAgainVotes.add(playerId);
    // In a bot match the opponent is the bot, which is always "ready", so a
    // single human vote restarts. PvP still needs both players.
    const needed = this.isBotMatch() ? 1 : 2;
    if (this.playAgainVotes.size >= needed) {
      this.playAgainVotes.clear();
      this.resetAndRestart();
    }
  }

  reportVillagersOutside(playerId: string, count: number): void {
    if (!this.state) return;
    const playerState = this.state.players[playerId];
    if (!playerState) return;
    playerState.villagersOutside = Math.max(0, Math.min(4, count));
    this.broadcastState();
  }

  forfeit(playerId: string): void {
    if (!this.state || this.state.phase !== "playing") return;
    const opponentId = Object.keys(this.state.players).find(
      (id) => id !== playerId,
    );
    this.cancelTimer("match_end");
    this.cleanupOnEnd();
    for (const ps of Object.values(this.state.players)) {
      for (const tool of ps.tools) {
        (ps.stats.finalToolLevels as Record<string, number>)[tool.id] =
          tool.level;
      }
    }
    this.state.phase = "ended";
    this.state.winnerId = opponentId ?? null;
    if (!this.persisted && this.config.persist) {
      this.persisted = true;
      void persistMatch(this.state, this.getSlotMap()).catch(console.error);
    }
    this.broadcastState();
  }

  private cleanupOnEnd(): void {
    if (!this.state) return;
    for (const [playerId, ps] of Object.entries(this.state.players)) {
      if (ps.thiefAttack !== null) {
        this.cancelTimer(`thief_expire:${playerId}`);
        ps.thiefAttack = null;
      }
      if (ps.merchant !== null) {
        this.cancelTimer(`merchant_leave:${playerId}`);
        ps.merchant = null;
      }
      for (const effect of ps.activeEffects) {
        if (effect.endsAt !== null)
          this.cancelTimer(`effect_expire:${effect.id}`);
      }
      ps.activeEffects = [];
      for (const field of ps.fields) {
        if (
          field.stage === "sowing" ||
          field.stage === "growing" ||
          field.stage === "harvesting"
        ) {
          this.cancelTimer(`${playerId}:${field.index}`);
        }
      }
    }
    for (let i = 0; i < this.config.merchantVisits.length; i++) {
      this.cancelTimer(`merchant_visit:${i}`);
    }
  }

  private resetAndRestart(): void {
    for (const key of [...this.timers.keys()]) this.cancelTimer(key);
    this.botController?.reset?.();
    this.startGame();
    this.broadcast({ type: "game_ready" });
  }

  sowField(
    playerId: string,
    fieldIndex: number,
    cropType: string,
  ): "ok" | "not_empty" | "not_found" | "field_paused" {
    if (!this.state) return "not_found";

    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const field = playerState.fields[fieldIndex];
    if (!field) return "not_found";
    if (field.fieldBlockedUntil && field.fieldBlockedUntil > Date.now())
      return "field_paused";
    if (field.stage !== "empty") return "not_empty";

    const startedAt = Date.now();
    let duration =
      this.config.sowDurationMs *
      UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, "tools")];
    if (playerState.weatherEffect)
      duration += weatherExtra(
        duration,
        playerState.weatherEffect.actionSlowFactor,
      );
    field.stage = "sowing";
    field.cropType = cropType;
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeSow(playerId, fieldIndex),
    );
    this.broadcastState();

    return "ok";
  }

  harvestField(
    playerId: string,
    fieldIndex: number,
  ): "ok" | "not_ready" | "not_found" | "field_paused" {
    if (!this.state) return "not_found";

    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const field = playerState.fields[fieldIndex];
    if (!field) return "not_found";
    if (field.fieldBlockedUntil && field.fieldBlockedUntil > Date.now())
      return "field_paused";
    if (field.crowAttack !== null) return "field_paused";
    if (field.stage !== "ready") return "not_ready";

    const startedAt = Date.now();
    let duration =
      this.config.harvestDurationMs *
      UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, "tools")];
    if (playerState.weatherEffect)
      duration += weatherExtra(
        duration,
        playerState.weatherEffect.actionSlowFactor,
      );
    field.stage = "harvesting";
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeHarvest(playerId, fieldIndex),
    );
    this.broadcastState();

    return "ok";
  }

  sendCrows(
    playerId: string,
    targetFieldIndices: number[],
  ):
    | "ok"
    | "not_found"
    | "not_unlocked"
    | "on_cooldown"
    | "insufficient_gold"
    | "invalid_target" {
    if (!this.state) return "not_found";
    if (!this.config.enabled.crows) return "not_unlocked";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const crowTool = playerState.tools.find((t) => t.id === "crows");
    if (!crowTool || crowTool.level === 0) return "not_unlocked";

    const now = Date.now();
    if (crowTool.cooldownUntil > now) return "on_cooldown";
    if (playerState.gold < CROW_SEND_COST) return "insufficient_gold";

    const opponentState = Object.values(this.state.players).find(
      (p) => p.id !== playerId,
    );
    if (!opponentState) return "not_found";

    const mirror = this.mirrorActive(now);
    if (mirror) mirror.data = { ...mirror.data, lastReflectedAt: now };
    const victimState = mirror ? playerState : opponentState;

    const config = CROW_LEVEL_CONFIG[crowTool.level - 1];

    // Validate: no duplicates, correct count, each field eligible
    const deduped = [...new Set(targetFieldIndices)];
    if (deduped.length === 0 || deduped.length > config.fieldCount)
      return "invalid_target";
    const targets: Field[] = [];
    for (const idx of deduped) {
      const field = victimState.fields[idx];
      if (
        !field ||
        (field.stage !== "growing" && field.stage !== "ready") ||
        field.crowAttack !== null
      ) {
        return "invalid_target";
      }
      targets.push(field);
    }

    for (const field of targets) {
      const baseProgress =
        field.stage === "ready"
          ? 1.0
          : Math.min(
              1,
              (now - field.sowedAt!) / (field.readyAt! - field.sowedAt!),
            );
      const totalGrowMs =
        field.stage === "ready"
          ? this.config.baseGrowMs
          : field.readyAt! - field.sowedAt!;

      if (field.stage === "growing") {
        this.cancelTimer(`${victimState.id}:${field.index}`);
      }

      field.crowAttack = {
        startedAt: now,
        eatRatePerMs: config.eatRatePerMs,
        baseProgress,
        totalGrowMs,
        level: crowTool.level,
      };

      const expiresAt = now + baseProgress / config.eatRatePerMs;
      this.scheduleTimer(
        `crow:${victimState.id}:${field.index}`,
        expiresAt,
        () => this.expireCrowAttack(victimState.id, field.index),
      );
    }

    playerState.gold -= CROW_SEND_COST;
    playerState.stats.goldSpentCrows += CROW_SEND_COST;
    playerState.stats.crowsSent++;
    crowTool.cooldownUntil = now + CROW_COOLDOWN_MS;

    this.broadcastState();
    return "ok";
  }

  scareCrow(
    playerId: string,
    fieldIndex: number,
  ): "ok" | "not_found" | "no_crow" | "already_scaring" {
    if (!this.state) return "not_found";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const field = playerState.fields[fieldIndex];
    if (!field) return "not_found";
    if (!field.crowAttack) return "no_crow";
    if (field.scaringAt !== null) return "already_scaring";

    const now = Date.now();
    field.scaringAt = now;
    const scareDurationMs =
      CROW_LEVEL_CONFIG[field.crowAttack.level - 1].scareDurationMs;
    this.scheduleTimer(
      `scare:${playerId}:${fieldIndex}`,
      now + scareDurationMs,
      () => this.completeScare(playerId, fieldIndex),
    );

    this.broadcastState();
    return "ok";
  }

  sendThief(
    playerId: string,
  ):
    | "ok"
    | "not_found"
    | "not_unlocked"
    | "on_cooldown"
    | "insufficient_gold"
    | "target_busy" {
    if (!this.state) return "not_found";
    if (!this.config.enabled.thief) return "not_unlocked";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const thiefTool = playerState.tools.find((t) => t.id === "thief");
    if (!thiefTool || thiefTool.level === 0) return "not_unlocked";

    const now = Date.now();
    if (thiefTool.cooldownUntil > now) return "on_cooldown";

    const cfg = THIEF_LEVELS[thiefTool.level - 1];
    if (playerState.gold < cfg.cost) return "insufficient_gold";

    const opponentState = Object.values(this.state.players).find(
      (p) => p.id !== playerId,
    );
    if (!opponentState) return "not_found";

    const mirror = this.mirrorActive(now);
    if (mirror) mirror.data = { ...mirror.data, lastReflectedAt: now };
    const victimState = mirror ? playerState : opponentState;
    if (victimState.thiefAttack !== null) return "target_busy";

    const actorSlot = this.getSlotOf(playerId)!;
    const entryAt =
      now + cfg.minWaitMs + Math.random() * (cfg.maxWaitMs - cfg.minWaitMs);

    const attack: ThiefAttack = {
      phase: "waiting",
      deployedAt: now,
      minEntryAt: now + cfg.minWaitMs,
      entryAt,
      stealStartedAt: null,
      lastProcessedAt: null,
      durationMs: cfg.durationMs,
      stealPerSecond: cfg.stealPerSecond,
      disguise: cfg.disguise,
      actorSlot,
    };
    if (mirror) attack.beneficiaryId = mirror.sourcePlayerId;

    victimState.thiefAttack = attack;
    playerState.gold -= cfg.cost;
    playerState.stats.goldSpentThief += cfg.cost;
    playerState.stats.thievesSent++;
    thiefTool.cooldownUntil = now + cfg.cooldownMs;

    // Safety-net: clean up if the thief never gets to enter (all villagers stay outside)
    this.scheduleTimer(
      `thief_expire:${victimState.id}`,
      now + cfg.maxWaitMs + cfg.durationMs,
      () => this.expireThief(victimState.id),
    );

    this.broadcastState();
    return "ok";
  }

  catchThief(
    playerId: string,
  ): "ok" | "not_found" | "no_thief" | "still_waiting" {
    if (!this.state) return "not_found";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    if (!playerState.thiefAttack) {
      // Check for paranoia fake thief
      const paranoia = this.findParanoiaWithFake(playerState);
      if (paranoia?.data) {
        const data = paranoia.data as { fake: unknown; nextFakeAt: number };
        data.fake = null;
        data.nextFakeAt = Date.now() + PARANOIA_RESPAWN_DELAY_MS;
        this.broadcastState();
        return "ok";
      }
      return "no_thief";
    }

    if (playerState.thiefAttack.phase === "waiting") return "still_waiting";

    const now = Date.now();
    this.drainThief(playerId, now);
    playerState.thiefAttack = null;
    playerState.stats.thievesCaught++;
    this.cancelTimer(`thief_expire:${playerId}`);

    this.broadcastState();
    return "ok";
  }

  accuseVillager(
    playerId: string,
    villagerId: number,
  ): "ok" | "not_found" | "invalid_field" {
    if (!this.state) return "not_found";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const field = playerState.fields[villagerId];
    if (!field) return "invalid_field";

    playerState.wrongAccusationCount++;

    const now = Date.now();

    if (playerState.wrongAccusationCount >= 3) {
      playerState.wrongAccusationCount = 0;

      const unblockAt = now + ACCUSATION_PAUSE_MS;
      field.fieldBlockedUntil = unblockAt;

      if (field.stage === "growing" && field.readyAt !== null) {
        field.growthPausedUntil = unblockAt;
        field.readyAt += ACCUSATION_PAUSE_MS;
        this.rescheduleFieldTimer(playerId, field);
      }

      // Single timer clears both flags when punishment expires
      this.scheduleTimer(
        `accusation_pause:${playerId}:${villagerId}`,
        unblockAt,
        () => {
          if (this.state) {
            const f = this.state.players[playerId]?.fields[villagerId];
            if (f) {
              delete f.fieldBlockedUntil;
              delete f.growthPausedUntil;
            }
            this.broadcastState();
          }
        },
      );
    }

    this.broadcastState();
    return "ok";
  }

  sendWeather(
    playerId: string,
  ):
    | "ok"
    | "not_found"
    | "not_unlocked"
    | "on_cooldown"
    | "insufficient_gold"
    | "already_active" {
    if (!this.state) return "not_found";
    if (!this.config.enabled.weather) return "not_unlocked";
    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const weatherTool = playerState.tools.find((t) => t.id === "weather");
    if (!weatherTool || weatherTool.level === 0) return "not_unlocked";

    const now = Date.now();
    if (weatherTool.cooldownUntil > now) return "on_cooldown";

    const cfg = WEATHER_LEVELS[weatherTool.level - 1];
    if (playerState.gold < cfg.cost) return "insufficient_gold";

    const opponentState = Object.values(this.state.players).find(
      (p) => p.id !== playerId,
    );
    if (!opponentState) return "not_found";

    const mirror = this.mirrorActive(now);
    if (mirror) mirror.data = { ...mirror.data, lastReflectedAt: now };
    const effectiveVictim = mirror ? playerState : opponentState;
    if (effectiveVictim.weatherEffect !== null) return "already_active";

    const endsAt = now + cfg.durationMs;
    effectiveVictim.weatherEffect = {
      slowFactor: cfg.slowFactor,
      actionSlowFactor: cfg.actionSlowFactor,
      endsAt,
      lightning: cfg.lightning,
    };

    for (const field of effectiveVictim.fields) {
      if (field.readyAt === null) continue;
      const sf =
        field.stage === "growing" ? cfg.slowFactor : cfg.actionSlowFactor;
      const extraMs = weatherExtra(field.readyAt - now, sf);
      playerState.stats.weatherGoldDestroyed +=
        this.goldPerSec(effectiveVictim) * (extraMs / 1000);
      field.readyAt += extraMs;
      this.rescheduleFieldTimer(effectiveVictim.id, field);
    }

    // Lv3: lightning strikes the most-grown field after a short delay
    if (cfg.lightning) {
      const eligible = effectiveVictim.fields.filter(
        (f) => f.stage === "growing" || f.stage === "ready",
      );
      if (eligible.length > 0) {
        const progress = (f: Field) =>
          f.stage === "ready"
            ? 1
            : (now - (f.sowedAt ?? now)) /
              ((f.readyAt ?? now + 1) - (f.sowedAt ?? now));
        const target = eligible.reduce((best, f) =>
          progress(f) > progress(best) ? f : best,
        );
        this.cancelTimer(`${effectiveVictim.id}:${target.index}`);
        const strikeAt = now + LIGHTNING_STRIKE_DELAY_MS;
        const victimId = effectiveVictim.id;
        this.scheduleTimer(
          `lightning:${victimId}:${target.index}`,
          strikeAt,
          () => {
            if (!this.state) return;
            const oState = this.state.players[victimId];
            const strikeField = oState?.fields[target.index];
            if (
              oState &&
              strikeField &&
              (strikeField.stage === "growing" || strikeField.stage === "ready")
            ) {
              const aState = this.state.players[playerId];
              if (aState) {
                const strikeNow = Date.now();
                const prog =
                  strikeField.stage === "ready"
                    ? 1
                    : Math.max(
                        0,
                        Math.min(
                          1,
                          (strikeNow - (strikeField.sowedAt ?? strikeNow)) /
                            ((strikeField.readyAt ?? strikeNow + 1) -
                              (strikeField.sowedAt ?? strikeNow)),
                        ),
                      );
                const toolsLvl =
                  oState.tools.find((t) => t.id === "tools")?.level ?? 0;
                let resowMs =
                  this.config.sowDurationMs *
                  UPGRADE_SPEED_MULTIPLIERS[toolsLvl];
                if (oState.weatherEffect)
                  resowMs += weatherExtra(
                    resowMs,
                    oState.weatherEffect.actionSlowFactor,
                  );
                const extraRegrowMs =
                  prog * (this.effectiveGrowMs(oState) - this.growMs(oState));
                aState.stats.weatherGoldDestroyed +=
                  prog * this.goldYield(oState) +
                  this.goldPerSec(oState) * ((resowMs + extraRegrowMs) / 1000);
              }
            }
            this.destroyField(target);
            this.broadcastState();
          },
        );
      }
    }

    playerState.gold -= cfg.cost;
    playerState.stats.goldSpentWeather += cfg.cost;
    playerState.stats.weatherSent++;
    weatherTool.cooldownUntil = now + cfg.cooldownMs;

    this.scheduleTimer(`weather_expire:${effectiveVictim.id}`, endsAt, () =>
      this.expireWeather(effectiveVictim.id),
    );

    this.broadcastState();
    return "ok";
  }

  processSabotages(): void {
    if (!this.state || this.state.phase !== "playing") return;
    const now = Date.now();
    let changed = false;

    for (const [playerId, playerState] of Object.entries(this.state.players)) {
      // Safety-net: expire weather if scheduled timer was missed (expireWeather broadcasts itself)
      if (playerState.weatherEffect && now >= playerState.weatherEffect.endsAt)
        this.expireWeather(playerId);

      // Safety-net: merchant departure if timer was missed
      if (
        playerState.merchant &&
        !playerState.merchant.windowOpen &&
        now >= playerState.merchant.leavesAt
      ) {
        playerState.merchant = null;
        changed = true;
      }

      // Safety-net: effect expiry if timer was missed
      for (const effect of [...playerState.activeEffects]) {
        if (effect.endsAt !== null && now >= effect.endsAt) {
          const idx = playerState.activeEffects.findIndex(
            (e) => e.id === effect.id,
          );
          if (idx !== -1) playerState.activeEffects.splice(idx, 1);
          this.cancelTimer(`effect_expire:${effect.id}`);
          changed = true;
        }
      }

      // Paranoia fake thief loop
      for (const effect of playerState.activeEffects) {
        if (effect.itemId !== "paranoia_curse" || !effect.data) continue;
        const data = effect.data as { fake: unknown; nextFakeAt: number };

        if (playerState.thiefAttack !== null) {
          // Real thief suppresses fakes; reset nextFakeAt so they resume quickly after
          if (data.fake !== null) {
            data.fake = null;
            data.nextFakeAt = now + PARANOIA_RESPAWN_DELAY_MS;
            changed = true;
          }
          continue;
        }

        // Expire a running fake after its durationMs
        if (data.fake !== null) {
          const fake = data.fake as { deployedAt: number; durationMs: number };
          if (now >= fake.deployedAt + fake.durationMs) {
            data.fake = null;
            data.nextFakeAt = now + PARANOIA_RESPAWN_DELAY_MS;
            changed = true;
          }
          continue;
        }

        // Spawn new fake
        if (now >= data.nextFakeAt) {
          const curserSlot = this.getSlotOf(effect.sourcePlayerId) ?? "p1";
          const casterState = this.state.players[effect.sourcePlayerId];
          const thiefLevel = Math.max(
            1,
            this.getToolLevel(casterState ?? playerState, "thief"),
          );
          const thiefCfg = THIEF_LEVELS[thiefLevel - 1];
          const disguise = thiefCfg.disguise;
          data.fake = {
            phase: "stealing" as const,
            deployedAt: now,
            minEntryAt: now,
            entryAt: now,
            stealStartedAt: now,
            lastProcessedAt: null,
            durationMs: thiefCfg.durationMs,
            stealPerSecond: thiefCfg.stealPerSecond,
            disguise,
            actorSlot: curserSlot,
          };
          changed = true;
        }
      }

      const attack = playerState.thiefAttack;
      if (!attack) continue;

      // Transition waiting → stealing: minimum wait elapsed AND at least one villager is inside
      const canEnter =
        now >= attack.minEntryAt && playerState.villagersOutside < 4;
      if (attack.phase === "waiting" && canEnter) {
        attack.phase = "stealing";
        attack.stealStartedAt = now;
        attack.lastProcessedAt = now;
        // Reschedule expiry from when stealing actually starts (house exit)
        this.scheduleTimer(
          `thief_expire:${playerId}`,
          now + attack.durationMs,
          () => this.expireThief(playerId),
        );
        changed = true;
      }

      // Drain gold
      if (attack.phase === "stealing" && attack.stealStartedAt !== null) {
        const drained = this.drainThief(playerId, now);
        if (drained) changed = true;

        // Check expiry
        if (now >= attack.stealStartedAt + attack.durationMs) {
          playerState.thiefAttack = null;
          this.cancelTimer(`thief_expire:${playerId}`);
          changed = true;
        }
      }
    }

    if (changed) {
      this.broadcastState();
    }
  }

  upgradeTool(
    playerId: string,
    toolId: ToolId,
  ): "ok" | "not_found" | "unknown_tool" | "max_level" | "insufficient_gold" {
    if (!this.state) return "not_found";

    if (!this.config.enabled[toolId]) return "unknown_tool";

    const playerState = this.state.players[playerId];
    if (!playerState) return "not_found";

    const tool = playerState.tools.find((t) => t.id === toolId);
    if (!tool) return "unknown_tool";

    const maxLevel =
      toolId === "fertilizer"
        ? MAX_FERTILIZER_LEVEL
        : toolId === "crows"
          ? MAX_CROW_LEVEL
          : toolId === "thief"
            ? MAX_THIEF_LEVEL
            : toolId === "weather"
              ? MAX_WEATHER_LEVEL
              : MAX_TOOL_LEVEL;
    if (tool.level >= maxLevel) return "max_level";

    const cost = TOOL_COSTS[toolId][tool.level];
    if (playerState.gold < cost) return "insufficient_gold";

    playerState.gold -= cost;
    (playerState.stats.goldSpentUpgradesByTool as Record<string, number>)[
      toolId
    ] =
      ((playerState.stats.goldSpentUpgradesByTool as Record<string, number>)[
        toolId
      ] ?? 0) + cost;
    const prevLevel = tool.level;
    tool.level += 1;

    // A fertilizer upgrade must take effect on crops that are already growing:
    // speed up their remaining grow time without jumping their visible progress.
    if (toolId === "fertilizer") {
      this.speedUpGrowingFields(playerState, prevLevel, tool.level);
    }

    this.broadcastState();

    return "ok";
  }

  // Re-base every growing field so its current progress is preserved but the
  // remaining grow time scales by the new/old fertilizer multiplier ratio.
  private speedUpGrowingFields(
    playerState: PlayerState,
    oldFertLevel: number,
    newFertLevel: number,
  ): void {
    const oldMult = FERTILIZER_GROW_MULTIPLIERS[oldFertLevel];
    const newMult = FERTILIZER_GROW_MULTIPLIERS[newFertLevel];
    if (newMult >= oldMult) return; // upgrade isn't faster — nothing to do

    const scale = newMult / oldMult;
    const now = Date.now();

    for (const field of playerState.fields) {
      if (
        field.stage !== "growing" ||
        field.sowedAt === null ||
        field.readyAt === null
      )
        continue;

      const remaining = field.readyAt - now;
      const total = field.readyAt - field.sowedAt;
      if (remaining <= 0 || total <= 0) continue;

      const progress = (now - field.sowedAt) / total;
      if (progress >= 1) continue;

      // Keep `progress` fixed at `now`, shrink the remaining duration by `scale`.
      const newRemaining = remaining * scale;
      const elapsed = (progress * newRemaining) / (1 - progress);
      field.sowedAt = now - elapsed;
      field.readyAt = now + newRemaining;
      this.rescheduleFieldTimer(playerState.id, field);
    }
  }

  private rollGrowDuration(fertMultiplier: number): number {
    return (
      this.config.baseGrowMs *
      fertMultiplier *
      (1 -
        this.config.growVariance +
        Math.random() * 2 * this.config.growVariance)
    );
  }

  private goldYield(ps: PlayerState): number {
    const fertLevel = ps.tools.find((t) => t.id === "fertilizer")?.level ?? 0;
    return Math.round(
      this.config.goldPerHarvest * FERTILIZER_GOLD_MULTIPLIERS[fertLevel],
    );
  }

  private growMs(ps: PlayerState): number {
    const fertLevel = ps.tools.find((t) => t.id === "fertilizer")?.level ?? 0;
    return this.config.baseGrowMs * FERTILIZER_GROW_MULTIPLIERS[fertLevel];
  }

  private effectiveGrowMs(ps: PlayerState): number {
    const w = ps.weatherEffect;
    return w ? this.growMs(ps) / (1 - w.slowFactor) : this.growMs(ps);
  }

  private goldPerSec(ps: PlayerState): number {
    return this.goldYield(ps) / (this.effectiveGrowMs(ps) / 1000);
  }

  private getPlayerIdBySlot(slot: Slot): string | null {
    return this.slots[slot]?.playerId ?? null;
  }

  private opponentId(playerId: string): string | null {
    if (!this.state) return null;
    return (
      Object.keys(this.state.players).find((id) => id !== playerId) ?? null
    );
  }

  private drainThief(victimId: string, now: number): boolean {
    if (!this.state) return false;
    const victimState = this.state.players[victimId];
    const attack = victimState?.thiefAttack;
    if (
      !attack ||
      attack.phase !== "stealing" ||
      attack.stealStartedAt === null ||
      attack.lastProcessedAt === null
    )
      return false;

    const endMs = attack.stealStartedAt + attack.durationMs;
    const drainTo = Math.min(now, endMs);
    const drainFrom = attack.lastProcessedAt;
    if (drainTo <= drainFrom) return false;

    const elapsedSec = (drainTo - drainFrom) / 1000;
    const toSteal = elapsedSec * attack.stealPerSecond;
    const actualStolen = Math.min(victimState.gold, toSteal);

    if (actualStolen > 0) {
      const creditId =
        attack.beneficiaryId ?? this.getPlayerIdBySlot(attack.actorSlot);
      const creditState = creditId ? this.state.players[creditId] : null;
      const stolen = Math.floor(actualStolen);
      victimState.gold = Math.max(0, victimState.gold - stolen);
      victimState.stats.goldLostToThief += stolen;
      if (creditState) {
        creditState.gold += stolen;
        creditState.stats.goldStolenByThief += stolen;
      }
    }

    attack.lastProcessedAt = drainTo;
    return true;
  }

  private expireWeather(victimId: string): void {
    if (!this.state) return;
    const victimState = this.state.players[victimId];
    if (!victimState?.weatherEffect) return;

    const { slowFactor, actionSlowFactor } = victimState.weatherEffect;
    victimState.weatherEffect = null;
    this.cancelTimer(`weather_expire:${victimId}`);

    const now = Date.now();
    for (const field of victimState.fields) {
      if (field.readyAt === null) continue;
      const sf = field.stage === "growing" ? slowFactor : actionSlowFactor;
      field.readyAt = now + (field.readyAt - now) * (1 - sf);
      this.rescheduleFieldTimer(victimId, field);
    }

    this.broadcastState();
  }

  private expireThief(victimId: string): void {
    if (!this.state) return;
    const victimState = this.state.players[victimId];
    if (!victimState?.thiefAttack) return;

    const now = Date.now();
    if (victimState.thiefAttack.phase === "stealing") {
      this.drainThief(victimId, now);
    }
    victimState.thiefAttack = null;
    this.broadcastState();
  }

  private completeScare(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || !field.crowAttack) return;

    const now = Date.now();
    const { startedAt, eatRatePerMs, baseProgress, totalGrowMs } =
      field.crowAttack;
    const progressEaten = (now - startedAt) * eatRatePerMs;
    const effectiveProgress = Math.max(0, baseProgress - progressEaten);

    const victimState = this.state.players[playerId];
    const attackerId = this.opponentId(playerId);
    const attackerState = attackerId ? this.state.players[attackerId] : null;
    if (victimState && attackerState) {
      if (effectiveProgress <= 0) {
        const toolsLevel = this.getToolLevel(victimState, "tools");
        let resowMs =
          this.config.sowDurationMs * UPGRADE_SPEED_MULTIPLIERS[toolsLevel];
        if (victimState.weatherEffect)
          resowMs += weatherExtra(
            resowMs,
            victimState.weatherEffect.actionSlowFactor,
          );
        const extraRegrowMs =
          baseProgress *
          (this.effectiveGrowMs(victimState) - this.growMs(victimState));
        attackerState.stats.crowGoldDestroyed +=
          baseProgress * this.goldYield(victimState) +
          this.goldPerSec(victimState) * ((resowMs + extraRegrowMs) / 1000);
      } else {
        attackerState.stats.crowGoldDestroyed +=
          Math.min(progressEaten, baseProgress) * this.goldYield(victimState);
      }
    }

    this.cancelTimer(`crow:${playerId}:${fieldIndex}`);
    field.crowAttack = null;
    field.scaringAt = null;

    if (effectiveProgress <= 0) {
      this.destroyField(field);
      this.cancelTimer(`${playerId}:${fieldIndex}`);
    } else {
      field.stage = "growing";
      field.sowedAt = now - effectiveProgress * totalGrowMs;
      field.readyAt = field.sowedAt + totalGrowMs;
      this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
        this.completeGrowth(playerId, fieldIndex),
      );
    }

    this.broadcastState();
  }

  private expireCrowAttack(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || !field.crowAttack) return;

    const victimState = this.state.players[playerId];
    const attackerId = this.opponentId(playerId);
    const attackerState = attackerId ? this.state.players[attackerId] : null;
    if (victimState && attackerState) {
      const { baseProgress } = field.crowAttack;
      const toolsLevel = this.getToolLevel(victimState, "tools");
      let resowMs =
        this.config.sowDurationMs * UPGRADE_SPEED_MULTIPLIERS[toolsLevel];
      if (victimState.weatherEffect)
        resowMs += weatherExtra(
          resowMs,
          victimState.weatherEffect.actionSlowFactor,
        );
      const extraRegrowMs =
        baseProgress *
        (this.effectiveGrowMs(victimState) - this.growMs(victimState));
      attackerState.stats.crowGoldDestroyed +=
        baseProgress * this.goldYield(victimState) +
        this.goldPerSec(victimState) * ((resowMs + extraRegrowMs) / 1000);
    }

    this.cancelTimer(`scare:${playerId}:${fieldIndex}`);
    this.cancelTimer(`${playerId}:${fieldIndex}`);
    this.destroyField(field);

    this.broadcastState();
  }

  private destroyField(field: Field): void {
    field.stage = "empty";
    field.cropType = null;
    field.sowedAt = null;
    field.readyAt = null;
    field.crowAttack = null;
    field.scaringAt = null;
  }

  private rescheduleFieldTimer(playerId: string, field: Field): void {
    if (field.readyAt === null) return;
    const at = field.readyAt;
    if (field.stage === "growing") {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () =>
        this.completeGrowth(playerId, field.index),
      );
    } else if (field.stage === "sowing") {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () =>
        this.completeSow(playerId, field.index),
      );
    } else if (field.stage === "harvesting") {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () =>
        this.completeHarvest(playerId, field.index),
      );
    }
  }

  private getToolLevel(playerState: PlayerState, toolId: ToolId): number {
    return playerState.tools.find((t) => t.id === toolId)?.level ?? 0;
  }

  private presowField(playerId: string, field: Field, now: number): void {
    const totalGrowMs = this.config.baseGrowMs;
    field.stage = "growing";
    field.cropType = PRESOW_CROP_TYPE;
    field.sowedAt = now - PRESOW_PROGRESS * totalGrowMs;
    field.readyAt = field.sowedAt + totalGrowMs;
    this.scheduleTimer(`${playerId}:${field.index}`, field.readyAt, () =>
      this.completeGrowth(playerId, field.index),
    );
  }

  private completeSow(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || field.stage !== "sowing") return;

    const startedAt = Date.now();
    const playerState = this.state.players[playerId];
    if (!playerState) return;
    const fertLevel = this.getToolLevel(playerState, "fertilizer");
    let growDuration = this.rollGrowDuration(
      FERTILIZER_GROW_MULTIPLIERS[fertLevel],
    );

    if (playerState.weatherEffect)
      growDuration += weatherExtra(
        growDuration,
        playerState.weatherEffect.slowFactor,
      );

    field.stage = "growing";
    field.sowedAt = startedAt;
    field.readyAt = startedAt + growDuration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeGrowth(playerId, fieldIndex),
    );
    this.broadcastState();
  }

  private completeGrowth(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || field.stage !== "growing") return;

    field.stage = "ready";
    field.sowedAt = null;
    field.readyAt = null;
    this.broadcastState();
  }

  private completeHarvest(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const playerState = this.state.players[playerId];
    const field = playerState?.fields[fieldIndex];
    if (!playerState || !field || field.stage !== "harvesting") return;

    const fertLevel = this.getToolLevel(playerState, "fertilizer");
    const toolsLevel = this.getToolLevel(playerState, "tools");
    const fullGold = this.goldYield(playerState);
    playerState.gold += fullGold;

    playerState.stats.fieldsHarvested++;
    playerState.stats.goldEarnedHarvest += fullGold;
    playerState.stats.upgradeExtraProfitFertilizer +=
      fullGold - this.config.goldPerHarvest;
    let actionSaved =
      (this.config.sowDurationMs + this.config.harvestDurationMs) *
      (1 - UPGRADE_SPEED_MULTIPLIERS[toolsLevel]);
    if (playerState.weatherEffect)
      actionSaved += weatherExtra(
        actionSaved,
        playerState.weatherEffect.actionSlowFactor,
      );
    if (actionSaved > 0) {
      playerState.stats.upgradeExtraProfitSpeed +=
        this.goldPerSec(playerState) * (actionSaved / 1000);
    }

    this.destroyField(field);
    this.broadcastState();
  }

  private scheduleTimer(
    key: string,
    firesAt: number,
    onFire: () => void,
  ): void {
    const existing = this.timers.get(key);
    if (existing !== undefined) clearTimeout(existing);
    const timer = setTimeout(onFire, Math.max(0, firesAt - Date.now()));
    this.timers.set(key, timer);
  }

  private cancelTimer(key: string): void {
    const existing = this.timers.get(key);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.timers.delete(key);
    }
  }

  // ---------------------------------------------------------------------------
  // Mirror / Paranoia / Fake-Merchant helpers
  // ---------------------------------------------------------------------------

  private mirrorActive(now: number): ActiveEffect | null {
    if (!this.state) return null;
    for (const ps of Object.values(this.state.players)) {
      const mirror = ps.activeEffects.find(
        (e) =>
          e.itemId === "mirror_curse" && (e.endsAt === null || e.endsAt > now),
      );
      if (mirror) return mirror;
    }
    return null;
  }

  private findParanoiaWithFake(ps: PlayerState): ActiveEffect | null {
    return (
      ps.activeEffects.find(
        (e) =>
          e.itemId === "paranoia_curse" &&
          e.data != null &&
          (e.data as { fake: unknown }).fake != null,
      ) ?? null
    );
  }

  private sendToastTo(recipientId: string, text: string): void {
    const session = this.getSessions().find((s) => s.playerId === recipientId);
    session?.send({ type: "toast", text });
  }

  private sendCenterToastToAll(text: string): void {
    for (const session of this.getSessions()) {
      session.send({ type: "center_toast", text });
    }
  }

  private deployFakeMerchant(
    opponentId: string,
    byPlayerId: string,
    afterMs?: number,
  ): void {
    if (afterMs && afterMs > 0) {
      this.scheduleTimer(
        `fake_merchant_deploy:${opponentId}`,
        Date.now() + afterMs,
        () => this.deployFakeMerchant(opponentId, byPlayerId),
      );
      return;
    }
    if (!this.state) return;
    const opponent = this.state.players[opponentId];
    if (!opponent) return;
    if (opponent.merchant?.fake) return;
    if (opponent.merchant && !opponent.merchant.fake) {
      // Real merchant still present (e.g. overstay) — reschedule after they leave
      this.scheduleTimer(
        `fake_merchant_deploy:${opponentId}`,
        Date.now() + FAKE_MERCHANT_POST_REAL_DELAY_MS,
        () => this.deployFakeMerchant(opponentId, byPlayerId),
      );
      return;
    }
    const now = Date.now();
    const fakeOffers = this.rollOffers(opponent, 1 - FAKE_MERCHANT_PRICE_PCT);
    const leavesAt = now + MERCHANT_STAY_MS;
    opponent.merchant = {
      visitIndex: -1,
      arrivesAt: now,
      leavesAt,
      discountPct: 0,
      offers: fakeOffers,
      windowOpen: false,
      fake: { byPlayerId, feeStep: 0, drained: 0 },
    };
    this.scheduleTimer(`merchant_leave:${opponentId}`, leavesAt, () =>
      this.tryMerchantDepart(opponentId),
    );
    this.broadcastState();
  }

  // ---------------------------------------------------------------------------
  // Per-player redacted broadcast
  // ---------------------------------------------------------------------------

  private redactStateFor(recipientId: string): GameState {
    const clone = structuredClone(this.state!) as GameState;
    for (const [pid, ps] of Object.entries(clone.players)) {
      // Paranoia: synthesize fake thief for the victim before stripping effects
      if (pid === recipientId && ps.thiefAttack === null) {
        const paranoia = this.findParanoiaWithFake(ps);
        if (paranoia?.data) {
          ps.thiefAttack = (paranoia.data as { fake: ThiefAttack }).fake;
        }
      }

      ps.activeEffects = ps.activeEffects.filter((e) => {
        if (e.visibility === "both") return true;
        if (e.visibility === "owner") return pid === recipientId;
        if (e.visibility === "source") return e.sourcePlayerId === recipientId;
        return false;
      });
      if (pid !== recipientId) {
        ps.merchant = null;
      } else if (ps.merchant?.fake) {
        delete ps.merchant.fake;
      }
    }
    return clone;
  }

  resetPlayerCooldowns(playerId: string): void {
    if (!this.state) return;
    const player = this.state.players[playerId];
    if (!player) return;
    for (const tool of player.tools) {
      tool.cooldownUntil = 0;
    }
    this.broadcastState();
  }

  // Tutorial: forcibly end a player's active weather and restore its slowed
  // field timers, so a fresh storm can be cast at them right away. No-op if the
  // player has no active weather. Reuses the normal expiry path.
  cancelWeather(playerId: string): void {
    this.expireWeather(playerId);
  }

  broadcastState(): void {
    if (!this.state) return;
    const serverNow = Date.now();
    for (const session of this.getSessions()) {
      session.send({
        type: "game_state",
        state: this.redactStateFor(session.playerId),
        serverNow,
      });
    }
  }

  sendStateTo(playerId: string): void {
    if (!this.state) return;
    const session = this.getSessions().find((s) => s.playerId === playerId);
    if (session) {
      session.send({
        type: "game_state",
        state: this.redactStateFor(playerId),
        serverNow: Date.now(),
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Merchant visit scheduling + catch-up
  // ---------------------------------------------------------------------------

  private beginMerchantVisit(visitIndex: number): void {
    if (!this.state || this.state.phase !== "playing") return;
    const now = Date.now();
    if (this.state.endsAt && this.state.endsAt - now < 25_000) return;

    const elapsed = now - (this.state.startedAt ?? now);
    const stage =
      MERCHANT_CATCHUP_STAGES.find((s) => elapsed <= s.untilMs) ??
      MERCHANT_CATCHUP_STAGES[MERCHANT_CATCHUP_STAGES.length - 1];

    const players = Object.values(this.state.players);
    if (players.length < 2) return;
    const [pa, pb] = players as [PlayerState, PlayerState];

    const catchupScore = (ps: PlayerState) => {
      const cum = ps.stats.goldEarnedHarvest + ps.stats.goldStolenByThief;
      return stage.cumWeight * cum + stage.balWeight * ps.gold;
    };

    const scoreA = catchupScore(pa);
    const scoreB = catchupScore(pb);
    const gap = Math.abs(scoreA - scoreB);

    if (gap < MERCHANT_MIN_SCORE_GAP) {
      this.setMerchantForPlayer(pa.id, visitIndex, now, 0);
      this.setMerchantForPlayer(pb.id, visitIndex, now, 0);
    } else {
      const worse = scoreA < scoreB ? pa : pb;
      const better = scoreA < scoreB ? pb : pa;
      this.setMerchantForPlayer(
        worse.id,
        visitIndex,
        now,
        MERCHANT_DISCOUNT_PCT,
      );
      this.setMerchantForPlayer(
        better.id,
        visitIndex,
        now + MERCHANT_HEAD_START_MS,
        0,
      );
    }

    this.broadcastState();
  }

  private setMerchantForPlayer(
    playerId: string,
    visitIndex: number,
    arrivesAt: number,
    discountPct: number,
  ): void {
    if (!this.state) return;
    const ps = this.state.players[playerId];
    if (!ps) return;
    const leavesAt = arrivesAt + MERCHANT_STAY_MS;
    ps.merchant = {
      visitIndex,
      arrivesAt,
      leavesAt,
      discountPct,
      offers: this.rollOffers(ps, discountPct),
      windowOpen: false,
    };
    this.scheduleTimer(`merchant_leave:${playerId}`, leavesAt, () =>
      this.tryMerchantDepart(playerId),
    );
  }

  private rollOffers(ps: PlayerState, discountPct: number): MerchantOffer[] {
    const pool = Object.values(ITEM_DEFS).filter((def) => {
      if (!ITEM_HANDLERS[def.id]) return false;
      if (itemsHeld(ps, def.id) > 0) return false;
      if (def.maxPerMatch === null) return true;
      return itemsHeld(ps, def.id) < def.maxPerMatch;
    });

    const offers: MerchantOffer[] = [];
    const remaining = [...pool];
    for (let i = 0; i < MERCHANT_OFFER_COUNT && remaining.length > 0; i++) {
      const totalWeight = remaining.reduce((s, d) => s + d.rarityWeight, 0);
      let rand = Math.random() * totalWeight;
      let chosenIdx = remaining.length - 1;
      for (let j = 0; j < remaining.length; j++) {
        rand -= remaining[j].rarityWeight;
        if (rand <= 0) {
          chosenIdx = j;
          break;
        }
      }
      const chosen = remaining[chosenIdx];
      remaining.splice(chosenIdx, 1);
      offers.push({
        itemId: chosen.id,
        basePrice: chosen.price,
        price: Math.round(chosen.price * (1 - discountPct)),
        bought: false,
      });
    }
    return offers;
  }

  /**
   * Tutorial-only: make a merchant arrive for `playerId` offering a forced item
   * (so Stage 3 can teach swap → mirror → blindness deterministically). The
   * forced item leads the offer list, padded with random offers via `rollOffers`.
   * Reuses the normal merchant entity/modal/departure machinery.
   */
  triggerTutorialMerchant(playerId: string, forcedItemId: ItemId): void {
    if (!this.state || this.state.phase !== "playing") return;
    const ps = this.state.players[playerId];
    if (!ps) return;
    const now = Date.now();
    const arrivesAt = now + MERCHANT_TUTORIAL_ARRIVE_MS;
    const leavesAt = arrivesAt + MERCHANT_STAY_MS;
    const def = ITEM_DEFS[forcedItemId];
    const forcedOffer: MerchantOffer = {
      itemId: forcedItemId,
      basePrice: def.price,
      price: def.price,
      bought: false,
    };
    const padding = this.rollOffers(ps, 0)
      .filter((o) => o.itemId !== forcedItemId)
      .slice(0, MERCHANT_OFFER_COUNT - 1);
    const offers = [forcedOffer, ...padding];
    ps.merchant = {
      visitIndex: this.tutorialMerchantVisits++,
      arrivesAt,
      leavesAt,
      discountPct: 0,
      offers,
      windowOpen: false,
    };
    this.scheduleTimer(`merchant_leave:${playerId}`, leavesAt, () =>
      this.tryMerchantDepart(playerId),
    );
    this.broadcastState();
  }

  /**
   * Tutorial-only: unlock the player's crows and thief at level 1 so the Stage-3
   * "blindness + sabotage combo" step can send them without a separate upgrade
   * lesson (Stage 3 doesn't teach upgrading).
   */
  grantTutorialSabotage(playerId: string): void {
    if (!this.state) return;
    const ps = this.state.players[playerId];
    if (!ps) return;
    for (const id of ["crows", "thief"] as ToolId[]) {
      const tool = ps.tools.find((t) => t.id === id);
      if (tool && tool.level < 1) tool.level = 1;
    }
    this.broadcastState();
  }

  private tryMerchantDepart(playerId: string): void {
    if (!this.state) return;
    const ps = this.state.players[playerId];
    if (!ps?.merchant) return;
    const now = Date.now();
    if (
      ps.merchant.windowOpen &&
      now < ps.merchant.leavesAt + MERCHANT_OVERSTAY_MAX_MS
    ) {
      this.scheduleTimer(
        `merchant_leave:${playerId}`,
        now + MERCHANT_WINDOW_RECHECK_MS,
        () => this.tryMerchantDepart(playerId),
      );
      return;
    }
    // Fake merchant departure: transfer drained gold to source player
    if (ps.merchant.fake && ps.merchant.fake.drained > 0) {
      const { byPlayerId, drained } = ps.merchant.fake;
      const sourceState = this.state.players[byPlayerId];
      if (sourceState) {
        sourceState.gold += drained;
        sourceState.stats.goldDrainedFakeMerchant += drained;
      }
      this.sendToastTo(
        byPlayerId,
        `Dein falscher Haendler hat ${drained} Gold ergaunert!`,
      );
    }
    ps.merchant = null;
    this.broadcastState();
  }

  setMerchantWindow(playerId: string, open: boolean): void {
    if (!this.state) return;
    const ps = this.state.players[playerId];
    if (!ps?.merchant) return;
    const now = Date.now();
    if (open && now < ps.merchant.arrivesAt) return;
    ps.merchant.windowOpen = open;
    if (!open && now >= ps.merchant.leavesAt) {
      ps.merchant = null;
      this.broadcastState();
      return;
    }
    this.broadcastState();
  }

  // ---------------------------------------------------------------------------
  // BuyItem
  // ---------------------------------------------------------------------------

  buyItem(
    playerId: string,
    itemId: ItemId,
  ):
    | "ok"
    | "no_merchant"
    | "not_offered"
    | "already_bought"
    | "insufficient_gold"
    | "inventory_full"
    | "already_have" {
    if (!this.state) return "no_merchant";
    if (!this.config.enabled.merchant) return "no_merchant";
    const ps = this.state.players[playerId];
    if (!ps) return "no_merchant";
    const now = Date.now();
    if (!ps.merchant || now < ps.merchant.arrivesAt) return "no_merchant";

    const offer = ps.merchant.offers.find((o) => o.itemId === itemId);
    if (!offer) return "not_offered";

    // Fake merchant: drain gold without delivering the item
    if (ps.merchant.fake) {
      if (ps.gold < offer.price) return "insufficient_gold";
      ps.gold -= offer.price;
      ps.stats.goldSpentMerchant += offer.price;
      ps.merchant.fake.drained += offer.price;
      ps.merchant.fake.feeStep++;
      const step = ps.merchant.fake.feeStep;
      const fee =
        FAKE_MERCHANT_FEE_SCHEDULE[
          Math.min(step - 1, FAKE_MERCHANT_FEE_SCHEDULE.length - 1)
        ];
      for (const o of ps.merchant.offers) {
        if (!o.bought) o.price += fee;
      }
      if (step - 1 < FAKE_MERCHANT_EXCUSES.length) {
        ps.merchant.notice = FAKE_MERCHANT_EXCUSES[step - 1];
      }
      this.broadcastState();
      return "ok";
    }

    if (ps.merchant.offers.some((o) => o.bought)) return "already_bought";
    if (ps.gold < offer.price) return "insufficient_gold";

    const def = ITEM_DEFS[itemId];
    if (def.maxPerMatch != null && itemsHeld(ps, itemId) >= def.maxPerMatch)
      return "already_bought";
    if (ps.items.filter((i) => i.count > 0).length >= 3)
      return "inventory_full";
    if (ps.items.some((i) => i.id === itemId && i.count > 0))
      return "already_have";

    ps.gold -= offer.price;
    offer.bought = true;
    ps.stats.goldSpentMerchant += offer.price;
    (ps.stats.itemsBought as Record<string, number>)[itemId] =
      ((ps.stats.itemsBought as Record<string, number>)[itemId] ?? 0) + 1;

    const existing = ps.items.find((i) => i.id === itemId);
    if (existing) {
      existing.count++;
      existing.pricePaid = offer.price;
    } else {
      const def = ITEM_DEFS[itemId];
      ps.items.push({
        id: itemId,
        name: def.name,
        count: 1,
        cooldownUntil: 0,
        pricePaid: offer.price,
      });
    }

    this.broadcastState();
    return "ok";
  }

  // ---------------------------------------------------------------------------
  // UseItem + effect registry
  // ---------------------------------------------------------------------------

  useItem(
    playerId: string,
    itemId: ItemId,
    targetFieldIndex?: number,
    secondTargetFieldIndex?: number,
  ):
    | "ok"
    | "not_found"
    | "no_item"
    | "not_implemented"
    | "invalid_target"
    | "not_applicable" {
    if (!this.state || this.state.phase !== "playing") return "not_found";
    if (!this.config.enabled.items) return "no_item";
    const ps = this.state.players[playerId];
    if (!ps) return "not_found";

    const item = ps.items.find((i) => i.id === itemId);
    if (!item || item.count <= 0) return "no_item";

    const opponentId = this.opponentId(playerId);
    const opponent = opponentId ? this.state.players[opponentId] : null;
    if (!opponent) return "not_found";

    const handler = ITEM_HANDLERS[itemId];
    if (!handler) return "not_implemented";

    const now = Date.now();
    const ctx = {
      state: this.state,
      user: ps,
      opponent,
      targetFieldIndex,
      secondTargetFieldIndex,
      now,
      addEffect: (
        owner: PlayerState,
        e: Omit<ActiveEffect, "id" | "startedAt">,
      ) => this.addEffect(owner, e),
      scheduleTimer: (key: string, firesAt: number, onFire: () => void) =>
        this.scheduleTimer(key, firesAt, onFire),
      cancelTimer: (key: string) => this.cancelTimer(key),
      rescheduleFieldTimer: (pid: string, fieldIndex: number) => {
        const field = this.state?.players[pid]?.fields[fieldIndex];
        if (field) this.rescheduleFieldTimer(pid, field);
      },
      rescheduleCrowTimer: (pid: string, fieldIndex: number) => {
        const field = this.state?.players[pid]?.fields[fieldIndex];
        if (!field?.crowAttack) return;
        const at =
          Date.now() +
          field.crowAttack.baseProgress / field.crowAttack.eatRatePerMs;
        this.scheduleTimer(`crow:${pid}:${fieldIndex}`, at, () =>
          this.expireCrowAttack(pid, fieldIndex),
        );
      },
      broadcastState: () => this.broadcastState(),
      deployFakeMerchant: (oId: string, byId: string, afterMs?: number) =>
        this.deployFakeMerchant(oId, byId, afterMs),
      sendCenterToast: (text: string) => this.sendCenterToastToAll(text),
    };

    const result = handler(ctx);
    if (result === "ok") {
      item.count--;
      (ps.stats.itemsUsedByType as Record<string, number>)[itemId] =
        ((ps.stats.itemsUsedByType as Record<string, number>)[itemId] ?? 0) + 1;
      this.broadcastState();
    }
    return result;
  }

  private addEffect(
    owner: PlayerState,
    e: Omit<ActiveEffect, "id" | "startedAt">,
  ): ActiveEffect {
    const id = `${owner.id}_fx_${this.effectCounter++}`;
    const now = Date.now();
    const effect: ActiveEffect = { ...e, id, startedAt: now };
    owner.activeEffects.push(effect);
    if (effect.endsAt !== null) {
      this.scheduleTimer(`effect_expire:${id}`, effect.endsAt, () => {
        if (!this.state) return;
        for (const ps of Object.values(this.state.players)) {
          const idx = ps.activeEffects.findIndex((ef) => ef.id === id);
          if (idx !== -1) {
            ps.activeEffects.splice(idx, 1);
            this.broadcastState();
            break;
          }
        }
      });
    }
    return effect;
  }
}

export class GameManager {
  private games: Map<string, Game> = new Map();
  private knownSlots: Map<string, { slot: Slot; roomCode: string }> = new Map();

  private generateRoomCode(): string {
    for (;;) {
      let code = "";
      for (let i = 0; i < 6; i++) {
        code +=
          ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
      if (!this.games.has(code)) return code;
    }
  }

  createRoom(session: Session): { roomCode: string; slot: Slot } {
    const roomCode = this.generateRoomCode();
    const game = new Game(roomCode);
    this.games.set(roomCode, game);
    const slot = game.join(session)!;
    this.knownSlots.set(session.playerId, { slot, roomCode });
    console.log(
      `[game] ${session.playerId} created room ${roomCode} as ${slot}`,
    );
    return { roomCode, slot };
  }

  handleHello(
    session: Session,
    roomCode?: string,
  ): {
    result: "assigned" | "rejoined" | "full" | "no_room" | "not_found";
    slot?: Slot;
    game?: Game;
  } {
    const existing = this.knownSlots.get(session.playerId);

    if (existing) {
      const game = this.games.get(existing.roomCode);
      if (!game) return { result: "not_found" };
      game.rejoin(session, existing.slot);
      console.log(
        `[game] ${session.playerId} rejoined room ${existing.roomCode} as ${existing.slot}`,
      );
      return { result: "rejoined", slot: existing.slot, game };
    }

    if (!roomCode) return { result: "no_room" };

    const game = this.games.get(roomCode);
    if (!game) return { result: "not_found" };

    const slot = game.join(session);
    if (!slot) {
      console.log(
        `[game] ${session.playerId} tried to join ${roomCode} but it's full`,
      );
      return { result: "full" };
    }

    this.knownSlots.set(session.playerId, { slot, roomCode });
    console.log(
      `[game] ${session.playerId} joined room ${roomCode} as ${slot}`,
    );
    return { result: "assigned", slot, game };
  }

  handleDisconnect(playerId: string): Game | undefined {
    const existing = this.knownSlots.get(playerId);
    if (!existing) return undefined;
    const game = this.games.get(existing.roomCode);
    game?.leave(playerId);
    // Keep knownSlots so the player can rejoin after reload
    console.log(
      `[game] ${playerId} disconnected from room ${existing.roomCode} (slot reserved)`,
    );
    return game;
  }

  clearSlot(playerId: string): void {
    this.knownSlots.delete(playerId);
  }

  clearGame(roomCode: string): void {
    this.games.delete(roomCode);
  }

  createTutorialRoom(session: Session, stage: TutorialStageId): { slot: Slot } {
    // Clear any existing slot for this player so they start fresh
    const existing = this.knownSlots.get(session.playerId);
    if (existing) {
      const oldGame = this.games.get(existing.roomCode);
      if (oldGame?.isTutorial()) {
        oldGame.forfeit(session.playerId);
        this.games.delete(existing.roomCode);
      }
    }

    const roomCode = this.generateRoomCode();
    const config = gameConfigForStage(stage);
    const game = new Game(roomCode, config);
    this.games.set(roomCode, game);

    const slot = game.join(session)!;
    this.knownSlots.set(session.playerId, { slot, roomCode });

    const botId = `bot_${roomCode}`;
    const botSession = new BotSession(botId);
    game.join(botSession);

    const botController = new BotController(game, botId);
    game.setBotController(botController);

    console.log(
      `[game] Tutorial room ${roomCode} created for ${session.playerId} (stage ${stage})`,
    );
    return { slot };
  }

  createBotMatchRoom(session: Session): { slot: Slot } {
    // Clear any existing tutorial/bot-match room for this player so they start
    // fresh (mirrors createTutorialRoom).
    const existing = this.knownSlots.get(session.playerId);
    if (existing) {
      const oldGame = this.games.get(existing.roomCode);
      if (oldGame?.isTutorial() || oldGame?.isBotMatch()) {
        oldGame.forfeit(session.playerId);
        this.games.delete(existing.roomCode);
      }
    }

    const roomCode = this.generateRoomCode();
    const game = new Game(roomCode, BOT_MATCH_CONFIG);
    this.games.set(roomCode, game);

    const slot = game.join(session)!;
    this.knownSlots.set(session.playerId, { slot, roomCode });

    const botId = `bot_${roomCode}`;
    const botSession = new BotSession(botId);
    game.join(botSession);

    const botController = new MatchBotController(game, botId);
    game.setBotController(botController);

    console.log(
      `[game] Bot match room ${roomCode} created for ${session.playerId}`,
    );
    return { slot };
  }

  getGame(roomCode: string): Game | undefined {
    return this.games.get(roomCode);
  }

  getRoomCodeOf(playerId: string): string | undefined {
    return this.knownSlots.get(playerId)?.roomCode;
  }

  getAllGames(): IterableIterator<Game> {
    return this.games.values();
  }
}

export const gameManager = new GameManager();
