import { Container, Graphics, Rectangle } from "pixi.js";

// Lv1 — generic stranger (cloak/hat, clearly out of place but not a cartoon thief)
const CLOAK_COLOR = 0x5a4a3a;
const HAT_COLOR = 0x3a2a1a;
const BAG_COLOR = 0x8b6914;

// Lv2 — near-villager (right shirt, wrong details)
const VILLAGER_SHIRT = 0x4a7abf;
const SHIRT_WORN = 0x3a6aaf; // slightly darker/duller than the real villager shirt
const SKIN = 0xffcc99;
const SKIN_PALE = 0xf0c080; // slightly off skin tone
const PANTS = 0x2a1a0a;

export type ThiefDisguise = "none" | "partial" | "full";

export class ThiefEntity {
  x: number;
  y: number;
  facingRight: boolean = true;
  walkFrame: number = 0;
  isVisible: boolean = true;

  private g: Graphics;
  private glow: Graphics;
  private glowActive: boolean = false;
  private nervousFrame: number = 0;
  readonly disguise: ThiefDisguise;
  private clickable: boolean;
  private onClick: (() => void) | null;

  constructor(
    x: number,
    y: number,
    disguise: ThiefDisguise,
    clickable: boolean,
    onClick: (() => void) | null,
  ) {
    this.x = x;
    this.y = y;
    this.disguise = disguise;
    this.clickable = clickable;
    this.onClick = onClick;
    this.g = new Graphics();
    this.glow = new Graphics();
  }

  render(stage: Container): void {
    stage.addChild(this.glow);
    stage.addChild(this.g);

    if (this.clickable) {
      this.g.eventMode = "static";
      this.g.cursor = "pointer";
      this.g.on("pointerdown", () => this.onClick?.());
    }

    this.draw();
  }

  update(): void {
    this.nervousFrame++;
    if (!this.isVisible) {
      this.g.visible = false;
      this.glow.visible = false;
      return;
    }
    this.g.visible = true;
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
    this.glow.ellipse(this.x, this.y - 1, 9, 3).fill({ color: 0xffd700, alpha: pulse });
    this.glowActive = true;
  }

  destroy(stage: Container): void {
    stage.removeChild(this.g);
    stage.removeChild(this.glow);
    this.g.destroy();
    this.glow.destroy();
  }

  private draw(): void {
    const g = this.g;
    g.clear();

    const cx = this.x;
    const by = this.y;
    const dir = this.facingRight ? 1 : -1;

    // Legs (walk animation)
    const phase = Math.floor(this.walkFrame / 8) % 2;
    const lOff = phase === 0 ? -2 : 2;
    const rOff = -lOff;
    g.rect(cx + dir * -3, by - 5 + lOff, 3, 5).fill({ color: PANTS });
    g.rect(cx + dir * 0, by - 5 + rOff, 3, 5).fill({ color: PANTS });
    g.rect(cx - 3, by - 8, 7, 3).fill({ color: PANTS });

    switch (this.disguise) {
      case "none":    this.drawStranger(g, cx, by, dir); break;
      case "partial": this.drawNearVillager(g, cx, by, dir); break;
      case "full":    this.drawClone(g, cx, by, dir); break;
    }

    if (this.clickable) {
      g.hitArea = new Rectangle(cx - 6, by - 26, 12, 26);
    }
  }

  // Lv1: generic cloaked stranger — clearly doesn't belong, but no cartoon thief cues
  private drawStranger(g: Graphics, cx: number, by: number, dir: number): void {
    // Wide cloak body — bulkier silhouette than a villager
    g.rect(cx - 4, by - 15, 9, 7).fill({ color: CLOAK_COLOR });
    // Bag hanging at side, clearly visible
    g.circle(cx + dir * 5, by - 11, 3).fill({ color: BAG_COLOR });
    g.rect(cx + dir * 3, by - 14, dir * 2, 4).fill({ color: BAG_COLOR });
    // Head
    g.ellipse(cx, by - 19, 4, 3.5).fill({ color: SKIN });
    // Wide-brim hat — very different from bare-headed villagers
    g.rect(cx - 5, by - 22, 10, 2).fill({ color: HAT_COLOR });
    g.rect(cx - 3, by - 26, 7, 4).fill({ color: HAT_COLOR });
    // Downward-cast eye (avoids eye contact)
    g.circle(cx + dir * 2, by - 20, 0.8).fill({ color: 0x222222 });
  }

  // Lv2: almost a villager — same shirt colour, but slightly off in 3 ways:
  //   1. shirt shade is a touch duller
  //   2. skin tone is slightly pale
  //   3. tiny bag outline still visible at hip
  private drawNearVillager(g: Graphics, cx: number, by: number, dir: number): void {
    // Body — dull version of the villager shirt
    g.rect(cx - 3, by - 15, 7, 7).fill({ color: SHIRT_WORN });
    // Small bag that could be mistaken for a pouch
    g.circle(cx + dir * 4, by - 12, 2).fill({ color: BAG_COLOR });
    // Head — slightly paler skin
    g.ellipse(cx, by - 19, 4, 3.5).fill({ color: SKIN_PALE });
    // Eye — glancing sideways instead of forward
    const eyeX = cx + dir * 3; // closer to face edge = looks sideways
    g.circle(eyeX, by - 20, 0.8).fill({ color: 0x333333 });
  }

  // Lv3: pixel-perfect villager clone — only tell is a slow sinusoidal head bob
  private drawClone(g: Graphics, cx: number, by: number, dir: number): void {
    const nervousOff = Math.sin(this.nervousFrame / 25) * 0.6;

    g.rect(cx - 3, by - 15, 7, 7).fill({ color: VILLAGER_SHIRT });
    g.ellipse(cx, by - 19 - nervousOff, 4, 3.5).fill({ color: SKIN });
    // Barely-visible bag shadow — almost impossible to spot
    g.circle(cx + dir * 4, by - 11, 1.5).fill({ color: BAG_COLOR, alpha: 0.2 });
    g.circle(cx + dir * 2, by - 20 - nervousOff, 0.8).fill({ color: 0x333333 });
  }
}
