import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { MerchantVisit } from "@gamedesign/shared";
import { FRAME_W, FRAME_H } from "./spriteSheet";

export class MerchantEntity {
  private sprite: Sprite;
  private fadeMs = 0;
  private appeared = false;
  private visit: MerchantVisit | null = null;
  private readonly onClicked: () => void;
  readonly stage: Container;

  constructor(stage: Container, x: number, y: number, onClicked: () => void) {
    this.stage = stage;
    this.onClicked = onClicked;

    // Fallback: first idle frame from theif-2-front-right tinted warm orange
    const base: Texture = Assets.get("/assets/theif-2-front-right.png");
    const tex = new Texture({
      source: base.source,
      frame: new Rectangle(0, 0, FRAME_W, FRAME_H),
    });
    this.sprite = new Sprite(tex);
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(2);
    this.sprite.x = x;
    this.sprite.y = y;
    this.sprite.tint = 0xffbb66;
    this.sprite.alpha = 0;
    this.sprite.visible = false;
    this.sprite.eventMode = "static";
    this.sprite.cursor = "pointer";
    this.sprite.on("pointertap", () => this.onClicked());
    stage.addChild(this.sprite);
  }

  setVisit(visit: MerchantVisit | null): void {
    this.visit = visit;
    if (!visit) {
      this.appeared = false;
      this.fadeMs = 0;
      this.sprite.visible = false;
    }
  }

  update(deltaMS: number): void {
    if (!this.visit) {
      this.sprite.visible = false;
      return;
    }
    const now = Date.now();
    if (now < this.visit.arrivesAt) {
      this.sprite.visible = false;
      return;
    }
    if (!this.appeared) {
      this.appeared = true;
      this.fadeMs = 0;
      this.sprite.alpha = 0;
      this.sprite.visible = true;
    }
    if (this.fadeMs < 600) {
      this.fadeMs = Math.min(600, this.fadeMs + deltaMS);
      this.sprite.alpha = this.fadeMs / 600;
    }
  }

  destroy(): void {
    this.stage.removeChild(this.sprite);
    this.sprite.destroy();
  }
}
