import { BUILDING_DEFS, COLORS, MAP_H, MAP_W, TILE, UNIT_DEFS } from "./config";
import { Grid } from "./grid";
import type { Game } from "./game";
import type { Entity, Vec2 } from "./types";

export interface RenderInput {
  dragStart: Vec2 | null; // screen coords
  dragNow: Vec2 | null; // screen coords
  mouseWorld: Vec2 | null;
}

const MINIMAP = { w: 200, h: 156, pad: 12 };

export function render(ctx: CanvasRenderingContext2D, game: Game, input: RenderInput): void {
  const { camera } = game;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, camera.vw, camera.vh);

  drawTerrain(ctx, game);
  drawEntities(ctx, game);
  drawPlacement(ctx, game, input.mouseWorld);
  drawDragBox(ctx, input);
  drawMinimap(ctx, game);
}

function drawTerrain(ctx: CanvasRenderingContext2D, game: Game): void {
  const { camera, grid } = game;
  const tl = camera.screenToWorld({ x: 0, y: 0 });
  const br = camera.screenToWorld({ x: camera.vw, y: camera.vh });
  const x0 = Math.max(0, Math.floor(tl.x / TILE));
  const y0 = Math.max(0, Math.floor(tl.y / TILE));
  const x1 = Math.min(MAP_W - 1, Math.ceil(br.x / TILE));
  const y1 = Math.min(MAP_H - 1, Math.ceil(br.y / TILE));
  const z = camera.zoom;
  const size = TILE * z;

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const s = camera.worldToScreen({ x: tx * TILE, y: ty * TILE });
      const t = grid.terrainAt(tx, ty);
      ctx.fillStyle =
        t === "water"
          ? (tx + ty) % 2 === 0 ? COLORS.water : COLORS.waterAlt
          : (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
      ctx.fillRect(s.x, s.y, size + 1, size + 1);

      if (t === "forest") drawForest(ctx, s, size);
      else if (t === "gold") drawMineral(ctx, s, size, COLORS.gold);
      else if (t === "stone") drawMineral(ctx, s, size, COLORS.stone);
    }
  }

  // subtle grid
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let tx = x0; tx <= x1 + 1; tx++) {
    const s = camera.worldToScreen({ x: tx * TILE, y: y0 * TILE });
    const e = camera.worldToScreen({ x: tx * TILE, y: (y1 + 1) * TILE });
    ctx.moveTo(Math.round(s.x), s.y);
    ctx.lineTo(Math.round(e.x), e.y);
  }
  for (let ty = y0; ty <= y1 + 1; ty++) {
    const s = camera.worldToScreen({ x: x0 * TILE, y: ty * TILE });
    const e = camera.worldToScreen({ x: (x1 + 1) * TILE, y: ty * TILE });
    ctx.moveTo(s.x, Math.round(s.y));
    ctx.lineTo(e.x, Math.round(e.y));
  }
  ctx.stroke();
}

