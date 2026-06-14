import { Assets, Container, Rectangle, Sprite, Texture } from "pixi.js";
import type { Owner } from "./Entity";

// Mirror of FieldEntity constants — avoids circular import
const FIELD_W = 120;
const FIELD_H = 64;

// Flying and landing sheets: 31 px frame + 2 px gap → 33 px stride
const FLY_LAND_FRAME_W = 31;
const FLY_LAND_STRIDE = 33;
const FLYING_FRAME_H = 47;
const FLYING_FRAME_COUNT = 4;
const LANDING_FRAME_H = 47;
const LANDING_FRAME_COUNT = 6;

// Eating sheet: 32 px frame, no gap
const EATING_FRAME_W = 32;
const EATING_FRAME_H = 21;
const EATING_FRAME_COUNT = 4;

// Animation speeds (ms per frame)
const FRAME_MS_FLYING = 95;
const FRAME_MS_LANDING = 70;
const FRAME_MS_EATING = 75;

const FLY_SPEED_PX_S = 85;
const LANDING_START_DIST = 36;
const LANDING_TOTAL_MS = LANDING_FRAME_COUNT * FRAME_MS_LANDING;

const SCALE_FLYING = 0.42;
const SCALE_LANDED = 0.36;
// Anchor values for the eating sprite, determined by testing:
// -1 eliminates the jump when switching from landing → eating.
//  1 eliminates the jump when switching from eating → taking-off.
const EATING_ANCHOR_X = -1; // applied on startEating()
const TAKEOFF_ANCHOR_X = 1; // applied on startFlyAway() before showing landing frames

const CROWS_PER_LEVEL = [3, 4, 5];
const FLY_ENTRY_OFFSET = 60;

type CrowState =
  | "waiting"
  | "flying"
  | "landing"
  | "eating"
  | "taking-off"
  | "flying-away"
  | "done";

interface CrowFrames {
  flying: Texture[];
  landing: Texture[];
  eating: Texture[];
}

function buildFrames(): CrowFrames {
  const flyTex: Texture = Assets.get("/assets/crow-flying.png");
  const landTex: Texture = Assets.get("/assets/crow-landing.png");
  const eatTex: Texture = Assets.get("/assets/crow-eating.png");
  return {
    flying: Array.from(
      { length: FLYING_FRAME_COUNT },
      (_, i) =>
        new Texture({
          source: flyTex.source,
          frame: new Rectangle(
            i * FLY_LAND_STRIDE,
            0,
            FLY_LAND_FRAME_W,
            FLYING_FRAME_H,
          ),
        }),
    ),
    landing: Array.from(
      { length: LANDING_FRAME_COUNT },
      (_, i) =>
        new Texture({
          source: landTex.source,
          frame: new Rectangle(
            i * FLY_LAND_STRIDE,
            0,
            FLY_LAND_FRAME_W,
            LANDING_FRAME_H,
          ),
        }),
    ),
    eating: Array.from(
      { length: EATING_FRAME_COUNT },
      (_, i) =>
        new Texture({
          source: eatTex.source,
          frame: new Rectangle(
            i * EATING_FRAME_W,
            0,
            EATING_FRAME_W,
            EATING_FRAME_H,
          ),
        }),
    ),
  };
}

class SingleCrow {
  setVisible(v: boolean): void {
    if (this.state !== "done") this.sprite.visible = v;
  }

  private state: CrowState = "waiting";
  private sprite: Sprite;
  private frames: CrowFrames;
  private frameIndex = 0;
  private frameAccum = 0;
  private currentX: number;
  private displayScale = SCALE_FLYING;
  private readonly landingX: number;
  private readonly landingY: number;
  // true → arrives from left, flies right; false → arrives from right, flies left
  private readonly comesFromLeft: boolean;
  private flyingAway = false;
  private readonly entryDelay: number;
  private delayAccum = 0;
  private eatPhase: "picking" | "pausing" = "picking";
  private picksTarget = 2;
  private picksDone = 0;
  private pauseUntil = 0;
  private motionStartTime = 0;
  // Scale at which the take-off animation begins (allows smooth lerp from any state)
  private takeoffStartScale = SCALE_LANDED;
  private lastTick = Date.now();

  get isDone(): boolean {
    return this.state === "done";
  }

