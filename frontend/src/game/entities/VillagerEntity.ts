import { Container, Sprite, Texture } from "pixi.js";
import { OutlineFilter } from "pixi-filters";
import type { Direction, Owner } from "./Entity";
import { FRAME_COUNT, buildFrames } from "./spriteSheet";

export class VillagerEntity {
  readonly id: number;
  readonly owner: Owner;
  x: number;
  y: number;
  direction: Direction = "down";
  walkFrame: number = 0;
  isVisible: boolean = true;
  selected: boolean = false;
  blinded: boolean = false;

  private sprite: Sprite;
  private frames: Record<Direction, Texture[]>;
  private clickable: boolean;
  private onClick: (() => void) | null;
  private outlineFilter: OutlineFilter;
  // Runtime gate (tutorial): when false, the villager shows no pointer
  // affordance and ignores clicks even if constructed clickable.
  clickEnabled: boolean = true;

  constructor(
    id: number,
    owner: Owner,
    x: number,
    y: number,
    clickable: boolean = false,
    onClick: (() => void) | null = null,
  ) {
    this.id = id;
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.clickable = clickable;
    this.onClick = onClick;
    this.outlineFilter = new OutlineFilter({ thickness: 3, color: 0xffdd00 });
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(0.8);
    this.frames = buildFrames("villager", owner);
  }

  render(stage: Container): void {
    stage.addChild(this.sprite);
    if (this.clickable) {
      this.sprite.on("pointerdown", () => {
        if (this.clickEnabled) this.onClick?.();
      });
      this.applyClickAffordance();
    }
    this.draw();
  }

  /** Toggle the pointer affordance/interaction at runtime (tutorial gating). */
  setClickEnabled(enabled: boolean): void {
    this.clickEnabled = enabled;
    if (this.clickable) this.applyClickAffordance();
  }

  private applyClickAffordance(): void {
    this.sprite.eventMode = this.clickEnabled ? "static" : "none";
    this.sprite.cursor = this.clickEnabled ? "pointer" : "default";
  }

  update(): void {
    if (!this.isVisible) {
      this.sprite.visible = false;
      this.sprite.filters = [];
      return;
    }
    this.sprite.visible = true;
    this.sprite.alpha = this.blinded ? 0 : 1;
    this.sprite.filters =
      this.selected && Math.floor(Date.now() / 300) % 2 === 0
        ? [this.outlineFilter]
        : [];
    this.draw();
  }

  private draw(): void {
    const frameIndex = Math.floor(this.walkFrame / 8) % FRAME_COUNT;
    this.sprite.texture = this.frames[this.direction][frameIndex];
    this.sprite.x = this.x;
    this.sprite.y = this.y;
  }
}