function drawForest(ctx: CanvasRenderingContext2D, s: Vec2, size: number): void {
  ctx.fillStyle = COLORS.forest;
  ctx.fillRect(s.x, s.y, size + 1, size + 1);
  ctx.fillStyle = "#2f5736";
  const r = size * 0.16;
  for (const [ox, oy] of [[0.3, 0.35], [0.65, 0.45], [0.45, 0.7]]) {
    ctx.beginPath();
    ctx.arc(s.x + size * ox, s.y + size * oy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMineral(ctx: CanvasRenderingContext2D, s: Vec2, size: number, color: string): void {
  ctx.fillStyle = "#3a3326";
  ctx.fillRect(s.x, s.y, size + 1, size + 1);
  ctx.fillStyle = color;
  for (const [ox, oy] of [[0.32, 0.36], [0.62, 0.4], [0.46, 0.66]]) {
    ctx.beginPath();
    ctx.arc(s.x + size * ox, s.y + size * oy, size * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
}

function ownerColors(e: Entity): { main: string; dark: string } {
  if (e.owner === "player") return { main: COLORS.player, dark: COLORS.playerDark };
  if (e.owner === "enemy") return { main: COLORS.enemy, dark: COLORS.enemyDark };
  return { main: COLORS.neutral, dark: "#9a875f" };
}

function drawEntities(ctx: CanvasRenderingContext2D, game: Game): void {
  const { camera } = game;
  const z = camera.zoom;
  const buildings: Entity[] = [];
  const units: Entity[] = [];
  for (const e of game.entities.values()) (e.category === "building" ? buildings : units).push(e);

  for (const b of buildings) {
    const def = BUILDING_DEFS[b.kind as keyof typeof BUILDING_DEFS];
    const s = camera.worldToScreen({ x: b.tile.x * TILE, y: b.tile.y * TILE });
    const px = def.footprint * TILE * z;
    const c = ownerColors(b);
    const progress = b.buildProgress ?? 1;

    ctx.fillStyle = progress < 1 ? "rgba(60,70,60,0.65)" : c.dark;
    ctx.fillRect(s.x + 2, s.y + 2, px - 4, px - 4);
    ctx.fillStyle = progress < 1 ? "rgba(120,140,120,0.45)" : c.main;
    ctx.fillRect(s.x + 2, s.y + 2, px - 4, (px - 4) * (progress < 1 ? progress : 1));

    // roof accent
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(s.x + 2, s.y + 2, px - 4, Math.max(4, px * 0.16));

    if (b.selected) {
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x, s.y, px, px);
    }
    drawLabel(ctx, def.name, s.x + px / 2, s.y - 4, z);
    if (b.hp < b.maxHp) drawHpBar(ctx, s.x + 2, s.y - 6, px - 4, b.hp / b.maxHp);
  }

  for (const u of units) {
    const def = UNIT_DEFS[u.kind as keyof typeof UNIT_DEFS];
    const s = camera.worldToScreen(u.pos);
    const r = def.radius * z;
    const c = ownerColors(u);

    if (u.selected) {
      ctx.strokeStyle = COLORS.selection;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y + r * 0.4, r + 4, (r + 4) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = c.dark;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.main;
    ctx.beginPath();
    ctx.arc(s.x, s.y - r * 0.18, r * 0.7, 0, Math.PI * 2);
    ctx.fill();

    if (u.kind === "soldier") {
      ctx.strokeStyle = "#e9e2cf";
      ctx.lineWidth = Math.max(1.5, 2 * z);
      ctx.beginPath();
      ctx.moveTo(s.x + r * 0.6, s.y - r);
      ctx.lineTo(s.x + r * 0.6, s.y + r);
      ctx.stroke();
    }
    if (u.carrying && u.carrying.amount > 0) {
      ctx.fillStyle = u.carrying.kind === "wood" ? "#7d5a32" : u.carrying.kind === "gold" ? COLORS.gold : COLORS.stone;
      ctx.fillRect(s.x - 3 * z, s.y - r - 6 * z, 6 * z, 5 * z);
    }
    if (u.hp < u.maxHp) drawHpBar(ctx, s.x - r, s.y - r - 6, r * 2, u.hp / u.maxHp);
  }
}

function drawHpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number): void {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = frac > 0.4 ? COLORS.hpGood : COLORS.hpBad;
  ctx.fillRect(x, y, w * Math.max(0, frac), 3);
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, z: number): void {
  if (z < 0.7) return;
  ctx.font = "600 11px ui-sans-serif, system-ui";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillText(text, cx + 1, y + 1);
  ctx.fillStyle = COLORS.parchment;
  ctx.fillText(text, cx, y);
  ctx.textAlign = "left";
}

function drawPlacement(ctx: CanvasRenderingContext2D, game: Game, mouseWorld: Vec2 | null): void {
  if (!game.placement || !mouseWorld) return;
  const def = BUILDING_DEFS[game.placement];
  const tile = Grid.worldToTile(mouseWorld);
  const tx = tile.x - Math.floor(def.footprint / 2);
  const ty = tile.y - Math.floor(def.footprint / 2);
  const ok = game.grid.areaFree(tx, ty, def.footprint);
  const s = game.camera.worldToScreen({ x: tx * TILE, y: ty * TILE });
  const px = def.footprint * TILE * game.camera.zoom;
  ctx.fillStyle = ok ? "rgba(95,207,106,0.35)" : "rgba(214,83,63,0.4)";
  ctx.fillRect(s.x, s.y, px, px);
  ctx.strokeStyle = ok ? COLORS.hpGood : COLORS.hpBad;
  ctx.lineWidth = 2;
  ctx.strokeRect(s.x, s.y, px, px);
}

function drawDragBox(ctx: CanvasRenderingContext2D, input: RenderInput): void {
  if (!input.dragStart || !input.dragNow) return;
  const x = Math.min(input.dragStart.x, input.dragNow.x);
  const y = Math.min(input.dragStart.y, input.dragNow.y);
  const w = Math.abs(input.dragStart.x - input.dragNow.x);
  const h = Math.abs(input.dragStart.y - input.dragNow.y);
  if (w < 3 && h < 3) return;
  ctx.fillStyle = "rgba(245,230,168,0.12)";
  ctx.strokeStyle = COLORS.selection;
  ctx.lineWidth = 1.5;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
}

function drawMinimap(ctx: CanvasRenderingContext2D, game: Game): void {
  const { camera } = game;
  const mx = camera.vw - MINIMAP.w - MINIMAP.pad;
  const my = camera.vh - MINIMAP.h - MINIMAP.pad;
  const sx = MINIMAP.w / (MAP_W * TILE);
  const sy = MINIMAP.h / (MAP_H * TILE);

  ctx.save();
  ctx.fillStyle = "rgba(10,16,14,0.85)";
  ctx.fillRect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8);
  ctx.strokeStyle = "rgba(233,220,192,0.4)";
  ctx.strokeRect(mx - 4, my - 4, MINIMAP.w + 8, MINIMAP.h + 8);

  // terrain (sampled)
  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = 0; tx < MAP_W; tx += 1) {
      const t = game.grid.terrainAt(tx, ty);
      if (t === "grass") continue;
      ctx.fillStyle =
        t === "water" ? COLORS.water : t === "forest" ? COLORS.forest : t === "gold" ? COLORS.gold : COLORS.stone;
      ctx.fillRect(mx + tx * TILE * sx, my + ty * TILE * sy, Math.ceil(TILE * sx), Math.ceil(TILE * sy));
    }
  }

  for (const e of game.entities.values()) {
    const c = ownerColors(e);
    ctx.fillStyle = c.main;
    const r = e.category === "building" ? 3 : 2;
    ctx.fillRect(mx + e.pos.x * sx - r / 2, my + e.pos.y * sy - r / 2, r, r);
  }

  // viewport rect
  ctx.strokeStyle = COLORS.parchment;
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mx + camera.x * sx,
    my + camera.y * sy,
    (camera.vw / camera.zoom) * sx,
    (camera.vh / camera.zoom) * sy,
  );
  ctx.restore();
}

export function minimapRect(camera: { vw: number; vh: number }): { x: number; y: number; w: number; h: number } {
  return {
    x: camera.vw - MINIMAP.w - MINIMAP.pad,
    y: camera.vh - MINIMAP.h - MINIMAP.pad,
    w: MINIMAP.w,
    h: MINIMAP.h,
  };
}