  constructor(
    parent: Container,
    frames: CrowFrames,
    landingX: number,
    landingY: number,
    owner: Owner,
    entryDelay: number,
  ) {
    this.frames = frames;
    this.landingX = landingX;
    this.landingY = landingY;
    this.entryDelay = entryDelay;
    this.comesFromLeft = owner === "opponent";
    this.currentX = this.comesFromLeft
      ? -FLY_ENTRY_OFFSET
      : FIELD_W + FLY_ENTRY_OFFSET;

    this.sprite = new Sprite(frames.flying[0]);
    this.sprite.anchor.set(0.5, 1.0);
    this.sprite.x = this.currentX;
    this.sprite.y = landingY;
    this.applyScale();
    parent.addChild(this.sprite);
  }

  startFlyAway(): void {
    if (this.state === "flying-away" || this.state === "done") return;
    this.flyingAway = true;
    const now = Date.now();

    if (this.state === "waiting") {
      this.state = "done";
      this.sprite.visible = false;
      return;
    }
    if (this.state === "flying") {
      this.state = "flying-away";
      this.motionStartTime = now;
      return;
    }

    // Landing or eating → play reversed landing frames while accelerating
    this.takeoffStartScale = this.displayScale;
    this.state = "taking-off";
    this.frameIndex = LANDING_FRAME_COUNT - 1;
    this.frameAccum = 0;
    this.motionStartTime = now;
    // Restore tested anchor before showing landing frames
    this.sprite.anchor.set(TAKEOFF_ANCHOR_X, 1.0);
    this.sprite.texture = this.frames.landing[this.frameIndex];
  }

  update(): void {
    if (this.state === "done") return;

    const now = Date.now();
    const delta = now - this.lastTick;
    this.lastTick = now;

    if (this.state === "waiting") {
      this.delayAccum += delta;
      if (this.delayAccum < this.entryDelay) return;
      this.state = "flying";
    }

    switch (this.state) {
      case "flying":
        this.tickFlying(delta, now);
        break;
      case "landing":
        this.tickLanding(delta, now);
        break;
      case "eating":
        this.tickEating(delta, now);
        break;
      case "taking-off":
        this.tickTakingOff(delta, now);
        break;
      case "flying-away":
        this.tickFlyingAway(delta);
        break;
    }

    this.sprite.x = this.currentX;
    this.sprite.y = this.landingY;
    this.applyScale();
  }

  destroy(): void {
    this.sprite.destroy();
  }

  private applyScale(): void {
    this.sprite.scale.y = this.displayScale;
    const flip = this.comesFromLeft !== this.flyingAway;
    this.sprite.scale.x = flip ? -this.displayScale : this.displayScale;
  }

  private tickFlying(delta: number, now: number): void {
    const step = FLY_SPEED_PX_S * (delta / 1000);
    this.currentX += this.comesFromLeft ? step : -step;

    const distToLanding = this.comesFromLeft
      ? this.landingX - this.currentX
      : this.currentX - this.landingX;

    if (distToLanding <= LANDING_START_DIST) {
      this.state = "landing";
      this.frameIndex = 0;
      this.frameAccum = 0;
      this.motionStartTime = now;
      this.sprite.texture = this.frames.landing[0];
      return;
    }

    this.frameAccum += delta;
    if (this.frameAccum >= FRAME_MS_FLYING) {
      this.frameAccum -= FRAME_MS_FLYING;
      this.frameIndex = (this.frameIndex + 1) % FLYING_FRAME_COUNT;
      this.sprite.texture = this.frames.flying[this.frameIndex];
    }
  }

  private tickLanding(delta: number, now: number): void {
    const t = Math.min(1, (now - this.motionStartTime) / LANDING_TOTAL_MS);
    const step = FLY_SPEED_PX_S * (1 - t) * (delta / 1000);
    this.currentX += this.comesFromLeft ? step : -step;
    if (this.comesFromLeft)
      this.currentX = Math.min(this.currentX, this.landingX);
    else this.currentX = Math.max(this.currentX, this.landingX);

    this.frameAccum += delta;
    if (this.frameAccum < FRAME_MS_LANDING) return;
    this.frameAccum -= FRAME_MS_LANDING;
    this.frameIndex++;
    if (this.frameIndex >= LANDING_FRAME_COUNT) {
      this.currentX = this.landingX;
      this.startEating();
      return;
    }
    const scaleT = this.frameIndex / (LANDING_FRAME_COUNT - 1);
    this.displayScale = SCALE_FLYING + (SCALE_LANDED - SCALE_FLYING) * scaleT;
    this.sprite.texture = this.frames.landing[this.frameIndex];
  }

