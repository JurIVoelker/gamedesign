# Plan 4 — Farm Items: Blindness Potion & Swap Potion

**Depends on:** Plan 01 only (framework + targeting-store extension). Independent of Plans 02/03.

## Context

Two items that act directly on the farms:
- **Blindness Potion** (40 g, repeatable, 20 s): the opponent's view of *your* farm is fogged; their own farm stays visible.
- **Swap Potion** (20 g, 1/match, instant): swap the crop contents of one own field and one opponent field.

Decision settled with the user: **crows stay on the field position and continue eating the swapped-in content**.

## Blindness Potion (Blindheitstrank)

- **Handler** (`backend/src/items.ts`): effect stored **on the victim** — `addEffect(opponent, { itemId: "blindness_potion", visibility: "both", sourcePlayerId: user.id, endsAt: now + 20_000 })`. **Stacking**: if already active, extend `endsAt += durationMs` (re-use the existing effect, don't duplicate).
- **Frontend** (`frontend/src/game/GameEngine.ts`): if **my own** `activeEffects` contain blindness → I am the victim → render a fog overlay over the **opponentFarm container** (which displays the buyer's farm from my perspective). Reuse the weather-overlay pattern: full-half `Graphics` rect, dark gray `0x222222`, alpha ≈ 0.92, fade in/out ~400 ms. Add `setOpponentFog(active: boolean)` called from `updateGameState`. The fog hides everything, including the victim's own in-flight sabotages on that farm — intended.
- Buyer sees the standard countdown chip via `visibility: "both"` (ItemBar renders it generically): "Gegner geblendet 14s".

## Swap Potion (Tauschtrank)

- **Targeting**: `target: "own_and_opponent_field"` — two-phase flow using the `targetingStore` extension from Plan 01 Step 8: phase 1 "Eigenes Feld wählen" (own `FieldEntity`s get the pulsing-border pick treatment, currently opponent-only — extend `FieldEntity` with an own-farm targeting mode), phase 2 "Gegnerfeld wählen". Completion sends `UseItem { itemId, targetFieldIndex: ownIdx, secondTargetFieldIndex: oppIdx }`.
- **Handler validation**: both fields must exist and **neither may be mid-action** (`stage === "sowing" | "harvesting"` → `invalid_target`); `empty`/`growing`/`ready` are all valid (swapping a ripe field is the point). `maxPerMatch: 1` enforced at offer roll (Plan 01).
- **Swap semantics**: exchange the crop payload between the two `Field` objects — `stage`, `cropType`, `sowedAt`, `readyAt`, `growthPausedUntil`. **Stays with the field position** (not swapped): `index`, `crowAttack`, `fieldBlockedUntil`; clear `scaringAt` on both.
- **Crows eat new content**: if a field has an active `crowAttack`, rebase it onto the incoming crop — compute the incoming crop's current progress, set `crowAttack.baseProgress` to it, `startedAt = now`, `totalGrowMs` = incoming crop's grow duration, keep `eatRatePerMs`.
- **Timers**: cancel + reschedule both fields' completion timers via `ctx.rescheduleFieldTimer` (provided by Plan 01's `ItemContext`). Known simplification: `readyAt` travels as-is across farms even if one farm has an active weather slow — documented, not recomputed.
- Both clients see the result through the normal broadcast (`FieldEntity.setField`). On receiving the updated state, `FieldEntity` plays a particle burst on both swapped fields — a brief swirl of colored sparks (e.g. `0xf0c040`, ~20 particles, radiate outward over ~600 ms then fade). Both players see the animation on both affected fields, so it is clear something happened and which fields were involved.

## Files

`backend/src/items.ts`, `backend/src/game.ts` (`rescheduleFieldTimer` exposure), `frontend/src/game/GameEngine.ts` (fog overlay), `frontend/src/game/entities/FieldEntity.ts` (own-farm targeting visuals), `frontend/src/state/targetingStore.ts`, `frontend/src/ui/ItemBar.tsx`.

## Verification

`bun run build` + lint. Two browser windows:
- **Blindness**: victim's view of the buyer's farm is fogged for 20 s (buyer's own view unaffected); buying again mid-effect extends the duration; chip countdown visible on both sides.
- **Swap**: two-phase targeting works (own field, then opponent field, ESC cancels); crop states exchange correctly incl. a ripe field; a crow-attacked field keeps its crows, which continue eating the swapped-in crop; growth timers fire correctly after the swap; mid-action fields are rejected.
- Refresh mid-effect → fog/chips restored from server state (persistence rule).
