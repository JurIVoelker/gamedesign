export const SOUND_CONFIG = {
  // Multiplier applied to enemy sounds (crows, rain, thunder)
  ENEMY_VOLUME_MULTIPLIER: 0.45,
  // Sow/harvest on enemy fields are barely audible — separate controls
  ENEMY_SOW_VOLUME: 0.08,
  ENEMY_HARVEST_VOLUME: 0.08,

  // Default fade durations (ms) applied to all sounds unless overridden
  DEFAULT_FADE_IN_MS: 80,
  DEFAULT_FADE_OUT_MS: 250,

  // Per-effect fade overrides
  CROW_FADE_IN_MS: 900,
  CROW_FADE_OUT_MS: 1400,
  RAIN_FADE_IN_MS: 1200,
  RAIN_FADE_OUT_MS: 1800,

  // Minimum milliseconds between repeat plays of the same sound category
  REPEAT_DELAY_MS: {
    villager: 300,
    angry: 800,
  },

  // Playback rate modifiers for villager sounds used in different contexts
  PITCH: {
    thief: 0.9, // subtle pitch-down; rate also slows speed so keep close to 1.0
    merchant: 1.2, // subtle pitch-up; same constraint
  },

  // Base volume per sound (before enemy multiplier is applied).
  //
  // Semantic tiers:
  //   DRAMATIC  (0.9–1.0) — rare, high-impact events: thunder, wrong accusation
  //   PROMINENT (0.75–0.85) — important one-shots that must cut through: scare, glass, notification, villagers, cast-item
  //   STANDARD  (0.6–0.7)  — normal action feedback: coin, buy, harvest (short loop)
  //   AMBIENT   (0.4–0.55) — long-running loops that must not fatigue: crows, rain, sow
  //   SUBTLE    (0.3–0.4)  — minimal UI chrome: click
  VOLUMES: {
    // Ambient loops — low so they don't drown out one-shots
    sow: 0.55,
    harvest: 0.6,
    crows: 0.75,
    rain: 0.6,

    // Dramatic one-shots — loudest tier
    thunder: 1.0,
    angry: 0.9,
    victory: 0.9,
    loss: 0.85,

    // Prominent one-shots — clearly audible action feedback
    "crow-scare": 0.48,
    glass: 0.85,
    notification: 0.85,
    "cast-item": 0.75,

    // Standard UI feedback
    coin: 0.65,
    "villager-1": 0.75,
    "villager-2": 0.75,
    "villager-3": 0.75,
    "villager-4": 0.75,

    // Subtle — minimal chrome
    click: 0.4,
  },
} as const;

export type SoundId = keyof typeof SOUND_CONFIG.VOLUMES;
