import type { TutorialStageId, GameState, ItemId } from "@gamedesign/shared";
import { CROW_TUTORIAL_MIN_GROWTH } from "@gamedesign/shared";
import type { TutorialStep, SendFn, TutorialSurface } from "./types";
import { useConnectionStore } from "../state/connectionStore";
import { useTutorialStore } from "../state/tutorialStore";

// Stage 1: baseline for harvest count (lazy-set on first gate call, reset by onEnter)
let harvestedBaseline: number | null = null;

// Stage 2: baselines and arrival flags (reset by each step's onEnter)
let s2CrowsArrived = false;
let s2CrowsTrackedFields: number[] = [];
// Fields the player actually scared this wave (captured while scaringAt is set).
// We can't infer "saved" from crop stage afterwards because the bot re-sows
// eaten fields, making an eaten field look defended.
let s2ScaredFields: number[] = [];
let s2CrowsSentBaseline: number | null = null;
let s2ThievesSentBaseline: number | null = null;
let s2WeatherSentBaseline: number | null = null;

// Stage 2: weather Lv1 "experience" step — once the bot's storm hits the player,
// linger this long (rather than waiting out the whole 40s storm) before moving
// on. Timestamp the storm landed, or null before it has hit.
const WEATHER_EXPERIENCE_LINGER_MS = 10_000;
let s2WeatherExperiencedAt: number | null = null;

// Stage 2: weather attack — after the player casts a storm on the opponent,
// linger this long so they see it take effect (and, at Lv3, the lightning
// strike) before advancing. Timestamp of the send, or null before it lands.
const WEATHER_ATTACK_LINGER_MS = 5_000;
let s2WeatherAttackLandedAt: number | null = null;

// Stage 2: thief attack — wait until the player's own thief has stolen this
// much gold from the opponent before advancing (proves the thief works).
const THIEF_ATTACK_STEAL_GOAL = 20;
let s2ThiefStolenBaseline: number | null = null;

// Stage 2: thief defense (catch the bot's escalating-disguise thief).
// Detect a real catch via the thievesCaught stat — an incoming thief that
// simply expires (player missed it) is otherwise indistinguishable from a
// caught one once thiefAttack clears.
let s2ThiefCaughtBaseline: number | null = null;
let s2ThiefArrived = false; // a thief has appeared this wave
let s2ThiefTryCount = 0; // misses so far this step
// Non-null while a retry is pending: the time the bot re-sends the thief.
let s2ThiefRetryAt: number | null = null;
let s2ThiefSuccessAt: number | null = null;
// Armed only after "Bereit!" is pressed, so the gate doesn't evaluate (or the
// bot doesn't attack) until the player says they're ready — mirrors the crows.
let s2ThiefArmed = false;

// Delay before the bot sends its thief after "Bereit!" is pressed (ms).
const THIEF_DEFEND_DELAY_MS = 1_500;
// Delay before re-sending the bot's thief after a miss (ms).
const THIEF_DEFEND_RETRY_DELAY_MS = 2_000;
// Linger after a successful catch so it registers before advancing (ms).
const THIEF_DEFEND_SUCCESS_LINGER_MS = 800;
// After this many misses on a step, reveal the thief with a blinking outline so
// the player can always finish. The step still only advances on a real catch.
const THIEF_HELP_AFTER_TRIES = 4;

// Delay before bot sends crows after player presses "Bereit" (ms)
const CROW_DEFEND_DELAY_MS = 3_000;
// Delay before retry after a failed defense (Lv1/2 and Lv3)
const CROW_DEFEND_RETRY_DELAY_MS = 3_000;
const CROW_DEFEND_LV3_RETRY_MS = 15_000;

// Tracks when opponent's crow attacks cleared so we can linger 2s after
let s2CrowsClearedAt: number | null = null;
const S2_CROW_LINGER_MS = 2_000;

// Flag-based retry state for defend gates (avoids stale setTimeout callbacks)
let s2RetryPending = false;
let s2RetryReadyAt = 0;
let s2DefendTryCount = 0;
const MAX_DEFEND_TRIES = 4;

// After a successful defense, linger briefly so the player sees the crows leave
// before the step advances (set on first success, polled until elapsed).
let s2DefendSuccessAt: number | null = null;
const CROW_DEFEND_SUCCESS_LINGER_MS = 1_000;

// Linear growth fraction (0..1) of a field from sow → ready. Used to pace defense
// retries and to gate the bot's scripted crow sends (see CROW_TUTORIAL_MIN_GROWTH,
// which both sides share so they never disagree); an approximation is fine here.
function fieldGrowthFraction(
  f: { stage: string; sowedAt: number | null; readyAt: number | null },
  now: number,
): number {
  if (f.stage === "ready") return 1;
  if (f.stage !== "growing" || f.sowedAt === null || f.readyAt === null) {
    return 0;
  }
  const span = f.readyAt - f.sowedAt;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (now - f.sowedAt) / span));
}

// Set to true only after "Bereit!" is pressed (or retry fires).
// Prevents the gate from accumulating leftover crow attacks from previous steps
// when a step transition leaves old crows still visible in the game state.
let s2WaitingForCrows = false;

