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
