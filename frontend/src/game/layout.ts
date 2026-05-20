import { FIELD_W, FIELD_H } from "./entities/FieldEntity";
import { HOUSE_W } from "./entities/HouseEntity";

export const H_GAP = 16;
export const ROW_GAP = 28;
export const MARGIN = 48;

export const FARM_W = HOUSE_W + H_GAP + FIELD_W;
export const SCENE_H_INNER = MARGIN + 4 * FIELD_H + 3 * ROW_GAP + MARGIN;

export const SPEED = 35; // logical px/s
export const ARRIVE_DIST = 4;

export function rowY(i: number): number {
  return MARGIN + i * (FIELD_H + ROW_GAP) + FIELD_H / 2;
}
