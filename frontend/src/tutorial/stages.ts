import type { TutorialStageId, GameState } from "@gamedesign/shared";
import type { TutorialStep, SendFn } from "./types";
import { useConnectionStore } from "../state/connectionStore";

type PlayerState = NonNullable<GameState["players"][string]>;

// Stage 1: baseline for harvest count (lazy-set on first gate call, reset by onEnter)
let harvestedBaseline: number | null = null;

// Stage 2: baselines and arrival flags (reset by each step's onEnter)
let s2CrowsArrived = false;
let s2CrowsTrackedFields: number[] = [];
// Fields the player actually scared this wave (captured while scaringAt is set).
// We can't infer "saved" from crop stage afterwards because the bot re-sows
// eaten fields, making an eaten field look defended.
let s2ScaredFields: number[] = [];
// Arrival flags wrapped in holder objects so a shared gate factory can flip
// them while each step's onEnter still resets them by reference.
const s2ThiefArrival = { arrived: false };
const s2WeatherArrival = { arrived: false };
let s2CrowsSentBaseline: number | null = null;
let s2ThievesSentBaseline: number | null = null;
let s2WeatherSentBaseline: number | null = null;
let s2HarvestedBaseline: number | null = null;

const FREE_PLAY_ATTACK_GOAL = 2;
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

// On a failed defense retry, only re-send crows once enough of the player's
// fields have actually REGROWN to at least this fraction. The plain "growing"
// stage is reached the instant the bot re-sows (≈0% grown), which made the next
// wave arrive on near-empty fields and feel impossible. Requiring real growth
// both guarantees a defendable crop and gives the farm time to recover.
const CROW_RETRY_MIN_GROWTH = 0.3;

// Linear growth fraction (0..1) of a field from sow → ready. Used only to pace
// defense retries; an approximation is fine for that purpose.
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

