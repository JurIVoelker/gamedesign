import { Session } from './session.js';
import { gameManager } from './game.js';
import { handleMessage } from './messages.js';

export interface WsData {
  playerId: string;
  lastPong: number;
}

const sessions = new Map<string, Session>();

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
const PORT = 3001;

Bun.serve<WsData>({
  port: PORT,

  fetch(req, server) {
    const url = new URL(req.url);
    const playerId = url.searchParams.get('playerId') ?? crypto.randomUUID();
    const upgraded = server.upgrade(req, {
      data: { playerId, lastPong: Date.now() },
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
    if (upgraded) return;
    return new Response('Farmyard Duel WebSocket server', { status: 200 });
  },

  websocket: {
    open(ws) {
      const session = new Session(ws.data.playerId, ws, ws.data.lastPong);
      sessions.set(ws.data.playerId, session);
      console.log(`[server] + ${ws.data.playerId} (${sessions.size} connected)`);
    },

    message(ws, data) {
      const session = sessions.get(ws.data.playerId);
      if (session) handleMessage(session, data);
    },

    close(ws) {
      sessions.delete(ws.data.playerId);
      gameManager.handleDisconnect(ws.data.playerId);
      gameManager.getGame().broadcastExcept(ws.data.playerId, { type: 'opponent_left' });
      console.log(`[server] - ${ws.data.playerId} (${sessions.size} connected)`);
    },
  },
});

setInterval(() => {
  const now = Date.now();
  for (const session of sessions.values()) {
    if (!session.isAlive(now, HEARTBEAT_TIMEOUT_MS)) {
      console.log(`[server] Dropping ${session.playerId}: heartbeat timeout`);
      session.ws.close(1001, 'heartbeat timeout');
    } else {
      session.send({ type: 'ping' });
    }
  }
}, HEARTBEAT_INTERVAL_MS);

console.log(`[server] Listening on ws://localhost:${PORT}`);
