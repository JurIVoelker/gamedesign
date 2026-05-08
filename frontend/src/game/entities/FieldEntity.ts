import { Container, Graphics } from "pixi.js";
import type { Field } from "@gamedesign/shared";
import { Entity } from "./Entity";

export const FIELD_W = 120;
export const FIELD_H = 64;

const MAX_PLANT_H = 9;
const SOIL_ROWS = 4;
const SOIL_Y_START = 4;
const SOIL_ROW_H = 10;
const SOIL_ROW_STRIDE = 14;
const SOIL_X = 4;
const SOIL_W = FIELD_W - 8;

export class FieldEntity extends Entity {
  private g: Graphics | null = null;
  private field: Field | null = null;
  private readonly onHarvest: (() => void) | null;

  constructor(
    id: number,
    owner: "player" | "opponent",
    x: number,
    y: number,
    onHarvest: (() => void) | null = null,
  ) {
    super(id, owner, x, y);
    this.onHarvest = onHarvest;
  }

  setField(field: Field | null): void {
    this.field = field;
  }

  render(stage: Container): void {
    this.g = new Graphics();
    this.g.x = this.x;
    this.g.y = this.y;
    this.g.eventMode = "static";
    stage.addChild(this.g);
    this.draw();
  }

  update(): void {
    if (this.g) this.draw();
  }

  private draw(): void {
    const g = this.g!;
    g.clear();

    const field = this.field;
    const isReady = field?.stage === "ready";

    const progress =
      field?.sowedAt && field?.readyAt
        ? Math.min(
          1,
          (Date.now() - field.sowedAt) / (field.readyAt - field.sowedAt),
        )
        : 0;

    // Soil background
    g.rect(0, 0, FIELD_W, FIELD_H).fill({ color: 0x7a5230 });

    // Soil rows + plants
    for (let row = 0; row < SOIL_ROWS; row++) {
      const rowY = SOIL_Y_START + row * SOIL_ROW_STRIDE;
      g.rect(SOIL_X, rowY, SOIL_W, SOIL_ROW_H).fill({ color: 0x8b6338 });

      const plantH = Math.round(progress * MAX_PLANT_H);
      if (plantH > 0) {
        const plantCount = 5;
        const spacing = SOIL_W / (plantCount + 1);
        const plantW = 3;
        const color = isReady && this.owner === "player" ? 0xf5d020 : 0x4caf50;
        for (let p = 0; p < plantCount; p++) {
          const px =
            SOIL_X + Math.round(spacing * (p + 1)) - Math.floor(plantW / 2);
          const py = rowY - plantH + 1;
          g.rect(px, py, plantW, plantH).fill({ color });
        }
      }
    }

    // Ready border + pointer cursor (own fields only)
    if (isReady && this.owner === "player") {
      g.rect(0, 0, FIELD_W, FIELD_H).stroke({ color: 0xffd700, width: 3 });
      g.cursor = "pointer";

      if (this.onHarvest) {
        g.removeAllListeners();
        g.on("pointerdown", this.onHarvest);
      }
    } else {
      g.cursor = "default";
      g.removeAllListeners();
    }
  }
}