let s2DefendTimer: ReturnType<typeof setTimeout> | null = null;

function cancelDefendTimer() {
  if (s2DefendTimer !== null) {
    clearTimeout(s2DefendTimer);
    s2DefendTimer = null;
  }
}

// Shared gate for all player-attack-with-crows steps.
// Phase 1: wait until crowsSent increases.
// Phase 2: wait until opponent's crow attacks clear (crows eaten or scared).
// Phase 3: linger 2s so the player can see the effect, then advance.
function s2AttackCrowsGate(game: GameState | null): boolean {
  const pid = useConnectionStore.getState().playerId;
  if (!game || !pid) return false;
  const count = game.players[pid]?.stats.crowsSent ?? 0;

  if (s2CrowsSentBaseline === null) {
    s2CrowsSentBaseline = count;
    return false;
  }
  if (count <= s2CrowsSentBaseline) return false;

  const opponentId = Object.keys(game.players).find((id) => id !== pid);
  if (!opponentId) return false;
  const crowsStillActive = game.players[opponentId]?.fields.some(
    (f) => f.crowAttack !== null,
  );
  if (crowsStillActive) {
    s2CrowsClearedAt = null;
    return false;
  }

  const now = Date.now();
  if (s2CrowsClearedAt === null) {
    s2CrowsClearedAt = now;
    return false;
  }
  return now - s2CrowsClearedAt >= S2_CROW_LINGER_MS;
}

// Shared gate for the player's weather-attack steps (Lv2 / Lv3).
// Phase 1: wait until the player's weatherSent increases (storm cast on the
// opponent). Phase 2: linger so the player watches it work — and at Lv3 sees
// the lightning strike — before advancing.
function s2AttackWeatherGate(game: GameState | null): boolean {
  const pid = useConnectionStore.getState().playerId;
  if (!game || !pid) return false;
  const count = game.players[pid]?.stats.weatherSent ?? 0;

  if (s2WeatherSentBaseline === null) {
    s2WeatherSentBaseline = count;
    return false;
  }
  if (count <= s2WeatherSentBaseline) return false;

  const now = Date.now();
  if (s2WeatherAttackLandedAt === null) {
    s2WeatherAttackLandedAt = now;
    return false;
  }
  return now - s2WeatherAttackLandedAt >= WEATHER_ATTACK_LINGER_MS;
}

// Gate for the Lv1 weather "experience" step: once the bot's storm lands on the
// player, linger a short while so they feel the slowdown — then advance without
// waiting out the full storm (the next step clears the leftover storm).
function s2ExperienceWeatherGate(game: GameState | null): boolean {
  const pid = useConnectionStore.getState().playerId;
  if (!game || !pid) return false;
  const ps = game.players[pid];
  if (!ps) return false;

  const now = Date.now();
  if (ps.weatherEffect !== null && s2WeatherExperiencedAt === null) {
    s2WeatherExperiencedAt = now;
  }
  if (s2WeatherExperiencedAt === null) return false;
  return now - s2WeatherExperiencedAt >= WEATHER_EXPERIENCE_LINGER_MS;
}

// onEnter for a thief defend step: reset per-step state and disarm. The bot's
// thief is NOT sent here — it waits until the player presses "Bereit!".
function resetThiefDefendState() {
  cancelDefendTimer();
  s2ThiefCaughtBaseline = null;
  s2ThiefArrived = false;
  s2ThiefTryCount = 0;
  s2ThiefRetryAt = null;
  s2ThiefSuccessAt = null;
  s2ThiefArmed = false;
  useTutorialStore.getState().setThiefHintActive(false);
}

// "Bereit!" button shared by the crow- and thief-defend steps: runs `arm` (sets
// the gate's per-defense armed flag), then dispatches the bot's attack cue after
// a short delay so the player has a moment to prepare.
function makeReadyButton(
  cue: "bot_send_crows" | "bot_send_thief",
  level: number,
  delayMs: number,
  arm: () => void,
) {
  return {
    label: "Bereit!",
    action: (send: SendFn) => {
      arm();
      cancelDefendTimer();
      s2DefendTimer = setTimeout(() => {
        s2DefendTimer = null;
        send?.({ type: "tutorial_cue", cue, level });
      }, delayMs);
    },
  };
}

// "Bereit!" button for a thief defend step: arms the gate, then sends the bot's
// thief after a short delay so the player has a moment to watch the villagers.
function makeThiefReadyButton(level: number) {
  return makeReadyButton("bot_send_thief", level, THIEF_DEFEND_DELAY_MS, () => {
    s2ThiefArmed = true;
  });
}

