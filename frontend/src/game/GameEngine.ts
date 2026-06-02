import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  TextureStyle,
} from "pixi.js";
import type { GameState } from "@gamedesign/shared";
import { FieldEntity, FIELD_W, FIELD_H } from "./entities/FieldEntity";
import { HouseEntity, HOUSE_W, HOUSE_H } from "./entities/HouseEntity";
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
  private bgLayer: Container | null = null;
  private treeLayer: Container | null = null;
  private edgeFade: Graphics | null = null;
  private resizeHandler: (() => void) | null = null;
  private rafId: number | null = null;

  private playerFields: FieldEntity[] = [];
  private opponentFields: FieldEntity[] = [];
  private playerVillagers: VillagerController | null = null;
  private opponentVillagers: VillagerController | null = null;
  private playerThief: ThiefController | null = null;
  private opponentThief: ThiefController | null = null;
  private onCatchThief: (() => void) | null = null;
  private onVillagersChange: ((count: number) => void) | null = null;
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
    onVillagersChange: (count: number) => void,
  ): Promise<void> {
    this.onCatchThief = onCatchThief;
    this.onVillagersChange = onVillagersChange;

    TextureStyle.defaultOptions.scaleMode = "nearest";
    await Assets.load([
      "/assets/grass.png",
      "/assets/flower.png",
      "/assets/house.png",
      "/assets/farm.png",
      "/assets/tree.png",
      "/assets/villager-back.png",
      "/assets/villager-front-left.png",
      "/assets/villager-front-right.png",
      "/assets/theif-1-back.png",
      "/assets/theif-1-front-left.png",
      "/assets/theif-1-front-right.png",
      "/assets/theif-2-back.png",
      "/assets/theif-2-front-left.png",
      "/assets/theif-2-front-right.png",
      "/assets/crow-flying.png",
      "/assets/crow-landing.png",
      "/assets/crow-eating.png",
    ]);

    const app = new Application();
    await app.init({
      background: 0xa7af4f,
      resizeTo: container,
      antialias: false,
    });

    this.app = app;
    container.appendChild(app.canvas);

    const sceneRoot = new Container();
    app.stage.addChild(sceneRoot);

    // Background sprites — drawn first so they sit behind everything
    this.bgLayer = this.buildBackgroundLayer();
    sceneRoot.addChild(this.bgLayer);

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

    sceneRoot.addChild(this.playerFarm);
    sceneRoot.addChild(this.opponentFarm);

    // Weather overlays in stage space: above game world but below the dither border
    this.playerWeatherOverlay = new Graphics();
    this.playerWeatherOverlay.visible = false;
    app.stage.addChild(this.playerWeatherOverlay);
    this.opponentWeatherOverlay = new Graphics();
    this.opponentWeatherOverlay.visible = false;
    app.stage.addChild(this.opponentWeatherOverlay);

    // Edge fade lives in stage space (above sceneRoot) so it always fills the screen
    this.edgeFade = new Graphics();
    app.stage.addChild(this.edgeFade);

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
    this.bgLayer = null;
    this.treeLayer = null;
    this.edgeFade = null;
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
    if (
      !this.villagersSeeded &&
      state.startedAt &&
      this.playerFarm &&
      this.opponentFarm
    ) {
      const opponentId = opponentState?.id ?? "";
      // Each farm gets a seed derived from startedAt + a hash of the owner's playerId.
      // Both clients compute the same seeds for the same farms, keeping them in sync.
      const mySeed = (state.startedAt ^ hashStr(myPlayerId)) >>> 0;
      const oppSeed = (state.startedAt ^ hashStr(opponentId)) >>> 0;
      // Thief uses a separate rand sequence (XOR with a constant to offset from villager)
      const myThiefSeed = (mySeed ^ 0xdeadbeef) >>> 0;
      const oppThiefSeed = (oppSeed ^ 0xdeadbeef) >>> 0;

      const myRand = new SeededRandom(mySeed);
      const oppRand = new SeededRandom(oppSeed);
      const myThiefRand = new SeededRandom(myThiefSeed);
      const oppThiefRand = new SeededRandom(oppThiefSeed);

      this.playerVillagers = new VillagerController(
        "player",
        this.playerFarm,
        () => myRand.next(),
        4,
        this.onVillagersChange ?? undefined,
      );
      this.opponentVillagers = new VillagerController(
        "opponent",
        this.opponentFarm,
        () => oppRand.next(),
        opponentState?.villagersOutside ?? 4,
      );
      this.playerThief = new ThiefController(
        "player",
        this.playerFarm,
        this.onCatchThief ?? undefined,
        () => myThiefRand.next(),
      );
      this.opponentThief = new ThiefController(
        "opponent",
        this.opponentFarm,
        undefined,
        () => oppThiefRand.next(),
      );
      this.villagersSeeded = true;
    }

    if (myState) {
      for (let i = 0; i < this.playerFields.length; i++) {
        this.playerFields[i].setField(myState.fields[i] ?? null);
      }
      this.playerVillagers?.setFields(myState.fields);
      this.playerThief?.setAttack(myState.thiefAttack ?? null, "victim");
      const myWeather = myState.weatherEffect != null;
      if (this.playerWeatherOverlay)
        this.playerWeatherOverlay.visible = myWeather;
      this.playerVillagers?.setWeather(myWeather);
    }
    if (opponentState) {
      for (let i = 0; i < this.opponentFields.length; i++) {
        this.opponentFields[i].setField(opponentState.fields[i] ?? null);
      }
      this.opponentVillagers?.setFields(opponentState.fields);
      this.opponentThief?.setAttack(
        opponentState.thiefAttack ?? null,
        "attacker",
      );
      const oppWeather = opponentState.weatherEffect != null;
      if (this.opponentWeatherOverlay)
        this.opponentWeatherOverlay.visible = oppWeather;
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
    // Fixed gap between the two farms; farms are re-centered horizontally on resize.
    const centerGap = 200;
    const leftX = Math.max(
      4,
      Math.round((logicalW - 2 * FARM_W - centerGap) / 2),
    );

    if (this.playerFarm) this.playerFarm.x = leftX;
    if (this.opponentFarm) this.opponentFarm.x = leftX + FARM_W + centerGap;

    this.rebuildTrees(leftX, centerGap, logicalW);

    const centerX = (leftX + FARM_W + centerGap / 2) * scale;
    if (this.playerWeatherOverlay) {
      this.playerWeatherOverlay.clear();
      this.playerWeatherOverlay
        .rect(0, 0, centerX, h)
        .fill({ color: 0x446688, alpha: 0.35 });
    }
    if (this.opponentWeatherOverlay) {
      this.opponentWeatherOverlay.clear();
      this.opponentWeatherOverlay
        .rect(centerX, 0, w - centerX, h)
        .fill({ color: 0x446688, alpha: 0.35 });
    }
    if (this.edgeFade) this.drawEdgeFade(w, h, centerX);
  }

  private buildBackgroundLayer(): Container {
    const layer = new Container();
    const rng = new SeededRandom(42);
    const grassTex = Assets.get("/assets/grass.png");
    const flowerTex = Assets.get("/assets/flower.png");

    for (let i = 0; i < 200; i++) {
      const isFlower = rng.next() < 0.25;
      const sprite = new Sprite(isFlower ? flowerTex : grassTex);
      sprite.x = Math.round(rng.next() * 1000 - 50);
      sprite.y = Math.round(rng.next() * (SCENE_H + 100) - 50);
      sprite.scale.set(1.5);
      layer.addChild(sprite);
    }

    const treeLayer = new Container();
    layer.addChild(treeLayer);
    this.treeLayer = treeLayer;

    return layer;
  }

  // Y positions staggered to avoid aligning with farm row starts (48,140,232,324).
  private static readonly TREE_Y = [75, 185, 305, 390];

  private rebuildTrees(
    leftX: number,
    centerGap: number,
    logicalW: number,
  ): void {
    const layer = this.treeLayer;
    if (!layer) return;
    layer.removeChildren();

    const tex = Assets.get("/assets/tree.png");
    const centerX = leftX + FARM_W + centerGap / 2;

    const cols: number[] = [];
    const innerLeft = leftX + FARM_W + 4;
    const innerRight = leftX + FARM_W + centerGap - HOUSE_W - 4;

    if (innerLeft + HOUSE_W <= centerX) cols.push(innerLeft);
    if (innerRight >= centerX && innerRight + HOUSE_W <= logicalW)
      cols.push(innerRight);

    for (const x of cols) {
      for (const y of GameEngine.TREE_Y) {
        const tree = new Sprite(tex);
        tree.width = HOUSE_W;
        tree.height = HOUSE_H;
        tree.x = Math.round(x);
        tree.y = y;
        layer.addChild(tree);
      }
    }
  }

  // Pixel-art border: solid dark core + smaller checkerboard transition zone,
  // jagged outer edge.  B drives tooth/solid size; CB drives checker square size.
  private drawEdgeFade(w: number, h: number, centerX: number): void {
    const g = this.edgeFade!;
    g.clear();

    const DARK = 0x5e632d;
    const B = 14; // solid tooth size (px)
    const CB = 7; // checker square size (px) — half of B, always two per tooth
    const CT = 3; // checker-transition depth in B-blocks
    const rng = new SeededRandom(99);

    // Random-walk profile returning block counts (in B units).
    const jag = (n: number, lo: number, hi: number): number[] => {
      const out: number[] = [];
      let b = lo + Math.floor(rng.next() * (hi - lo + 1));
      let hold = 0;
      for (let i = 0; i < n; i++) {
        if (hold <= 0) {
          b = Math.max(lo, Math.min(hi, b + Math.floor(rng.next() * 3) - 1));
          hold = Math.floor(rng.next() * 4);
        } else hold--;
        out.push(b);
      }
      return out;
    };

    // Fill checker squares (CB×CB) inside [x0,x1)×[y0,y1) using global coords.
    const fill = (x0: number, x1: number, y0: number, y1: number) => {
      for (let cy2 = y0; cy2 < y1; cy2 += CB) {
        for (let cx2 = x0; cx2 < x1; cx2 += CB) {
          if ((Math.floor(cx2 / CB) + Math.floor(cy2 / CB)) % 2 === 0) {
            const bw = Math.min(CB, x1 - cx2);
            const bh = Math.min(CB, y1 - cy2);
            g.rect(cx2, cy2, bw, bh).fill({ color: DARK });
          }
        }
      }
    };

    const cols = Math.ceil(w / B);
    const rows = Math.ceil(h / B);
    // TOP — guaranteed solid (lo = CT+1 ensures sb ≥ 1 always)
    for (const [ci, tb] of jag(cols, CT + 1, CT + 4).entries()) {
      const sb = tb - CT;
      g.rect(ci * B, 0, B, sb * B).fill({ color: DARK });
      fill(ci * B, (ci + 1) * B, sb * B, tb * B);
    }

    // BOTTOM
    for (const [ci, tb] of jag(cols, CT + 1, CT + 4).entries()) {
      const sb = tb - CT;
      g.rect(ci * B, h - sb * B, B, sb * B).fill({ color: DARK });
      fill(ci * B, (ci + 1) * B, h - tb * B, h - sb * B);
    }

    // LEFT
    for (const [ri, tb] of jag(rows, CT + 1, CT + 4).entries()) {
      const sb = tb - CT;
      g.rect(0, ri * B, sb * B, B).fill({ color: DARK });
      fill(sb * B, tb * B, ri * B, (ri + 1) * B);
    }

    // RIGHT
    for (const [ri, tb] of jag(rows, CT + 1, CT + 4).entries()) {
      const sb = tb - CT;
      g.rect(w - sb * B, ri * B, sb * B, B).fill({ color: DARK });
      fill(w - tb * B, w - sb * B, ri * B, (ri + 1) * B);
    }

    // CENTER — solid core + checker transition, symmetric, full-height.
    // cxSnap aligns the seam to the CB grid so both halves meet without partial blocks.
    const cxSnap = Math.round(centerX / CB) * CB;
    const CTC = 3; // checker-transition depth for center (3 CB-block each side)
    for (const [ri, tb] of jag(rows, CTC + 2, CTC + 4).entries()) {
      const y0 = ri * B;
      const sb = tb - CTC; // solid half-width in blocks (always ≥ 1)
      g.rect(cxSnap - sb * B, y0, sb * 2 * B, B).fill({ color: DARK });
      fill(cxSnap - tb * B, cxSnap - sb * B, y0, y0 + B);
      fill(cxSnap + sb * B, cxSnap + tb * B, y0, y0 + B);
    }
  }

  private addFarmTrees(farm: Container, owner: "player" | "opponent"): void {
    const treeTex = Assets.get("/assets/tree.png");
    // Row y areas: 48-112, 140-204, 232-296, 324-388.
    const playerPositions: [number, number][] = [
      [-58, 38],
      [-75, 218],
      [-120, 379],
      [-120, 118],
      [-65, 295],
      [-150, 245],
      [-200, 230],
      [-210, 290],
      [-195, 350],
      [-210, 170],
      [-216, 70],
      [-160, 10],
      [-100, -40],
      [50, -20],
      [150, -10],
      [180, 30],
      [230, 100],
      [230, 100],
      [235, 180],
      [210, 250],
      [240, 370],
    ];
    let positions: [number, number][];
    if (owner === "player") {
      positions = playerPositions;
    } else {
      const rng = new SeededRandom(7);
      const JITTER = 25;
      positions = playerPositions.map(([tx, ty]) => [
        Math.round(FARM_W - tx - HOUSE_W + (rng.next() * 2 - 1) * JITTER),
        Math.round(ty + (rng.next() * 2 - 1) * JITTER),
      ]);
    }
    for (const [tx, ty] of positions) {
      const tree = new Sprite(treeTex);
      tree.width = HOUSE_W;
      tree.height = HOUSE_H;
      tree.x = tx;
      tree.y = ty;
      farm.addChild(tree);
    }
  }

  private buildFarm(
    owner: "player" | "opponent",
    onSow: ((fieldIndex: number) => void) | null,
    onHarvest: ((fieldIndex: number) => void) | null,
    onScareCrow: ((fieldIndex: number) => void) | null,
  ): { container: Container; fields: FieldEntity[] } {
    const farm = new Container();
    const fields: FieldEntity[] = [];
    this.addFarmTrees(farm, owner);

    for (let i = 0; i < FIELD_COUNT; i++) {
      const rowY = MARGIN + i * (FIELD_H + ROW_GAP);
      const sow = onSow ? () => onSow(i) : null;
      const harvest = onHarvest ? () => onHarvest(i) : null;
      const scare = onScareCrow ? () => onScareCrow(i) : null;

      if (owner === "player") {
        new HouseEntity(i, owner, 0, rowY).render(farm);
        const fe = new FieldEntity(
          i,
          owner,
          HOUSE_W + H_GAP,
          rowY,
          sow,
          harvest,
          scare,
        );
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
}
