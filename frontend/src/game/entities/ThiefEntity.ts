import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Direction, Owner } from "./Entity";
import { FRAME_COUNT, buildFrames } from "./spriteSheet";

export type ThiefDisguise = "none" | "partial" | "full";

const DISGUISE_PREFIX: Record<ThiefDisguise, string> = {
  none: "theif-1",
  partial: "theif-2",
  full: "villager",
};

export class ThiefEntity {
  x: number;
  y: number;
  direction: Direction = "down";
  walkFrame: number = 0;
  isVisible: boolean = true;

  private sprite: Sprite;
  private glow: Graphics;
  private frames: Record<Direction, Texture[]>;
  private glowActive: boolean = false;
  private nervousFrame: number = 0;
  private frozen: boolean = false;
  readonly disguise: ThiefDisguise;
  readonly owner: Owner;
  private clickable: boolean;
  private onClick: (() => void) | null;

  constructor(
    x: number,
    y: number,
    disguise: ThiefDisguise,
    owner: Owner,
    clickable: boolean,
    onClick: (() => void) | null,
  ) {
    this.x = x;
    this.y = y;
    this.disguise = disguise;
    this.owner = owner;
    this.clickable = clickable;
    this.onClick = onClick;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(0.8);
    this.glow = new Graphics();
    this.frames = buildFrames(DISGUISE_PREFIX[disguise], owner);
  }

  render(stage: Container): void {
    stage.addChild(this.glow);
    stage.addChild(this.sprite);
    if (this.clickable) {
      this.sprite.eventMode = "static";
      this.sprite.cursor = "pointer";
      this.sprite.on("pointerdown", () => this.onClick?.());
    }
    this.draw();
  }

  setFrozen(v: boolean): void {
    this.frozen = v;
  }

  update(): void {
    if (!this.frozen) this.nervousFrame++;
    if (!this.isVisible) {
      this.sprite.visible = false;
      this.glow.visible = false;
      return;
    }
    this.sprite.visible = true;
    this.glow.visible = true;
    this.draw();
  }

  showAttackerGlow(show: boolean): void {
    if (!show || !this.isVisible) {
      if (this.glowActive) {
        this.glow.clear();
        this.glowActive = false;
      }
      return;
    }
    const pulse = 0.4 + 0.3 * Math.sin(Date.now() / 400);
    this.glow.clear();
    this.glow
      .ellipse(this.x, this.y - 1, 9, 3)
      .fill({ color: 0xffd700, alpha: pulse });
    this.glowActive = true;
  }

  destroy(stage: Container): void {
    stage.removeChild(this.sprite);
    stage.removeChild(this.glow);
    this.sprite.destroy();
    this.glow.destroy();
  }

  private draw(): void {
    const frameIndex = Math.floor(this.walkFrame / 8) % FRAME_COUNT;
    // Lv3 full disguise: subtle sinusoidal body bob to hint at nervousness
    const nervousY =
      this.disguise === "full" ? Math.sin(this.nervousFrame / 25) * 0.6 : 0;
    this.sprite.texture = this.frames[this.direction][frameIndex];
    this.sprite.x = this.x;
    this.sprite.y = this.y - nervousY;
  }
}