// Gate factory for thief defend steps. Advances only on a real catch
// (thievesCaught increases), lingering briefly so the catch registers. A missed
// thief (it arrived, then cleared without a catch) is counted and the bot
// re-sends after a short delay. After THIEF_HELP_AFTER_TRIES misses the thief is
// revealed with a blinking outline — the step never auto-advances, so the player
// always finishes on an actual catch.
function makeThiefDefendGate(
  level: number,
): (game: GameState | null) => boolean {
  return (game) => {
    const pid = useConnectionStore.getState().playerId;
    if (!game || !pid) return false;
    const ps = game.players[pid];
    if (!ps) return false;

    // Wait for "Bereit!" before evaluating — no thief is in play until then.
    if (!s2ThiefArmed) return false;

    const caught = ps.stats.thievesCaught ?? 0;
    if (s2ThiefCaughtBaseline === null) {
      s2ThiefCaughtBaseline = caught;
      return false;
    }

    // Retry path: wait out the delay, then re-send the bot's thief.
    if (s2ThiefRetryAt !== null) {
      if (Date.now() < s2ThiefRetryAt) return false;
      s2ThiefRetryAt = null;
      s2ThiefArrived = false;
      useConnectionStore
        .getState()
        .send?.({ type: "tutorial_cue", cue: "bot_send_thief", level });
      return false;
    }

    const thiefActive = ps.thiefAttack !== null;
    if (thiefActive) s2ThiefArrived = true;

    // Caught it — linger briefly so the catch registers, then advance. Checked
    // before the miss branch so a catch (which also clears thiefAttack) wins.
    if (caught > s2ThiefCaughtBaseline) {
      const now = Date.now();
      if (s2ThiefSuccessAt === null) {
        s2ThiefSuccessAt = now;
        return false;
      }
      return now - s2ThiefSuccessAt >= THIEF_DEFEND_SUCCESS_LINGER_MS;
    }

    // The thief arrived and is now gone but wasn't caught — a miss. Count it,
    // reveal the thief once the player has struggled enough, and retry.
    if (s2ThiefArrived && !thiefActive) {
      s2ThiefArrived = false;
      s2ThiefTryCount++;
      if (s2ThiefTryCount >= THIEF_HELP_AFTER_TRIES) {
        useTutorialStore.getState().setThiefHintActive(true);
      }
      s2ThiefRetryAt = Date.now() + THIEF_DEFEND_RETRY_DELAY_MS;
      return false;
    }

    return false; // thief still in play (or not yet arrived) — wait
  };
}

// Clears the per-wave crow-tracking flags (shared by the defend gate's success
// and failure branches). Does NOT touch retry/try-count state.
function resetCrowTracking() {
  s2CrowsArrived = false;
  s2CrowsTrackedFields = [];
  s2ScaredFields = [];
  s2WaitingForCrows = false;
  s2DefendSuccessAt = null;
}

// Resets all crow-defense state. Used as each defend step's onEnter so the
// reset lives in one place rather than being copy-pasted per level.
function resetDefendState(send?: SendFn) {
  cancelDefendTimer();
  resetCrowTracking();
  s2RetryPending = false;
  s2DefendTryCount = 0;
  send?.({ type: "tutorial_cue", cue: "reset_player_cooldowns" });
}

// "Bereit!" button for a crow defend step: arms the gate, then sends the bot's
// crows after a short delay so the player has a moment to prepare.
function makeDefendReadyButton(level: number) {
  return makeReadyButton("bot_send_crows", level, CROW_DEFEND_DELAY_MS, () => {
    s2WaitingForCrows = true;
  });
}

