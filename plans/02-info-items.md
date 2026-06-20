# Plan 2 — Info Items: Crystal Ball (Zauberkugel) & Spy (Spion)

**Depends on:** Plan 01 (merchant system + item framework).

## Context

Two pure-information merchant items:
- **Crystal Ball** (60 g, 1/match, until match end): notification 5 s before any of the opponent's sabotage cooldowns become available again.
- **Spy** (35 g, max 2/match, 120 s): periodic reports of the opponent's current gold balance.

**Key insight**: the opponent's tool cooldowns and gold are *already* in the broadcast `GameState` (the UI just doesn't show them). Both items are therefore server-side just an `ActiveEffect` with `visibility: "owner"`; the real work is client UI. A determined cheater can read the websocket anyway — consistent with the existing design; redacting these fields by default is explicitly out of scope.

## Step 1: Toast/notification system (new, reused by Plan 03)

No notification system exists in the frontend. Build:
- **`frontend/src/state/toastStore.ts`** — Zustand store: `toasts: { id, text, icon? }[]`, `push()`, auto-expire ~4 s.
- **`frontend/src/ui/ToastStack.tsx`** — rendered from `App.tsx`, bottom-left, pixel-font styling consistent with the HUD.

## Step 2: Crystal Ball

- **Backend** (`backend/src/items.ts`): register handler — `addEffect(user, { itemId: "crystal_ball", sourcePlayerId: user.id, endsAt: null, visibility: "owner" })`. `maxPerMatch: 1` is already enforced by the offer roll (Plan 01).
- **Frontend**: small headless component (e.g. `CrystalBallWatcher`, mounted in `FarmCanvas` or `App`): when my `activeEffects` contain `crystal_ball`, compare the opponent's `tools[].cooldownUntil` for crows/thief/weather each tick; when `now >= cooldownUntil - 5000` and that exact timestamp wasn't yet notified (ref `Set<string>` keyed `toolId:cooldownUntil`), push toast: "🔮 Gegners Krähen sind gleich bereit!" (one line per tool type).
- ItemBar shows a persistent 🔮 chip (`endsAt: null` → label "bis Spielende").

## Step 3: Spy

- **Backend**: register handler — `addEffect(user, { itemId: "spy_glass", endsAt: now + ITEM_DEFS.spy_glass.durationMs, visibility: "owner", sourcePlayerId: user.id })`. **Stacking rule**: buying/using again while active extends `endsAt` instead of duplicating.
- **Frontend**: while active, ItemBar renders a spy chip showing a **periodic snapshot** of opponent gold — update the displayed value only every 10 s (feels like informant reports rather than a live mirror): "🕵️ Gegner: 134 G". Interval in constants: `SPY_REPORT_INTERVAL_MS = 10_000`.

## Files

`backend/src/items.ts`, `shared/src/constants.ts` (SPY_REPORT_INTERVAL_MS, notification lead time), `frontend/src/state/toastStore.ts` (new), `frontend/src/ui/ToastStack.tsx` (new), `frontend/src/ui/ItemBar.tsx`, `frontend/src/game/FarmCanvas.tsx` or `App.tsx`.

## Verification

`bun run build` + lint. Two browser windows:
- Buy Crystal Ball → have the opponent send a sabotage → toast fires 5 s before their cooldown ends; repeats for every later cooldown until match end.
- Buy Spy → chip shows opponent gold, value updates every ~10 s, chip disappears after 120 s; second purchase extends the timer.
- Opponent's client shows no trace of either effect (check their ItemBar/HUD).
