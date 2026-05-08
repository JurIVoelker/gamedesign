import type { ServerMessage } from '@gamedesign/shared';
import { Session } from './session.js';

type Slot = 'p1' | 'p2';

export class Game {
  readonly id: string;
  private slots: { p1: Session | null; p2: Session | null } = { p1: null, p2: null };

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
