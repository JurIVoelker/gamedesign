export type CropStage = 'empty' | 'sowing' | 'growing' | 'ready' | 'harvesting';

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
}

export interface Field {
  index: number;
  stage: CropStage;
  cropType: string | null;
  sowedAt: number | null;
  readyAt: number | null;
  crowAttack: CrowAttack | null;
  scaringAt: number | null;
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
}

export interface GameState {
  roomCode: string;
  phase: 'waiting' | 'playing' | 'ended';
  startedAt: number | null;
  endsAt: number | null;
  players: Record<string, PlayerState>;
  winnerId: string | null;
}
