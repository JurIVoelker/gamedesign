import { Container } from "pixi.js";
import type { ThiefAttack } from "@gamedesign/shared";
import { ThiefEntity } from "./entities/ThiefEntity";
import {
  H_GAP,
  MARGIN,
  FARM_W,
  SCENE_H_INNER,
  SPEED,
  ARRIVE_DIST,
  rowY,
} from "./layout";
import { FIELD_W } from "./entities/FieldEntity";
import { HOUSE_W, HOUSE_H } from "./entities/HouseEntity";

type MoveState =
  | { kind: "idle"; nextAt: number }
  | { kind: "moving"; tx: number; ty: number }
  | { kind: "working"; doneAt: number };

export class ThiefController {
  private entity: ThiefEntity | null = null;
  private attack: ThiefAttack | null = null;
  private role: "victim" | "attacker" | null = null;
  private moveState: MoveState = { kind: "idle", nextAt: 0 };
  private rand: () => number;
  private frozen: boolean = false;

  private readonly fieldCenters: { x: number; y: number }[];
  private readonly houseEntrances: { x: number; y: number }[];
  private readonly lurkerX: number;

  constructor(
    private readonly owner: "player" | "opponent",
    private readonly farmStage: Container,
    private readonly onThiefClicked?: () => void,
    rand: () => number = Math.random,
  ) {
    this.rand = rand;
    const isPlayer = owner === "player";

    this.fieldCenters = Array.from({ length: 4 }, (_, i) => ({
      x: isPlayer ? HOUSE_W + H_GAP + FIELD_W / 2 : FIELD_W / 2,
      y: rowY(i),
    }));

    this.houseEntrances = Array.from({ length: 4 }, (_, i) => ({
      x: isPlayer ? HOUSE_W / 2 : FIELD_W + H_GAP + HOUSE_W / 2,
      y: rowY(i) + HOUSE_H / 2,
    }));

    this.lurkerX = isPlayer ? -10 : FARM_W + 10;
  }

  setAttack(attack: ThiefAttack | null, role: "victim" | "attacker"): void {
    const prevPhase = this.attack?.phase;
    this.attack = attack;
    this.role = attack ? role : null;

    if (!attack) {
      this.destroyEntity();
      return;
    }

    if (!this.entity) {
      this.spawnEntity(attack, role);
      return;
    }

    if (prevPhase === "waiting" && attack.phase === "stealing") {
      this.emergeFromHouse();
      this.entity.showAttackerGlow(role === "attacker");
    }
  }

  update(deltaMs: number): void {
    if (!this.entity || !this.attack) return;
    const now = Date.now();
    const dt = deltaMs / 1000;

    if (this.attack.phase === "waiting") {
      this.entity.isVisible = this.role === "attacker";
      this.entity.showAttackerGlow(false);
      this.entity.update();
      return;
    }

    this.entity.isVisible = true;
    if (!this.frozen) {
      this.tickMovement(now, dt);
      if (this.moveState.kind === "moving") this.entity.walkFrame++;
    }
    this.entity.showAttackerGlow(this.role === "attacker");
    this.entity.update();
  }

  private spawnEntity(attack: ThiefAttack, role: "victim" | "attacker"): void {
    const now = Date.now();
    const isClickable = role === "victim";

    let startX: number;
    let startY: number;

    if (attack.phase === "stealing") {
      const idx = Math.floor(this.rand() * this.houseEntrances.length);
      startX = this.houseEntrances[idx].x;
      startY = this.houseEntrances[idx].y;
    } else {
      startX = this.lurkerX;
      startY = rowY(2);
    }

    this.entity = new ThiefEntity(
      startX,
      startY,
      attack.disguise,
      this.owner,
      isClickable,
      isClickable ? () => this.onThiefClicked?.() : null,
    );
    this.entity.render(this.farmStage);

    this.moveState = {
      kind: "idle",
      nextAt: attack.phase === "stealing" ? now : now + this.randBetween(500, 2000),
    };
  }

  private emergeFromHouse(): void {
    if (!this.entity) return;
    const now = Date.now();
    const idx = Math.floor(this.rand() * this.houseEntrances.length);
    this.entity.x = this.houseEntrances[idx].x;
    this.entity.y = this.houseEntrances[idx].y;
    this.entity.isVisible = true;
    this.moveState = { kind: "idle", nextAt: now };
  }

  private tickMovement(now: number, dt: number): void {
    if (!this.entity) return;

    switch (this.moveState.kind) {
      case "idle": {
        if (now >= this.moveState.nextAt) {
          if (this.rand() < 0.6) {
            const idx = Math.floor(this.rand() * this.fieldCenters.length);
            this.moveState = {
              kind: "moving",
              tx: this.fieldCenters[idx].x,
              ty: this.fieldCenters[idx].y,
            };
          } else {
            this.moveState = {
              kind: "moving",
              tx: this.randBetween(8, FARM_W - 8),
              ty: this.randBetween(MARGIN + 8, SCENE_H_INNER - MARGIN - 8),
            };
          }
        }
        break;
      }

      case "moving": {
        const dx = this.moveState.tx - this.entity.x;
        const dy = this.moveState.ty - this.entity.y;

        if (Math.abs(dx) <= ARRIVE_DIST && Math.abs(dy) <= ARRIVE_DIST) {
          this.moveState = {
            kind: "working",
            doneAt: now + this.randBetween(2000, 5000),
          };
        } else {
          const step = SPEED * dt;
          if (Math.abs(dx) > ARRIVE_DIST) {
            this.entity.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
            this.entity.direction = dx >= 0 ? "right" : "left";
          } else {
            this.entity.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
            this.entity.direction = dy >= 0 ? "down" : "up";
          }
        }
        break;
      }

      case "working": {
        if (now >= this.moveState.doneAt) {
          this.moveState = {
            kind: "idle",
            nextAt: now + this.randBetween(300, 1200),
          };
        }
        break;
      }
    }
  }

  private randBetween(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  setModalOpen(v: boolean): void {
    this.frozen = v;
    this.entity?.setFrozen(v);
  }

  private destroyEntity(): void {
    if (this.entity) {
      this.entity.destroy(this.farmStage);
      this.entity = null;
    }
    this.moveState = { kind: "idle", nextAt: 0 };
  }
}
