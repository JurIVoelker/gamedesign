import { Container, Graphics } from "pixi.js";
import { Entity } from "./Entity";

export const FIELD_W = 120;
export const FIELD_H = 64;

export class FieldEntity extends Entity {
  render(stage: Container): void {
    const g = new Graphics();
    g.rect(0, 0, FIELD_W, FIELD_H).fill({ color: 0x7a5230 });
    for (let row = 0; row < 4; row++) {
      g.rect(4, 4 + row * 14, FIELD_W - 8, 10).fill({ color: 0x8b6338 });
    }
    g.x = this.x;
    g.y = this.y;
    stage.addChild(g);
  }
}
