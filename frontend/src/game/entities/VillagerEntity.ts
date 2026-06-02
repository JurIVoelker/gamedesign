import { Container, Sprite, Texture } from "pixi.js";
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

  private sprite: Sprite;
  private frames: Record<Direction, Texture[]>;

  constructor(id: number, owner: Owner, x: number, y: number) {
    this.id = id;
    this.owner = owner;
    this.x = x;
    this.y = y;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(0.8);
    this.frames = buildFrames("villager", owner);
  }

  render(stage: Container): void {
    stage.addChild(this.sprite);
    this.draw();
  }

  update(): void {
    if (!this.isVisible) {
      this.sprite.visible = false;
      return;
    }
    this.sprite.visible = true;
    this.draw();
  }

  private draw(): void {
    const frameIndex = Math.floor(this.walkFrame / 8) % FRAME_COUNT;
    this.sprite.texture = this.frames[this.direction][frameIndex];
    this.sprite.x = this.x;
    this.sprite.y = this.y;
  }
}
