# Plan 1 — Merchant System + Item Framework

## Context

Farmyard Duel gets a **wandering merchant** that visits each player ~3× per 8-min match, offering 3 weighted-random items from a pool of 9 one-shot consumables (psychological/informational/rule-bending mechanics). Scaffolding already exists (`Item` type, `BuyItem`/`UseItem` actions in `shared/src/types/actions.ts`) but is completely unhandled — no backend logic, no UI.

This plan builds the merchant + item framework and ships the two trivial items (**Pointless Potion**, **Halving Brew**) to validate it end-to-end. The other 7 items follow in plans 02–04.

### Decisions (settled with the user)

- **Merchant appearance**: PixiJS character that *appears* (fade-in, no walk animation) at the edge of the player's farm half. Clicking opens a React shop modal.
- **Visits**: ~3 per match at ~2 / 4.5 / 6.5 min with random jitter, same roll for both players.
- **Catch-up mechanic**: the currently "worse" player gets earlier merchant access (head start) + a price discount. "Worse" is stage-dependent: early game = lower *cumulative* earnings; late game = mostly lower *current* balance; mid game = blend.
- **Stay duration**: 40 s, countdown visible in the modal. Merchant must **not** leave while the shop modal is open (departure deferred, hard overstay cap).
- **Offers**: 3 items per visit, weighted random by rarity; one-per-match items stop appearing once bought.

### Architectural keystone: per-player redacted broadcast

Today the server broadcasts the identical `GameState` to both players. Hidden effects (Mirror Curse, Paranoia, fake merchant — plans 03) require that the opponent's client **never receives** the hidden data. This plan introduces `redactStateFor(state, recipientId)` — one pure function through which every broadcast flows. This is the riskiest change (≈24 call sites in `backend/src/game.ts` + the rejoin path in `backend/src/messages.ts`) and is done first as a zero-behavior-change checkpoint.

---

## Step 1: Shared types & constants

**`shared/src/constants.ts`** — append:

```ts
export type ItemId =
  | "blindness_potion" | "paranoia_curse" | "crystal_ball" | "swap_potion"
  | "mirror_curse" | "fake_merchant" | "spy_glass" | "pointless_potion" | "halving_brew";

export interface ItemDef {
  id: ItemId; name: string; price: number; rarityWeight: number;
  maxPerMatch: number | null;
  target: "none" | "opponent_field" | "own_and_opponent_field";
  durationMs: number | null; // null = instant or until-match-end
}
export const ITEM_DEFS: Record<ItemId, ItemDef> = { /* pricing table below */ };

export const MERCHANT_VISITS = [
  { atMs: 120_000, jitterMs: 25_000 },
  { atMs: 270_000, jitterMs: 25_000 },
  { atMs: 390_000, jitterMs: 20_000 },
] as const;
export const MERCHANT_STAY_MS = 40_000;
export const MERCHANT_OFFER_COUNT = 3;
export const MERCHANT_HEAD_START_MS = 10_000;
export const MERCHANT_DISCOUNT_PCT = 0.20;
export const MERCHANT_MIN_SCORE_GAP = 20;
export const MERCHANT_OVERSTAY_MAX_MS = 60_000;
export const MERCHANT_WINDOW_RECHECK_MS = 3_000;

// "Worse" player scoring: score = cumWeight * cumulativeEarnings + balWeight * currentGold
export const MERCHANT_CATCHUP_STAGES = [
  { untilMs: 180_000, cumWeight: 1.0, balWeight: 0.0 },  // early
  { untilMs: 330_000, cumWeight: 0.5, balWeight: 0.5 },  // mid
  { untilMs: Infinity, cumWeight: 0.2, balWeight: 0.8 }, // late
] as const;
```

**Pricing table** (economy: ~200–400 g earned/match, harvest ≈40 g):

