import { Container, Graphics } from "pixi.js";

const SHIRT = 0x4a7abf;
const SKIN = 0xffcc99;
const PANTS = 0x2a1a0a;

export class VillagerEntity {
  readonly id: number;
  x: number;
  y: number;
  facingRight: boolean = true;
  walkFrame: number = 0;
  isVisible: boolean = true;

  private g: Graphics;

  constructor(id: number, x: number, y: number) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.g = new Graphics();
  }

  render(stage: Container): void {
    stage.addChild(this.g);
    this.draw();
  }

  update(): void {
    if (!this.isVisible) {
      this.g.visible = false;
      return;
    }
    this.g.visible = true;
    this.draw();
  }

  private draw(): void {
    const g = this.g;
    g.clear();

    const shirt = SHIRT;

    // Origin is villager center-bottom
    const cx = this.x;
    const by = this.y;

    // Flip: if facing left, mirror around cx
    const dir = this.facingRight ? 1 : -1;

    // Legs (animated)
    const phase = Math.floor(this.walkFrame / 8) % 2;
    const lLegOff = phase === 0 ? -2 : 2;
    const rLegOff = -lLegOff;

    // Left leg
    g.rect(cx + dir * -3, by - 5 + lLegOff, 3, 5).fill({ color: PANTS });
    // Right leg
    g.rect(cx + dir * 0, by - 5 + rLegOff, 3, 5).fill({ color: PANTS });

    // Pants strip (connects legs)
    g.rect(cx - 3, by - 8, 7, 3).fill({ color: PANTS });

    // Body
    g.rect(cx - 3, by - 15, 7, 7).fill({ color: shirt });

    // Head
    g.ellipse(cx, by - 19, 4, 3.5).fill({ color: SKIN });

    // Eye (on facing side)
    const eyeX = cx + dir * 2;
    g.circle(eyeX, by - 20, 0.8).fill({ color: 0x333333 });
  }
}