// Gate factory for crow defend steps.
// minDefended: how many fields must be saved (default = all attacked fields).
// retryDelayMs: how long to wait after failure before re-attacking.
//
// Advances as soon as the player has CLICKED enough fields (scaringAt set),
// without waiting for the full scare animation to finish. This prevents the
// "10s wait" caused by long scare animations at Lv1.
//
// Uses a flag-based retry (no setTimeout) so stale callbacks can't fire after
// step advance, and the retry also waits for fields to regrow.
function makeCrowDefendGate(
  level: number,
  minDefended?: number,
  retryDelayMs: number = CROW_DEFEND_RETRY_DELAY_MS,
): (game: GameState | null) => boolean {
  return (game) => {
    const pid = useConnectionStore.getState().playerId;
    if (!game || !pid) return false;
    const fields = game.players[pid]?.fields ?? [];

    // Retry path: wait until time has elapsed AND enough fields are growable.
    // Use level (= bot's fieldCount) as the lower bound so the bot can actually
    // send the right number of crows. minDefended caps it for Lv3 (need 2, not 3).
    if (s2RetryPending) {
      const now = Date.now();
      if (now < s2RetryReadyAt) return false;
      const minForRetry = Math.min(level, minDefended ?? level);
      // Require fields to have meaningfully regrown — not merely re-sown — so the
      // next wave lands on a real crop the player can actually defend.
      const eligibleCount = fields.filter(
        (f) =>
          (f.stage === "growing" || f.stage === "ready") &&
          f.crowAttack === null &&
          fieldGrowthFraction(f, now) >= CROW_TUTORIAL_MIN_GROWTH,
      ).length;
      if (eligibleCount < minForRetry) return false;
      s2RetryPending = false;
      s2WaitingForCrows = true;
      s2DefendSuccessAt = null;
      useConnectionStore
        .getState()
        .send?.({ type: "tutorial_cue", cue: "bot_send_crows", level });
      return false;
    }

    // Guard: only start accumulating after "Bereit!" was pressed. This prevents
    // the gate from immediately triggering on step-transition when the previous
    // step's crow scare is still visible in the game state.
    if (!s2WaitingForCrows) return false;

    // Accumulate all fields that have (or had) an active crow attack this wave.
    const activeAttacks = fields.filter((f) => f.crowAttack !== null);
    if (activeAttacks.length > 0) {
      s2CrowsArrived = true;
      for (const f of activeAttacks) {
        if (!s2CrowsTrackedFields.includes(f.index)) {
          s2CrowsTrackedFields.push(f.index);
        }
      }
    }

    if (!s2CrowsArrived || s2CrowsTrackedFields.length === 0) return false;

    // Record the player's scare action the moment it happens (scaringAt set).
    // This is the only reliable "defended" signal: once the crow leaves, a
    // scared field and an eaten-then-resown field are indistinguishable by
    // stage, because the bot auto-farms the player's fields during the tutorial.
    for (const idx of s2CrowsTrackedFields) {
      const f = fields.find((field) => field.index === idx);
      if (f && f.scaringAt !== null && !s2ScaredFields.includes(idx)) {
        s2ScaredFields.push(idx);
      }
    }

    const total = s2CrowsTrackedFields.length;
    const required = Math.min(minDefended ?? total, total);

    // Player has scared enough fields — defended. Linger 1s so they see the
    // crows leave, then advance (the gate is polled, so this resolves even with
    // no further game updates).
    if (s2ScaredFields.length >= required) {
      const now = Date.now();
      if (s2DefendSuccessAt === null) {
        s2DefendSuccessAt = now;
        return false;
      }
      if (now - s2DefendSuccessAt < CROW_DEFEND_SUCCESS_LINGER_MS) return false;
      resetCrowTracking();
      return true;
    }

    // Every crow has resolved (scared or eaten) but not enough were scared —
    // the wave is lost. Retry (or advance once out of tries).
    const allResolved = s2CrowsTrackedFields.every((idx) => {
      const f = fields.find((field) => field.index === idx);
      return !f || f.crowAttack === null;
    });
    if (allResolved) {
      resetCrowTracking();
      s2DefendTryCount++;
      if (s2DefendTryCount >= MAX_DEFEND_TRIES) {
        return true; // max tries reached — advance regardless
      }
      s2RetryPending = true;
      s2RetryReadyAt = Date.now() + retryDelayMs;
      return false;
    }

    return false; // crows still in play — wait for the player to act
  };
}

// ── Stage 3: Markt & Items ───────────────────────────────────────────────────
// Item ids the scripted Stage-3 lessons reference (named so the literal lives in
// exactly one place — no magic strings).
const SWAP_ITEM_ID: ItemId = "swap_potion";
const MIRROR_ITEM_ID: ItemId = "mirror_curse";
const BLINDNESS_ITEM_ID: ItemId = "blindness_potion";

// Baselines reset by each step's onEnter (snapshots of "used" / "sent" counts).
let s3SwapUsedBaseline: number | null = null;
let s3BlindUsedBaseline: number | null = null;
let s3ComboThiefBaseline: number | null = null;
let s3ComboCrowsBaseline: number | null = null;

// Mirror lesson: after the player activates the mirror curse, the bot attacks
// with all three sabotages — staggered, because the bot only retries one pending
// cue at a time — so the player watches each one reflect onto the bot. Then the
// step lingers long enough to see all three land (well within the 30s mirror).
const S3_REFLECT_STAGGER_MS = 4_000;
const S3_REFLECT_WATCH_MS = 16_000;
let s3ReflectStartedAt: number | null = null;

function s3PlayerState(game: GameState | null) {
  const pid = useConnectionStore.getState().playerId;
  if (!game || !pid) return null;
  return game.players[pid] ?? null;
}

function s3OwnsItem(game: GameState | null, itemId: ItemId): boolean {
  const ps = s3PlayerState(game);
  return (ps?.items.find((i) => i.id === itemId)?.count ?? 0) > 0;
}

function s3UsedCount(game: GameState | null, itemId: ItemId): number {
  return s3PlayerState(game)?.stats.itemsUsedByType[itemId] ?? 0;
}

// Base surfaces for Stage 3 — everything the player already learned in Stages
// 1–2 is visible from the start; merchant/itemBar are revealed one-at-a-time.
const S3_BASE_REVEALS: TutorialSurface[] = [
  "goldHud",
  "exitButton",
  "opponentFarm",
  "effectsTimeline",
  "toolsCard",
  "fertilizerCard",
  "crowsCard",
  "thiefCard",
  "weatherCard",
  "villagers",
  "villagerAccuse",
  "thiefEntity",
];

// A merchant visit: on entry, force the merchant to arrive offering `itemId`;
// the step completes once the player owns it. Used for all three Stage-3 buys.
function makeMerchantPurchaseStep(
  text: string,
  itemId: ItemId,
  reveals?: TutorialSurface[],
): TutorialStep {
  return {
    text,
    ...(reveals ? { reveals } : {}),
    allow: [],
    merchantItemId: itemId,
    onEnter: (send) => {
      send?.({ type: "tutorial_cue", cue: "tutorial_merchant", itemId });
    },
    gate: (game) => s3OwnsItem(game, itemId),
  };
}

