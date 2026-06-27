import { Assets, Container, Graphics, Rectangle, Sprite } from "pixi.js";
import type { CropStage, Field } from "@gamedesign/shared";
import { ACCUSATION_PAUSE_MS } from "@gamedesign/shared";
import { Entity } from "./Entity";
import { useTargetingStore } from "../../state/targetingStore";
import { useTutorialStore } from "../../state/tutorialStore";
import { CrowAnimator } from "./CrowAnimator";
import { SeededRandom } from "../SeededRandom";
import { serverTime } from "../../net/clockSync";

export const FIELD_W = 120;
export const FIELD_H = 64;

const SWAP_PARTICLE_COLORS = [
  0x44cc66, 0x22aa44, 0x66dd88, 0xaaffcc, 0x88ffaa, 0x33bb55,
];
const SWAP_PARTICLE_LIFETIME_MS = 3600;
const SWAP_PARTICLE_SIZE = 18;

const MAX_PLANT_H = 9;
const SOIL_ROWS = 4;
const SOIL_Y_START = 8;
const SOIL_ROW_STRIDE = 14;
const SOIL_X = 4;
const SOIL_W = FIELD_W - 8;

const PLUS_SIZE = 24;
const PLUS_THICKNESS = 6;
const PLUS_COLOR = 0xf0e8c0;
const PLUS_ALPHA = 0.55;

const PROGRESS_COLOR = 0xffffff;
const PROGRESS_ALPHA = 0.35;
// Half-diagonal of the field — guarantees the pie covers every corner at 100%.
const PROGRESS_RADIUS = Math.ceil(
  Math.sqrt((FIELD_W / 2) ** 2 + (FIELD_H / 2) ** 2),
);

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  gfx: Sprite;
  rotation: number;
  rotationSpeed: number;
}

export class FieldEntity extends Entity {
  private farmSprite: Sprite | null = null;
  private base: Graphics | null = null;
  private progress: Graphics | null = null;
  private fieldContainer: Container | null = null;
  private crowAnimator: CrowAnimator | null = null;
  private field: Field | null = null;
  private prevField: Field | null = null;
  private lastInteractiveStage: CropStage | null = null;
  private lastHadCrowAttack = false;
  private lastWasTargetEligible = false;
  private lastWasChosen = false;
  private lastWasScaring = false;
  private readonly onSow: (() => void) | null;
  private readonly onHarvest: (() => void) | null;
  private readonly onScareCrow: (() => void) | null;
  private particles: Particle[] = [];
  private lastParticleUpdate = 0;
  private blinded = false;
  private craterAlpha = 0;
  private craterRim: number[] = [];
  private craterCore: number[] = [];
  private craterCracks: number[][] = [];

  constructor(
    id: number,
    owner: "player" | "opponent",
    x: number,
    y: number,
    onSow: (() => void) | null = null,
    onHarvest: (() => void) | null = null,
    onScareCrow: (() => void) | null = null,
  ) {
    super(id, owner, x, y);
    this.onSow = onSow;
    this.onHarvest = onHarvest;
    this.onScareCrow = onScareCrow;
  }

  resetPrevState(): void {
    this.prevField = null;
  }

  setField(field: Field | null, lightningActive = false): void {
    const prev = this.prevField;
    if (prev !== null) {
      // Swap particles fire from an explicit server signal: the swap potion
      // stamps both swapped positions with a fresh `lastSwappedAt`, so a changed
      // marker is an unambiguous "this field was just swapped". No inference, so
      // unrelated changes (growth completion, fertilizer speed-ups) never trip it.
      const swapped =
        field != null &&
        field.lastSwappedAt != null &&
        field.lastSwappedAt !== prev.lastSwappedAt;
      if (swapped) this.spawnSwapParticles();

      // Lightning strike: growing/ready → empty while lightning is active.
      // Skip when a crow was present on the previous field — that means the crow
      // (not lightning) caused the destruction.
      const crowCausedEmpty = !!prev.crowAttack && field?.stage === "empty";
      if (
        lightningActive &&
        !crowCausedEmpty &&
        (prev.stage === "growing" || prev.stage === "ready") &&
        field?.stage === "empty"
      ) {
        this.triggerCrater();
      }
    }
    this.prevField = field;
    this.field = field;
  }

  render(stage: Container): void {
    const container = new Container();
    container.x = this.x;
    container.y = this.y;
    this.fieldContainer = container;

    const farmSprite = new Sprite(Assets.get("/assets/farm.png"));
    farmSprite.width = FIELD_W;
    farmSprite.height = FIELD_H;
    container.addChild(farmSprite);
    this.farmSprite = farmSprite;

    const base = new Graphics();
    base.eventMode = "static";
    base.hitArea = new Rectangle(0, 0, FIELD_W, FIELD_H);
    container.addChild(base);

    const progress = new Graphics();
    const progressMask = new Graphics();
    progressMask.rect(0, 0, FIELD_W, FIELD_H).fill({ color: 0xffffff });
    container.addChild(progressMask);
    progress.mask = progressMask;
    container.addChild(progress);

    stage.addChild(container);

    this.base = base;
    this.progress = progress;
    this.draw();
  }

