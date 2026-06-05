import { Container } from "pixi.js";
import type { Field } from "@gamedesign/shared";
import { VillagerEntity } from "./entities/VillagerEntity";
import { FIELD_W } from "./entities/FieldEntity";
import { HOUSE_W, HOUSE_H } from "./entities/HouseEntity";
import {
  H_GAP,
  MARGIN,
  FARM_W,
  SCENE_H_INNER,
  SPEED,
  ARRIVE_DIST,
  rowY,
} from "./layout";

type VState =
  | {
      kind: "wandering";
      targetX: number;
      targetY: number;
      nextDecisionAt: number;
    }
  | {
      kind: "walking_to_field";
      fieldIndex: number;
      targetX: number;
      targetY: number;
    }
  | { kind: "working_field"; fieldIndex: number; doneAt: number }
  | {
      kind: "walking_to_house";
      houseIndex: number;
      targetX: number;
      targetY: number;
    }
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
  private isPlayer: boolean;
  private outsideCount: number;
  private onOutsideCountChange: ((count: number) => void) | undefined;
  private onVillagerClicked: ((id: number) => void) | undefined;
  private forcedInsideUntil: number[] = [0, 0, 0, 0];
  private frozenVillagerId: number | null = null;

  constructor(
    owner: "player" | "opponent",
    farmStage: Container,
    rand: () => number = Math.random,
    initialOutsideCount: number = 4,
    onOutsideCountChange?: (count: number) => void,
    onVillagerClicked?: (id: number) => void,
  ) {
    this.rand = rand;
    this.isPlayer = owner === "player";
    this.outsideCount = Math.max(0, Math.min(4, initialOutsideCount));
    this.onOutsideCountChange = onOutsideCountChange;
    this.onVillagerClicked = onVillagerClicked;

    this.fieldCenters = Array.from({ length: 4 }, (_, i) => ({
      x: this.isPlayer ? HOUSE_W + H_GAP + FIELD_W / 2 : FIELD_W / 2,
      y: rowY(i),
    }));

    // Entrance is at the center of the house, vertically at the door (bottom of house)
    this.houseEntrances = Array.from({ length: 4 }, (_, i) => ({
      x: this.isPlayer ? HOUSE_W / 2 : FIELD_W + H_GAP + HOUSE_W / 2,
      y: rowY(i) + HOUSE_H / 2,
    }));

    const now = Date.now();
    // How many villagers start inside: the ones past index (initialOutsideCount - 1)
    const insideCount = 4 - this.outsideCount;

    for (let i = 0; i < 4; i++) {
      const startX = this.houseEntrances[i].x;
      const startY = this.houseEntrances[i].y;
      const clickable = this.isPlayer && !!this.onVillagerClicked;
      const villagerId = i;
      const entity = new VillagerEntity(
        i,
        owner,
        startX,
        startY,
        clickable,
        clickable
          ? () => {
              // Ignore clicks when this villager is forced inside (angry)
              const isAngry = this.forcedInsideUntil[villagerId] > Date.now();
              if (isAngry) return;
              // Freeze and turn immediately — don't wait for the React effect
              this.frozenVillagerId = villagerId;
              entity.direction = "right";
              entity.walkFrame = 0;
              this.onVillagerClicked?.(villagerId);
            }
          : null,
      );
      entity.render(farmStage);

      const initialDelay = i * 1500;
      let state: VState;
      let nextHouseVisitAt: number;

      if (i < insideCount) {
        // This villager starts inside — stagger their emergence so they trickle out
        entity.isVisible = false;
        state = {
          kind: "inside_house",
          houseIndex: i,
          emergesAt: now + this.jitter(10_000, 0.5),
        };
        nextHouseVisitAt = now + this.jitter(45_000, 0.3);
      } else {
        state = {
          kind: "wandering",
          targetX: this.randomWanderX(),
          targetY: this.randomWanderY(),
          nextDecisionAt: now + initialDelay + this.randBetween(1000, 3000),
        };
        nextHouseVisitAt = now + initialDelay + this.jitter(40_000, 0.3);
      }

      this.villagers.push({ entity, state, nextHouseVisitAt });
    }
  }

  setFrozenVillager(id: number | null): void {
    this.frozenVillagerId = id;
    if (id !== null) {
      const v = this.villagers.find((v) => v.entity.id === id);
      if (v) {
        v.entity.direction = "right";
        v.entity.walkFrame = 0;
      }
    }
  }

  update(deltaMs: number): void {
    const now = Date.now();
    const dt = deltaMs / 1000;

    for (const v of this.villagers) {
      if (v.entity.id !== this.frozenVillagerId) {
        this.tickVillager(v, now, dt);
      }
      v.entity.selected = v.entity.id === this.frozenVillagerId;
      v.entity.update();
    }
  }

  setFields(fields: Field[]): void {
    const now = Date.now();

    for (let i = 0; i < fields.length; i++) {
      const prev = this.prevFields[i];
      const curr = fields[i];

      // Update forced-inside deadline regardless of stage change
      if (curr) {
        const until = Math.max(curr.growthPausedUntil ?? 0, curr.fieldBlockedUntil ?? 0);
        if (until > this.forcedInsideUntil[i]) {
          this.forcedInsideUntil[i] = until;
        }
      }

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
        this.outsideCount++;
        this.onOutsideCountChange?.(this.outsideCount);
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
        return {
          villagerId: v.entity.id,
          houseIndex: s.houseIndex,
          emergesAt: s.emergesAt,
        };
      });
  }

  private tickVillager(v: VillagerData, now: number, dt: number): void {
    const id = v.entity.id;
    if (
      now < this.forcedInsideUntil[id] &&
      v.state.kind !== "inside_house" &&
      v.state.kind !== "walking_to_house"
    ) {
      v.state = {
        kind: "walking_to_house",
        houseIndex: id,
        targetX: this.houseEntrances[id].x,
        targetY: this.houseEntrances[id].y,
      };
    }

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
        const arrived = this.moveTowardVFirst(
          v.entity,
          s.targetX,
          s.targetY,
          dt,
        );
        if (arrived) {
          v.entity.isVisible = false;
          const indoorMs = this.weatherActive
            ? this.jitter(30_000, 0.2)
            : this.jitter(15_000, 0.3);
          const id = v.entity.id;
          const emergesAt = Math.max(
            now + indoorMs,
            this.forcedInsideUntil[id] ?? 0,
          );
          v.state = {
            kind: "inside_house",
            houseIndex: s.houseIndex,
            emergesAt,
          };
          this.outsideCount--;
          this.onOutsideCountChange?.(this.outsideCount);
        }
        break;
      }

      case "inside_house": {
        if (now >= s.emergesAt) {
          const entrance = this.houseEntrances[s.houseIndex];
          v.entity.x = entrance.x;
          v.entity.y = entrance.y;
          v.entity.isVisible = true;
          v.nextHouseVisitAt =
            now +
            (this.weatherActive
              ? this.jitter(6_000, 0.3)
              : this.jitter(45_000, 0.3));
          v.state = {
            kind: "wandering",
            targetX: this.randomWanderX(),
            targetY: this.randomWanderY(),
            nextDecisionAt: now + this.jitter(2000, 0.3),
          };
          this.outsideCount++;
          this.onOutsideCountChange?.(this.outsideCount);
        }
        break;
      }
    }
  }

  private moveToward(
    entity: VillagerEntity,
    tx: number,
    ty: number,
    dt: number,
  ): boolean {
    const dx = tx - entity.x;
    const dy = ty - entity.y;

    if (Math.abs(dx) <= ARRIVE_DIST && Math.abs(dy) <= ARRIVE_DIST) return true;

    const step = SPEED * dt;
    // Resolve horizontal first, then vertical — never both at once
    if (Math.abs(dx) > ARRIVE_DIST) {
      entity.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
      entity.direction = dx >= 0 ? "right" : "left";
    } else {
      entity.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
      entity.direction = dy >= 0 ? "down" : "up";
    }
    entity.walkFrame += 0.8;
    return false;
  }

  // Vertical-first variant: used when approaching the house so the villager
  // aligns to the entrance Y (house bottom) while still in the open field column,
  // then slides horizontally into the door — never clipping through the house body.
  private moveTowardVFirst(
    entity: VillagerEntity,
    tx: number,
    ty: number,
    dt: number,
  ): boolean {
    const dx = tx - entity.x;
    const dy = ty - entity.y;

    if (Math.abs(dx) <= ARRIVE_DIST && Math.abs(dy) <= ARRIVE_DIST) return true;

    const step = SPEED * dt;
    if (Math.abs(dy) > ARRIVE_DIST) {
      entity.y += Math.sign(dy) * Math.min(Math.abs(dy), step);
      entity.direction = dy >= 0 ? "down" : "up";
    } else {
      entity.x += Math.sign(dx) * Math.min(Math.abs(dx), step);
      entity.direction = dx >= 0 ? "right" : "left";
    }
    entity.walkFrame += 0.8;
    return false;
  }

  private jitter(base: number, fraction: number): number {
    return base + (this.rand() * 2 - 1) * base * fraction;
  }

  private randBetween(min: number, max: number): number {
    return min + this.rand() * (max - min);
  }

  private randomWanderX(): number {
    // Keep villagers in the field column, never in the house column
    if (this.isPlayer) {
      return this.randBetween(HOUSE_W + H_GAP + 4, FARM_W - 8);
    } else {
      return this.randBetween(8, FIELD_W - 4);
    }
  }

  private randomWanderY(): number {
    return this.randBetween(MARGIN + 8, SCENE_H_INNER - MARGIN - 8);
  }
}
