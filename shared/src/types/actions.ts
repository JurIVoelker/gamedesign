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
  itemId: string;
};

export type UseItem = {
  kind: 'UseItem';
  itemId: string;
  targetFieldIndex?: number;
};

export type ToolId = 'sow' | 'harvest' | 'fertilizer';

export type UpgradeTool = {
  kind: 'UpgradeTool';
  toolId: ToolId;
};

export type PlayerAction =
  | SowField
  | HarvestField
  | BuyItem
  | UseItem
  | UpgradeTool;