  update(): void {
    const clientNow = Date.now();
    const dt =
      this.lastParticleUpdate > 0 ? clientNow - this.lastParticleUpdate : 0;
    this.lastParticleUpdate = clientNow;
    if (this.craterAlpha > 0) {
      this.craterAlpha = Math.max(0, this.craterAlpha - dt / 3000);
    }
    if (this.particles.length > 0) {
      for (const p of this.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life = Math.max(0, p.life - dt / SWAP_PARTICLE_LIFETIME_MS);
        p.rotation += p.rotationSpeed * dt;
        const alpha = p.life > 0.8 ? (1 - p.life) / 0.2 : p.life / 0.8;
        const popScale = p.life > 0.8 ? (1 - p.life) / 0.2 : 1;
        p.gfx.x = p.x;
        p.gfx.y = p.y;
        p.gfx.alpha = alpha;
        p.gfx.rotation = p.rotation;
        p.gfx.scale.set(popScale);
      }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        if (this.particles[i].life <= 0) {
          this.particles[i].gfx.destroy();
          this.particles.splice(i, 1);
        }
      }
    }
    // Use server-adjusted time so progress bars stay correct across machines with
    // different clocks (LAN multiplayer). Particle/crater deltas stay on client time.
    if (this.base) this.draw(serverTime());
  }

  private draw(now = Date.now()): void {
    const base = this.base!;
    const progress = this.progress!;
    base.clear();
    progress.clear();

    const field = this.field;
    const stage = field?.stage ?? "empty";
    const isReady = stage === "ready";
    const isCasting = stage === "sowing" || stage === "harvesting";
    const showPlants =
      stage === "growing" || stage === "ready" || stage === "harvesting";
    const isOwn = this.owner === "player";
    const hasCrow = !!field?.crowAttack;
    const isScaring = !!field?.scaringAt;

    // Targeting state
    const targeting = useTargetingStore.getState();
    const isEligibleTarget =
      (targeting.active &&
        !targeting.ownFarm &&
        this.owner === "opponent" &&
        (stage === "growing" || stage === "ready") &&
        !field?.crowAttack &&
        !targeting.chosen.includes(this.id)) ||
      (targeting.active &&
        targeting.ownFarm &&
        this.owner === "player" &&
        stage !== "sowing" &&
        stage !== "harvesting" &&
        !targeting.chosen.includes(this.id));
    const isChosen =
      targeting.active &&
      targeting.chosen.includes(this.id) &&
      (targeting.ownFarm ? this.owner === "player" : this.owner === "opponent");

    // Normal grow progress (0→1) from sowedAt/readyAt timestamps
    let stageProgress =
      field?.sowedAt && field?.readyAt
        ? Math.min(1, (now - field.sowedAt) / (field.readyAt - field.sowedAt))
        : 0;

    // Freeze progress bar while growth is paused (villager forced inside).
    // readyAt was already extended by 20s when the pause was set, so use
    // the pre-extension value to avoid the bar jumping backward.
    if (field?.growthPausedUntil && field.growthPausedUntil > now) {
      const pausedAt = field.growthPausedUntil - ACCUSATION_PAUSE_MS;
      const originalReadyAt = field.readyAt
        ? field.readyAt - ACCUSATION_PAUSE_MS
        : null;
      stageProgress =
        field.sowedAt && originalReadyAt
          ? Math.min(
              1,
              Math.max(
                0,
                (pausedAt - field.sowedAt) / (originalReadyAt - field.sowedAt),
              ),
            )
          : stageProgress;
    }

    // Effective progress accounts for crows eating backwards in real-time
    let effectiveProgress: number;
    if (hasCrow && field?.crowAttack) {
      const { startedAt, eatRatePerMs, baseProgress } = field.crowAttack;
      const eaten = (now - startedAt) * eatRatePerMs;
      effectiveProgress = Math.max(0, baseProgress - eaten);
    } else {
      effectiveProgress = isReady ? 1 : stageProgress;
    }

    this.farmSprite!.tint = hasCrow && !this.blinded ? 0xaa7755 : 0xffffff;

    // Plants (soil rows are provided by the farm.png sprite)
    const isHarvesting = stage === "harvesting";
    const plantCount = 5;
    const plantW = 3;
    const plantSpacing = SOIL_W / (plantCount + 1);
    const plantColor =
      (isReady || isHarvesting) && isOwn && !hasCrow ? 0xf5d020 : 0x4caf50;
    // Deterministic per-plant vanish thresholds seeded by field id
    const vanishRng = isHarvesting ? new SeededRandom(this.id) : null;

    for (let row = 0; row < SOIL_ROWS; row++) {
      const rowY = SOIL_Y_START + row * SOIL_ROW_STRIDE;

      if (isHarvesting && showPlants) {
        // Crops stay at full height; each vanishes when stageProgress exceeds its threshold
        const plantH = MAX_PLANT_H;
        const py = rowY - plantH + 1;
        for (let p = 0; p < plantCount; p++) {
          const vanishAt = vanishRng!.next();
          if (stageProgress < vanishAt) {
            const px =
              SOIL_X +
              Math.round(plantSpacing * (p + 1)) -
              Math.floor(plantW / 2);
            base.rect(px, py, plantW, plantH).fill({ color: plantColor });
          }
        }
      } else {
        const plantFill = showPlants ? effectiveProgress : 0;
        const plantH = Math.round(plantFill * MAX_PLANT_H);
        if (plantH > 0) {
          for (let p = 0; p < plantCount; p++) {
            const px =
              SOIL_X +
              Math.round(plantSpacing * (p + 1)) -
              Math.floor(plantW / 2);
            const py = rowY - plantH + 1;
            base.rect(px, py, plantW, plantH).fill({ color: plantColor });
          }
        }
      }
    }

    // Empty-field "+" prompt (own fields only)
    if (stage === "empty" && isOwn) {
      this.drawPlusIcon(base);
    }

    // Radial progress overlay during sowing/harvesting (masked to the field rect)
    if (isCasting && stageProgress > 0) {
      this.drawRadialProgress(progress, stageProgress);
    }

    // Ready border (own fields only, only when no crow eating)
    if (isReady && isOwn && !hasCrow) {
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({ color: 0xffd700, width: 3 });
    }

    // Targeting overlay — eligible field pulsing border
    if (isEligibleTarget) {
      const pulse = 0.6 + 0.4 * Math.sin(now / 200);
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({
        color: 0xff6600,
        width: 3,
        alpha: pulse,
      });
    }

    // Targeting overlay — selected (already chosen) field
    if (isChosen) {
      base.rect(0, 0, FIELD_W, FIELD_H).fill({ color: 0xff6600, alpha: 0.25 });
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({ color: 0xff6600, width: 3 });
    }

    // Crow animator lifecycle
    if (hasCrow !== this.lastHadCrowAttack) {
      if (hasCrow && this.fieldContainer) {
        this.crowAnimator = new CrowAnimator(
          this.fieldContainer,
          this.owner,
          field?.crowAttack?.level ?? 1,
        );
        this.crowAnimator.setBlinded(this.blinded);
      } else {
        this.crowAnimator?.startFlyAway();
      }
    }
    this.crowAnimator?.setBlinded(this.blinded);
    // Clean up once all crows have flown off screen
    if (this.crowAnimator?.isDone) {
      this.crowAnimator.destroy();
      this.crowAnimator = null;
    }
    this.crowAnimator?.update();

    // Scaring border — orange flash while scare animation plays
    if (isScaring) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 120));
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({
        color: 0xffdd00,
        width: 3,
        alpha: pulse,
      });
    }

    // Lightning crater scorch mark — jagged, cracked, seeded per strike
    if (this.craterAlpha > 0 && this.craterRim.length > 0) {
      const a = this.craterAlpha;
      // Outer scorch (irregular blob)
      base.poly(this.craterRim).fill({ color: 0x1a0800, alpha: a * 0.78 });
      // Inner charred core
      base.poly(this.craterCore).fill({ color: 0x070200, alpha: a * 0.9 });
      // Ember rim
      base
        .poly(this.craterRim)
        .stroke({ color: 0xff4400, width: 1.5, alpha: a * 0.5 });
      // Radiating cracks
      for (const crack of this.craterCracks) {
        base.moveTo(crack[0], crack[1]);
        for (let i = 2; i < crack.length; i += 2) {
          base.lineTo(crack[i], crack[i + 1]);
        }
        base.stroke({ color: 0x050100, width: 1.5, alpha: a * 0.7 });
      }
    }

    // Tutorial highlight: gold pulsing ring when this field is the step focus
    const highlight = useTutorialStore.getState().highlightField;
    if (
      highlight &&
      highlight.owner === this.owner &&
      highlight.index === this.id
    ) {
      const pulse = 0.55 + 0.45 * Math.sin(now / 180);
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({
        color: 0xffd700,
        width: 4,
        alpha: pulse,
      });
    }

    // Interactivity — update listeners when relevant state changes
    if (
      stage !== this.lastInteractiveStage ||
      hasCrow !== this.lastHadCrowAttack ||
      isEligibleTarget !== this.lastWasTargetEligible ||
      isChosen !== this.lastWasChosen ||
      isScaring !== this.lastWasScaring
    ) {
      base.removeAllListeners();
      if (isEligibleTarget) {
        base.cursor = "crosshair";
        base.on("pointerdown", () =>
          useTargetingStore.getState().pick(this.id),
        );
      } else if (hasCrow && !isScaring && isOwn && this.onScareCrow) {
        base.cursor = "pointer";
        base.on("pointerdown", this.onScareCrow);
      } else if (stage === "empty" && isOwn && this.onSow) {
        base.cursor = "pointer";
        base.on("pointerdown", this.onSow);
      } else if (isReady && isOwn && this.onHarvest) {
        base.cursor = "pointer";
        base.on("pointerdown", this.onHarvest);
      } else {
        base.cursor = "default";
      }
      this.lastInteractiveStage = stage;
      this.lastHadCrowAttack = hasCrow;
      this.lastWasTargetEligible = isEligibleTarget;
      this.lastWasChosen = isChosen;
      this.lastWasScaring = isScaring;
    }
  }

  setBlinded(b: boolean): void {
    this.blinded = b;
    this.crowAnimator?.setBlinded(b);
  }

  private triggerCrater(): void {
    this.craterAlpha = 1;
    this.generateCrater();
  }

  // Build an irregular, cracked scorch shape. Seeded so it's stable across
  // frames but varies per strike.
  private generateCrater(): void {
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    const rx = FIELD_W * 0.15;
    const ry = FIELD_H * 0.14;
    const rng = new SeededRandom((this.id + 1) * 7919 + (Date.now() & 0xffff));

    const segs = 14;
    const rim: number[] = [];
    const core: number[] = [];
    for (let i = 0; i < segs; i++) {
      const ang = (i / segs) * Math.PI * 2;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const rimJitter = 0.72 + rng.next() * 0.45;
      rim.push(cx + cos * rx * rimJitter, cy + sin * ry * rimJitter);
      const coreJitter = 0.38 + rng.next() * 0.3;
      core.push(cx + cos * rx * coreJitter, cy + sin * ry * coreJitter);
    }

    const cracks: number[][] = [];
    const crackCount = 4 + Math.floor(rng.next() * 3);
    for (let c = 0; c < crackCount; c++) {
      const steps = 3 + Math.floor(rng.next() * 2);
      const maxR = 0.85 + rng.next() * 0.55;
      let ang = rng.next() * Math.PI * 2;
      const pts: number[] = [cx, cy];
      for (let s = 1; s <= steps; s++) {
        const r = (s / steps) * maxR;
        ang += (rng.next() - 0.5) * 0.9;
        pts.push(cx + Math.cos(ang) * rx * r, cy + Math.sin(ang) * ry * r);
      }
      cracks.push(pts);
    }

    this.craterRim = rim;
    this.craterCore = core;
    this.craterCracks = cracks;
  }

  private spawnSwapParticles(): void {
    if (!this.fieldContainer) return;
    const COUNT = 110;
    for (let i = 0; i < COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.01 + Math.random() * 0.015) * 0.85;
      const x = Math.random() * FIELD_W;
      const y = Math.random() * FIELD_H;
      const color =
        SWAP_PARTICLE_COLORS[
          Math.floor(Math.random() * SWAP_PARTICLE_COLORS.length)
        ];
      const gfx = new Sprite(Assets.get("/assets/particle.png"));
      gfx.anchor.set(0.5);
      gfx.width = SWAP_PARTICLE_SIZE;
      gfx.height = SWAP_PARTICLE_SIZE;
      gfx.tint = color;
      gfx.x = x;
      gfx.y = y;
      gfx.alpha = 0;
      gfx.scale.set(0);
      this.fieldContainer.addChild(gfx);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        gfx,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.014,
      });
    }
  }

  private drawPlusIcon(g: Graphics): void {
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    const half = PLUS_SIZE / 2;
    const halfT = PLUS_THICKNESS / 2;
    g.rect(cx - half, cy - halfT, PLUS_SIZE, PLUS_THICKNESS).fill({
      color: PLUS_COLOR,
      alpha: PLUS_ALPHA,
    });
    g.rect(cx - halfT, cy - half, PLUS_THICKNESS, PLUS_SIZE).fill({
      color: PLUS_COLOR,
      alpha: PLUS_ALPHA,
    });
  }

  private drawRadialProgress(g: Graphics, p: number): void {
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2;
    const start = -Math.PI / 2;
    const end = start + p * Math.PI * 2;
    g.moveTo(cx, cy);
    g.arc(cx, cy, PROGRESS_RADIUS, start, end);
    g.lineTo(cx, cy);
    g.fill({ color: PROGRESS_COLOR, alpha: PROGRESS_ALPHA });
  }
}
