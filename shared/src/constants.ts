export const SOW_DURATION_MS = 5_000;
export const HARVEST_DURATION_MS = 5_000;
export const BASE_GROW_MS = 60_000;
export const GROW_VARIANCE = 0.1;
export const GOLD_PER_HARVEST = 40;
export const STARTING_GOLD = 150;

// Index n = duration multiplier at tool level n.
// 1.0 / 0.45 / 0.2 / 0.05 → 0% / 55% / 80% / 95% faster.
export const UPGRADE_SPEED_MULTIPLIERS = [1.0, 0.45, 0.2, 0.05];
export const MAX_TOOL_LEVEL = 3;

// Combined sow+harvest action-speed tool (id: 'tools'). Cheap because it only saves action time.
export const TOOLS_UPGRADE_COSTS = [20, 40, 80];

// Fertilizer absorbs the old sow grow-time and harvest gold bonuses.
export const FERTILIZER_GROW_MULTIPLIERS = [1.0, 0.80, 0.64, 0.51];
export const FERTILIZER_GOLD_MULTIPLIERS = [1.0, 1.28, 1.55, 1.82];
export const MAX_FERTILIZER_LEVEL = 3;
export const FERTILIZER_UPGRADE_COSTS = [100, 250, 500];

// Crows sabotage tool: upgrade to unlock and increase strength.
// eatRatePerMs — grow-progress units eaten per ms (1/10000 = full field in 10s at Lv1).
// scareDurationMs — how long the player must hold the scare action to chase the crows away.
export const CROW_LEVEL_CONFIG = [
  { fieldCount: 1, eatRatePerMs: 1 / 10_000, scareDurationMs: 1_500 },  // Lv1
  { fieldCount: 2, eatRatePerMs: 1 /  7_000, scareDurationMs: 1_500 },  // Lv2
  { fieldCount: 3, eatRatePerMs: 1 /  8_000, scareDurationMs: 1_500 },  // Lv3
] as const;

export type CrowLevelCfg = (typeof CROW_LEVEL_CONFIG)[number];

export const MAX_CROW_LEVEL = 3;
export const CROW_UPGRADE_COSTS = [20, 55, 150] as const;  // to Lv1, Lv2, Lv3
export const CROW_SEND_COST = 8;
export const CROW_COOLDOWN_MS = 35_000;

// Thief sabotage tool: sneaks onto opponent farm disguised as a villager.
// cost — gold deducted per send; disguise — visual level on the client.
export const THIEF_LEVELS = [
  { cost: 15, cooldownMs: 60_000, stealPerSecond: 3, minWaitMs: 5_000, maxWaitMs: 20_000, durationMs: 20_000, disguise: 'none' as const },
  { cost: 25, cooldownMs: 60_000, stealPerSecond: 4, minWaitMs: 5_000, maxWaitMs: 25_000, durationMs: 20_000, disguise: 'partial' as const },
  { cost: 35, cooldownMs: 60_000, stealPerSecond: 5, minWaitMs: 5_000, maxWaitMs: 30_000, durationMs: 20_000, disguise: 'full' as const },
] as const;

export const MAX_THIEF_LEVEL = 3;
export const THIEF_UPGRADE_COSTS = [35, 80, 150] as const;  // to Lv1, Lv2, Lv3

// slowFactor       — fraction of growth speed removed (0.30 → crops grow at 70%)
// actionSlowFactor — fraction of sow/harvest speed removed (steeper than slowFactor)
export const WEATHER_LEVELS = [
  { cost: 15, cooldownMs: 70_000, slowFactor: 0.30, actionSlowFactor: 0.55, durationMs: 40_000, lightning: false },
  { cost: 28, cooldownMs: 70_000, slowFactor: 0.50, actionSlowFactor: 0.70, durationMs: 40_000, lightning: false },
  { cost: 35, cooldownMs: 70_000, slowFactor: 0.50, actionSlowFactor: 0.70, durationMs: 40_000, lightning: true },
] as const;

