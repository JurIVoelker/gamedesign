import { Application, Container, Text, TextStyle } from "pixi.js";
import { Entity } from "./entities/Entity";
import { FieldEntity, FIELD_W, FIELD_H } from "./entities/FieldEntity";
import { HouseEntity, HOUSE_W } from "./entities/HouseEntity";

const FIELD_COUNT = 4;
const H_GAP = 16;
const ROW_GAP = 28;
const CENTER_GAP = 56;
const MARGIN = 48;
const OUTER_MARGIN = 60;

const PLAYER_HOUSE_X = MARGIN;
const PLAYER_FIELD_X = MARGIN + HOUSE_W + H_GAP;
const OPPONENT_FIELD_X = MARGIN + HOUSE_W + H_GAP + FIELD_W + CENTER_GAP;
const OPPONENT_HOUSE_X = OPPONENT_FIELD_X + FIELD_W + H_GAP;

const SCENE_W = OPPONENT_HOUSE_X + HOUSE_W + MARGIN;
const SCENE_H = MARGIN + FIELD_COUNT * FIELD_H + (FIELD_COUNT - 1) * ROW_GAP + MARGIN;

const LABEL_STYLE = new TextStyle({ fill: 0xf0e8c0, fontSize: 11, fontFamily: "monospace" });

export class GameEngine {
  private app: Application | null = null;
  private resizeHandler: (() => void) | null = null;
  private rafId: number | null = null;

  async init(container: HTMLElement): Promise<void> {
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

    this.drawScene(sceneRoot, this.buildEntities());
    this.rescale(app, sceneRoot);

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
  }

  private rescale(app: Application, root: Container): void {
    const w = app.renderer.width;
    const h = app.renderer.height;
    const scale = Math.min(
      (w - OUTER_MARGIN * 2) / SCENE_W,
      (h - OUTER_MARGIN * 2) / SCENE_H,
    );
    root.scale.set(scale);
    root.x = Math.round((w - SCENE_W * scale) / 2);
    root.y = Math.round((h - SCENE_H * scale) / 2);
  }

  private buildEntities(): Entity[] {
    const entities: Entity[] = [];
    for (let i = 0; i < FIELD_COUNT; i++) {
      const rowY = MARGIN + i * (FIELD_H + ROW_GAP);
      entities.push(new FieldEntity(i, "player", PLAYER_FIELD_X, rowY));
      entities.push(new HouseEntity(i, "player", PLAYER_HOUSE_X, rowY));
      entities.push(new FieldEntity(i, "opponent", OPPONENT_FIELD_X, rowY));
      entities.push(new HouseEntity(i, "opponent", OPPONENT_HOUSE_X, rowY));
    }
    return entities;
  }

  private drawScene(root: Container, entities: Entity[]): void {
    const playerLabel = new Text({ text: "Your Farm", style: LABEL_STYLE });
    playerLabel.x = PLAYER_FIELD_X;
    playerLabel.y = 8;
    root.addChild(playerLabel);

    const opponentLabel = new Text({ text: "Opponent", style: LABEL_STYLE });
    opponentLabel.x = OPPONENT_FIELD_X;
    opponentLabel.y = 8;
    root.addChild(opponentLabel);

    for (const entity of entities) entity.render(root);
  }
}
