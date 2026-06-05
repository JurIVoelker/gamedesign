import { Assets, Container, Graphics, Rectangle, Sprite } from "pixi.js";
import type { CropStage, Field } from "@gamedesign/shared";
import { ACCUSATION_PAUSE_MS } from "@gamedesign/shared";
import { Entity } from "./Entity";
import { useTargetingStore } from "../../state/targetingStore";
import { CrowAnimator } from "./CrowAnimator";
import { SeededRandom } from "../SeededRandom";

export const FIELD_W = 120;
export const FIELD_H = 64;

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

export class FieldEntity extends Entity {
  private farmSprite: Sprite | null = null;
  private base: Graphics | null = null;
  private progress: Graphics | null = null;
  private fieldContainer: Container | null = null;
  private crowAnimator: CrowAnimator | null = null;
  private field: Field | null = null;
  private lastInteractiveStage: CropStage | null = null;
  private lastHadCrowAttack = false;
  private lastWasTargetEligible = false;
  private lastWasChosen = false;
  private lastWasScaring = false;
  private readonly onSow: (() => void) | null;
  private readonly onHarvest: (() => void) | null;
  private readonly onScareCrow: (() => void) | null;

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

  setField(field: Field | null): void {
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
    if (this.base) this.draw();
  }

  private draw(): void {
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
      targeting.active &&
      this.owner === "opponent" &&
      (stage === "growing" || stage === "ready") &&
      !field?.crowAttack &&
      !targeting.chosen.includes(this.id);
    const isChosen = targeting.active && targeting.chosen.includes(this.id);

    const now = Date.now();
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
      const originalReadyAt = field.readyAt ? field.readyAt - ACCUSATION_PAUSE_MS : null;
      stageProgress = field.sowedAt && originalReadyAt
        ? Math.min(1, Math.max(0, (pausedAt - field.sowedAt) / (originalReadyAt - field.sowedAt)))
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

    this.farmSprite!.tint = hasCrow ? 0xaa7755 : 0xffffff;

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
      const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
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
      } else {
        this.crowAnimator?.startFlyAway();
      }
    }
    // Clean up once all crows have flown off screen
    if (this.crowAnimator?.isDone) {
      this.crowAnimator.destroy();
      this.crowAnimator = null;
    }
    this.crowAnimator?.update();

    // Scaring border — orange flash while scare animation plays
    if (isScaring) {
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 120));
      base.rect(0, 0, FIELD_W, FIELD_H).stroke({
        color: 0xffdd00,
        width: 3,
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
