import { ITEM_DEFS } from '@gamedesign/shared';
import type { GameState, PlayerState, ActiveEffect, ItemId } from '@gamedesign/shared';

export interface ItemContext {
  state: GameState;
  user: PlayerState;
  opponent: PlayerState;
  targetFieldIndex?: number;
  secondTargetFieldIndex?: number;
  now: number;
  addEffect: (owner: PlayerState, e: Omit<ActiveEffect, 'id' | 'startedAt'>) => ActiveEffect;
  scheduleTimer: (key: string, firesAt: number, onFire: () => void) => void;
  cancelTimer: (key: string) => void;
  rescheduleFieldTimer: (playerId: string, fieldIndex: number) => void;
  broadcastState: () => void;
}

export type ItemEffectHandler = (ctx: ItemContext) => 'ok' | 'invalid_target' | 'not_applicable';

export const ITEM_HANDLERS: Partial<Record<ItemId, ItemEffectHandler>> = {
  pointless_potion: (ctx) => {
    ctx.user.gold += 20;
    return 'ok';
  },

  halving_brew: (ctx) => {
    ctx.user.gold = Math.floor(ctx.user.gold / 2);
    ctx.opponent.gold = Math.floor(ctx.opponent.gold / 2);
    return 'ok';
  },

  crystal_ball: (ctx) => {
    if (ctx.user.activeEffects.some(e => e.itemId === 'crystal_ball')) return 'not_applicable';
    ctx.addEffect(ctx.user, {
      itemId: 'crystal_ball',
      sourcePlayerId: ctx.user.id,
      endsAt: null,
      visibility: 'owner',
    });
    return 'ok';
  },

  spy_glass: (ctx) => {
    const durationMs = ITEM_DEFS.spy_glass.durationMs ?? 120_000;
    const existing = ctx.user.activeEffects.find((e) => e.itemId === 'spy_glass');
    if (existing) {
      existing.endsAt = ctx.now + durationMs;
      return 'ok';
    }
    ctx.addEffect(ctx.user, {
      itemId: 'spy_glass',
      sourcePlayerId: ctx.user.id,
      endsAt: ctx.now + durationMs,
      visibility: 'owner',
    });
    return 'ok';
  },
};
