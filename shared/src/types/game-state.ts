export type CropStage = 'empty' | 'sown' | 'growing' | 'ready' | 'withered';

export interface Field {
  index: number;
  stage: CropStage;
  cropType: string | null;
  sowedAt: number | null;
}

export interface Tool {
  id: string;
  level: number;
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
