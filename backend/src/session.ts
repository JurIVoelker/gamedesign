import type { ServerWebSocket } from 'bun';
import type { ServerMessage, GameStateMsg } from '@gamedesign/shared';
import type { WsData } from './server.js';

export interface SessionLike {
  readonly playerId: string;
  send(msg: ServerMessage): void;
  isAlive(now: number, timeoutMs: number): boolean;
}

export class Session implements SessionLike {
  constructor(
    public readonly playerId: string,
    public ws: ServerWebSocket<WsData>,
    public lastPong: number,
  ) {}

  send(msg: ServerMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  isAlive(now: number, timeoutMs: number): boolean {
    return now - this.lastPong < timeoutMs;
  }
}

export class BotSession implements SessionLike {
  lastState: GameStateMsg | null = null;

  constructor(public readonly playerId: string) {}

  send(msg: ServerMessage): void {
    if (msg.type === 'game_state') {
      this.lastState = msg;
    }
  }

  isAlive(): boolean {
    return true;
  }
}
