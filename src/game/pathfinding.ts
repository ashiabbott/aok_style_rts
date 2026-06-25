import { Grid } from "./grid";
import type { Vec2 } from "./types";

interface Node {
  i: number;
  g: number;
  f: number;
}

/**
 * A* over the tile grid (4/8-connected, no corner cutting). Returns a list of
 * tile-center world points, or an empty array if unreachable. `goalOverride`
 * lets a tile be treated as passable (e.g. walking onto a building's rally tile).
 */
export function findPath(
  grid: Grid,
  startTile: Vec2,
  goalTile: Vec2,
  allowGoalBlocked = false,
): Vec2[] {
  const w = grid.w;
  const startI = startTile.y * w + startTile.x;
  const goalI = goalTile.y * w + goalTile.x;
  if (startI === goalI) return [];

  const blocked = (tx: number, ty: number): boolean => {
    if (allowGoalBlocked && tx === goalTile.x && ty === goalTile.y) return false;
    return grid.isBlocked(tx, ty);
  };

  // If the goal itself is blocked and not allowed, find nearest free neighbour.
  let target = goalI;
  if (blocked(goalTile.x, goalTile.y)) {
    const alt = nearestFree(grid, goalTile);
    if (alt < 0) return [];
    target = alt;
  }

  const open: Node[] = [{ i: startI, g: 0, f: heuristic(startI, target, w) }];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>([[startI, 0]]);
  const closed = new Set<number>();
  let iterations = 0;
  const maxIter = w * grid.h * 4;

  while (open.length > 0 && iterations++ < maxIter) {
    // pop lowest f (linear scan; map is small enough for a starter)
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[bi].f) bi = k;
    const current = open.splice(bi, 1)[0];
    if (current.i === target) return reconstruct(came, current.i, w);
    closed.add(current.i);

    const cx = current.i % w;
    const cy = Math.floor(current.i / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!grid.inBounds(nx, ny)) continue;
        if (blocked(nx, ny)) continue;
        // prevent diagonal corner cutting
        if (dx !== 0 && dy !== 0) {
          if (blocked(cx + dx, cy) || blocked(cx, cy + dy)) continue;
        }
        const ni = ny * w + nx;
        if (closed.has(ni)) continue;
        const step = dx !== 0 && dy !== 0 ? 1.41421356 : 1;
        const tentative = (gScore.get(current.i) ?? Infinity) + step;
        if (tentative < (gScore.get(ni) ?? Infinity)) {
          came.set(ni, current.i);
          gScore.set(ni, tentative);
          const f = tentative + heuristic(ni, target, w);
          const existing = open.find((n) => n.i === ni);
          if (existing) {
            existing.g = tentative;
            existing.f = f;
          } else {
            open.push({ i: ni, g: tentative, f });
          }
        }
      }
    }
  }
  return [];
}

function heuristic(a: number, b: number, w: number): number {
  const ax = a % w;
  const ay = Math.floor(a / w);
  const bx = b % w;
  const by = Math.floor(b / w);
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return (dx + dy) + (1.41421356 - 2) * Math.min(dx, dy);
}

function reconstruct(came: Map<number, number>, end: number, w: number): Vec2[] {
  const out: Vec2[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    out.push(Grid.tileCenter(cur % w, Math.floor(cur / w)));
    cur = came.get(cur);
  }
  out.reverse();
  out.shift(); // drop the start tile
  return out;
}

function nearestFree(grid: Grid, goal: Vec2): number {
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = goal.x + dx;
        const ny = goal.y + dy;
        if (grid.inBounds(nx, ny) && !grid.isBlocked(nx, ny)) return ny * grid.w + nx;
      }
    }
  }
  return -1;
}
