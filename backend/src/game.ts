import type { ServerMessage, GameState, Field, PlayerState, ToolId, ThiefAttack } from '@gamedesign/shared';
import { Session } from './session.js';
import {
  SOW_DURATION_MS,
  HARVEST_DURATION_MS,
  BASE_GROW_MS,
  GROW_VARIANCE,
  GOLD_PER_HARVEST,
  STARTING_GOLD,
  UPGRADE_SPEED_MULTIPLIERS,
  MAX_TOOL_LEVEL,
  SOW_UPGRADE_COSTS,
  SOW_GROW_MULTIPLIERS,
  HARVEST_UPGRADE_COSTS,
  HARVEST_GOLD_MULTIPLIERS,
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
  THIEF_GOLD_RETURN_FRACTION,
  WEATHER_LEVELS,
  MAX_WEATHER_LEVEL,
  WEATHER_UPGRADE_COSTS,
  WEATHER_MAX_EXTRA_MS,
  ACCUSATION_PAUSE_MS,
} from './constants.js';

type Slot = 'p1' | 'p2';

const MATCH_DURATION_MS = 8 * 60 * 1000;

const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TOOL_COSTS: Record<ToolId, readonly number[]> = {
  sow: SOW_UPGRADE_COSTS,
  harvest: HARVEST_UPGRADE_COSTS,
  fertilizer: FERTILIZER_UPGRADE_COSTS,
  crows: CROW_UPGRADE_COSTS,
  thief: THIEF_UPGRADE_COSTS,
  weather: WEATHER_UPGRADE_COSTS,
};

function weatherExtra(remaining: number, slowFactor: number): number {
  return Math.min(remaining * slowFactor / (1 - slowFactor), WEATHER_MAX_EXTRA_MS);
}

function rollGrowDuration(fertMultiplier: number): number {
  return (
    BASE_GROW_MS * fertMultiplier * (1 - GROW_VARIANCE + Math.random() * 2 * GROW_VARIANCE)
  );
}

function createField(index: number): Field {
  return {
    index,
    stage: 'empty',
    cropType: null,
    sowedAt: null,
    readyAt: null,
    crowAttack: null,
    scaringAt: null,
  };
}

function createPlayerState(playerId: string): PlayerState {
  return {
    id: playerId,
    gold: STARTING_GOLD,
    score: 0,
    fields: [0, 1, 2, 3].map(createField),
    tools: [
      { id: 'sow',        level: 0, cooldownUntil: 0 },
      { id: 'harvest',    level: 0, cooldownUntil: 0 },
      { id: 'fertilizer', level: 0, cooldownUntil: 0 },
      { id: 'crows',      level: 0, cooldownUntil: 0 },
      { id: 'thief',      level: 0, cooldownUntil: 0 },
      { id: 'weather',    level: 0, cooldownUntil: 0 },
    ],
    items: [],
    thiefAttack: null,
    weatherEffect: null,
    villagersOutside: 4,
    wrongAccusationCount: 0,
  };
}

export class Game {
  readonly id: string;
  private slots: { p1: Session | null; p2: Session | null } = { p1: null, p2: null };
  private state: GameState | null = null;
  private timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(id: string) {
    this.id = id;
  }

  join(session: Session): Slot | null {
    if (!this.slots.p1) {
      this.slots.p1 = session;
      return 'p1';
    }
    if (!this.slots.p2) {
      this.slots.p2 = session;
      return 'p2';
    }
    return null;
  }

  rejoin(session: Session, slot: Slot): void {
    this.slots[slot] = session;
  }

  leave(playerId: string): Slot | null {
    for (const slot of ['p1', 'p2'] as Slot[]) {
      if (this.slots[slot]?.playerId === playerId) {
        this.slots[slot] = null;
        return slot;
      }
    }
    return null;
  }

  getSlotOf(playerId: string): Slot | null {
    for (const slot of ['p1', 'p2'] as Slot[]) {
      if (this.slots[slot]?.playerId === playerId) return slot;
    }
    return null;
  }

  getOpponent(slot: Slot): Session | null {
    return slot === 'p1' ? this.slots.p2 : this.slots.p1;
  }

  isFull(): boolean {
    return this.slots.p1 !== null && this.slots.p2 !== null;
  }

  isEmpty(): boolean {
    return this.slots.p1 === null && this.slots.p2 === null;
  }

