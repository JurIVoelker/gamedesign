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
};
