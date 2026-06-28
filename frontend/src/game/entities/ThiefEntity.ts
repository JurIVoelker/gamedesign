import { Container, Graphics, Sprite, Texture } from "pixi.js";
import { OutlineFilter } from "pixi-filters";
import type { Direction, Owner } from "./Entity";
import { FRAME_COUNT, buildFrames } from "./spriteSheet";

export type ThiefDisguise = "none" | "partial" | "full";

// Tutorial hint: blinking red outline that reveals the real thief after the
// player has repeatedly failed to catch it.
const HINT_OUTLINE_COLOR = 0xff3b3b;
const HINT_OUTLINE_THICKNESS = 3;
const HINT_BLINK_PERIOD_MS = 300;
// Yellow blinking outline shown while the thief is clicked (modal open),
// matching the villager selection highlight (see VillagerEntity).
const SELECT_OUTLINE_COLOR = 0xffdd00;
const SELECT_OUTLINE_THICKNESS = 3;

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
  blinded: boolean = false;

  private sprite: Sprite;
  private glow: Graphics;
  private frames: Record<Direction, Texture[]>;
  private glowActive: boolean = false;
  private nervousFrame: number = 0;
  private frozen: boolean = false;
  private hint: boolean = false;
  private hintOutline: OutlineFilter;
  private selectOutline: OutlineFilter;
  // Outline currently applied to sprite.filters; tracked so we only re-assign on
  // change (the Pixi v8 setter copies + freezes the array on every assignment).
  private appliedOutline: OutlineFilter | null = null;
  readonly disguise: ThiefDisguise;
  readonly owner: Owner;
  private clickable: boolean;
  private onClick: (() => void) | null;
  private isAttacker: boolean;

  constructor(
    x: number,
    y: number,
    disguise: ThiefDisguise,
    owner: Owner,
    clickable: boolean,
    onClick: (() => void) | null,
    isAttacker: boolean,
  ) {
    this.x = x;
    this.y = y;
    this.disguise = disguise;
    this.owner = owner;
    this.clickable = clickable;
    this.onClick = onClick;
    this.isAttacker = isAttacker;
    this.sprite = new Sprite();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.scale.set(0.8);
    this.glow = new Graphics();
    this.hintOutline = new OutlineFilter({
      thickness: HINT_OUTLINE_THICKNESS,
      color: HINT_OUTLINE_COLOR,
    });
    this.selectOutline = new OutlineFilter({
      thickness: SELECT_OUTLINE_THICKNESS,
      color: SELECT_OUTLINE_COLOR,
    });
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

  /** Tutorial assist: blinking outline revealing this thief to the defender. */
  setHint(v: boolean): void {
    this.hint = v;
  }

  update(): void {
    if (!this.frozen) this.nervousFrame++;
    if (!this.isVisible) {
      this.sprite.visible = false;
      this.glow.visible = false;
      this.applyOutline(null);
      return;
    }
    this.sprite.visible = true;
    this.glow.visible = true;
    this.sprite.alpha = this.blinded ? 0 : 1;
    this.glow.alpha = this.blinded ? 0 : 1;
    // Blinking outline: yellow while clicked (frozen/modal open) — matching the
    // villager selection — otherwise red when the catch hint is active.
    const blinkOn = Math.floor(Date.now() / HINT_BLINK_PERIOD_MS) % 2 === 0;
    let outline: OutlineFilter | null = null;
    if (!this.blinded && blinkOn) {
      if (this.frozen) outline = this.selectOutline;
      else if (this.hint) outline = this.hintOutline;
    }
    this.applyOutline(outline);
    this.draw();
  }

  // Assign sprite.filters only when the outline actually changes, to avoid the
  // per-frame array allocation + copy/freeze the Pixi setter does on every set.
  private applyOutline(outline: OutlineFilter | null): void {
    if (outline === this.appliedOutline) return;
    this.appliedOutline = outline;
    this.sprite.filters = outline ? [outline] : [];
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
    // Lv3 full disguise: subtle sinusoidal body bob to hint at nervousness (attacker only)
    const nervousY =
      this.disguise === "full" && this.isAttacker
        ? Math.sin(this.nervousFrame / 25) * 0.6
        : 0;
    this.sprite.texture = this.frames[this.direction][frameIndex];
    this.sprite.x = this.x;
    this.sprite.y = this.y - nervousY;
  }
}
