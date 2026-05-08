import type { ServerWebSocket } from 'bun';
import type { ServerMessage } from '@gamedesign/shared';
import type { WsData } from './server.js';

export class Session {
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
