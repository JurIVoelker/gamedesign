import {
  SOW_DURATION_MS,
  HARVEST_DURATION_MS,
  BASE_GROW_MS,
  GROW_VARIANCE,
  GOLD_PER_HARVEST,
  STARTING_GOLD,
  MERCHANT_VISITS,
} from "./constants.js";

export interface GameConfig {
  sowDurationMs: number;
  harvestDurationMs: number;
  baseGrowMs: number;
  growVariance: number;
  goldPerHarvest: number;
  startingGold: number;
  matchDurationMs: number;
  merchantVisits: readonly { atMs: number; jitterMs: number }[];
  enabled: {
    tools: boolean;
    fertilizer: boolean;
    crows: boolean;
    thief: boolean;
    weather: boolean;
    merchant: boolean;
    items: boolean;
  };
  persist: boolean;
}

export type TutorialStageId = 1 | 2 | 3;

// Accelerated tutorial pacing constants
const TUTORIAL_SOW_DURATION_MS = 1_000;
const TUTORIAL_HARVEST_DURATION_MS = 1_000;
const TUTORIAL_BASE_GROW_MS = 12_000;
const TUTORIAL_GROW_VARIANCE = 0.05;
const TUTORIAL_GOLD_PER_HARVEST = 40;
const TUTORIAL_STARTING_GOLD = 300;
const TUTORIAL_MATCH_DURATION_MS = 5 * 60 * 1_000;
const TUTORIAL_MERCHANT_VISITS = [
  { atMs: 45_000, jitterMs: 5_000 },
] as const;

// DEFAULT_GAME_CONFIG matches the existing shared constants exactly so PvP is byte-identical.
// If any shared constant changes, update the corresponding field here too.
export const DEFAULT_GAME_CONFIG: GameConfig = {
  sowDurationMs: SOW_DURATION_MS,
  harvestDurationMs: HARVEST_DURATION_MS,
  baseGrowMs: BASE_GROW_MS,
  growVariance: GROW_VARIANCE,
  goldPerHarvest: GOLD_PER_HARVEST,
  startingGold: STARTING_GOLD,
  matchDurationMs: 8 * 60 * 1_000,
  merchantVisits: MERCHANT_VISITS,
  enabled: {
    tools: true,
    fertilizer: true,
    crows: true,
    thief: true,
    weather: true,
    merchant: true,
    items: true,
  },
  persist: true,
};

export function gameConfigForStage(stage: TutorialStageId): GameConfig {
  const base: GameConfig = {
    sowDurationMs: TUTORIAL_SOW_DURATION_MS,
    harvestDurationMs: TUTORIAL_HARVEST_DURATION_MS,
    baseGrowMs: TUTORIAL_BASE_GROW_MS,
    growVariance: TUTORIAL_GROW_VARIANCE,
    goldPerHarvest: TUTORIAL_GOLD_PER_HARVEST,
    startingGold: TUTORIAL_STARTING_GOLD,
    matchDurationMs: TUTORIAL_MATCH_DURATION_MS,
    merchantVisits: TUTORIAL_MERCHANT_VISITS,
    persist: false,
    enabled: {
      tools: true,
      fertilizer: true,
      crows: false,
      thief: false,
      weather: false,
      merchant: false,
      items: false,
    },
  };
  if (stage === 2) {
    return {
      ...base,
      enabled: { ...base.enabled, crows: true, thief: true, weather: true },
    };
  }
  if (stage === 3) {
    return {
      ...base,
      enabled: {
        ...base.enabled,
        crows: true,
        thief: true,
        weather: true,
        merchant: true,
        items: true,
      },
    };
  }
  return base;
}