  getSessions(): Session[] {
    return [this.slots.p1, this.slots.p2].filter((s): s is Session => s !== null);
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
    const p1Id = this.slots.p1!.playerId;
    const p2Id = this.slots.p2!.playerId;
    const startedAt = Date.now();

    this.state = {
      roomCode: this.id,
      phase: 'playing',
      startedAt,
      endsAt: startedAt + MATCH_DURATION_MS,
      players: {
        [p1Id]: createPlayerState(p1Id),
        [p2Id]: createPlayerState(p2Id),
      },
      winnerId: null,
    };

    this.scheduleTimer('match_end', startedAt + MATCH_DURATION_MS, () => this.endMatch());
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private endMatch(): void {
    if (!this.state || this.state.phase !== 'playing') return;
    const [a, b] = Object.values(this.state.players);
    this.state.phase = 'ended';
    this.state.winnerId = a.gold > b.gold ? a.id : b.gold > a.gold ? b.id : null;
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private playAgainVotes: Set<string> = new Set();

  votePlayAgain(playerId: string): void {
    this.playAgainVotes.add(playerId);
    if (this.playAgainVotes.size >= 2) {
      this.playAgainVotes.clear();
      this.resetAndRestart();
    }
  }

  reportVillagersOutside(playerId: string, count: number): void {
    if (!this.state) return;
    const playerState = this.state.players[playerId];
    if (!playerState) return;
    playerState.villagersOutside = Math.max(0, Math.min(4, count));
    this.broadcast({ type: 'game_state', state: this.state });
  }

  forfeit(playerId: string): void {
    if (!this.state || this.state.phase !== 'playing') return;
    const opponentId = Object.keys(this.state.players).find((id) => id !== playerId);
    this.cancelTimer('match_end');
    this.state.phase = 'ended';
    this.state.winnerId = opponentId ?? null;
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private resetAndRestart(): void {
    for (const key of [...this.timers.keys()]) this.cancelTimer(key);
    this.startGame();
    this.broadcast({ type: 'game_ready' });
  }

  sowField(
    playerId: string,
    fieldIndex: number,
    cropType: string,
  ): 'ok' | 'not_empty' | 'not_found' | 'field_paused' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (field.fieldBlockedUntil && field.fieldBlockedUntil > Date.now()) return 'field_paused';
    if (field.stage !== 'empty') return 'not_empty';

    const startedAt = Date.now();
    let duration =
      SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, 'sow')];
    if (playerState.weatherEffect)
      duration += weatherExtra(duration, playerState.weatherEffect.actionSlowFactor);
    field.stage = 'sowing';
    field.cropType = cropType;
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeSow(playerId, fieldIndex),
    );
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  harvestField(playerId: string, fieldIndex: number): 'ok' | 'not_ready' | 'not_found' | 'field_paused' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (field.fieldBlockedUntil && field.fieldBlockedUntil > Date.now()) return 'field_paused';
    if (field.stage !== 'ready') return 'not_ready';

