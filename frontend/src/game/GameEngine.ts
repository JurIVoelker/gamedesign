import { Application, Container, Graphics } from "pixi.js";
import type { GameState } from "@gamedesign/shared";
import { FieldEntity, FIELD_W, FIELD_H } from "./entities/FieldEntity";
import { HouseEntity, HOUSE_W } from "./entities/HouseEntity";

const FIELD_COUNT = 4;
const H_GAP = 16;
const ROW_GAP = 28;
const MARGIN = 48;
const OUTER_MARGIN = 60;

// Width of one farm side (house + gap + field, or mirrored)
const FARM_W = HOUSE_W + H_GAP + FIELD_W;
const SCENE_H =
  MARGIN + FIELD_COUNT * FIELD_H + (FIELD_COUNT - 1) * ROW_GAP + MARGIN;

export class GameEngine {
  private app: Application | null = null;
  private playerFarm: Container | null = null;
  private opponentFarm: Container | null = null;
  private divider: Graphics | null = null;
  private resizeHandler: (() => void) | null = null;
  private rafId: number | null = null;

  private playerFields: FieldEntity[] = [];
  private opponentFields: FieldEntity[] = [];

  async init(
    container: HTMLElement,
    onSow: (fieldIndex: number) => void,
    onHarvest: (fieldIndex: number) => void,
  ): Promise<void> {
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
    );
    const { container: opponentFarm, fields: opponentFields } = this.buildFarm(
      "opponent",
      null,
      null,
    );

    this.playerFarm = playerFarm;
    this.opponentFarm = opponentFarm;
    this.playerFields = playerFields;
    this.opponentFields = opponentFields;
    this.divider = this.buildDivider();

    sceneRoot.addChild(this.divider);
    sceneRoot.addChild(this.playerFarm);
    sceneRoot.addChild(this.opponentFarm);

    this.rescale(app, sceneRoot);

    app.ticker.add(() => {
      for (const entity of this.playerFields) entity.update();
      for (const entity of this.opponentFields) entity.update();
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
  }

  updateGameState(state: GameState, myPlayerId: string): void {
    const myState = state.players[myPlayerId];
    const opponentState = Object.values(state.players).find(
      (p) => p.id !== myPlayerId,
    );

    if (myState) {
      for (let i = 0; i < this.playerFields.length; i++) {
        this.playerFields[i].setField(myState.fields[i] ?? null);
      }
    }
    if (opponentState) {
      for (let i = 0; i < this.opponentFields.length; i++) {
        this.opponentFields[i].setField(opponentState.fields[i] ?? null);
      }
    }
  }

  private rescale(app: Application, root: Container): void {
    const w = app.renderer.width;
    const h = app.renderer.height;

    // Scale to fit height, let width fill the window
    const scale = (h - OUTER_MARGIN * 2) / SCENE_H;
    root.scale.set(scale);
    root.x = 0;
    root.y = Math.round((h - SCENE_H * scale) / 2);

    // Distribute farms with 3 equal gaps: [gap][playerFarm][gap][opponentFarm][gap]
    const logicalW = w / scale;
    const gap = Math.max(MARGIN, (logicalW - 2 * FARM_W) / 3);

    if (this.playerFarm) this.playerFarm.x = gap;
    if (this.opponentFarm) this.opponentFarm.x = 2 * gap + FARM_W;
    if (this.divider) this.divider.x = gap + FARM_W + gap / 2;
  }

  // player: [house][field], opponent: [field][house] — mirrored
  private buildFarm(
    owner: "player" | "opponent",
    onSow: ((fieldIndex: number) => void) | null,
    onHarvest: ((fieldIndex: number) => void) | null,
  ): { container: Container; fields: FieldEntity[] } {
    const farm = new Container();
    const fields: FieldEntity[] = [];

    for (let i = 0; i < FIELD_COUNT; i++) {
      const rowY = MARGIN + i * (FIELD_H + ROW_GAP);
      const sow = onSow ? () => onSow(i) : null;
      const harvest = onHarvest ? () => onHarvest(i) : null;

      if (owner === "player") {
        new HouseEntity(i, owner, 0, rowY).render(farm);
        const fe = new FieldEntity(
          i,
          owner,
          HOUSE_W + H_GAP,
          rowY,
          sow,
          harvest,
        );
        fe.render(farm);
        fields.push(fe);
      } else {
        const fe = new FieldEntity(i, owner, 0, rowY, null, null);
        fe.render(farm);
        fields.push(fe);
        new HouseEntity(i, owner, FIELD_W + H_GAP, rowY).render(farm);
      }
    }

    return { container: farm, fields };
  }

  private buildDivider(): Graphics {
    const g = new Graphics();
    g.moveTo(0, MARGIN / 2)
      .lineTo(0, SCENE_H - MARGIN / 2)
      .stroke({ color: 0xf0e8c0, alpha: 0.25, width: 1 });
    return g;
  }
}
