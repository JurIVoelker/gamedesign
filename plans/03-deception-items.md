# Plan 3 — Deception Items: Paranoia Curse, Mirror Curse, Fake Merchant

**Depends on:** Plan 01 (redacted broadcast + framework) and Plan 02 (toast system, for source-player feedback).

## Context

Three psychological items whose power comes from the opponent **not knowing** they are active. All three rely on Plan 01's `redactStateFor`: the victim's client must receive **synthesized-but-normal-looking** state, never the truth.

Decisions settled with the user:
- **Mirror Curse** reflects ALL base sabotages (crows, thief, weather — NOT items) sent by *either* player during the window back onto their sender. Mirrored thief: steals from its sender, **yield is credited to the mirror owner**.
- **Paranoia fakes**: catching a fake thief has no penalty; another spawns ~0.5 s later.

## Paranoia Curse (Paranoia-Fluch) — 30 g, max 2/match, 60 s

- **Handler**: `addEffect(opponent, { itemId: "paranoia_curse", visibility: "source", sourcePlayerId: user.id, endsAt: now + 60_000, data: { fake: null, nextFakeAt: now + firstDelay } })`.
- **Server fake-thief loop** (in the existing `processSabotages()` 1 s tick): while the victim has the effect, no real `thiefAttack` and no active fake → create a fake record in `effect.data` (`deployedAt`, `entryAt = now`, random `disguise`, seed-relevant fields). **Real thief takes precedence**: while a real `thiefAttack` exists, fakes are suppressed; they resume afterwards — the victim cannot distinguish.
- **Redaction synthesis** (extend `redactStateFor` in `backend/src/game.ts`): for the *victim's own view*, if a fake is active and the real `thiefAttack` is null → set `ps.thiefAttack` to a synthetic `ThiefAttack` built from `effect.data` (phase `"stealing"`, plausible `stealPerSecond`, `actorSlot` = curser's slot). The victim's client then renders it with the **existing `ThiefController` — zero frontend changes**. Ensure every field the controller's deterministic seeding reads (`stealStartedAt`/`deployedAt`, playerId) is populated.
- **Catching**: in `Game.catchThief()`, if there is no real `thiefAttack` but an active fake → clear the fake, set `data.nextFakeAt = now + 500`, return `'ok'` (no gold transfer, no `wrongAccusationCount` penalty).
- **Known tell (accepted)**: fake thieves don't actually drain gold; a victim staring at their gold count could deduce the fake. Deliberate counterplay — watching gold while clicking thieves costs exactly the attention the item is designed to burn.

## Mirror Curse (Spiegelfluch) — 30 g, max 2/match, 30 s

- **Handler**: `addEffect(user, { itemId: "mirror_curse", visibility: "owner", endsAt: now + 30_000 })`. Buyer sees a generic countdown chip (ItemBar, Plan 01); the opponent sees nothing — no icon, no HUD change.
- **Reflection rule**: while *any* player has an active `mirror_curse`, **every** `sendCrows` / `sendThief` / `sendWeather` from **either** player applies to its **sender** instead of the target. Items are never mirrored. The sender still pays gold cost + cooldown.
- **Implementation** (`backend/src/game.ts`): helper `mirrorActive(): ActiveEffect | null`; at the top of each of the three send methods, after cost/cooldown validation, swap the effective victim to the sender when active:
  - **Crows**: the crow attack lands on the sender's own fields at the same indices (re-validate target rules against the sender's farm).
  - **Thief**: `ThiefAttack` placed on the sender's own `PlayerState` with `beneficiaryId = mirrorOwner.id` (field added in Plan 01); modify `drainThief()` to credit `beneficiaryId ?? actor`. The sender is the victim → existing clickability lets them catch their own thief. Self-mirror edge case (buyer sends a thief during their own window): drains from and credits the same player → net zero minus cost.
  - **Weather**: `WeatherEffect` applied to the sender.
- **Stats**: reflected damage counts as self-inflicted on the sender (no new stat fields).

## Fake Merchant (Falscher Händler) — 40 g, max 2/match, instant trigger

- **Handler**: creates a `MerchantVisit` on the opponent with `fake: { byPlayerId: user.id, feeStep: 0, drained: 0 }`, offers = 3 random items at ~35 % of base price (`FAKE_MERCHANT_PRICE_PCT`), normal `leavesAt = now + MERCHANT_STAY_MS`. If the opponent currently has a real visit, schedule the fake to start right after it departs. Plan 01's redaction strips `fake` → the victim's client renders a completely normal merchant entity + modal.
- **`buyItem()` on a fake visit**: never deliver. Deduct the currently displayed price, increment `fake.drained`, advance `feeStep`, then escalate: `offer.price += fee` and `visit.notice = FAKE_MERCHANT_EXCUSES[feeStep]` ("Dazu kommen noch Versandkosten…", "…plus die Steuer.", "…und ein kleines Trinkgeld?"). The modal already renders `notice` (Plan 01). The victim can walk away anytime; total drain = number of clicks. Fee schedule + excuse lines in `shared/src/constants.ts`.
- **On departure**: drained gold is **transferred to the source player** (your merchant returns with the loot) — config flag `FAKE_MERCHANT_TRANSFER = true` so it can be switched to destroy-only if it tunes too strong. Toast to the source: "💰 Dein falscher Händler hat X Gold ergaunert!". If `drained === 0`, no effect (per spec: ignored merchant leaves harmlessly).

## Files

`backend/src/items.ts`, `backend/src/game.ts` (redaction synthesis, `catchThief`, the three send methods, `drainThief`, `buyItem` fake branch), `shared/src/constants.ts` (fee schedule, excuses, price pct, fake-thief timing).

## Verification

`bun run build` + lint. Two browser windows:
- **Paranoia**: victim window shows thieves that respawn ~0.5 s after catching, no accusation penalty; send a real thief during the curse → it works and is indistinguishable; fakes stop at 60 s.
- **Mirror**: opponent's crows/thief/weather hit themselves during the window; mirrored thief's stolen gold credits the mirror owner; victim window shows **no** curse indicator anywhere.
- **Fake Merchant**: victim sees a normal-looking merchant with suspiciously cheap items; each buy click drains gold and shows the next excuse line, no item is ever delivered; source receives the loot toast at departure; ignoring it = no effect.
- For each item: inspect the victim's websocket frames (browser devtools) — they must contain no `mirror_curse`/`paranoia_curse` effect entry and no `fake` field.