    const startedAt = Date.now();
    let duration =
      HARVEST_DURATION_MS *
      UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, 'harvest')];
    if (playerState.weatherEffect)
      duration += weatherExtra(duration, playerState.weatherEffect.actionSlowFactor);
    field.stage = 'harvesting';
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeHarvest(playerId, fieldIndex),
    );
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  sendCrows(
    playerId: string,
    targetFieldIndices: number[],
  ): 'ok' | 'not_found' | 'not_unlocked' | 'on_cooldown' | 'insufficient_gold' | 'invalid_target' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const crowTool = playerState.tools.find((t) => t.id === 'crows');
    if (!crowTool || crowTool.level === 0) return 'not_unlocked';

    const now = Date.now();
    if (crowTool.cooldownUntil > now) return 'on_cooldown';
    if (playerState.gold < CROW_SEND_COST) return 'insufficient_gold';

    const opponentState = Object.values(this.state.players).find((p) => p.id !== playerId);
    if (!opponentState) return 'not_found';

    const config = CROW_LEVEL_CONFIG[crowTool.level - 1];

    // Validate: no duplicates, correct count, each field eligible
    const deduped = [...new Set(targetFieldIndices)];
    if (deduped.length === 0 || deduped.length > config.fieldCount) return 'invalid_target';
    const targets: Field[] = [];
    for (const idx of deduped) {
      const field = opponentState.fields[idx];
      if (
        !field ||
        (field.stage !== 'growing' && field.stage !== 'ready') ||
        field.crowAttack !== null
      ) {
        return 'invalid_target';
      }
      targets.push(field);
    }

    for (const field of targets) {
      const baseProgress =
        field.stage === 'ready'
          ? 1.0
          : Math.min(1, (now - field.sowedAt!) / (field.readyAt! - field.sowedAt!));
      const totalGrowMs =
        field.stage === 'ready' ? BASE_GROW_MS : field.readyAt! - field.sowedAt!;

      field.crowAttack = {
        startedAt: now,
        eatRatePerMs: config.eatRatePerMs,
        baseProgress,
        totalGrowMs,
        level: crowTool.level,
      };

      const expiresAt = now + baseProgress / config.eatRatePerMs;
      this.scheduleTimer(`crow:${opponentState.id}:${field.index}`, expiresAt, () =>
        this.expireCrowAttack(opponentState.id, field.index),
      );
    }

    playerState.gold -= CROW_SEND_COST;
    crowTool.cooldownUntil = now + CROW_COOLDOWN_MS;

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  scareCrow(
    playerId: string,
    fieldIndex: number,
  ): 'ok' | 'not_found' | 'no_crow' | 'already_scaring' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (!field.crowAttack) return 'no_crow';
    if (field.scaringAt !== null) return 'already_scaring';

    const now = Date.now();
    field.scaringAt = now;
    const scareDurationMs = CROW_LEVEL_CONFIG[field.crowAttack.level - 1].scareDurationMs;
    this.scheduleTimer(`scare:${playerId}:${fieldIndex}`, now + scareDurationMs, () =>
      this.completeScare(playerId, fieldIndex),
    );

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  sendThief(
    playerId: string,
  ): 'ok' | 'not_found' | 'not_unlocked' | 'on_cooldown' | 'insufficient_gold' | 'target_busy' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const thiefTool = playerState.tools.find((t) => t.id === 'thief');
    if (!thiefTool || thiefTool.level === 0) return 'not_unlocked';

    const now = Date.now();
    if (thiefTool.cooldownUntil > now) return 'on_cooldown';

    const cfg = THIEF_LEVELS[thiefTool.level - 1];
    if (playerState.gold < cfg.cost) return 'insufficient_gold';

    const opponentState = Object.values(this.state.players).find((p) => p.id !== playerId);
    if (!opponentState) return 'not_found';
    if (opponentState.thiefAttack !== null) return 'target_busy';

    const actorSlot = this.getSlotOf(playerId)!;
    const entryAt = now + cfg.minWaitMs + Math.random() * (cfg.maxWaitMs - cfg.minWaitMs);

    const attack: ThiefAttack = {
      phase: 'waiting',
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

    opponentState.thiefAttack = attack;
    playerState.gold -= cfg.cost;
    thiefTool.cooldownUntil = now + cfg.cooldownMs;

    // Safety-net: clean up if the thief never gets to enter (all villagers stay outside)
    this.scheduleTimer(`thief_expire:${opponentState.id}`, now + cfg.maxWaitMs + cfg.durationMs, () =>
      this.expireThief(opponentState.id),
    );

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  catchThief(
    playerId: string,
  ): 'ok' | 'not_found' | 'no_thief' | 'still_waiting' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';
    if (!playerState.thiefAttack) return 'no_thief';
    if (playerState.thiefAttack.phase === 'waiting') return 'still_waiting';

    const now = Date.now();
    this.drainThief(playerId, now);
    playerState.thiefAttack = null;
    this.cancelTimer(`thief_expire:${playerId}`);

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  accuseVillager(
    playerId: string,
    villagerId: number,
  ): 'ok' | 'not_found' | 'invalid_field' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[villagerId];
    if (!field) return 'invalid_field';

    playerState.wrongAccusationCount++;

    const now = Date.now();

    if (playerState.wrongAccusationCount >= 3) {
      playerState.wrongAccusationCount = 0;

      const unblockAt = now + ACCUSATION_PAUSE_MS;
      field.fieldBlockedUntil = unblockAt;

      if (field.stage === 'growing' && field.readyAt !== null) {
        field.growthPausedUntil = unblockAt;
        field.readyAt += ACCUSATION_PAUSE_MS;
        this.rescheduleFieldTimer(playerId, field);
      }

      // Single timer clears both flags when punishment expires
      this.scheduleTimer(`accusation_pause:${playerId}:${villagerId}`, unblockAt, () => {
        if (this.state) {
          const f = this.state.players[playerId]?.fields[villagerId];
          if (f) {
            delete f.fieldBlockedUntil;
            delete f.growthPausedUntil;
          }
          this.broadcast({ type: 'game_state', state: this.state });
        }
      });
    }

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  sendWeather(
    playerId: string,
  ): 'ok' | 'not_found' | 'not_unlocked' | 'on_cooldown' | 'insufficient_gold' | 'already_active' {
    if (!this.state) return 'not_found';
    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const weatherTool = playerState.tools.find((t) => t.id === 'weather');
    if (!weatherTool || weatherTool.level === 0) return 'not_unlocked';

    const now = Date.now();
    if (weatherTool.cooldownUntil > now) return 'on_cooldown';

    const cfg = WEATHER_LEVELS[weatherTool.level - 1];
    if (playerState.gold < cfg.cost) return 'insufficient_gold';

    const opponentState = Object.values(this.state.players).find((p) => p.id !== playerId);
    if (!opponentState) return 'not_found';
    if (opponentState.weatherEffect !== null) return 'already_active';

    const endsAt = now + cfg.durationMs;
    opponentState.weatherEffect = { slowFactor: cfg.slowFactor, actionSlowFactor: cfg.actionSlowFactor, endsAt, lightning: cfg.lightning };

    for (const field of opponentState.fields) {
      if (field.readyAt === null) continue;
      const sf = field.stage === 'growing' ? cfg.slowFactor : cfg.actionSlowFactor;
      field.readyAt += weatherExtra(field.readyAt - now, sf);
      this.rescheduleFieldTimer(opponentState.id, field);
    }

    // Lv3: lightning strikes the most-grown field after a short delay
    if (cfg.lightning) {
      const eligible = opponentState.fields.filter(
        (f) => f.stage === 'growing' || f.stage === 'ready',
      );
      if (eligible.length > 0) {
        const progress = (f: Field) =>
          f.stage === 'ready' ? 1 : (now - (f.sowedAt ?? now)) / ((f.readyAt ?? now + 1) - (f.sowedAt ?? now));
        const target = eligible.reduce((best, f) => progress(f) > progress(best) ? f : best);
        this.cancelTimer(`${opponentState.id}:${target.index}`);
        const strikeAt = now + 2000;
        this.scheduleTimer(`lightning:${opponentState.id}:${target.index}`, strikeAt, () => {
          this.destroyField(target);
          this.broadcast({ type: 'game_state', state: this.state! });
        });
      }
    }

    playerState.gold -= cfg.cost;
    weatherTool.cooldownUntil = now + cfg.cooldownMs;

    this.scheduleTimer(`weather_expire:${opponentState.id}`, endsAt, () =>
      this.expireWeather(opponentState.id),
    );

    this.broadcast({ type: 'game_state', state: this.state });
    return 'ok';
  }

  processSabotages(): void {
    if (!this.state) return;
    const now = Date.now();
    let changed = false;

    for (const [playerId, playerState] of Object.entries(this.state.players)) {
      // Safety-net: expire weather if scheduled timer was missed (expireWeather broadcasts itself)
      if (playerState.weatherEffect && now >= playerState.weatherEffect.endsAt)
        this.expireWeather(playerId);

      const attack = playerState.thiefAttack;
      if (!attack) continue;

      // Transition waiting → stealing: minimum wait elapsed AND at least one villager is inside
      const canEnter = now >= attack.minEntryAt && playerState.villagersOutside < 4;
      if (attack.phase === 'waiting' && canEnter) {
        attack.phase = 'stealing';
        attack.stealStartedAt = now;
        attack.lastProcessedAt = now;
        // Reschedule expiry from when stealing actually starts (house exit)
        this.scheduleTimer(`thief_expire:${playerId}`, now + attack.durationMs, () =>
          this.expireThief(playerId),
        );
        changed = true;
      }

      // Drain gold
      if (attack.phase === 'stealing' && attack.stealStartedAt !== null) {
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
      this.broadcast({ type: 'game_state', state: this.state });
    }
  }

  upgradeTool(
    playerId: string,
    toolId: ToolId,
  ): 'ok' | 'not_found' | 'unknown_tool' | 'max_level' | 'insufficient_gold' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const tool = playerState.tools.find((t) => t.id === toolId);
    if (!tool) return 'unknown_tool';

    const maxLevel =
      toolId === 'fertilizer' ? MAX_FERTILIZER_LEVEL :
      toolId === 'crows'      ? MAX_CROW_LEVEL :
      toolId === 'thief'      ? MAX_THIEF_LEVEL :
      toolId === 'weather'    ? MAX_WEATHER_LEVEL :
      MAX_TOOL_LEVEL;
    if (tool.level >= maxLevel) return 'max_level';

    const cost = TOOL_COSTS[toolId][tool.level];
    if (playerState.gold < cost) return 'insufficient_gold';

    playerState.gold -= cost;
    tool.level += 1;
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  private getPlayerIdBySlot(slot: Slot): string | null {
    return this.slots[slot]?.playerId ?? null;
  }

  private drainThief(victimId: string, now: number): boolean {
    if (!this.state) return false;
    const victimState = this.state.players[victimId];
    const attack = victimState?.thiefAttack;
    if (!attack || attack.phase !== 'stealing' || attack.stealStartedAt === null || attack.lastProcessedAt === null) return false;

    const endMs = attack.stealStartedAt + attack.durationMs;
    const drainTo = Math.min(now, endMs);
    const drainFrom = attack.lastProcessedAt;
    if (drainTo <= drainFrom) return false;

    const elapsedSec = (drainTo - drainFrom) / 1000;
    const toSteal = elapsedSec * attack.stealPerSecond;
    const actualStolen = Math.min(victimState.gold, toSteal);

    if (actualStolen > 0) {
      const actorId = this.getPlayerIdBySlot(attack.actorSlot);
      const actorState = actorId ? this.state.players[actorId] : null;
      victimState.gold = Math.max(0, victimState.gold - Math.floor(actualStolen));
      if (actorState) {
        actorState.gold += Math.floor(actualStolen * THIEF_GOLD_RETURN_FRACTION);
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
      const sf = field.stage === 'growing' ? slowFactor : actionSlowFactor;
      field.readyAt = now + (field.readyAt - now) * (1 - sf);
      this.rescheduleFieldTimer(victimId, field);
    }

    this.broadcast({ type: 'game_state', state: this.state });
  }

  private expireThief(victimId: string): void {
    if (!this.state) return;
    const victimState = this.state.players[victimId];
    if (!victimState?.thiefAttack) return;

    const now = Date.now();
    if (victimState.thiefAttack.phase === 'stealing') {
      this.drainThief(victimId, now);
    }
    victimState.thiefAttack = null;
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private completeScare(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || !field.crowAttack) return;

    const now = Date.now();
    const { startedAt, eatRatePerMs, baseProgress, totalGrowMs } = field.crowAttack;
    const progressEaten = (now - startedAt) * eatRatePerMs;
    const effectiveProgress = Math.max(0, baseProgress - progressEaten);

    this.cancelTimer(`crow:${playerId}:${fieldIndex}`);
    field.crowAttack = null;
    field.scaringAt = null;

    if (effectiveProgress <= 0) {
      this.destroyField(field);
      this.cancelTimer(`${playerId}:${fieldIndex}`);
    } else {
      field.stage = 'growing';
      field.sowedAt = now - effectiveProgress * totalGrowMs;
      field.readyAt = field.sowedAt + totalGrowMs;
      this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
        this.completeGrowth(playerId, fieldIndex),
      );
    }

    this.broadcast({ type: 'game_state', state: this.state });
  }

  private expireCrowAttack(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || !field.crowAttack) return;

    this.cancelTimer(`scare:${playerId}:${fieldIndex}`);
    this.cancelTimer(`${playerId}:${fieldIndex}`);
    this.destroyField(field);

    this.broadcast({ type: 'game_state', state: this.state });
  }

  private destroyField(field: Field): void {
    field.stage = 'empty';
    field.cropType = null;
    field.sowedAt = null;
    field.readyAt = null;
    field.crowAttack = null;
    field.scaringAt = null;
  }

  private rescheduleFieldTimer(playerId: string, field: Field): void {
    if (field.readyAt === null) return;
    const at = field.readyAt;
    if (field.stage === 'growing') {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () => this.completeGrowth(playerId, field.index));
    } else if (field.stage === 'sowing') {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () => this.completeSow(playerId, field.index));
    } else if (field.stage === 'harvesting') {
      this.scheduleTimer(`${playerId}:${field.index}`, at, () => this.completeHarvest(playerId, field.index));
    }
  }

  private getToolLevel(playerState: PlayerState, toolId: ToolId): number {
    return playerState.tools.find((t) => t.id === toolId)?.level ?? 0;
  }

  private completeSow(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || field.stage !== 'sowing') return;

    const startedAt = Date.now();
    const playerState = this.state.players[playerId];
    if (!playerState) return;
    const fertLevel = this.getToolLevel(playerState, 'fertilizer');
    const sowLevel = this.getToolLevel(playerState, 'sow');
    let growDuration = rollGrowDuration(FERTILIZER_GROW_MULTIPLIERS[fertLevel] * SOW_GROW_MULTIPLIERS[sowLevel]);

    if (playerState.weatherEffect)
      growDuration += weatherExtra(growDuration, playerState.weatherEffect.slowFactor);

    field.stage = 'growing';
    field.sowedAt = startedAt;
    field.readyAt = startedAt + growDuration;

    this.scheduleTimer(`${playerId}:${fieldIndex}`, field.readyAt, () =>
      this.completeGrowth(playerId, fieldIndex),
    );
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private completeGrowth(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || field.stage !== 'growing') return;

    field.stage = 'ready';
    field.sowedAt = null;
    field.readyAt = null;
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private completeHarvest(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const playerState = this.state.players[playerId];
    const field = playerState?.fields[fieldIndex];
    if (!playerState || !field || field.stage !== 'harvesting') return;

    const fertLevel = this.getToolLevel(playerState, 'fertilizer');
    const harvestLevel = this.getToolLevel(playerState, 'harvest');
    playerState.gold += Math.round(GOLD_PER_HARVEST * FERTILIZER_GOLD_MULTIPLIERS[fertLevel] * HARVEST_GOLD_MULTIPLIERS[harvestLevel]);
    this.destroyField(field);
    this.broadcast({ type: 'game_state', state: this.state });
  }

  private scheduleTimer(key: string, firesAt: number, onFire: () => void): void {
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
}

