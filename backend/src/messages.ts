import { isClientMessage } from '@gamedesign/shared';
import { Session } from './session.js';
import { gameManager } from './game.js';

export function handleMessage(session: Session, raw: string | Buffer): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
  } catch {
    console.warn(`[messages] Bad JSON from ${session.playerId}`);
    return;
  }

  if (!isClientMessage(parsed)) {
    console.warn(`[messages] Unknown message type from ${session.playerId}`);
    return;
  }

  switch (parsed.type) {
    case 'hello': {
      const { result, slot } = gameManager.handleHello(session);

      if (result === 'full') {
        session.send({ type: 'error', message: 'Game is full' });
        return;
      }

      session.send({ type: 'assigned', slot: slot!, playerId: session.playerId });

      if (result === 'rejoined') {
        const st = gameManager.getGame().getState();
        if (st) gameManager.getGame().broadcast({ type: 'game_state', state: st });
      }

      if (gameManager.getGame().isFull() && result === 'assigned') {
        gameManager.getGame().broadcast({ type: 'game_ready' });
        gameManager.getGame().startGame();
        console.log('[game] Both players connected — game started');
      }
      break;
    }

    case 'player_action': {
      const game = gameManager.getGame();
      const slot = game.getSlotOf(session.playerId);
      if (!slot) {
        session.send({ type: 'error', message: 'Not in game' });
        return;
      }

      const action = parsed.action;
      console.log(`[game] Action ${action.kind} from ${slot}`);

      if (action.kind === 'HarvestField') {
        const result = game.harvestField(session.playerId, action.fieldIndex);
        if (result !== 'ok') {
          session.send({ type: 'error', message: 'Field not ready' });
        }
      }
      break;
    }

    case 'pong': {
      session.lastPong = Date.now();
      break;
    }
  }
}
