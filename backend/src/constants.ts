export const SOW_DURATION_MS = 5_000;
export const HARVEST_DURATION_MS = 5_000;
export const BASE_GROW_MS = 60_000;
export const GROW_VARIANCE = 0.1;
export const GOLD_PER_HARVEST = 25;

// Index n = duration multiplier at tool level n.
// 1.0 / 0.7 / 0.4 / 0.1 → 0% / 30% / 60% / 90% faster.
export const UPGRADE_SPEED_MULTIPLIERS = [1.0, 0.7, 0.4, 0.1];
export const MAX_TOOL_LEVEL = 3;

// Cost to reach lvl 1, 2, 3 respectively (index = target level - 1).
export const SOW_UPGRADE_COSTS = [50, 150, 400];
export const HARVEST_UPGRADE_COSTS = [50, 150, 400];

// Fertilizer: 5 levels reducing grow time and increasing gold yield.
export const FERTILIZER_GROW_MULTIPLIERS = [1.0, 0.88, 0.77, 0.67, 0.57, 0.5];
export const FERTILIZER_GOLD_MULTIPLIERS = [1.0, 1.12, 1.25, 1.4, 1.58, 1.8];
export const MAX_FERTILIZER_LEVEL = 5;
export const FERTILIZER_UPGRADE_COSTS = [100, 250, 500, 900, 1500];

// Crows sabotage tool: upgrade to unlock and increase strength.
// eatRatePerMs — grow-progress units eaten per ms (1/12000 = full field in 12s at Lv1).
export const CROW_LEVEL_CONFIG = [
  { fieldCount: 1, eatRatePerMs: 1 / 12_000, targetRipest: false },  // Lv1
  { fieldCount: 2, eatRatePerMs: 1 / 12_000, targetRipest: false },  // Lv2
  { fieldCount: 2, eatRatePerMs: 1 / 8_000,  targetRipest: true  },  // Lv3
] as const;

export type CrowLevelCfg = (typeof CROW_LEVEL_CONFIG)[number];

export const MAX_CROW_LEVEL = 3;
export const CROW_UPGRADE_COSTS = [30, 80, 200] as const;  // to Lv1, Lv2, Lv3
export const CROW_SEND_COST = 15;
export const CROW_COOLDOWN_MS = 45_000;
export const CROW_SCARE_MS = 1_500;

// Thief sabotage tool: sneaks onto opponent farm disguised as a villager.
// cost — gold deducted per send; disguise — visual level on the client.
export const THIEF_LEVELS = [
  { cost: 20,  cooldownMs: 60_000, stealPerSecond: 2,   minWaitMs: 5_000,  maxWaitMs: 20_000, durationMs: 15_000, disguise: 'none'    as const },
  { cost: 35,  cooldownMs: 60_000, stealPerSecond: 3,   minWaitMs: 5_000,  maxWaitMs: 25_000, durationMs: 20_000, disguise: 'partial' as const },
  { cost: 55,  cooldownMs: 60_000, stealPerSecond: 4.5, minWaitMs: 5_000,  maxWaitMs: 30_000, durationMs: 25_000, disguise: 'full'    as const },
] as const;

export const MAX_THIEF_LEVEL = 3;
export const THIEF_UPGRADE_COSTS = [40, 100, 250] as const;  // to Lv1, Lv2, Lv3
export const THIEF_GOLD_RETURN_FRACTION = 0.60; // fraction of stolen gold that reaches the saboteur

// slowFactor       — fraction of growth speed removed (0.30 → crops grow at 70%)
// actionSlowFactor — fraction of sow/harvest speed removed (steeper than slowFactor)
export const WEATHER_LEVELS = [
  { cost: 15, cooldownMs: 70_000, slowFactor: 0.30, actionSlowFactor: 0.55, durationMs: 40_000, lightning: false },
  { cost: 28, cooldownMs: 70_000, slowFactor: 0.50, actionSlowFactor: 0.70, durationMs: 40_000, lightning: false },
  { cost: 48, cooldownMs: 70_000, slowFactor: 0.50, actionSlowFactor: 0.70, durationMs: 40_000, lightning: true  },
] as const;

export const MAX_WEATHER_LEVEL = 3;
export const WEATHER_UPGRADE_COSTS = [30, 80, 200] as const;  // to Lv1, Lv2, Lv3
// Max extra ms added to a growing field's readyAt when weather is applied
export const WEATHER_MAX_EXTRA_MS = 20_000;
