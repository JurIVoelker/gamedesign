import { isClientMessage } from '@gamedesign/shared';
import { Session } from './session.js';
import { gameManager } from './game.js';
import type { TutorialStageId } from '@gamedesign/shared';

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
        // Broadcast to both players: the rejoiner needs the full state, and the
        // opponent — who was bumped to "waiting" by our opponent_left on the
        // reload — needs a fresh game_state to return to "in_game".
        game.broadcastState();
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
          action.toolId !== 'tools' &&
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
      } else if (action.kind === 'BuyItem') {
        const result = game.buyItem(session.playerId, action.itemId);
        if (result !== 'ok') {
          session.send({ type: 'error', message: `BuyItem failed: ${result}` });
        }
      } else if (action.kind === 'UseItem') {
        const result = game.useItem(session.playerId, action.itemId, action.targetFieldIndex, action.secondTargetFieldIndex);
        if (result !== 'ok' && result !== 'not_implemented') {
          session.send({ type: 'error', message: `UseItem failed: ${result}` });
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
      if (game?.isTutorial() || game?.isBotMatch())
        gameManager.clearGame(roomCode);
      console.log(`[game] ${session.playerId} forfeited room ${roomCode}`);
      break;
    }

    case 'start_tutorial': {
      const stage = parsed.stage as TutorialStageId;
      const { slot } = gameManager.createTutorialRoom(session, stage);
      const roomCode = gameManager.getRoomCodeOf(session.playerId)!;
      // Send room_created so the client stores the roomCode in localStorage,
      // enabling seamless reconnection after a page refresh.
      session.send({ type: 'room_created', roomCode });
      session.send({ type: 'assigned', slot, playerId: session.playerId });
      session.send({ type: 'game_ready' });
      gameManager.getGame(roomCode)?.startGame();
      console.log(`[game] Tutorial stage ${stage} started for ${session.playerId}`);
      break;
    }

    case 'start_bot_match': {
      const { slot } = gameManager.createBotMatchRoom(session);
      const roomCode = gameManager.getRoomCodeOf(session.playerId)!;
      // Send room_created so the client stores the roomCode in localStorage,
      // enabling seamless reconnection after a page refresh.
      session.send({ type: 'room_created', roomCode });
      session.send({ type: 'assigned', slot, playerId: session.playerId });
      session.send({ type: 'game_ready' });
      gameManager.getGame(roomCode)?.startGame();
      console.log(`[game] Bot match started for ${session.playerId}`);
      break;
    }

    case 'tutorial_cue': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.botController?.handleCue?.(parsed.cue, parsed.level, parsed.itemId);
      break;
    }

    case 'villagers': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.reportVillagersOutside(session.playerId, parsed.count);
      break;
    }

    case 'merchant_window': {
      const roomCode = gameManager.getRoomCodeOf(session.playerId);
      if (!roomCode) return;
      const game = gameManager.getGame(roomCode);
      game?.setMerchantWindow(session.playerId, parsed.open);
      break;
    }

    case 'pong': {
      session.lastPong = Date.now();
      break;
    }
  }
}