export const TUTORIAL_STEPS: Record<TutorialStageId, TutorialStep[]> = {
  1: [
    {
      // Step 0 — welcome; "Weiter" button advances and enables field interaction
      text: "Willkommen auf deinem Hof! Hier lernst du, wie du Weizen anbauen und ernten kannst.",
      reveals: ["goldHud", "exitButton"],
    },
    {
      // Step 1 — sow; gate auto-advances as soon as any field starts sowing
      text: "Klicke auf eines deiner Felder (das + Symbol), um Weizen zu säen.",
      highlight: { kind: "field", owner: "player", index: 0 },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          game.players[pid]?.fields.some((f) => f.stage !== "empty") ?? false
        );
      },
    },
    {
      // Step 2 — wait for growth; gate auto-advances when a field turns ready
      text: "Gut! Dein Weizen wächst. Wenn er reif ist, kannst du ihn ernten.",
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          game.players[pid]?.fields.some((f) => f.stage === "ready") ?? false
        );
      },
    },
    {
      // Step 3 — harvest; gate lazily sets a baseline on first call, then
      // auto-advances the moment fieldsHarvested increases. onEnter resets
      // the baseline so a tutorial restart reinitializes correctly.
      text: "Reif! Klicke auf das gold-umrandete Feld, um zu ernten und Gold zu verdienen.",
      onEnter: () => {
        harvestedBaseline = null;
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const count = game.players[pid]?.stats.fieldsHarvested ?? 0;
        if (harvestedBaseline === null) {
          harvestedBaseline = count;
          return false;
        }
        return count > harvestedBaseline;
      },
    },
    {
      // Step 4 — upgrade task; gate auto-advances when tools ≥ 3 AND fertilizer ≥ 2
      text: "Sehr gut! Jetzt upgrade dein Werkzeug auf Stufe 3 und deinen Dünger auf Stufe 3.",
      reveals: ["toolsCard", "fertilizerCard"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const tools = game.players[pid]?.tools ?? [];
        const toolsLevel = tools.find((t) => t.id === "tools")?.level ?? 1;
        const fertLevel = tools.find((t) => t.id === "fertilizer")?.level ?? 1;
        return toolsLevel >= 3 && fertLevel >= 3;
      },
    },
    {
      // Step 5 — completion; "Fertig" button finishes the tutorial
      text: "Perfekt! Du kennst jetzt die Grundlagen. Du kannst mit dem nächsten Level fortfahren.",
    },
  ],

  2: [
    // ── Step 0: Intro ──────────────────────────────────────────────────────────
    {
      text: "Willkommen zu Stufe 2! Dein Gegner ist jetzt auf dem Hof. Hier lernst du, wie du ihn sabotierst — und dich gegen seine Angriffe wehrst.",
      reveals: ["goldHud", "exitButton", "opponentFarm", "effectsTimeline"],
      allow: [],
    },

    // ── KRÄHEN — ANGRIFF ───────────────────────────────────────────────────────

    // Step 1: Explain crows + unlock (upgrade to Lv1)
    {
      text: "Krähen! Du kannst Krähen auf die Felder deines Gegners schicken — sie fressen seine Ernte. Schalte die Krähen auf Stufe 1 frei, um anzugreifen!",
      reveals: ["crowsCard"],
      highlight: { kind: "dom", id: "crowsCard" },
      allow: ["upgrade:crows"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "crows")?.level ??
            0) >= 1
        );
      },
    },

    // Step 2: Player attacks with Lv1
    {
      text: "Jetzt greifst du an! Klicke SENDEN, wähle ein Feld deines Gegners aus und schick die Krähen los.",
      allow: ["sendCrows"],
      onEnter: () => {
        s2CrowsSentBaseline = null;
        s2CrowsClearedAt = null;
      },
      gate: s2AttackCrowsGate,
    },

    // Step 3: Upgrade to Lv2
    {
      text: "Gut! Die Krähen auf Stufe 1 greifen 1 Feld an. Werte sie auf Stufe 2 auf — dann werden 2 Felder gleichzeitig angegriffen!",
      highlight: { kind: "dom", id: "crowsCard" },
      allow: ["upgrade:crows"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "crows")?.level ??
            0) >= 2
        );
      },
    },

    // Step 4: Player attacks with Lv2
    {
      text: "Deine Krähen sind jetzt auf Stufe 2 — schick sie auf 2 Felder deines Gegners!",
      allow: ["sendCrows"],
      onEnter: (send) => {
        s2CrowsSentBaseline = null;
        s2CrowsClearedAt = null;
        send?.({ type: "tutorial_cue", cue: "reset_player_cooldowns" });
      },
      gate: s2AttackCrowsGate,
    },

    // Step 5: Upgrade to Lv3
    {
      text: "Sehr gut! Werte die Krähen auf Stufe 3 auf — dann greifen sie 3 Felder gleichzeitig an und das Verscheuchen dauert länger!",
      highlight: { kind: "dom", id: "crowsCard" },
      allow: ["upgrade:crows"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "crows")?.level ??
            0) >= 3
        );
      },
    },

    // Step 6: Player attacks with Lv3
    {
      text: "Deine Krähen sind jetzt auf Stufe 3 — schick sie auf 3 Felder deines Gegners!",
      allow: ["sendCrows"],
      onEnter: (send) => {
        s2CrowsSentBaseline = null;
        s2CrowsClearedAt = null;
        send?.({ type: "tutorial_cue", cue: "reset_player_cooldowns" });
      },
      gate: s2AttackCrowsGate,
    },

    // ── KRÄHEN — VERTEIDIGUNG ──────────────────────────────────────────────────

    // Step 7: Defend against Lv1 crows
    {
      text: "Jetzt lernt dein Gegner dasselbe! Seine Krähen auf Stufe 1 greifen 1 Feld an. Klicke auf das befallene Feld, um die Krähen zu verscheuchen. Drücke BEREIT, wenn du vorbereitet bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(1),
      gate: makeCrowDefendGate(1),
    },

    // Step 8: Defend against Lv2 crows
    {
      text: "Gut! Jetzt greifen seine Krähen auf Stufe 2 an — 2 Felder gleichzeitig. Klicke auf jedes befallene Feld. Drücke BEREIT, wenn du bereit bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(2),
      gate: makeCrowDefendGate(2),
    },

    // Step 9: Defend against Lv3 crows (2 out of 3 sufficient)
    {
      text: "Seine Krähen auf Stufe 3 greifen jetzt bis zu 3 Felder gleichzeitig an! Drücke BEREIT, wenn du bereit bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(3),
      gate: makeCrowDefendGate(3, 2, CROW_DEFEND_LV3_RETRY_MS),
    },

    // ── DIEB — ANGRIFF ─────────────────────────────────────────────────────────

    // Step: Explain thief + unlock (upgrade to Lv1)
    {
      text: "Dieb! Du kannst einen Dieb zum Gegner schmuggeln — als Dorfbewohner verkleidet schleicht er sich ein und klaut Gold. Schalte den Dieb auf Stufe 1 frei, um ihn loszuschicken!",
      reveals: ["thiefCard"],
      highlight: { kind: "dom", id: "thiefCard" },
      allow: ["upgrade:thief"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "thief")?.level ??
            0) >= 1
        );
      },
    },

    // Step: Player sends their own thief (explain how it sneaks in)
    {
      text: "Jetzt greifst du an! Klicke auf SENDEN, um deinen Dieb loszuschicken. Er wartet am Rand, bis ein Dorfbewohner in ein Haus geht — dann schlüpft er verkleidet aus genau diesem Haus heraus und beginnt zu klauen.",
      allow: ["sendThief"],
      onEnter: () => {
        s2ThievesSentBaseline = null;
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const count = game.players[pid]?.stats.thievesSent ?? 0;
        if (s2ThievesSentBaseline === null) {
          s2ThievesSentBaseline = count;
          return false;
        }
        return count > s2ThievesSentBaseline;
      },
    },

    // Step: Wait until the player's thief has stolen enough gold
    {
      text: `Dein Dieb ist drüben und stiehlt Gold. Beobachte ihn — sobald er ${THIEF_ATTACK_STEAL_GOAL} Gold geklaut hat, geht es weiter.`,
      allow: [],
      onEnter: () => {
        s2ThiefStolenBaseline = null;
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const stolen = game.players[pid]?.stats.goldStolenByThief ?? 0;
        if (s2ThiefStolenBaseline === null) {
          s2ThiefStolenBaseline = stolen;
          return false;
        }
        return stolen >= s2ThiefStolenBaseline + THIEF_ATTACK_STEAL_GOAL;
      },
    },

    // ── DIEB — VERTEIDIGUNG ────────────────────────────────────────────────────

    // Step: Defend against Lv1 thief (no disguise)
    {
      text: "Jetzt lernt dein Gegner dasselbe! Sein Dieb schleicht sich gleich zwischen deine Dorfbewohner. So fängst du ihn: Klicke den Dieb an und bestätige — aber klicke NICHT auf echte Dorfbewohner, sonst wirst du bestraft! Der Dieb auf Stufe 1 trägt keine Verkleidung. Drücke BEREIT, wenn du bereit bist!",
      reveals: ["villagers", "villagerAccuse", "thiefEntity"],
      allow: ["accuse"],
      onEnter: resetThiefDefendState,
      readyButton: makeThiefReadyButton(1),
      gate: makeThiefDefendGate(1),
    },

    // Step: Defend against Lv2 thief (partial disguise)
    {
      text: "Gut gefangen! Der Dieb auf Stufe 2 ist verkleidet — aber nicht perfekt: Er trägt ein helleres Hemd und hat rote Augen. Schau genau hin! Drücke BEREIT, wenn du bereit bist!",
      allow: ["accuse"],
      onEnter: resetThiefDefendState,
      readyButton: makeThiefReadyButton(2),
      gate: makeThiefDefendGate(2),
    },

    // Step: Defend against Lv3 thief (full disguise — observational tips)
    {
      text: "Der Dieb auf Stufe 3 sieht genau wie ein echter Dorfbewohner aus. So erkennst du ihn trotzdem:\n• Sinkt plötzlich dein Gold? Dann ist ein Dieb da.\n• Achte darauf, in welche Häuser Dorfbewohner gehen — kommt jemand aus einem Haus, in das niemand hineingegangen ist, ist das dein Dieb.\nDrücke BEREIT, wenn du bereit bist!",
      allow: ["accuse"],
      onEnter: resetThiefDefendState,
      readyButton: makeThiefReadyButton(3),
      gate: makeThiefDefendGate(3),
    },

    // ── UNWETTER — ERLEBEN (Stufe 1) ─────────────────────────────────────────────

    // Step: Weather explanation — manual advance, no attack yet
    {
      text: "Unwetter! Dein Gegner kann einen Sturm über deinen Hof schicken, der alles verlangsamt. Dagegen kannst du dich nicht wehren — du musst ihn einfach abwarten. Gleich zieht ein Sturm auf!",
      reveals: ["weatherCard"],
      allow: [],
    },

    // Step: Bot sends Lv1 weather — player experiences it briefly (no need to
    // wait out the whole storm; the next step clears the leftover).
    {
      text: "Da ist er! Dein ganzer Hof läuft jetzt langsamer, und deine Dorfbewohner verkriechen sich in den Häusern. Du kannst nichts tun — warte einfach ab, bis der Sturm vorüberzieht.",
      allow: [],
      onEnter: (send) => {
        s2WeatherExperiencedAt = null;
        send?.({ type: "tutorial_cue", cue: "bot_send_weather", level: 1 });
      },
      gate: s2ExperienceWeatherGate,
    },

    // ── UNWETTER — ANGRIFF (Stufe 2) ─────────────────────────────────────────────

    // Step: Upgrade weather to Lv2. onEnter clears the leftover Lv1 storm so the
    // player isn't still slowed while they learn to attack ("Vorbei!").
    {
      text: "Vorbei! Jetzt bist du dran. Werte das Unwetter auf Stufe 2 auf — dann wird dein Sturm deutlich stärker.",
      highlight: { kind: "dom", id: "weatherCard" },
      allow: ["upgrade:weather"],
      onEnter: (send) => {
        send?.({ type: "tutorial_cue", cue: "cancel_weather" });
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "weather")?.level ??
            0) >= 2
        );
      },
    },

    // Step: Player casts Lv2 weather on the opponent — linger 5s to see it work
    {
      text: "Schick das Unwetter auf Stufe 2 zu deinem Gegner — es verlangsamt seinen ganzen Hof. Klicke SENDEN!",
      allow: ["sendWeather"],
      onEnter: () => {
        s2WeatherSentBaseline = null;
        s2WeatherAttackLandedAt = null;
      },
      gate: s2AttackWeatherGate,
    },

    // ── UNWETTER — ANGRIFF (Stufe 3, Blitz) ──────────────────────────────────────

    // Step: Upgrade weather to Lv3
    {
      text: "Stark! Werte das Unwetter auf Stufe 3 auf — dann schlägt zusätzlich ein Blitz ein und vernichtet sofort ein Feld deines Gegners.",
      highlight: { kind: "dom", id: "weatherCard" },
      allow: ["upgrade:weather"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "weather")?.level ??
            0) >= 3
        );
      },
    },

    // Step: Player casts Lv3 weather — watch the lightning strike. onEnter clears
    // the still-active Lv2 storm (a target can hold only one weather at a time)
    // and resets the player's cooldown so the fresh storm can be cast at once.
    {
      text: "Jetzt der Blitz! Schick das Unwetter auf Stufe 3 zum Gegner und sieh zu, wie ein Blitz eines seiner Felder vernichtet.",
      allow: ["sendWeather"],
      onEnter: (send) => {
        s2WeatherSentBaseline = null;
        s2WeatherAttackLandedAt = null;
        send?.({ type: "tutorial_cue", cue: "cancel_weather" });
        send?.({ type: "tutorial_cue", cue: "reset_player_cooldowns" });
      },
      gate: s2AttackWeatherGate,
    },

    // ── ABSCHLUSS ────────────────────────────────────────────────────────────────

    // Step: Completion — "Fertig" returns to the menu
    {
      text: "Stark gespielt! Du beherrschst jetzt Krähen, Dieb und Unwetter — Angriff wie Verteidigung. Damit bist du bereit für echte Duelle. Viel Erfolg!",
    },
  ],

  3: [
    // ── INTRO ──────────────────────────────────────────────────────────────────
    // Step 0 — what items are and how to get them. Manual "Weiter".
    {
      text: "Willkommen zu Stufe 3! Items sind mächtige Einmal-Helfer. Du kaufst sie beim Händler, der dreimal pro Spiel vorbeikommt und dir jedes Mal ein paar Items anbietet — kauf pro Besuch eins.",
      reveals: S3_BASE_REVEALS,
      allow: [],
    },

    // ── TAUSCHTRANK (swap_potion) ──────────────────────────────────────────────
    // Step 1 — merchant arrives offering the swap potion; player buys it.
    makeMerchantPurchaseStep(
      "Der Händler ist da! Klicke ihn an und kauf den Tauschtrank.",
      SWAP_ITEM_ID,
      ["merchant"],
    ),
    // Step 2 — use the swap potion (own field ↔ opponent field).
    {
      text: "Mit dem Tauschtrank tauschst du Felder: Wähle zuerst eins deiner frisch wachsenden Felder, dann ein reifes Feld deines Gegners — so klaust du seine Ernte und drückst ihm deinen Setzling auf.",
      reveals: ["itemBar"],
      highlight: { kind: "dom", id: "itemBar" },
      allow: ["useItem"],
      onEnter: () => {
        s3SwapUsedBaseline = null;
      },
      gate: (game) => {
        const used = s3UsedCount(game, SWAP_ITEM_ID);
        if (s3SwapUsedBaseline === null) {
          s3SwapUsedBaseline = used;
          return false;
        }
        return used > s3SwapUsedBaseline;
      },
    },

    // ── SPIEGELFLUCH (mirror_curse) ────────────────────────────────────────────
    // Step 3 — merchant returns offering the mirror curse; player buys it.
    makeMerchantPurchaseStep(
      "Der Händler kommt wieder vorbei. Kauf diesmal den Spiegelfluch.",
      MIRROR_ITEM_ID,
    ),
    // Step 4 — activate the mirror curse.
    {
      text: "Aktiviere den Spiegelfluch! 30 Sekunden lang prallt jede Sabotage, die dein Gegner schickt, auf ihn selbst zurück.",
      highlight: { kind: "dom", id: "itemBar" },
      allow: ["useItem"],
      gate: (game) => {
        const ps = s3PlayerState(game);
        return !!ps?.activeEffects.some((e) => e.itemId === MIRROR_ITEM_ID);
      },
    },
    // Step 5 — watch all three sabotages reflect back onto the bot.
    {
      text: "Sieh zu! Dein Gegner greift jetzt an — doch seine Krähen, sein Sturm und sein Dieb treffen seinen eigenen Hof.",
      allow: [],
      onEnter: (send) => {
        s3ReflectStartedAt = Date.now();
        send?.({ type: "tutorial_cue", cue: "bot_send_crows", level: 1 });
        setTimeout(() => {
          send?.({ type: "tutorial_cue", cue: "bot_send_weather", level: 1 });
        }, S3_REFLECT_STAGGER_MS);
        setTimeout(() => {
          send?.({ type: "tutorial_cue", cue: "bot_send_thief", level: 1 });
        }, S3_REFLECT_STAGGER_MS * 2);
      },
      gate: () => {
        if (s3ReflectStartedAt === null) return false;
        return Date.now() - s3ReflectStartedAt >= S3_REFLECT_WATCH_MS;
      },
    },

    // ── BLINDHEITSTRANK (blindness_potion) ─────────────────────────────────────
    // Step 6 — merchant's last visit offering the blindness potion; player buys it.
    makeMerchantPurchaseStep(
      "Letzter Besuch des Händlers — kauf den Blindheitstrank.",
      BLINDNESS_ITEM_ID,
    ),
    // Step 7 — upgrade crows + thief to Lv1, then use the blindness potion.
    {
      text: "Der Blindheitstrank macht den Gegner 15 Sekunden lang blind — er sieht deinen Dieb nicht und kann deine Krähen nicht verscheuchen. Schalte zuerst Krähen und Dieb auf Stufe 1 frei, dann setz den Trank ein!",
      highlight: { kind: "dom", id: "itemBar" },
      allow: ["upgrade:crows", "upgrade:thief", "useItem"],
      onEnter: () => {
        s3BlindUsedBaseline = null;
        s3ComboThiefBaseline = null;
        s3ComboCrowsBaseline = null;
      },
      gate: (game) => {
        const ps = s3PlayerState(game);
        if (!ps) return false;
        const blindUsed = ps.stats.itemsUsedByType[BLINDNESS_ITEM_ID] ?? 0;
        if (s3BlindUsedBaseline === null) {
          s3BlindUsedBaseline = blindUsed;
          return false;
        }
        return blindUsed > s3BlindUsedBaseline;
      },
    },

    // Step 8 — now send thief + crows while the opponent is blind.
    {
      text: "Perfekt! Der Gegner ist blind. Schick jetzt sofort einen Dieb UND Krähen los!",
      allow: ["sendThief", "sendCrows"],
      onEnter: () => {
        s3ComboThiefBaseline = null;
        s3ComboCrowsBaseline = null;
      },
      gate: (game) => {
        const ps = s3PlayerState(game);
        if (!ps) return false;
        const thieves = ps.stats.thievesSent;
        const crows = ps.stats.crowsSent;
        if (s3ComboThiefBaseline === null) {
          s3ComboThiefBaseline = thieves;
          s3ComboCrowsBaseline = crows;
          return false;
        }
        return (
          thieves > (s3ComboThiefBaseline ?? 0) &&
          crows > (s3ComboCrowsBaseline ?? 0)
        );
      },
    },

    // ── ABSCHLUSS ──────────────────────────────────────────────────────────────
    // Step 8 — completion; manual finish button returns to the learning path.
    {
      text: "Hervorragend! Du beherrschst jetzt Markt und Items. Damit bist du bereit für ein echtes Testspiel. Viel Erfolg!",
    },
  ],
};
