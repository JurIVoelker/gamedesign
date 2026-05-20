import { Application, Container, Graphics } from "pixi.js";
import type { GameState } from "@gamedesign/shared";
import { FieldEntity, FIELD_W, FIELD_H } from "./entities/FieldEntity";
import { HouseEntity, HOUSE_W } from "./entities/HouseEntity";
import { VillagerController } from "./VillagerController";
import { ThiefController } from "./ThiefController";
import { SeededRandom, hashStr } from "./SeededRandom";
import { H_GAP, ROW_GAP, MARGIN, FARM_W, SCENE_H_INNER } from "./layout";

const FIELD_COUNT = 4;
const OUTER_MARGIN = 60;

const SCENE_H = SCENE_H_INNER;

export class GameEngine {
  private app: Application | null = null;
  private playerFarm: Container | null = null;
  private opponentFarm: Container | null = null;
  private divider: Graphics | null = null;
  private resizeHandler: (() => void) | null = null;
  private rafId: number | null = null;

  private playerFields: FieldEntity[] = [];
  private opponentFields: FieldEntity[] = [];
  private playerVillagers: VillagerController | null = null;
  private opponentVillagers: VillagerController | null = null;
  private playerThief: ThiefController | null = null;
  private opponentThief: ThiefController | null = null;
  private onCatchThief: (() => void) | null = null;
  private playerWeatherOverlay: Graphics | null = null;
  private opponentWeatherOverlay: Graphics | null = null;

  // Lazy init: created once startedAt is known so both clients use the same seed
  private villagersSeeded = false;

