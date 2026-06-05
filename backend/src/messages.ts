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
    case 'create_room': {
      const { roomCode, slot } = gameManager.createRoom(session);
      session.send({ type: 'room_created', roomCode });
      session.send({ type: 'assigned', slot, playerId: session.playerId });
      break;
    }

    case 'hello': {
      const helloResult = gameManager.handleHello(session, parsed.roomCode);
      const { result } = helloResult;

      const errorMessages: Partial<Record<typeof result, string>> = {
        no_room: 'No room code — create or join a room first',
        not_found: 'Room not found',
        full: 'Game is full',
      };
      if (result in errorMessages) {
        session.send({ type: 'error', message: errorMessages[result]! });
        return;
      }

      // result is now 'assigned' | 'rejoined', slot and game are defined
      const { slot, game } = helloResult as Required<typeof helloResult>;

      session.send({ type: 'assigned', slot, playerId: session.playerId });

      if (result === 'rejoined') {
        const st = game.getState();
        if (st) game.broadcast({ type: 'game_state', state: st });
      }

      if (game.isFull() && result === 'assigned') {
        game.broadcast({ type: 'game_ready' });
        game.startGame();
        console.log(`[game] Both players in room ${gameManager.getRoomCodeOf(session.playerId)} — game started`);
      }
      break;
    }

    case 'play_again': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.votePlayAgain(session.playerId);
      break;
    }

    case 'player_action': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) {
        session.send({ type: 'error', message: 'Not in game' });
        return;
      }
      const game = gameManager.getGame(roomCode);
      if (!game) {
        session.send({ type: 'error', message: 'Not in game' });
        return;
      }
      const slot = game.getSlotOf(session.playerId);
      if (!slot) {
        session.send({ type: 'error', message: 'Not in game' });
        return;
      }

      const action = parsed.action;
      console.log(`[game] Action ${action.kind} from ${slot}`);

      if (action.kind === 'SowField') {
        const result = game.sowField(
          session.playerId,
          action.fieldIndex,
          action.cropType,
        );
        if (result !== 'ok') {
          session.send({ type: 'error', message: 'Field cannot be sown' });
        }
      } else if (action.kind === 'HarvestField') {
        const result = game.harvestField(session.playerId, action.fieldIndex);
        if (result !== 'ok') {
          session.send({ type: 'error', message: 'Field not ready' });
        }
      } else if (action.kind === 'UpgradeTool') {
        if (
          action.toolId !== 'sow' &&
          action.toolId !== 'harvest' &&
          action.toolId !== 'fertilizer' &&
          action.toolId !== 'crows' &&
          action.toolId !== 'thief' &&
          action.toolId !== 'weather'
        ) {
          session.send({ type: 'error', message: 'Unknown tool' });
          break;
        }
        const result = game.upgradeTool(session.playerId, action.toolId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `Upgrade failed: ${result}` });
        }
      } else if (action.kind === 'SendCrows') {
        const result = game.sendCrows(session.playerId, action.targetFieldIndices);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `SendCrows failed: ${result}` });
        }
      } else if (action.kind === 'ScareCrow') {
        const result = game.scareCrow(session.playerId, action.fieldIndex);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `ScareCrow failed: ${result}` });
        }
      } else if (action.kind === 'SendThief') {
        const result = game.sendThief(session.playerId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `SendThief failed: ${result}` });
        }
      } else if (action.kind === 'CatchThief') {
        const result = game.catchThief(session.playerId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `CatchThief failed: ${result}` });
        }
      } else if (action.kind === 'SendWeather') {
        const result = game.sendWeather(session.playerId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `SendWeather failed: ${result}` });
        }
      } else if (action.kind === 'AccuseVillager') {
        const result = game.accuseVillager(session.playerId, action.villagerId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `AccuseVillager failed: ${result}` });
        }
      }
      break;
    }

    case 'leave_game': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.forfeit(session.playerId);
      gameManager.clearSlot(session.playerId);
      console.log(`[game] ${session.playerId} forfeited room ${roomCode}`);
      break;
    }

    case 'villagers': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.reportVillagersOutside(session.playerId, parsed.count);
      break;
    }

    case 'pong': {
      session.lastPong = Date.now();
      break;
    }
  }
}
