import { Assets, Rectangle, Texture } from "pixi.js";
import type { Direction, Owner } from "./Entity";

export const FRAME_W = 14;
export const FRAME_H = 23;
export const FRAME_GAP = 2;
export const FRAME_COUNT = 4;

export function assetPath(
  prefix: string,
  direction: Direction,
  owner: Owner,
): string {
  if (direction === "up") return `/assets/${prefix}-back.png`;
  if (direction === "left") return `/assets/${prefix}-front-left.png`;
  if (direction === "right") return `/assets/${prefix}-front-right.png`;
  return owner === "player"
    ? `/assets/${prefix}-front-right.png`
    : `/assets/${prefix}-front-left.png`;
}

export function buildFrames(
  prefix: string,
  owner: Owner,
): Record<Direction, Texture[]> {
  const dirs: Direction[] = ["up", "down", "left", "right"];
  const frames = {} as Record<Direction, Texture[]>;
  for (const dir of dirs) {
    const base: Texture = Assets.get(assetPath(prefix, dir, owner));
    frames[dir] = Array.from(
      { length: FRAME_COUNT },
      (_, i) =>
        new Texture({
          source: base.source,
          frame: new Rectangle(i * (FRAME_W + FRAME_GAP), 0, FRAME_W, FRAME_H),
        }),
    );
  }
  return frames;
}