| id | Name (DE) | price | weight | maxPerMatch | target | durationMs |
|---|---|---|---|---|---|---|
| `pointless_potion` | Trank der Unnötigkeit | 20 | 12 | null | none | null |
| `blindness_potion` | Blindheitstrank | 40 | 18 | null | none | 20 000 |
| `spy_glass` | Spion | 35 | 14 | 2 | none | 120 000 |
| `fake_merchant` | Falscher Händler | 40 | 11 | 2 | none | null |
| `paranoia_curse` | Paranoia-Fluch | 30 | 12 | 2 | none | 60 000 |
| `mirror_curse` | Spiegelfluch | 30 | 11 | 2 | none | 30 000 |
| `swap_potion` | Tauschtrank | 20 | 8 | 1 | own_and_opponent_field | null |
| `crystal_ball` | Zauberkugel | 60 | 7 | 1 | none | null (match end) |
| `halving_brew` | Halbierungstrunk | 85 | 5 | 1 | none | null |

Rationale: total weight 98; items cost 0.25–2 harvests (harvest ≈ 40 g) so any visit feels like a real opportunity — the dilemma is which to buy, not whether to afford anything. Power items (swap/crystal ball/halving brew) each gained +1 weight so they appear ~2× per match on average instead of ~1.6×. With the 20 % catch-up discount, Halving Brew drops to 68 g — still a meaningful decision for the trailing player, but no longer out of reach.

**`shared/src/types/game-state.ts`**:

```ts
export type EffectVisibility = "both" | "owner" | "source";
// owner  = only the player whose PlayerState holds it sees it
// source = only the player who applied it sees it (mirror/paranoia victim must not)

export interface ActiveEffect {
  id: string; itemId: ItemId; sourcePlayerId: string;
  startedAt: number; endsAt: number | null;
  visibility: EffectVisibility;
  data?: Record<string, unknown>;
}
export interface MerchantOffer { itemId: ItemId; basePrice: number; price: number; bought: boolean; }
export interface MerchantVisit {
  visitIndex: number; arrivesAt: number; leavesAt: number;
  discountPct: number; offers: MerchantOffer[]; windowOpen: boolean;
  notice?: string;                                  // merchant speech line (used by fake merchant)
  fake?: { byPlayerId: string; feeStep: number; drained: number }; // server-only, redacted away
}
```

- Extend `PlayerState` with `merchant: MerchantVisit | null` and `activeEffects: ActiveEffect[]`.
- Extend `MatchStats` with `goldSpentMerchant: number`, `itemsBought: Partial<Record<ItemId, number>>`, `itemsUsed: number`.
- Add optional `beneficiaryId?: string` to `ThiefAttack` (drain credit target — used by Mirror Curse in plan 03; harmless now).

**`shared/src/types/actions.ts`**: tighten `BuyItem`/`UseItem` to `itemId: ItemId`; add `secondTargetFieldIndex?: number` to `UseItem` (for Swap Potion).

**`shared/src/types/messages.ts`**: add `{ type: "merchant_window"; open: boolean }` to `ClientMessage` + type guard.

## Step 2: Redacted broadcast (zero-behavior checkpoint)

In `backend/src/game.ts` add:

