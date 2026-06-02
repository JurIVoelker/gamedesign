import { Assets, Container, Sprite } from "pixi.js";
import { Entity } from "./Entity";
import { FIELD_H } from "./FieldEntity";

export const HOUSE_W = 40;
export const HOUSE_H = 48;

export class HouseEntity extends Entity {
  render(stage: Container): void {
    const sprite = new Sprite(Assets.get("/assets/house.png"));
    sprite.width = HOUSE_W;
    sprite.height = HOUSE_H;
    sprite.x = this.x;
    sprite.y = this.y + (FIELD_H - HOUSE_H) / 2;
    stage.addChild(sprite);
  }
}
