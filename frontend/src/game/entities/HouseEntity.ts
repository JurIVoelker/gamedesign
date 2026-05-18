import { Container, Graphics } from "pixi.js";
import { Entity } from "./Entity";
import { FIELD_H } from "./FieldEntity";

export const HOUSE_W = 40;
export const HOUSE_H = 48;
const ROOF_H = 14;

export class HouseEntity extends Entity {
  render(stage: Container): void {
    const g = new Graphics();
    g.rect(0, ROOF_H, HOUSE_W, HOUSE_H - ROOF_H).fill({ color: 0x7a5230 });
    g.moveTo(0, ROOF_H)
      .lineTo(HOUSE_W / 2, 0)
      .lineTo(HOUSE_W, ROOF_H)
      .fill({ color: 0x5a3a1a });
    g.x = this.x;
    g.y = this.y + (FIELD_H - HOUSE_H) / 2;
    stage.addChild(g);
  }
}