// Gate for "an attack arrives, then clears" steps (thief catch, weather wait):
// latches `arrived` while the effect is active, advances once it's gone.
function makeArrivalGate(
  arrival: { arrived: boolean },
  isActive: (ps: PlayerState) => boolean,
): (game: GameState | null) => boolean {
  return (game) => {
    const pid = useConnectionStore.getState().playerId;
    if (!game || !pid) return false;
    const ps = game.players[pid];
    if (!ps) return false;
    if (isActive(ps)) {
      arrival.arrived = true;
      return false;
    }
    return arrival.arrived;
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

// "Bereit!" button for a defend step: arms the gate, then sends the bot's
// crows after a short delay so the player has a moment to prepare.
function makeDefendReadyButton(level: number) {
  return {
    label: "Bereit!",
    action: (send: SendFn) => {
      s2WaitingForCrows = true;
      cancelDefendTimer();
      s2DefendTimer = setTimeout(() => {
        s2DefendTimer = null;
        send?.({ type: "tutorial_cue", cue: "bot_send_crows", level });
      }, CROW_DEFEND_DELAY_MS);
    },
  };
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
          fieldGrowthFraction(f, now) >= CROW_RETRY_MIN_GROWTH,
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
      text: "Krähen! Du kannst Krähen auf die Felder deines Gegners schicken — sie fressen seine Ernte. Kaufe die Krähen-Karte auf Stufe 1, um sie freizuschalten!",
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
      text: "Gut! Stufe 1 greift 1 Feld an. Upgrade auf Stufe 2 — dann werden 2 Felder gleichzeitig angegriffen!",
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
      text: "Stufe 2 — schick jetzt Krähen auf 2 Felder deines Gegners!",
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
      text: "Sehr gut! Upgrade auf Stufe 3 — dann greifen 3 Felder gleichzeitig an und das Scheuchen dauert länger!",
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
      text: "Stufe 3 — schick jetzt Krähen auf 3 Felder deines Gegners!",
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
      text: "Jetzt lernt dein Gegner dasselbe! Stufe 1 greift 1 Feld an. Klicke auf das befallene Feld, um die Krähen zu verscheuchen. Drücke BEREIT, wenn du vorbereitet bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(1),
      gate: makeCrowDefendGate(1),
    },

    // Step 8: Defend against Lv2 crows
    {
      text: "Gut! Jetzt greift Stufe 2 an — 2 Felder gleichzeitig. Klicke auf jedes befallene Feld. Drücke BEREIT, wenn du bereit bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(2),
      gate: makeCrowDefendGate(2),
    },

    // Step 9: Defend against Lv3 crows (2 out of 3 sufficient)
    {
      text: "Stufe 3 — jetzt greifen bis zu 3 Felder gleichzeitig an! Drücke BEREIT, wenn du bereit bist!",
      allow: ["scareCrow"],
      onEnter: resetDefendState,
      readyButton: makeDefendReadyButton(3),
      gate: makeCrowDefendGate(3, 2, CROW_DEFEND_LV3_RETRY_MS),
    },

    // ── DIEB LEKTION ───────────────────────────────────────────────────────────

    // Step 8: Thief explanation — manual advance, no attack yet
    {
      text: "Dieb! Dein Gegner kann einen Dieb zwischen deine Dorfbewohner schmuggeln, der dein Gold klaut. Klicke auf den Dieb, um ihn zu fangen — aber klicke nicht auf echte Dorfbewohner! Gleich schleicht er sich rein.",
      reveals: ["thiefCard", "villagers", "villagerAccuse", "thiefEntity"],
      allow: [],
    },

    // Step 9: Bot sends Lv1 thief — player catches
    {
      text: "Er trägt keine Verkleidung — leicht zu erkennen! Klicke auf ihn, bevor er zu viel klaut.",
      allow: ["accuse"],
      onEnter: (send) => {
        s2ThiefArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_thief", level: 1 });
      },
      gate: makeArrivalGate(s2ThiefArrival, (ps) => ps.thiefAttack !== null),
    },

    // Step 8: Upgrade thief to Lv2
    {
      text: "Erwischt! Stufe 1 hat keine Tarnung. Upgrade auf Stufe 2 — dann trägt er eine Teilverkleidung und ist schwerer zu erkennen!",
      highlight: { kind: "dom", id: "thiefCard" },
      allow: ["upgrade:thief"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "thief")?.level ??
            0) >= 2
        );
      },
    },

    // Step 9: Bot sends Lv2 thief — player catches
    {
      text: "Jetzt trägt er eine Verkleidung — schau genau hin und fange ihn!",
      allow: ["accuse"],
      onEnter: (send) => {
        s2ThiefArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_thief", level: 2 });
      },
      gate: makeArrivalGate(s2ThiefArrival, (ps) => ps.thiefAttack !== null),
    },

    // Step 10: Upgrade thief to Lv3
    {
      text: "Gut! Upgrade auf Stufe 3 — dann trägt er eine Vollverkleidung und sieht fast aus wie ein echter Dorfbewohner.",
      highlight: { kind: "dom", id: "thiefCard" },
      allow: ["upgrade:thief"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "thief")?.level ??
            0) >= 3
        );
      },
    },

    // Step 11: Bot sends Lv3 thief — player catches
    {
      text: "Vollverkleidung! Er sieht aus wie ein normaler Dorfbewohner. Kannst du ihn trotzdem finden?",
      allow: ["accuse"],
      onEnter: (send) => {
        s2ThiefArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_thief", level: 3 });
      },
      gate: makeArrivalGate(s2ThiefArrival, (ps) => ps.thiefAttack !== null),
    },

    // Step 12: Player sends thief
    {
      text: "Jetzt bist du dran! Schicke deinen eigenen Dieb zum Gegner.",
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

    // ── UNWETTER LEKTION ───────────────────────────────────────────────────────

    // Step 15: Weather explanation — manual advance, no attack yet
    {
      text: "Unwetter! Dein Gegner kann einen Sturm über deinen Hof schicken, der alles verlangsamt. Auf Stufe 3 trifft zusätzlich ein Blitzschlag und vernichtet sofort ein Feld. Du kannst nichts tun — warte einfach ab. Gleich zieht ein Sturm auf!",
      reveals: ["weatherCard"],
      allow: [],
    },

    // Step 16: Bot sends Lv1 weather — player waits it out
    {
      text: "Ein schwaches Gewitter — alles läuft etwas langsamer. Warte geduldig, bis es aufhört!",
      allow: [],
      onEnter: (send) => {
        s2WeatherArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_weather", level: 1 });
      },
      gate: makeArrivalGate(
        s2WeatherArrival,
        (ps) => ps.weatherEffect !== null,
      ),
    },

    // Step 14: Upgrade weather to Lv2
    {
      text: "Vorbei! Stufe 1 ist noch harmlos. Upgrade auf Stufe 2 — dann wird der Sturm deutlich stärker!",
      highlight: { kind: "dom", id: "weatherCard" },
      allow: ["upgrade:weather"],
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        return (
          (game.players[pid]?.tools.find((t) => t.id === "weather")?.level ??
            0) >= 2
        );
      },
    },

    // Step 15: Bot sends Lv2 weather — player waits it out
    {
      text: "Stärkerer Sturm — der Hof läuft deutlich langsamer. Warte, bis es vorbeigeht.",
      allow: [],
      onEnter: (send) => {
        s2WeatherArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_weather", level: 2 });
      },
      gate: makeArrivalGate(
        s2WeatherArrival,
        (ps) => ps.weatherEffect !== null,
      ),
    },

    // Step 16: Upgrade weather to Lv3
    {
      text: "Gut! Upgrade auf Stufe 3 — dann trifft zusätzlich ein Blitz und vernichtet sofort ein Feld.",
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

    // Step 17: Bot sends Lv3 weather (lightning!) — player waits it out
    {
      text: "Stufe 3 mit Blitz! Ein Feld wird sofort zerstört. Schau zu — und warte, bis der Sturm vorbei ist.",
      allow: [],
      onEnter: (send) => {
        s2WeatherArrival.arrived = false;
        send?.({ type: "tutorial_cue", cue: "bot_send_weather", level: 3 });
      },
      gate: makeArrivalGate(
        s2WeatherArrival,
        (ps) => ps.weatherEffect !== null,
      ),
    },

    // Step 18: Player sends weather
    {
      text: "Jetzt bist du dran! Schicke selbst ein Unwetter zum Gegner.",
      allow: ["sendWeather"],
      onEnter: () => {
        s2WeatherSentBaseline = null;
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const count = game.players[pid]?.stats.weatherSent ?? 0;
        if (s2WeatherSentBaseline === null) {
          s2WeatherSentBaseline = count;
          return false;
        }
        return count > s2WeatherSentBaseline;
      },
    },

    // ── FREIES SPIEL ───────────────────────────────────────────────────────────

    // Step 19: Free-play — send 2 more attacks to complete Stage 2
    {
      text: `Du hast alles gelernt! Dein Gegner greift weiter an. Schicke noch ${FREE_PLAY_ATTACK_GOAL} Angriffe, um Stufe 2 abzuschließen.`,
      onEnter: (send) => {
        s2HarvestedBaseline = null;
        send?.({ type: "tutorial_cue", cue: "free_play_start" });
      },
      gate: (game) => {
        const pid = useConnectionStore.getState().playerId;
        if (!game || !pid) return false;
        const stats = game.players[pid]?.stats;
        if (!stats) return false;
        const total =
          (stats.crowsSent ?? 0) +
          (stats.thievesSent ?? 0) +
          (stats.weatherSent ?? 0);
        if (s2HarvestedBaseline === null) {
          s2HarvestedBaseline = total;
          return false;
        }
        return total >= s2HarvestedBaseline + FREE_PLAY_ATTACK_GOAL;
      },
    },
  ],

  3: [],
};
