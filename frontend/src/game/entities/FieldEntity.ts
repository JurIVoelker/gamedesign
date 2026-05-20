import { Container, Graphics } from "pixi.js";
import type { CropStage, Field } from "@gamedesign/shared";
import { Entity } from "./Entity";
import { useTargetingStore } from "../../state/targetingStore";

export const FIELD_W = 120;
export const FIELD_H = 64;

const MAX_PLANT_H = 9;
const SOIL_ROWS = 4;
const SOIL_Y_START = 4;
const SOIL_ROW_H = 10;
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
  private base: Graphics | null = null;
  private progress: Graphics | null = null;
  private crow: Graphics | null = null;
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

    const base = new Graphics();
    base.eventMode = "static";
    container.addChild(base);

    const progress = new Graphics();
    const progressMask = new Graphics();
    progressMask.rect(0, 0, FIELD_W, FIELD_H).fill({ color: 0xffffff });
    container.addChild(progressMask);
    progress.mask = progressMask;
    container.addChild(progress);

    const crow = new Graphics();
    container.addChild(crow);

    stage.addChild(container);

    this.base = base;
    this.progress = progress;
    this.crow = crow;
    this.draw();
  }

  update(): void {
    if (this.base) this.draw();
  }

  private draw(): void {
    const base = this.base!;
    const progress = this.progress!;
    const crow = this.crow!;
    base.clear();
    progress.clear();
    crow.clear();

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
    const isChosen =
      targeting.active && targeting.chosen.includes(this.id);

    // Normal grow progress (0→1) from sowedAt/readyAt timestamps
    const stageProgress =
      field?.sowedAt && field?.readyAt
        ? Math.min(
            1,
            (Date.now() - field.sowedAt) / (field.readyAt - field.sowedAt),
          )
        : 0;

    // Effective progress accounts for crows eating backwards in real-time
    let effectiveProgress: number;
    if (hasCrow && field?.crowAttack) {
      const { startedAt, eatRatePerMs, baseProgress } = field.crowAttack;
      const eaten = (Date.now() - startedAt) * eatRatePerMs;
      effectiveProgress = Math.max(0, baseProgress - eaten);
    } else {
      effectiveProgress = isReady ? 1 : stageProgress;
    }

    // Soil background — tint darker when under crow attack
    const soilColor = hasCrow ? 0x6b3a20 : 0x7a5230;
    base.rect(0, 0, FIELD_W, FIELD_H).fill({ color: soilColor });

    // Soil rows + plants
    for (let row = 0; row < SOIL_ROWS; row++) {
      const rowY = SOIL_Y_START + row * SOIL_ROW_STRIDE;
      base.rect(SOIL_X, rowY, SOIL_W, SOIL_ROW_H).fill({ color: 0x8b6338 });

      const plantFill = showPlants ? effectiveProgress : 0;
      const plantH = Math.round(plantFill * MAX_PLANT_H);
      if (plantH > 0) {
        const plantCount = 5;
        const spacing = SOIL_W / (plantCount + 1);
        const plantW = 3;
        const color = isReady && isOwn && !hasCrow ? 0xf5d020 : 0x4caf50;
        for (let p = 0; p < plantCount; p++) {
          const px =
            SOIL_X + Math.round(spacing * (p + 1)) - Math.floor(plantW / 2);
          const py = rowY - plantH + 1;
          base.rect(px, py, plantW, plantH).fill({ color });
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

    // Crow overlay
    if (hasCrow) {
      this.drawCrow(crow, isScaring);
    }

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
        base.on("pointerdown", () => useTargetingStore.getState().pick(this.id));
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

  private drawCrow(g: Graphics, scared: boolean): void {
    const cx = FIELD_W / 2;
    const cy = FIELD_H / 2 - 2;
    const bodyColor = scared ? 0x665544 : 0x111111;
    const wingColor = scared ? 0x554433 : 0x222222;

    g.ellipse(cx, cy, 10, 6).fill({ color: bodyColor });
    g.circle(cx + 8, cy - 4, 4).fill({ color: bodyColor });
    g.poly([cx + 11, cy - 4, cx + 16, cy - 3, cx + 11, cy - 2]).fill({ color: 0xf0c040 });
    g.poly([cx - 12, cy, cx - 2, cy - 7, cx + 2, cy + 3]).fill({ color: wingColor });
    g.poly([cx + 4, cy - 1, cx + 14, cy - 7, cx + 12, cy + 3]).fill({ color: wingColor });
    g.circle(cx + 9, cy - 5, 1).fill({ color: scared ? 0xffffff : 0xff4040 });
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
