import { Container } from "pixi.js";
import type { Field } from "@gamedesign/shared";
import { VillagerEntity } from "./entities/VillagerEntity";
import { FIELD_W } from "./entities/FieldEntity";
import { HOUSE_W } from "./entities/HouseEntity";
import { H_GAP, MARGIN, FARM_W, SCENE_H_INNER, SPEED, ARRIVE_DIST, rowY } from "./layout";

type VState =
  | { kind: "wandering"; targetX: number; targetY: number; nextDecisionAt: number }
  | { kind: "walking_to_field"; fieldIndex: number; targetX: number; targetY: number }
  | { kind: "working_field"; fieldIndex: number; doneAt: number }
  | { kind: "walking_to_house"; houseIndex: number; targetX: number; targetY: number }
  | { kind: "inside_house"; houseIndex: number; emergesAt: number };

interface VillagerData {
  entity: VillagerEntity;
  state: VState;
  nextHouseVisitAt: number;
}

export class VillagerController {
  private villagers: VillagerData[] = [];
  private fieldCenters: { x: number; y: number }[];
  private houseEntrances: { x: number; y: number }[];
  private prevFields: Field[] = [];
  private rand: () => number;
  private weatherActive: boolean = false;

  constructor(
    owner: "player" | "opponent",
    farmStage: Container,
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
      y: rowY(i),
    }));

    const now = Date.now();

    for (let i = 0; i < 4; i++) {
      const startX = this.houseEntrances[i].x;
      const startY = this.houseEntrances[i].y;
      const entity = new VillagerEntity(i, startX, startY);
      entity.render(farmStage);

      const initialDelay = i * 1500;
      const data: VillagerData = {
        entity,
        state: {
          kind: "wandering",
          targetX: this.randomWanderX(),
          targetY: this.randomWanderY(),
          nextDecisionAt: now + initialDelay + this.randBetween(1000, 3000),
        },
        nextHouseVisitAt: now + initialDelay + this.jitter(40000, 0.3),
      };
      this.villagers.push(data);
    }
  }

  update(deltaMs: number): void {
    const now = Date.now();
    const dt = deltaMs / 1000;

    for (const v of this.villagers) {
      this.tickVillager(v, now, dt);
      v.entity.update();
    }
  }

  setFields(fields: Field[]): void {
    const now = Date.now();

    for (let i = 0; i < fields.length; i++) {
      const prev = this.prevFields[i];
      const curr = fields[i];
      if (!curr || !prev) continue;

      const stageChanged = prev.stage !== curr.stage;
      if (!stageChanged) continue;

      const pullsOut = curr.stage === "sowing" || curr.stage === "harvesting";
      const interesting =
        pullsOut ||
        curr.stage === "ready" ||
        (curr.stage === "empty" && prev.stage !== "empty");

      if (!interesting) continue;

      const v = this.villagers[i];
      const s = v.state;

      if (s.kind === "walking_to_house") continue;

      // For sowing/harvesting: pull the villager out of the house if they're inside
      if (s.kind === "inside_house" && pullsOut) {
        const entrance = this.houseEntrances[s.houseIndex];
        v.entity.x = entrance.x;
        v.entity.y = entrance.y;
        v.entity.isVisible = true;
        v.nextHouseVisitAt = now + this.jitter(30_000, 0.3);
      } else if (s.kind === "inside_house") {
        continue;
      }

      v.state = {
        kind: "walking_to_field",
        fieldIndex: i,
        targetX: this.fieldCenters[i].x,
        targetY: this.fieldCenters[i].y,
      };
    }

    this.prevFields = fields.map((f) => ({ ...f }));
  }

  setWeather(active: boolean): void {
    if (active === this.weatherActive) return;
    this.weatherActive = active;

    if (!active) return;

    // Weather just turned on: stagger each outdoor villager's home trip over 0–12s
    // so they trickle inside rather than all leaving at once
    const now = Date.now();
    for (const v of this.villagers) {
      const s = v.state;
      if (s.kind === "walking_to_house" || s.kind === "inside_house") continue;
      v.nextHouseVisitAt = now + this.rand() * 12_000;
    }
  }

  getOutsideCount(): number {
    return this.villagers.filter((v) => v.state.kind !== "inside_house").length;
  }

  getInsideHouseVillagers(): Array<{
    villagerId: number;
    houseIndex: number;
    emergesAt: number;
  }> {
    return this.villagers
      .filter((v) => v.state.kind === "inside_house")
      .map((v) => {
        const s = v.state as Extract<VState, { kind: "inside_house" }>;
        return { villagerId: v.entity.id, houseIndex: s.houseIndex, emergesAt: s.emergesAt };
      });
  }

  private tickVillager(v: VillagerData, now: number, dt: number): void {
    const s = v.state;

    switch (s.kind) {
      case "wandering": {
        if (now >= v.nextHouseVisitAt) {
          const row = v.entity.id;
          v.state = {
            kind: "walking_to_house",
            houseIndex: row,
            targetX: this.houseEntrances[row].x,
            targetY: this.houseEntrances[row].y,
          };
          break;
        }

        const arrived = this.moveToward(v.entity, s.targetX, s.targetY, dt);
        if (arrived || now >= s.nextDecisionAt) {
          v.state = {
            kind: "wandering",
            targetX: this.randomWanderX(),
            targetY: this.randomWanderY(),
            nextDecisionAt: now + this.jitter(3000, 0.4),
          };
        }
        break;
      }

      case "walking_to_field": {
        const arrived = this.moveToward(v.entity, s.targetX, s.targetY, dt);
        if (arrived) {
          v.state = {
            kind: "working_field",
            fieldIndex: s.fieldIndex,
            doneAt: now + this.jitter(4000, 0.3),
          };
        }
        break;
      }

      case "working_field": {
        if (now >= s.doneAt) {
          v.state = {
            kind: "wandering",
            targetX: this.randomWanderX(),
            targetY: this.randomWanderY(),
            nextDecisionAt: now + this.jitter(2500, 0.3),
          };
        }
        break;
      }

      case "walking_to_house": {
        const arrived = this.moveToward(v.entity, s.targetX, s.targetY, dt);
        if (arrived) {
          v.entity.isVisible = false;
          const indoorMs = this.weatherActive ? this.jitter(30_000, 0.2) : this.jitter(15_000, 0.3);
          v.state = {
            kind: "inside_house",
            houseIndex: s.houseIndex,
            emergesAt: now + indoorMs,
          };
        }
        break;
      }

      case "inside_house": {
        if (now >= s.emergesAt) {
          const entrance = this.houseEntrances[s.houseIndex];
          v.entity.x = entrance.x;
          v.entity.y = entrance.y;
          v.entity.isVisible = true;
          v.nextHouseVisitAt = now + (this.weatherActive ? this.jitter(6_000, 0.3) : this.jitter(45_000, 0.3));
          v.state = {
            kind: "wandering",
            targetX: this.randomWanderX(),
            targetY: this.randomWanderY(),
            nextDecisionAt: now + this.jitter(2000, 0.3),
          };
        }
        break;
      }
    }
  }

  private moveToward(entity: VillagerEntity, tx: number, ty: number, dt: number): boolean {
    const dx = tx - entity.x;
    const dy = ty - entity.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= ARRIVE_DIST) return true;

    const step = SPEED * dt;
    const ratio = Math.min(step, dist) / dist;
    entity.x += dx * ratio;
    entity.y += dy * ratio;
    entity.facingRight = dx >= 0;
    entity.walkFrame++;
    return false;
  }

  private jitter(base: number, fraction: number): number {
    return base + (this.rand() * 2 - 1) * base * fraction;
  }

  private randBetween(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  private randomWanderX(): number {
    return this.randBetween(8, FARM_W - 8);
  }

  private randomWanderY(): number {
    return this.randBetween(MARGIN + 8, SCENE_H_INNER - MARGIN - 8);
  }
}