export class GameManager {
  private games: Map<string, Game> = new Map();
  private knownSlots: Map<string, { slot: Slot; roomCode: string }> = new Map();

  private generateRoomCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
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
    console.log(`[game] ${session.playerId} created room ${roomCode} as ${slot}`);
    return { roomCode, slot };
  }

  handleHello(
    session: Session,
    roomCode?: string,
  ): { result: 'assigned' | 'rejoined' | 'full' | 'no_room' | 'not_found'; slot?: Slot; game?: Game } {
    const existing = this.knownSlots.get(session.playerId);

    if (existing) {
      const game = this.games.get(existing.roomCode);
      if (!game) return { result: 'not_found' };
      game.rejoin(session, existing.slot);
      console.log(`[game] ${session.playerId} rejoined room ${existing.roomCode} as ${existing.slot}`);
      return { result: 'rejoined', slot: existing.slot, game };
    }

    if (!roomCode) return { result: 'no_room' };

    const game = this.games.get(roomCode);
    if (!game) return { result: 'not_found' };

    const slot = game.join(session);
    if (!slot) {
      console.log(`[game] ${session.playerId} tried to join ${roomCode} but it's full`);
      return { result: 'full' };
    }

    this.knownSlots.set(session.playerId, { slot, roomCode });
    console.log(`[game] ${session.playerId} joined room ${roomCode} as ${slot}`);
    return { result: 'assigned', slot, game };
  }

  handleDisconnect(playerId: string): Game | undefined {
    const existing = this.knownSlots.get(playerId);
    if (!existing) return undefined;
    const game = this.games.get(existing.roomCode);
    game?.leave(playerId);
    // Keep knownSlots so the player can rejoin after reload
    console.log(`[game] ${playerId} disconnected from room ${existing.roomCode} (slot reserved)`);
    return game;
  }

  clearSlot(playerId: string): void {
    this.knownSlots.delete(playerId);
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
