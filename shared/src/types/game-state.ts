import type { ToolId } from './actions.js';
import type { ItemId } from '../constants.js';

export type CropStage = 'empty' | 'sowing' | 'growing' | 'ready' | 'harvesting';

export type EffectVisibility = 'both' | 'owner' | 'source';

export interface ActiveEffect {
  id: string;
  itemId: ItemId;
  sourcePlayerId: string;
  startedAt: number;
  endsAt: number | null;
  visibility: EffectVisibility;
  data?: Record<string, unknown>;
}

export interface MerchantOffer {
  itemId: ItemId;
  basePrice: number;
  price: number;
  bought: boolean;
}

export interface MerchantVisit {
  visitIndex: number;
  arrivesAt: number;
  leavesAt?: number;
  discountPct: number;
  offers: MerchantOffer[];
  windowOpen: boolean;
  notice?: string;
  fake?: { byPlayerId: string; feeStep: number; drained: number };
  /** Set on tutorial-scripted merchants — they never leave on their own. */
  tutorial?: boolean;
}

export interface MatchStats {
  goldEarnedHarvest: number;
  goldStolenByThief: number;
  goldLostToThief: number;
  goldSpentUpgradesByTool: Record<ToolId, number>;
  goldSpentCrows: number;
  goldSpentThief: number;
  goldSpentWeather: number;
  goldSpentMerchant: number;
  crowGoldDestroyed: number;
  weatherGoldDestroyed: number;
  upgradeExtraProfitFertilizer: number;
  upgradeExtraProfitSpeed: number;
  fieldsHarvested: number;
  crowsSent: number;
  thievesSent: number;
  thievesCaught: number;
  weatherSent: number;
  itemsBought: Partial<Record<ItemId, number>>;
  itemsUsedByType: Partial<Record<ItemId, number>>;
  goldGainedItems: number;
  goldDrainedFakeMerchant: number;
  goldLostHalvingBrew: number;
  finalToolLevels: Record<ToolId, number>;
}

export interface CrowAttack {
  startedAt: number;
  eatRatePerMs: number;  // grow-progress units consumed per millisecond
  baseProgress: number;  // grow progress [0-1] when crows landed
  totalGrowMs: number;   // original full grow duration (used to recalculate sowedAt/readyAt)
  level: number;         // 1-3, used to determine crow count on the client
}

export interface ThiefAttack {
  phase: 'waiting' | 'stealing';
  deployedAt: number;
  minEntryAt: number;        // earliest the thief can enter (deployedAt + minWaitMs)
  entryAt: number;           // server-chosen random entry time; frontend uses to sync house animation
  stealStartedAt: number | null;
  lastProcessedAt: number | null; // tracks drain progress to avoid double-counting
  durationMs: number;
  stealPerSecond: number;
  disguise: 'none' | 'partial' | 'full';
  actorSlot: 'p1' | 'p2';   // who sent the thief (routes stolen gold)
  beneficiaryId?: string;    // drain credit target (used by Mirror Curse)
}

export interface Field {
  index: number;
  stage: CropStage;
  cropType: string | null;
  sowedAt: number | null;
  readyAt: number | null;
  crowAttack: CrowAttack | null;
  scaringAt: number | null;
  growthPausedUntil?: number;
  fieldBlockedUntil?: number;
  // Timestamp of the last swap that touched this position. Bumped by the swap
  // potion so the client can fire swap particles from an explicit signal rather
  // than inferring a swap from state diffs.
  lastSwappedAt?: number;
}

export interface Tool {
  id: string;
  level: number;
  cooldownUntil: number;
}

export interface Item {
  id: string;
  name: string;
  count: number;
  cooldownUntil: number;
  pricePaid?: number;
}

export interface WeatherEffect {
  slowFactor: number;
  actionSlowFactor: number;
  endsAt: number;
  lightning: boolean;
}

export interface PlayerState {
  id: string;
  gold: number;
  score: number;
  fields: Field[];
  tools: Tool[];
  items: Item[];
  thiefAttack: ThiefAttack | null;
  weatherEffect: WeatherEffect | null;
  villagersOutside: number;
  wrongAccusationCount: number;
  stats: MatchStats;
  merchant: MerchantVisit | null;
  activeEffects: ActiveEffect[];
}

export interface GameState {
  roomCode: string;
  phase: 'waiting' | 'playing' | 'ended';
  startedAt: number | null;
  endsAt: number | null;
  players: Record<string, PlayerState>;
  winnerId: string | null;
}