- `redactStateFor(recipientId): GameState` — `structuredClone(this.state)`, then per player: filter `activeEffects` by visibility (`both` always; `owner` if `ps.id === recipientId`; `source` if `e.sourcePlayerId === recipientId`); if `ps.id !== recipientId` set `ps.merchant = null` (never leak the opponent's visit/discount); strip `merchant.fake` from the recipient's own visit.
- `broadcastState()` — sends each session its redacted view. **Mechanically replace all ~24 `this.broadcast({ type: "game_state", ... })` calls** with `this.broadcastState()`.
- `sendStateTo(playerId)` — for the rejoin path in `backend/src/messages.ts` (replace the `hello` rejoin broadcast; otherwise a refresh would leak hidden effects).

`structuredClone` twice per broadcast on a ~2 KB object at <5 broadcasts/sec is negligible.

**Checkpoint: play a full match incl. mid-match refresh before continuing — behavior must be identical.**

## Step 3: Visit scheduling + catch-up + departure (`backend/src/game.ts`)

- `createPlayerState`: `merchant: null, activeEffects: []`; `createEmptyStats`: new fields.
- In `startGame()`: schedule `merchant_visit:${i}` timers at `startedAt + atMs ± jitter` (one roll, shared by both players) via existing `scheduleTimer`.
- `beginMerchantVisit(i)`: guard `phase === "playing"`, skip if < ~25 s match time left. Compute per-player catch-up score (stage from `MERCHANT_CATCHUP_STAGES` by elapsed time; `cumulativeEarnings = stats.goldEarnedHarvest + stats.goldStolenByThief`). If gap < `MERCHANT_MIN_SCORE_GAP`: both arrive now, no discount. Else worse player arrives now with `MERCHANT_DISCOUNT_PCT`, better player arrives `+MERCHANT_HEAD_START_MS`, no discount. Set `ps.merchant = { ..., offers: rollOffers(ps, discountPct), windowOpen: false }`, schedule `merchant_leave:${playerId}`.
- `rollOffers(ps, discountPct)`: candidate pool = `ITEM_DEFS` minus ids where `stats.itemsBought[id] >= maxPerMatch`; weighted sample without replacement of 3 distinct ids; `price = round(basePrice * (1 - discountPct))`.
- `tryMerchantDepart(playerId)`: if `windowOpen && now < leavesAt + MERCHANT_OVERSTAY_MAX_MS` → reschedule check in `MERCHANT_WINDOW_RECHECK_MS`; else clear `merchant`, broadcast.
- `setMerchantWindow(playerId, open)`: set flag (only if visit exists and `now >= arrivesAt`); on `open=false` past `leavesAt` depart immediately. Reset `windowOpen` in `leave()` (disconnect must not pin the merchant). Safety net in `processSabotages()` for missed timers; cancel merchant/effect timers in match-end cleanup.

## Step 4: BuyItem (backend)

`Game.buyItem(playerId, itemId)` → `'ok' | 'no_merchant' | 'not_offered' | 'already_bought' | 'insufficient_gold'`: require active visit with `now >= arrivesAt`; find unbought offer; check gold; then deduct, mark bought, `stats.goldSpentMerchant += price`, `stats.itemsBought[itemId]++`, increment/push into `ps.items`, broadcast. Route in `backend/src/messages.ts` (`BuyItem` case + top-level `merchant_window` case).

## Step 5: UseItem skeleton + effect registry

New **`backend/src/items.ts`**:

```ts
export interface ItemContext {
  state: GameState; user: PlayerState; opponent: PlayerState;
  targetFieldIndex?: number; secondTargetFieldIndex?: number; now: number;
  addEffect: (owner: PlayerState, e: Omit<ActiveEffect, "id" | "startedAt">) => ActiveEffect;
  scheduleTimer: (key: string, firesAt: number, onFire: () => void) => void;
  cancelTimer: (key: string) => void;
  rescheduleFieldTimer: (playerId: string, fieldIndex: number) => void;
  broadcastState: () => void;
}
export type ItemEffectHandler = (ctx: ItemContext) => "ok" | "invalid_target" | "not_applicable";
export const ITEM_HANDLERS: Partial<Record<ItemId, ItemEffectHandler>> = {};
```

- `Game.useItem(playerId, itemId, targetFieldIndex?, secondTargetFieldIndex?)`: validate phase + inventory `count > 0`; missing handler → `'not_implemented'` (no decrement); on `'ok'` decrement count, `stats.itemsUsed++`, broadcast.
- `Game.addEffect()` helper: assign id, push to `activeEffects`, schedule `effect_expire:${id}` if `endsAt !== null`; expiry safety net in `processSabotages()`.

**Register the two trivial handlers** (validates the pipeline end-to-end):
- `pointless_potion`: 1 % jackpot chance — `ctx.user.gold += 50`; otherwise `ctx.user.gold += 20`. (`Math.random() < 0.01`)
- `halving_brew`: `gold = Math.floor(gold / 2)` for both players.

## Step 6: MerchantEntity (PixiJS)

New **`frontend/src/game/entities/MerchantEntity.ts`** modeled on `ThiefEntity`: static sprite (idle frame) at the left edge of the player's farm half (farm-local `x ≈ -36`, lower area, clear of trees/house — constants from `frontend/src/game/layout.ts`), scale 2. `setVisit(visit | null)` + `update(deltaMS)`: invisible while `now < arrivesAt`, fade-in ~600 ms on arrival, fade-out + destroy on null. `eventMode = "static"`, `pointertap` → `onClicked`.

**Asset**: no merchant sprite exists — add `merchant-front-right/-left/-back.png` (same 62×23 sheet layout as villager); interim fallback: tinted `theif-2` textures. Add to `Assets.load` in `GameEngine.init`.

`frontend/src/game/GameEngine.ts`: new `onMerchantClicked` init callback; create/update entity in `updateGameState` from `myState.merchant`; tick `update()` in the ticker loop (makes a future `arrivesAt` pop in without a fresh broadcast); clean up in `destroy()`. Opponent's merchant is never rendered (redacted to null).

## Step 7: MerchantShopModal (React)

New **`frontend/src/ui/MerchantShopModal.tsx`**, visual pattern cloned from `AccusationModal` (panel-pixel, portrait frame, countdown):
- Props: `visit`, `gold`, `onBuy(itemId)`, `onDismiss`. 1 s-interval countdown to `leavesAt`; at 0 while open show "Der Händler wartet ungeduldig…" (server defers departure); modal force-closes only when `merchant` becomes null in the store.
- Offer rows: name + price (strike-through `basePrice` in green when `discountPct > 0`); "Kaufen" disabled when bought or unaffordable; bought → "Gekauft". Render `visit.notice` as a merchant speech line when present (used by fake merchant in plan 03). ESC dismisses.
- Window tracking: `useEffect` mount/unmount sends `{ type: "merchant_window", open: true/false }` via `connectionStore.send`.

`frontend/src/game/FarmCanvas.tsx`: `merchantOpen` state, wire `onMerchantClicked`, render modal when open + visit active, `onBuy` dispatches `BuyItem`.

## Step 8: ItemBar (inventory + UseItem)

New **`frontend/src/ui/ItemBar.tsx`** next to `UpgradePanel` (match `upgrade-card` styling): lists `me.items` with count badges + hover tooltips. Click by `ITEM_DEFS[id].target`:
- `"none"` → send `UseItem` immediately.
- `"opponent_field"` / `"own_and_opponent_field"` → `targetingStore` flow (CrowsCard pattern). **Extend `frontend/src/state/targetingStore.ts` now** with a phase concept (`ownFarm` flag + optional second phase) so player-side `FieldEntity`s can participate — Swap Potion (plan 04) needs own-field-then-opponent-field picking.

Also render own visible `activeEffects` as generic countdown chips (itemId + remaining seconds) in the bar.

## Step 9: Stats

`createEmptyStats()` + `frontend/src/ui/StatsPanel.tsx` `emptyStats()`: new fields; add "Händler-Einkäufe" StatRow (goldSpentMerchant my/opp).

## Files

`shared/src/constants.ts`, `shared/src/types/{game-state,actions,messages}.ts`, `backend/src/{game,messages}.ts`, `backend/src/items.ts` (new), `frontend/src/game/entities/MerchantEntity.ts` (new), `frontend/src/game/GameEngine.ts`, `frontend/src/game/FarmCanvas.tsx`, `frontend/src/ui/{MerchantShopModal,ItemBar}.tsx` (new), `frontend/src/state/targetingStore.ts`, `frontend/src/ui/StatsPanel.tsx`.

## Risks

- **Redaction refactor touches ~24 call sites** — mechanical but match-critical; the Step 2 checkpoint de-risks it. Biggest trap: the `messages.ts` rejoin path must use `sendStateTo`, otherwise a refresh leaks hidden effects.
- **Departure deferral abuse** (popup held open forever) — capped by `MERCHANT_OVERSTAY_MAX_MS`, recovered by the `processSabotages` net and the `leave()` reset.
- **Missing merchant art** — tinted thief-2 fallback keeps the feature unblocked.

## Verification

`bun run build` + `bun --filter frontend lint`. Then two browser windows (`bun dev`, port 8080):
- Merchant appears ~min 2 for both (worse player earlier + 20 % discount once gold diverges).
- Modal countdown runs; merchant waits while modal open (test past 40 s); leaves at overstay cap.
- Buy Pointless Potion (+20 g net 0) and Halving Brew (both players halved).
- **Refresh mid-visit** → merchant + inventory restored (state persistence rule).
- Stats screen shows Händler-Einkäufe.
