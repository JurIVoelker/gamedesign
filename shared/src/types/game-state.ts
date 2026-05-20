export type CropStage = 'empty' | 'sowing' | 'growing' | 'ready' | 'harvesting';

export interface CrowAttack {
  startedAt: number;
  eatRatePerMs: number;  // grow-progress units consumed per millisecond
  baseProgress: number;  // grow progress [0-1] when crows landed
  totalGrowMs: number;   // original full grow duration (used to recalculate sowedAt/readyAt)
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

export interface PlayerState {
  id: string;
  gold: number;
  score: number;
  fields: Field[];
  tools: Tool[];
  items: Item[];
}

export interface GameState {
  roomCode: string;
  phase: 'waiting' | 'playing' | 'ended';
  startedAt: number | null;
  endsAt: number | null;
  players: Record<string, PlayerState>;
  winnerId: string | null;
}
