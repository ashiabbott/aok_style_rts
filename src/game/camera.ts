import { MAP_H, MAP_W, TILE } from "./config";
import type { Vec2 } from "./types";

export class Camera {
  x = TILE * 1.5; // world coords of viewport top-left
  y = TILE * 1.5;
  zoom = 1;
  vw = 800;
  vh = 600;

  setViewport(w: number, h: number): void {
    this.vw = w;
    this.vh = h;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / this.zoom;
    this.clamp();
  }

  zoomAt(screen: Vec2, factor: number): void {
    const before = this.screenToWorld(screen);
    this.zoom = Math.min(2.2, Math.max(0.45, this.zoom * factor));
    const after = this.screenToWorld(screen);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.x) * this.zoom, y: (p.y - this.y) * this.zoom };
  }

  screenToWorld(p: Vec2): Vec2 {
    return { x: p.x / this.zoom + this.x, y: p.y / this.zoom + this.y };
  }

  centerOn(p: Vec2): void {
    this.x = p.x - this.vw / this.zoom / 2;
    this.y = p.y - this.vh / this.zoom / 2;
    this.clamp();
  }

  private clamp(): void {
    const worldW = MAP_W * TILE;
    const worldH = MAP_H * TILE;
    const viewW = this.vw / this.zoom;
    const viewH = this.vh / this.zoom;
    this.x = Math.max(-TILE, Math.min(worldW - viewW + TILE, this.x));
    this.y = Math.max(-TILE, Math.min(worldH - viewH + TILE, this.y));
  }
}
