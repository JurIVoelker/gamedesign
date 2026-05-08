import type { ServerMessage, GameState, Field, PlayerState } from '@gamedesign/shared';
import { Session } from './session.js';

type Slot = 'p1' | 'p2';

const BASE_GROW_MS = 60_000;
const GOLD_PER_HARVEST = 25;

function createField(index: number): Field {
  const sowedAt = Date.now();
  const readyAt = sowedAt + BASE_GROW_MS * (0.9 + Math.random() * 0.2);
  return { index, stage: 'growing', cropType: 'wheat', sowedAt, readyAt };
}

function createPlayerState(playerId: string): PlayerState {
  return {
    id: playerId,
    gold: 0,
    score: 0,
    fields: [0, 1, 2, 3].map(createField),
    tools: [],
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

    for (const [playerId, playerState] of Object.entries(this.state.players)) {
      for (const field of playerState.fields) {
        this.scheduleFieldTimer(playerId, field.index, field.readyAt!);
      }
    }

    this.broadcast({ type: 'game_state', state: this.state });
  }

  harvestField(playerId: string, fieldIndex: number): 'ok' | 'not_ready' | 'not_found' {
    if (!this.state) return 'not_found';

    const playerState = this.state.players[playerId];
    if (!playerState) return 'not_found';

    const field = playerState.fields[fieldIndex];
    if (!field) return 'not_found';
    if (field.stage !== 'ready') return 'not_ready';

    playerState.gold += GOLD_PER_HARVEST;

    const sowedAt = Date.now();
    const readyAt = sowedAt + BASE_GROW_MS * (0.9 + Math.random() * 0.2);
    field.stage = 'growing';
    field.sowedAt = sowedAt;
    field.readyAt = readyAt;

    this.scheduleFieldTimer(playerId, fieldIndex, readyAt);
    this.broadcast({ type: 'game_state', state: this.state });

    return 'ok';
  }

  private scheduleFieldTimer(playerId: string, fieldIndex: number, readyAt: number): void {
    const key = `${playerId}:${fieldIndex}`;
    const existing = this.timers.get(key);
    if (existing !== undefined) clearTimeout(existing);

    const delay = readyAt - Date.now();
    const timer = setTimeout(() => {
      if (!this.state) return;
      const field = this.state.players[playerId]?.fields[fieldIndex];
      if (!field || field.stage !== 'growing') return;
      field.stage = 'ready';
      this.broadcast({ type: 'game_state', state: this.state });
    }, Math.max(0, delay));

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
