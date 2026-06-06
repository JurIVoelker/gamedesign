import { PrismaClient } from '@prisma/client';
import type { GameState } from '@gamedesign/shared';

const prisma = new PrismaClient();

export async function persistMatch(state: GameState, slots: Record<string, string> = {}): Promise<void> {
  if (!state.startedAt) return;
  const durationMs = Date.now() - state.startedAt;

  await prisma.match.create({
    data: {
      roomCode: state.roomCode,
      startedAt: new Date(state.startedAt),
      winnerId: state.winnerId,
      durationMs,
      players: {
        create: Object.values(state.players).map((ps) => ({
          playerId: ps.id,
          slot: slots[ps.id] ?? 'unknown',
          finalGold: ps.gold,
          statsJson: JSON.stringify(ps.stats),
        })),
      },
    },
  });
}
