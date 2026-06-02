import { Container } from "pixi.js";

export type Owner = "player" | "opponent";
export type Direction = "up" | "down" | "left" | "right";

export abstract class Entity {
  readonly id: number;
  readonly owner: Owner;
  readonly x: number;
  readonly y: number;

  constructor(id: number, owner: Owner, x: number, y: number) {
    this.id = id;
    this.owner = owner;
    this.x = x;
    this.y = y;
  }

  abstract render(stage: Container): void;
}
