import { MAP_H, MAP_W, TILE } from "./config";
import type { Game } from "./game";
import { minimapRect, type RenderInput } from "./renderer";
import type { Vec2 } from "./types";

const EDGE = 24; // px from edge that triggers camera pan
const EDGE_SPEED = 520; // px/sec

export class Input {
  private canvas: HTMLCanvasElement;
  private game: Game;
  private dragStart: Vec2 | null = null;
  private dragNow: Vec2 | null = null;
  private mouseScreen: Vec2 | null = null;
  private draggingMinimap = false;
  private keys = new Set<string>();

  constructor(canvas: HTMLCanvasElement, game: Game) {
    this.canvas = canvas;
    this.game = game;
    this.attach();
  }

  private attach(): void {
    const c = this.canvas;
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    c.addEventListener("mousedown", (e) => this.onDown(e));
    window.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", (e) => this.onUp(e));
    c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key.toLowerCase());
      if (e.key === "Escape") {
        if (this.game.placement) this.game.cancelPlacement();
        else this.game.clearSelection();
        this.game.onChange?.();
      } else if (e.key === ".") {
        this.game.selectNextIdleVillager();
      } else if (e.key === ",") {
        this.game.selectNextIdleVillager(true);
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private rel(e: MouseEvent): Vec2 {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private inMinimap(p: Vec2): boolean {
    const m = minimapRect(this.game.camera);
    return p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h;
  }

  private minimapToWorld(p: Vec2): Vec2 {
    const m = minimapRect(this.game.camera);
    const fx = (p.x - m.x) / m.w;
    const fy = (p.y - m.y) / m.h;
    return { x: fx * MAP_W * TILE, y: fy * MAP_H * TILE };
  }

  private onDown(e: MouseEvent): void {
    const p = this.rel(e);
    this.mouseScreen = p;

    if (this.inMinimap(p)) {
      if (e.button === 0) {
        this.draggingMinimap = true;
        this.game.camera.centerOn(this.minimapToWorld(p));
      } else if (e.button === 2) {
        this.game.commandAt(this.minimapToWorld(p));
      }
      return;
    }

    const world = this.game.camera.screenToWorld(p);

    if (e.button === 2) {
      // right click: contextual order (or set rally if a building is selected)
      if (this.game.selectedEntities().some((s) => s.category === "building" && s.owner === "player")) {
        this.game.setRallyForSelected(world);
      }
      this.game.commandAt(world);
      return;
    }

    if (e.button !== 0) return;

    if (this.game.placement) {
      this.game.tryPlaceAt(world);
      if (!e.shiftKey) this.game.placement = null;
      return;
    }
    this.dragStart = p;
    this.dragNow = p;
  }

  private onMove(e: MouseEvent): void {
    const p = this.rel(e);
    this.mouseScreen = p;
    if (this.dragStart) this.dragNow = p;
    if (this.draggingMinimap) this.game.camera.centerOn(this.minimapToWorld(p));
  }

  private onUp(e: MouseEvent): void {
    if (this.draggingMinimap) { this.draggingMinimap = false; return; }
    if (e.button !== 0 || !this.dragStart) return;
    const end = this.rel(e);
    const moved = Math.hypot(end.x - this.dragStart.x, end.y - this.dragStart.y);
    const additive = e.shiftKey;
    if (moved < 5) {
      this.game.selectAtPoint(this.game.camera.screenToWorld(end), additive);
    } else {
      const a = this.game.camera.screenToWorld(this.dragStart);
      const b = this.game.camera.screenToWorld(end);
      this.game.selectInRect(a, b, additive);
    }
    this.dragStart = null;
    this.dragNow = null;
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const p = this.rel(e);
    this.game.camera.zoomAt(p, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  /** Camera panning from held keys and screen edges; called each render frame. */
  updateCamera(dt: number): void {
    const cam = this.game.camera;
    let dx = 0;
    let dy = 0;
    const k = this.keys;
    if (k.has("a") || k.has("arrowleft")) dx -= 1;
    if (k.has("d") || k.has("arrowright")) dx += 1;
    if (k.has("w") || k.has("arrowup")) dy -= 1;
    if (k.has("s") || k.has("arrowdown")) dy += 1;

    const m = this.mouseScreen;
    if (m && !this.dragStart) {
      if (m.x < EDGE) dx -= 1;
      else if (m.x > cam.vw - EDGE) dx += 1;
      if (m.y < EDGE) dy -= 1;
      else if (m.y > cam.vh - EDGE) dy += 1;
    }
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy) || 1;
      cam.pan((dx / len) * EDGE_SPEED * dt, (dy / len) * EDGE_SPEED * dt);
    }
  }

  renderInput(): RenderInput {
    return {
      dragStart: this.dragStart,
      dragNow: this.dragNow,
      mouseWorld: this.mouseScreen ? this.game.camera.screenToWorld(this.mouseScreen) : null,
    };
  }
}
