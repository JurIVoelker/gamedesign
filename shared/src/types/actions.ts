import type { ItemId } from '../constants.js';

export type SowField = {
  kind: 'SowField';
  fieldIndex: number;
  cropType: string;
};

export type HarvestField = {
  kind: 'HarvestField';
  fieldIndex: number;
};

export type BuyItem = {
  kind: 'BuyItem';
  itemId: ItemId;
};

export type UseItem = {
  kind: 'UseItem';
  itemId: ItemId;
  targetFieldIndex?: number;
  secondTargetFieldIndex?: number;
};

export type ToolId = 'tools' | 'fertilizer' | 'crows' | 'thief' | 'weather';

export type UpgradeTool = {
  kind: 'UpgradeTool';
  toolId: ToolId;
};

export type SendCrows = {
  kind: 'SendCrows';
  targetFieldIndices: number[];
};

export type ScareCrow = {
  kind: 'ScareCrow';
  fieldIndex: number;
};

export type SendThief = {
  kind: 'SendThief';
};

export type CatchThief = {
  kind: 'CatchThief';
};

export type SendWeather = {
  kind: 'SendWeather';
};

export type AccuseVillager = {
  kind: 'AccuseVillager';
  villagerId: number;
};

export type PlayerAction =
  | SowField
  | HarvestField
  | BuyItem
  | UseItem
  | UpgradeTool
  | SendCrows
  | ScareCrow
  | SendThief
  | CatchThief
  | SendWeather
  | AccuseVillager;
