import { MAP_H, MAP_W, RESOURCE_NODE_AMOUNT, TILE } from "./config";
import type { ResourceNode, Terrain, Vec2 } from "./types";

/**
 * The world map: a fixed grid of terrain tiles plus harvestable resource nodes.
 * Buildings mark tiles occupied so pathfinding routes around them.
 */
export class Grid {
  readonly w = MAP_W;
  readonly h = MAP_H;
  terrain: Terrain[]; // length w*h
  occupied: Int32Array; // -1 free, else owning entity id
  nodes: ResourceNode[] = [];
  private nodeAt: Int32Array; // tile -> node index or -1

  constructor(seed = 1337) {
    this.terrain = new Array(this.w * this.h).fill("grass");
    this.occupied = new Int32Array(this.w * this.h).fill(-1);
    this.nodeAt = new Int32Array(this.w * this.h).fill(-1);
    this.generate(seed);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  terrainAt(tx: number, ty: number): Terrain {
    if (!this.inBounds(tx, ty)) return "water";
    return this.terrain[this.idx(tx, ty)];
  }

  nodeIndexAt(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return -1;
    return this.nodeAt[this.idx(tx, ty)];
  }

  /** Tile is impassable for ground movement. */
  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    const t = this.terrain[this.idx(tx, ty)];
    if (t === "water" || t === "forest" || t === "gold" || t === "stone") return true;
    return this.occupied[this.idx(tx, ty)] !== -1;
  }

  setOccupied(tx: number, ty: number, id: number): void {
    if (this.inBounds(tx, ty)) this.occupied[this.idx(tx, ty)] = id;
  }

  clearOccupied(tx: number, ty: number): void {
    if (this.inBounds(tx, ty)) this.occupied[this.idx(tx, ty)] = -1;
  }

  areaFree(tx: number, ty: number, size: number): boolean {
    for (let y = ty; y < ty + size; y++) {
      for (let x = tx; x < tx + size; x++) {
        if (!this.inBounds(x, y)) return false;
        const t = this.terrain[this.idx(x, y)];
        if (t !== "grass") return false;
        if (this.occupied[this.idx(x, y)] !== -1) return false;
      }
    }
    return true;
  }

  static worldToTile(p: Vec2): Vec2 {
    return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
  }

  static tileCenter(tx: number, ty: number): Vec2 {
    return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
  }

  private addNode(tx: number, ty: number, kind: "forest" | "gold" | "stone"): void {
    if (!this.inBounds(tx, ty)) return;
    if (this.terrain[this.idx(tx, ty)] !== "grass") return;
    this.terrain[this.idx(tx, ty)] = kind;
    const node: ResourceNode = {
      id: this.nodes.length,
      kind,
      tile: { x: tx, y: ty },
      amount: RESOURCE_NODE_AMOUNT[kind],
      maxAmount: RESOURCE_NODE_AMOUNT[kind],
    };
    this.nodeAt[this.idx(tx, ty)] = this.nodes.length;
    this.nodes.push(node);
  }

  private generate(seed: number): void {
    // Deterministic PRNG so the map is reproducible.
    let s = seed >>> 0;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0xffffffff;
    };

    // A winding river along the right third.
    for (let y = 0; y < this.h; y++) {
      const cx = Math.floor(this.w * 0.72 + Math.sin(y * 0.35) * 4);
      for (let x = cx; x < cx + 2; x++) {
        if (this.inBounds(x, y)) this.terrain[this.idx(x, y)] = "water";
      }
    }

    // Forest clusters
    for (let c = 0; c < 9; c++) {
      const ox = 4 + Math.floor(rnd() * (this.w - 12));
      const oy = 4 + Math.floor(rnd() * (this.h - 8));
      const size = 3 + Math.floor(rnd() * 4);
      for (let y = oy; y < oy + size; y++) {
        for (let x = ox; x < ox + size; x++) {
          if (rnd() > 0.25) this.addNode(x, y, "forest");
        }
      }
    }

    // Gold + stone deposits
    for (let c = 0; c < 5; c++) {
      const gx = 6 + Math.floor(rnd() * (this.w - 14));
      const gy = 5 + Math.floor(rnd() * (this.h - 10));
      this.addNode(gx, gy, "gold");
      this.addNode(gx + 1, gy, "gold");
      this.addNode(gx, gy + 1, "gold");
    }
    for (let c = 0; c < 4; c++) {
      const sx = 6 + Math.floor(rnd() * (this.w - 14));
      const sy = 5 + Math.floor(rnd() * (this.h - 10));
      this.addNode(sx, sy, "stone");
      this.addNode(sx + 1, sy, "stone");
    }

    // Keep the player's starting area (top-left) clear of obstacles.
    for (let y = 2; y < 9; y++) {
      for (let x = 2; x < 11; x++) {
        const i = this.idx(x, y);
        if (this.terrain[i] !== "grass") {
          if (this.nodeAt[i] !== -1) {
            this.nodes[this.nodeAt[i]].amount = 0;
            this.nodeAt[i] = -1;
          }
          this.terrain[i] = "grass";
        }
      }
    }
    // ...but leave a forest + gold within reach so the economy works immediately.
    this.addNode(12, 4, "forest");
    this.addNode(12, 5, "forest");
    this.addNode(12, 6, "forest");
    this.addNode(11, 9, "gold");
    this.addNode(12, 9, "gold");
  }
}
