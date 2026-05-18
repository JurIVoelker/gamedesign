import type { ServerMessage, GameState, Field, PlayerState, ToolId } from '@gamedesign/shared';
import { Session } from './session.js';
import {
  SOW_DURATION_MS,
  HARVEST_DURATION_MS,
  BASE_GROW_MS,
  GROW_VARIANCE,
  GOLD_PER_HARVEST,
  UPGRADE_SPEED_MULTIPLIERS,
  MAX_TOOL_LEVEL,
  SOW_UPGRADE_COSTS,
  HARVEST_UPGRADE_COSTS,
  FERTILIZER_GROW_MULTIPLIERS,
  FERTILIZER_GOLD_MULTIPLIERS,
  MAX_FERTILIZER_LEVEL,
  FERTILIZER_UPGRADE_COSTS,
} from './constants.js';

type Slot = 'p1' | 'p2';

const TOOL_COSTS: Record<ToolId, readonly number[]> = {
  sow: SOW_UPGRADE_COSTS,
  harvest: HARVEST_UPGRADE_COSTS,
  fertilizer: FERTILIZER_UPGRADE_COSTS,
};

function rollGrowDuration(fertMultiplier: number): number {
  return (
    BASE_GROW_MS * fertMultiplier * (1 - GROW_VARIANCE + Math.random() * 2 * GROW_VARIANCE)
  );
}

function createField(index: number): Field {
  return { index, stage: 'empty', cropType: null, sowedAt: null, readyAt: null };
}

function createPlayerState(playerId: string): PlayerState {
  return {
    id: playerId,
    gold: 0,
    score: 0,
    fields: [0, 1, 2, 3].map(createField),
    tools: [
      { id: 'sow', level: 0 },
      { id: 'harvest', level: 0 },
      { id: 'fertilizer', level: 0 },
    ],
    items: [],
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
    const playerState = this.state?.players[playerId];
    if (playerState) {
      for (const field of playerState.fields) {
        const key = `${playerId}:${field.index}`;
        const timer = this.timers.get(key);
        if (timer !== undefined) {
          clearTimeout(timer);
          this.timers.delete(key);
        }
      }
    }
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

    this.state = {
      roomCode: this.id,
      phase: 'playing',
      startedAt: Date.now(),
      endsAt: null,
      players: {
        [p1Id]: createPlayerState(p1Id),
        [p2Id]: createPlayerState(p2Id),
      },
      winnerId: null,
    };

    this.broadcast({ type: 'game_state', state: this.state });
  }

  sowField(
    playerId: string,
    fieldIndex: number,
    cropType: string,
  ): 'ok' | 'not_empty' | 'not_found' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (field.stage !== 'empty') return 'not_empty';

    const startedAt = Date.now();
    const duration =
      SOW_DURATION_MS * UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, 'sow')];
    field.stage = 'sowing';
    field.cropType = cropType;
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleFieldTimer(playerId, fieldIndex, field.readyAt, () =>
      this.completeSow(playerId, fieldIndex),
    );
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  harvestField(playerId: string, fieldIndex: number): 'ok' | 'not_ready' | 'not_found' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (field.stage !== 'ready') return 'not_ready';

    const startedAt = Date.now();
    const duration =
      HARVEST_DURATION_MS *
      UPGRADE_SPEED_MULTIPLIERS[this.getToolLevel(playerState, 'harvest')];
    field.stage = 'harvesting';
    field.sowedAt = startedAt;
    field.readyAt = startedAt + duration;

    this.scheduleFieldTimer(playerId, fieldIndex, field.readyAt, () =>
      this.completeHarvest(playerId, fieldIndex),
    );
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  private completeSow(playerId: string, fieldIndex: number): void {
    if (!this.state) return;
    const field = this.state.players[playerId]?.fields[fieldIndex];
    if (!field || field.stage !== 'sowing') return;

    const startedAt = Date.now();
    const playerState = this.state.players[playerId];
    if (!playerState) return;
    const fertLevel = this.getToolLevel(playerState, 'fertilizer');
    field.stage = 'growing';
    field.sowedAt = startedAt;
    field.readyAt = startedAt + rollGrowDuration(FERTILIZER_GROW_MULTIPLIERS[fertLevel]);

    this.scheduleFieldTimer(playerId, fieldIndex, field.readyAt, () =>
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
    playerState.gold += Math.round(GOLD_PER_HARVEST * FERTILIZER_GOLD_MULTIPLIERS[fertLevel]);
    field.stage = 'empty';
    field.cropType = null;
    field.sowedAt = null;
    field.readyAt = null;
    this.broadcast({ type: 'game_state', state: this.state });
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
    const maxLevel = toolId === 'fertilizer' ? MAX_FERTILIZER_LEVEL : MAX_TOOL_LEVEL;
    if (tool.level >= maxLevel) return 'max_level';

    const cost = TOOL_COSTS[toolId][tool.level];
    if (playerState.gold < cost) return 'insufficient_gold';

    playerState.gold -= cost;
    tool.level += 1;
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  private getToolLevel(playerState: PlayerState, toolId: ToolId): number {
    return playerState.tools.find((t) => t.id === toolId)?.level ?? 0;
  }

  private scheduleFieldTimer(
    playerId: string,
    fieldIndex: number,
    firesAt: number,
    onFire: () => void,
  ): void {
    const key = `${playerId}:${fieldIndex}`;
    const existing = this.timers.get(key);
    if (existing !== undefined) clearTimeout(existing);

    const delay = firesAt - Date.now();
    const timer = setTimeout(onFire, Math.max(0, delay));

    this.timers.set(key, timer);
  }
}

export class GameManager {
  // Single game for now — swap to Map<string, Game> later for multi-game support
  private game: Game = new Game('global');
  private knownSlots: Map<string, Slot> = new Map();

  handleHello(session: Session): { result: 'assigned' | 'rejoined' | 'full'; slot?: Slot } {
    const existingSlot = this.knownSlots.get(session.playerId);

    if (existingSlot) {
      this.game.rejoin(session, existingSlot);
      console.log(`[game] ${session.playerId} rejoined as ${existingSlot}`);
      return { result: 'rejoined', slot: existingSlot };
    }

    const slot = this.game.join(session);
    if (!slot) {
      console.log(`[game] ${session.playerId} tried to join but game is full`);
      return { result: 'full' };
    }

    this.knownSlots.set(session.playerId, slot);
    console.log(`[game] ${session.playerId} assigned as ${slot}`);
    return { result: 'assigned', slot };
  }

  handleDisconnect(playerId: string): void {
    this.game.leave(playerId);
    // Keep knownSlots entry so the player can rejoin after reload
    console.log(`[game] ${playerId} disconnected (slot reserved)`);
  }

  getGame(): Game {
    return this.game;
  }
}

export const gameManager = new GameManager();