  private startEating(): void {
    this.state = "eating";
    this.frameIndex = 0;
    this.frameAccum = 0;
    this.displayScale = SCALE_LANDED;
    this.sprite.anchor.set(EATING_ANCHOR_X, 1.0);
    this.sprite.texture = this.frames.eating[0];
    this.picksTarget = 2 + Math.floor(Math.random() * 2);
    this.picksDone = 0;
    this.eatPhase = "picking";
  }

  private tickEating(delta: number, now: number): void {
    if (this.eatPhase === "pausing") {
      if (now >= this.pauseUntil) {
        this.eatPhase = "picking";
        this.picksDone = 0;
        this.picksTarget = 2 + Math.floor(Math.random() * 2);
        this.frameIndex = 0;
        this.frameAccum = 0;
        this.sprite.texture = this.frames.eating[0];
      }
      return;
    }

    this.frameAccum += delta;
    if (this.frameAccum < FRAME_MS_EATING) return;
    this.frameAccum -= FRAME_MS_EATING;
    this.frameIndex++;
    if (this.frameIndex >= EATING_FRAME_COUNT) {
      this.frameIndex = 0;
      this.picksDone++;
      if (this.picksDone >= this.picksTarget) {
        this.eatPhase = "pausing";
        this.pauseUntil = now + 700 + Math.random() * 900;
        this.sprite.texture = this.frames.eating[0];
        return;
      }
    }
    this.sprite.texture = this.frames.eating[this.frameIndex];
  }

  private tickTakingOff(delta: number, now: number): void {
    const t = Math.min(1, (now - this.motionStartTime) / LANDING_TOTAL_MS);
    const step = FLY_SPEED_PX_S * t * (delta / 1000);
    this.currentX += this.comesFromLeft ? -step : step;

    this.frameAccum += delta;
    if (this.frameAccum < FRAME_MS_LANDING) return;
    this.frameAccum -= FRAME_MS_LANDING;
    this.frameIndex--;
    if (this.frameIndex < 0) {
      this.state = "flying-away";
      this.frameIndex = 0;
      this.frameAccum = 0;
      this.displayScale = SCALE_FLYING;
      this.sprite.texture = this.frames.flying[0];
      return;
    }
    // Lerp from the scale we were at when take-off started down to SCALE_FLYING
    const scaleT = this.frameIndex / (LANDING_FRAME_COUNT - 1);
    this.displayScale =
      SCALE_FLYING + (this.takeoffStartScale - SCALE_FLYING) * scaleT;
    this.sprite.texture = this.frames.landing[this.frameIndex];
  }

  private tickFlyingAway(delta: number): void {
    const step = FLY_SPEED_PX_S * (delta / 1000);
    this.currentX += this.comesFromLeft ? -step : step;

    const offScreen = this.comesFromLeft
      ? this.currentX < -FLY_ENTRY_OFFSET
      : this.currentX > FIELD_W + FLY_ENTRY_OFFSET;

    if (offScreen) {
      this.state = "done";
      this.sprite.visible = false;
      return;
    }

    this.frameAccum += delta;
    if (this.frameAccum >= FRAME_MS_FLYING) {
      this.frameAccum -= FRAME_MS_FLYING;
      this.frameIndex = (this.frameIndex + 1) % FLYING_FRAME_COUNT;
      this.sprite.texture = this.frames.flying[this.frameIndex];
    }
  }
}

export class CrowAnimator {
  private crows: SingleCrow[] = [];
  private blinded = false;

  get isDone(): boolean {
    return this.crows.every((c) => c.isDone);
  }

  setBlinded(b: boolean): void {
    this.blinded = b;
    for (const c of this.crows) c.setVisible(!b);
  }

  constructor(parent: Container, owner: Owner, level: number) {
    const frames = buildFrames();
    const count =
      CROWS_PER_LEVEL[Math.min(level - 1, CROWS_PER_LEVEL.length - 1)];

    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const jitterX = (Math.random() - 0.5) * 18;
      const landingX = Math.round(FIELD_W * t + jitterX);
      const landingY = Math.round(FIELD_H * 0.62 + (i % 3) * 7);
      const entryDelay = i * 320;
      this.crows.push(
        new SingleCrow(parent, frames, landingX, landingY, owner, entryDelay),
      );
    }
  }

  startFlyAway(): void {
    for (const c of this.crows) c.startFlyAway();
  }

  update(): void {
    for (const c of this.crows) {
      c.update();
      if (this.blinded) c.setVisible(false);
    }
  }

  destroy(): void {
    for (const c of this.crows) c.destroy();
    this.crows = [];
  }
}