  async init(
    container: HTMLElement,
    onSow: (fieldIndex: number) => void,
    onHarvest: (fieldIndex: number) => void,
    onScareCrow: (fieldIndex: number) => void,
    onCatchThief: () => void,
  ): Promise<void> {
    this.onCatchThief = onCatchThief;
    const app = new Application();
    await app.init({
      background: 0x3d6b1f,
      resizeTo: container,
      antialias: false,
    });

    this.app = app;
    container.appendChild(app.canvas);

    const sceneRoot = new Container();
    app.stage.addChild(sceneRoot);

    const { container: playerFarm, fields: playerFields } = this.buildFarm(
      "player",
      onSow,
      onHarvest,
      onScareCrow,
    );
    const { container: opponentFarm, fields: opponentFields } = this.buildFarm(
      "opponent",
      null,
      null,
      null,
    );

    this.playerFarm = playerFarm;
    this.opponentFarm = opponentFarm;
    this.playerFields = playerFields;
    this.opponentFields = opponentFields;
    this.divider = this.buildDivider();

    this.playerWeatherOverlay = this.buildWeatherOverlay();
    this.playerFarm.addChild(this.playerWeatherOverlay);
    this.opponentWeatherOverlay = this.buildWeatherOverlay();
    this.opponentFarm.addChild(this.opponentWeatherOverlay);

    // Villagers and thief controllers are created lazily in updateGameState once startedAt
    // is known, so both clients produce identical decisions using the same seeds.

    sceneRoot.addChild(this.divider);
    sceneRoot.addChild(this.playerFarm);
    sceneRoot.addChild(this.opponentFarm);

    this.rescale(app, sceneRoot);

    app.ticker.add(() => {
      for (const entity of this.playerFields) entity.update();
      for (const entity of this.opponentFields) entity.update();
      this.playerVillagers?.update(app.ticker.deltaMS);
      this.opponentVillagers?.update(app.ticker.deltaMS);
      this.playerThief?.update(app.ticker.deltaMS);
      this.opponentThief?.update(app.ticker.deltaMS);
    });

    this.resizeHandler = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.rafId = null;
        this.rescale(app, sceneRoot);
      });
    };
    window.addEventListener("resize", this.resizeHandler);
  }

  destroy(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    this.app?.destroy(true);
    this.app = null;
    this.playerFarm = null;
    this.opponentFarm = null;
    this.divider = null;
    this.playerFields = [];
    this.opponentFields = [];
    this.playerVillagers = null;
    this.opponentVillagers = null;
    this.playerThief = null;
    this.opponentThief = null;
    this.playerWeatherOverlay = null;
    this.opponentWeatherOverlay = null;
    this.villagersSeeded = false;
  }

  updateGameState(state: GameState, myPlayerId: string): void {
    const myState = state.players[myPlayerId];
    const opponentState = Object.values(state.players).find(
      (p) => p.id !== myPlayerId,
    );

    // First time we have a startedAt: create villager controllers with deterministic seeds
    // so both clients produce identical decisions for every farm.
    if (!this.villagersSeeded && state.startedAt && this.playerFarm && this.opponentFarm) {
      const opponentId = opponentState?.id ?? "";
      // Each farm gets a seed derived from startedAt + a hash of the owner's playerId.
      // Both clients compute the same seeds for the same farms, keeping them in sync.
      const mySeed  = (state.startedAt ^ hashStr(myPlayerId)) >>> 0;
      const oppSeed = (state.startedAt ^ hashStr(opponentId)) >>> 0;
      // Thief uses a separate rand sequence (XOR with a constant to offset from villager)
      const myThiefSeed  = (mySeed  ^ 0xdeadbeef) >>> 0;
      const oppThiefSeed = (oppSeed ^ 0xdeadbeef) >>> 0;

      const myRand      = new SeededRandom(mySeed);
      const oppRand     = new SeededRandom(oppSeed);
      const myThiefRand  = new SeededRandom(myThiefSeed);
      const oppThiefRand = new SeededRandom(oppThiefSeed);

      this.playerVillagers   = new VillagerController("player",   this.playerFarm,   () => myRand.next());
      this.opponentVillagers = new VillagerController("opponent", this.opponentFarm, () => oppRand.next());
      this.playerThief  = new ThiefController("player",   this.playerFarm,   this.onCatchThief ?? undefined, () => myThiefRand.next());
      this.opponentThief = new ThiefController("opponent", this.opponentFarm, undefined,                      () => oppThiefRand.next());
      this.villagersSeeded = true;
    }

    if (myState) {
      for (let i = 0; i < this.playerFields.length; i++) {
        this.playerFields[i].setField(myState.fields[i] ?? null);
      }
      this.playerVillagers?.setFields(myState.fields);
      this.playerThief?.setAttack(myState.thiefAttack ?? null, "victim");
      const myWeather = myState.weatherEffect != null;
      if (this.playerWeatherOverlay) this.playerWeatherOverlay.visible = myWeather;
      this.playerVillagers?.setWeather(myWeather);
    }
    if (opponentState) {
      for (let i = 0; i < this.opponentFields.length; i++) {
        this.opponentFields[i].setField(opponentState.fields[i] ?? null);
      }
      this.opponentVillagers?.setFields(opponentState.fields);
      this.opponentThief?.setAttack(opponentState.thiefAttack ?? null, "attacker");
      const oppWeather = opponentState.weatherEffect != null;
      if (this.opponentWeatherOverlay) this.opponentWeatherOverlay.visible = oppWeather;
      this.opponentVillagers?.setWeather(oppWeather);
    }
  }

  private rescale(app: Application, root: Container): void {
    const w = app.renderer.width;
    const h = app.renderer.height;

    const scale = (h - OUTER_MARGIN * 2) / SCENE_H;
    root.scale.set(scale);
    root.x = 0;
    root.y = Math.round((h - SCENE_H * scale) / 2);

    const logicalW = w / scale;
    const gap = Math.max(MARGIN, (logicalW - 2 * FARM_W) / 3);

    if (this.playerFarm) this.playerFarm.x = gap;
    if (this.opponentFarm) this.opponentFarm.x = 2 * gap + FARM_W;
    if (this.divider) this.divider.x = gap + FARM_W + gap / 2;
  }

  private buildFarm(
    owner: "player" | "opponent",
    onSow: ((fieldIndex: number) => void) | null,
    onHarvest: ((fieldIndex: number) => void) | null,
    onScareCrow: ((fieldIndex: number) => void) | null,
  ): { container: Container; fields: FieldEntity[] } {
    const farm = new Container();
    const fields: FieldEntity[] = [];

    for (let i = 0; i < FIELD_COUNT; i++) {
      const rowY = MARGIN + i * (FIELD_H + ROW_GAP);
      const sow = onSow ? () => onSow(i) : null;
      const harvest = onHarvest ? () => onHarvest(i) : null;
      const scare = onScareCrow ? () => onScareCrow(i) : null;

      if (owner === "player") {
        new HouseEntity(i, owner, 0, rowY).render(farm);
        const fe = new FieldEntity(i, owner, HOUSE_W + H_GAP, rowY, sow, harvest, scare);
        fe.render(farm);
        fields.push(fe);
      } else {
        const fe = new FieldEntity(i, owner, 0, rowY, null, null, null);
        fe.render(farm);
        fields.push(fe);
        new HouseEntity(i, owner, FIELD_W + H_GAP, rowY).render(farm);
      }
    }

    return { container: farm, fields };
  }

  private buildWeatherOverlay(): Graphics {
    const g = new Graphics();
    g.rect(0, 0, FARM_W, SCENE_H_INNER).fill({ color: 0x446688, alpha: 0.35 });
    g.visible = false;
    return g;
  }

  private buildDivider(): Graphics {
    const g = new Graphics();
    g.moveTo(0, MARGIN / 2)
      .lineTo(0, SCENE_H - MARGIN / 2)
      .stroke({ color: 0xf0e8c0, alpha: 0.25, width: 1 });
    return g;
  }
}
