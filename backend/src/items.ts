import { ITEM_DEFS, PARANOIA_FIRST_DELAY_MIN_MS, PARANOIA_FIRST_DELAY_MAX_MS, BASE_GROW_MS } from '@gamedesign/shared';
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
  rescheduleCrowTimer: (playerId: string, fieldIndex: number) => void;
  broadcastState: () => void;
  deployFakeMerchant: (opponentId: string, byPlayerId: string, afterMs?: number) => void;
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

  paranoia_curse: (ctx) => {
    const { now, opponent, user } = ctx;
    if (opponent.activeEffects.some(e => e.itemId === 'paranoia_curse')) return 'not_applicable';
    const durationMs = ITEM_DEFS.paranoia_curse.durationMs ?? 60_000;
    const firstDelay = PARANOIA_FIRST_DELAY_MIN_MS +
      Math.random() * (PARANOIA_FIRST_DELAY_MAX_MS - PARANOIA_FIRST_DELAY_MIN_MS);
    ctx.addEffect(opponent, {
      itemId: 'paranoia_curse',
      sourcePlayerId: user.id,
      endsAt: now + durationMs,
      visibility: 'source',
      data: { fake: null, nextFakeAt: now + firstDelay },
    });
    return 'ok';
  },

  mirror_curse: (ctx) => {
    const { now, user } = ctx;
    if (user.activeEffects.some(e => e.itemId === 'mirror_curse')) return 'not_applicable';
    const durationMs = ITEM_DEFS.mirror_curse.durationMs ?? 30_000;
    ctx.addEffect(ctx.user, {
      itemId: 'mirror_curse',
      sourcePlayerId: user.id,
      endsAt: now + durationMs,
      visibility: 'owner',
    });
    return 'ok';
  },

  fake_merchant: (ctx) => {
    const { opponent, user, now } = ctx;
    if (opponent.merchant?.fake) return 'not_applicable';
    const afterMs = opponent.merchant ? Math.max(0, opponent.merchant.leavesAt - now + 100) : undefined;
    ctx.deployFakeMerchant(opponent.id, user.id, afterMs);
    return 'ok';
  },

  blindness_potion: (ctx) => {
    const { now, opponent, user } = ctx;
    const durationMs = ITEM_DEFS.blindness_potion.durationMs ?? 20_000;
    const existing = opponent.activeEffects.find(e => e.itemId === 'blindness_potion');
    if (existing && existing.endsAt !== null) {
      existing.endsAt += durationMs;
      const effects = opponent.activeEffects;
      ctx.scheduleTimer(`effect_expire:${existing.id}`, existing.endsAt, () => {
        const idx = effects.findIndex(e => e.id === existing.id);
        if (idx !== -1) { effects.splice(idx, 1); ctx.broadcastState(); }
      });
      return 'ok';
    }
    ctx.addEffect(opponent, {
      itemId: 'blindness_potion',
      sourcePlayerId: user.id,
      endsAt: now + durationMs,
      visibility: 'both',
    });
    return 'ok';
  },

  swap_potion: (ctx) => {
    const { user, opponent, targetFieldIndex, secondTargetFieldIndex, now } = ctx;
    if (targetFieldIndex === undefined || secondTargetFieldIndex === undefined) return 'invalid_target';

    const ownField = user.fields[targetFieldIndex];
    const oppField = opponent.fields[secondTargetFieldIndex];
    if (!ownField || !oppField) return 'invalid_target';
    if (ownField.stage === 'sowing' || ownField.stage === 'harvesting') return 'invalid_target';
    if (oppField.stage === 'sowing' || oppField.stage === 'harvesting') return 'invalid_target';

    // Swap crop payload; crowAttack, fieldBlockedUntil, index stay on their position
    const ownPayload = {
      stage: ownField.stage,
      cropType: ownField.cropType,
      sowedAt: ownField.sowedAt,
      readyAt: ownField.readyAt,
      growthPausedUntil: ownField.growthPausedUntil,
    };
    ownField.stage = oppField.stage;
    ownField.cropType = oppField.cropType;
    ownField.sowedAt = oppField.sowedAt;
    ownField.readyAt = oppField.readyAt;
    ownField.growthPausedUntil = oppField.growthPausedUntil;
    ownField.scaringAt = null;

    oppField.stage = ownPayload.stage;
    oppField.cropType = ownPayload.cropType;
    oppField.sowedAt = ownPayload.sowedAt;
    oppField.readyAt = ownPayload.readyAt;
    oppField.growthPausedUntil = ownPayload.growthPausedUntil;
    oppField.scaringAt = null;

    ctx.cancelTimer(`scare:${user.id}:${ownField.index}`);
    ctx.cancelTimer(`scare:${opponent.id}:${oppField.index}`);

    // Rebase crow attacks on the swapped-in content
    for (const [playerId, field] of [[user.id, ownField], [opponent.id, oppField]] as const) {
      if (!field.crowAttack) continue;
      if (field.stage === 'empty') {
        field.crowAttack = null;
        ctx.cancelTimer(`crow:${playerId}:${field.index}`);
      } else {
        const incomingProgress = field.stage === 'ready'
          ? 1.0
          : field.sowedAt && field.readyAt
            ? Math.min(1, Math.max(0, (now - field.sowedAt) / (field.readyAt - field.sowedAt)))
            : 0;
        const totalGrowMs = field.stage === 'growing' && field.sowedAt && field.readyAt
          ? field.readyAt - field.sowedAt
          : BASE_GROW_MS;
        field.crowAttack.baseProgress = incomingProgress;
        field.crowAttack.startedAt = now;
        field.crowAttack.totalGrowMs = totalGrowMs;
        ctx.rescheduleCrowTimer(playerId, field.index);
      }
    }

    ctx.rescheduleFieldTimer(user.id, ownField.index);
    ctx.rescheduleFieldTimer(opponent.id, oppField.index);

    return 'ok';
  },
};