export const MAX_WEATHER_LEVEL = 3;
export const WEATHER_UPGRADE_COSTS = [30, 80, 140] as const;  // to Lv1, Lv2, Lv3
// Max extra ms added to a growing field's readyAt when weather is applied
export const WEATHER_MAX_EXTRA_MS = 20_000;

export const ACCUSATION_PAUSE_MS = 20_000;

// ---------------------------------------------------------------------------
// Items & Merchant
// ---------------------------------------------------------------------------

export type ItemId =
  | "blindness_potion"
  | "paranoia_curse"
  | "crystal_ball"
  | "swap_potion"
  | "mirror_curse"
  | "fake_merchant"
  | "spy_glass"
  | "pointless_potion"
  | "halving_brew";

export interface ItemDef {
  id: ItemId;
  name: string;
  price: number;
  rarityWeight: number;
  maxPerMatch: number | null;
  target: "none" | "opponent_field" | "own_and_opponent_field";
  durationMs: number | null;
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  pointless_potion:  { id: "pointless_potion",  name: "Trank der Unnötigkeit", price: 20,  rarityWeight: 14, maxPerMatch: null, target: "none",                    durationMs: null    },
  blindness_potion:  { id: "blindness_potion",  name: "Blindheitstrank",        price: 45,  rarityWeight: 18, maxPerMatch: null, target: "none",                    durationMs: 20_000  },
  spy_glass:         { id: "spy_glass",         name: "Spion",                  price: 50,  rarityWeight: 14, maxPerMatch: 2,    target: "none",                    durationMs: 120_000 },
  fake_merchant:     { id: "fake_merchant",     name: "Falscher Händler",       price: 55,  rarityWeight: 10, maxPerMatch: 2,    target: "none",                    durationMs: null    },
  paranoia_curse:    { id: "paranoia_curse",    name: "Paranoia-Fluch",         price: 60,  rarityWeight: 12, maxPerMatch: 2,    target: "none",                    durationMs: 60_000  },
  mirror_curse:      { id: "mirror_curse",      name: "Spiegelfluch",           price: 70,  rarityWeight: 10, maxPerMatch: 2,    target: "none",                    durationMs: 30_000  },
  swap_potion:       { id: "swap_potion",       name: "Tauschtrank",            price: 80,  rarityWeight: 7,  maxPerMatch: 1,    target: "own_and_opponent_field",  durationMs: null    },
  crystal_ball:      { id: "crystal_ball",      name: "Zauberkugel",            price: 100, rarityWeight: 6,  maxPerMatch: 1,    target: "none",                    durationMs: null    },
  halving_brew:      { id: "halving_brew",      name: "Halbierungstrunk",       price: 120, rarityWeight: 4,  maxPerMatch: 1,    target: "none",                    durationMs: null    },
};

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

export const MERCHANT_CATCHUP_STAGES = [
  { untilMs: 180_000, cumWeight: 1.0, balWeight: 0.0 },
  { untilMs: 330_000, cumWeight: 0.5, balWeight: 0.5 },
  { untilMs: Infinity, cumWeight: 0.2, balWeight: 0.8 },
] as const;

export const CRYSTAL_BALL_LEAD_MS = 5_000;
export const SPY_REPORT_INTERVAL_MS = 10_000;

// ---------------------------------------------------------------------------
// Deception Items
// ---------------------------------------------------------------------------

export const PARANOIA_FIRST_DELAY_MIN_MS = 3_000;
export const PARANOIA_FIRST_DELAY_MAX_MS = 8_000;
export const PARANOIA_RESPAWN_DELAY_MS = 500;

export const FAKE_MERCHANT_PRICE_PCT = 0.35;
export const FAKE_MERCHANT_EXCUSES = [
  "Dazu kommen noch Versandkosten...",
  "...plus die Steuer.",
  "...und ein kleines Trinkgeld?",
] as const;
export const FAKE_MERCHANT_FEE_SCHEDULE = [5, 8, 12] as const;
