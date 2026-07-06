import { Camera } from "./camera";
import {
  BASE_POP_CAP,
  BUILDING_DEFS,
  CARRY_CAPACITY,
  GATHER_RATE,
  NODE_RESOURCE,
  START_RESOURCES,
  TILE,
  UNIT_DEFS,
} from "./config";
import { Grid } from "./grid";
import { findPath } from "./pathfinding";
import type {
  BuildingKind,
  Entity,
  Owner,
  ResourceKind,
  ResourceNode,
  Resources,
  UnitKind,
  Vec2,
} from "./types";

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export interface GameSnapshot {
  resources: Resources;
  pop: number;
  popCap: number;
  selected: Entity[];
  placement: BuildingKind | null;
  message: string | null;
  time: number;
}

export class Game {
  grid = new Grid();
  camera = new Camera();
  entities = new Map<number, Entity>();
  resources: Resources = { ...START_RESOURCES };
  selected: number[] = [];
  placement: BuildingKind | null = null;
  time = 0;
  message: string | null = null;
  private messageTimer = 0;
  private nextId = 1;
  onChange: (() => void) | null = null;

  constructor() {
    this.seedWorld();
  }

  // ── lifecycle ──────────────────────────────────────────────
  private seedWorld(): void {
    const tc = this.addBuilding("town_center", { x: 4, y: 4 }, "player", true);
    this.camera.centerOn(tc.pos);

    // starting villagers around the town center
    const spots: Vec2[] = [
      { x: 8, y: 4 }, { x: 8, y: 5 }, { x: 8, y: 6 },
    ];
    for (const s of spots) this.addUnit("villager", Grid.tileCenter(s.x, s.y), "player");

    // a forward enemy outpost with marauders
    this.addBuilding("barracks", { x: 40, y: 22 }, "enemy", true);
    this.addUnit("soldier", Grid.tileCenter(38, 20), "enemy");
    this.addUnit("soldier", Grid.tileCenter(42, 24), "enemy");
    this.addUnit("soldier", Grid.tileCenter(39, 26), "enemy");
  }

  // ── factories ──────────────────────────────────────────────
  addUnit(kind: UnitKind, pos: Vec2, owner: Owner): Entity {
    const def = UNIT_DEFS[kind];
    const e: Entity = {
      id: this.nextId++,
      kind,
      category: "unit",
      owner,
      pos: { ...pos },
      tile: Grid.worldToTile(pos),
      hp: def.hp,
      maxHp: def.hp,
      selected: false,
      task: { type: "idle" },
      path: [],
      speed: def.speed,
      attackCooldown: 0,
    };
    this.entities.set(e.id, e);
    return e;
  }

  addBuilding(kind: BuildingKind, tile: Vec2, owner: Owner, complete: boolean): Entity {
    const def = BUILDING_DEFS[kind];
    const center: Vec2 = {
      x: tile.x * TILE + (def.footprint * TILE) / 2,
      y: tile.y * TILE + (def.footprint * TILE) / 2,
    };
    const e: Entity = {
      id: this.nextId++,
      kind,
      category: "building",
      owner,
      pos: center,
      tile: { ...tile },
      hp: complete ? def.hp : Math.max(1, def.hp * 0.05),
      maxHp: def.hp,
      selected: false,
      footprint: def.footprint,
      buildProgress: complete ? 1 : 0,
      trainQueue: [],
      rally: { x: center.x, y: center.y + def.footprint * TILE },
    };
    for (let y = tile.y; y < tile.y + def.footprint; y++) {
      for (let x = tile.x; x < tile.x + def.footprint; x++) this.grid.setOccupied(x, y, e.id);
    }
    this.entities.set(e.id, e);
    return e;
  }

  // ── economy helpers ────────────────────────────────────────
  get pop(): number {
    let n = 0;
    for (const e of this.entities.values()) if (e.owner === "player" && e.category === "unit") n++;
    return n;
  }

  get popCap(): number {
    let cap = BASE_POP_CAP;
    for (const e of this.entities.values()) {
      if (e.owner !== "player" || e.category !== "building" || (e.buildProgress ?? 0) < 1) continue;
      cap += BUILDING_DEFS[e.kind as BuildingKind].popProvided ?? 0;
    }
    return Math.min(cap, 60);
  }

  private affordable(cost: Partial<Resources>): boolean {
    return (Object.entries(cost) as [ResourceKind, number][]).every(
      ([k, v]) => this.resources[k] >= v,
    );
  }

  private pay(cost: Partial<Resources>): void {
    for (const [k, v] of Object.entries(cost) as [ResourceKind, number][]) this.resources[k] -= v;
  }

  private notify(msg: string): void {
    this.message = msg;
    this.messageTimer = 2.5;
    this.onChange?.();
  }

  // ── commands (from input / HUD) ────────────────────────────
  trainFromSelected(unit: UnitKind): void {
    const building = this.selectedEntities().find(
      (e) => e.category === "building" && e.owner === "player" && (e.buildProgress ?? 0) >= 1 &&
        (BUILDING_DEFS[e.kind as BuildingKind].trains ?? []).includes(unit),
    );
    if (!building) return;
    const def = UNIT_DEFS[unit];
    if (!this.affordable(def.cost)) return this.notify(`Need more ${lacking(this.resources, def.cost)}`);
    this.pay(def.cost);
    building.trainQueue!.push({ unit, remaining: def.trainTime, total: def.trainTime });
    this.onChange?.();
  }

  enterPlacement(kind: BuildingKind): void {
    if (!this.selectedEntities().some((e) => e.kind === "villager" && e.owner === "player")) {
      return this.notify("Select a villager to build");
    }
    const def = BUILDING_DEFS[kind];
    if (!this.affordable(def.cost)) return this.notify(`Need more ${lacking(this.resources, def.cost)}`);
    this.placement = kind;
    this.onChange?.();
  }

  cancelPlacement(): void {
    this.placement = null;
    this.onChange?.();
  }

  tryPlaceAt(world: Vec2): boolean {
    if (!this.placement) return false;
    const def = BUILDING_DEFS[this.placement];
    const tile = Grid.worldToTile(world);
    const tx = tile.x - Math.floor(def.footprint / 2);
    const ty = tile.y - Math.floor(def.footprint / 2);
    if (!this.grid.areaFree(tx, ty, def.footprint)) {
      this.notify("Can't build there");
      return false;
    }
    if (!this.affordable(def.cost)) {
      this.notify(`Need more ${lacking(this.resources, def.cost)}`);
      this.placement = null;
      return false;
    }
    this.pay(def.cost);
    const foundation = this.addBuilding(this.placement, { x: tx, y: ty }, "player", false);
    const builders = this.selectedEntities().filter((e) => e.kind === "villager" && e.owner === "player");
    for (const b of builders) this.assignBuild(b, foundation);
    this.placement = null;
    this.onChange?.();
    return true;
  }

  /** Right-click contextual order for the current selection. */
  commandAt(world: Vec2): void {
    const own = this.selectedEntities().filter((e) => e.owner === "player" && e.category === "unit");
    if (own.length === 0) return;

    const enemy = this.entityAtWorld(world, (e) => e.owner === "enemy");
    const tile = Grid.worldToTile(world);
    const nodeIdx = this.grid.nodeIndexAt(tile.x, tile.y);

    own.forEach((u, i) => {
      if (enemy) {
        u.task = { type: "attack", target: enemy.id };
        u.path = [];
      } else if (nodeIdx >= 0 && u.kind === "villager" && this.grid.nodes[nodeIdx].amount > 0) {
        this.assignGather(u, this.grid.nodes[nodeIdx]);
      } else {
        const spread = formationOffset(i, own.length);
        const dest = { x: world.x + spread.x, y: world.y + spread.y };
        this.moveUnit(u, dest);
      }
    });
    this.onChange?.();
  }

  setRallyForSelected(world: Vec2): void {
    for (const e of this.selectedEntities()) {
      if (e.category === "building" && e.owner === "player") e.rally = { ...world };
    }
  }

  // ── selection ──────────────────────────────────────────────
  clearSelection(): void {
    for (const id of this.selected) {
      const e = this.entities.get(id);
      if (e) e.selected = false;
    }
    this.selected = [];
  }

  selectAtPoint(world: Vec2, additive: boolean): void {
    const e = this.entityAtWorld(world, () => true);
    if (!additive) this.clearSelection();
    if (e) {
      e.selected = true;
      if (!this.selected.includes(e.id)) this.selected.push(e.id);
    }
    this.onChange?.();
  }

  selectInRect(a: Vec2, b: Vec2, additive: boolean): void {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (!additive) this.clearSelection();
    let pickedUnit = false;
    for (const e of this.entities.values()) {
      if (e.owner !== "player" || e.category !== "unit") continue;
      if (e.pos.x >= minX && e.pos.x <= maxX && e.pos.y >= minY && e.pos.y <= maxY) {
        e.selected = true;
        if (!this.selected.includes(e.id)) this.selected.push(e.id);
        pickedUnit = true;
      }
    }
    // if the box caught no units, fall back to single building under the start point
    if (!pickedUnit) this.selectAtPoint(a, additive);
    else this.onChange?.();
  }

  selectedEntities(): Entity[] {
    return this.selected.map((id) => this.entities.get(id)).filter((e): e is Entity => !!e);
  }

  selectNextIdleVillager(reverse = false): boolean {
    const idleVillagers = [...this.entities.values()]
      .filter((e) => e.owner === "player" && e.kind === "villager" && e.task?.type === "idle")
      .sort((a, b) => a.id - b.id);
    if (idleVillagers.length === 0) {
      this.notify("No idle villagers");
      return false;
    }

    const currentIdleIndex = idleVillagers.findIndex((e) => e.selected);
    let nextIndex = reverse ? idleVillagers.length - 1 : 0;
    if (currentIdleIndex >= 0) {
      nextIndex = (currentIdleIndex + (reverse ? -1 : 1) + idleVillagers.length) % idleVillagers.length;
    }
    const next = idleVillagers[nextIndex];
    this.clearSelection();
    next.selected = true;
    this.selected = [next.id];
    this.camera.centerOn(next.pos);
    this.onChange?.();
    return true;
  }

  selectPrimaryTownCenter(): boolean {
    const townCenter = [...this.entities.values()]
      .filter((e) => e.owner === "player" && e.kind === "town_center")
      .sort((a, b) => a.id - b.id)[0];
    if (!townCenter) {
      this.notify("No Town Center");
      return false;
    }

    this.clearSelection();
    townCenter.selected = true;
    this.selected = [townCenter.id];
    this.camera.centerOn(townCenter.pos);
    this.onChange?.();
    return true;
  }

  // ── movement / tasks ───────────────────────────────────────
  private moveUnit(u: Entity, dest: Vec2): void {
    const start = Grid.worldToTile(u.pos);
    const goal = Grid.worldToTile(dest);
    const path = findPath(this.grid, start, goal, false);
    if (path.length === 0) {
      u.task = { type: "idle" };
      u.path = [];
      return;
    }
    path[path.length - 1] = { ...dest };
    u.path = path;
    u.task = { type: "move", target: { ...dest } };
  }

  private assignGather(u: Entity, node: ResourceNode): void {
    u.task = { type: "gather", node: node.id, phase: "to_node" };
    const adj = this.adjacentFreeTile(node.tile);
    u.path = findPath(this.grid, Grid.worldToTile(u.pos), adj, false);
  }

  private assignBuild(u: Entity, building: Entity): void {
    u.task = { type: "build", building: building.id };
    const adj = this.adjacentFreeTile(building.tile, building.footprint ?? 1);
    u.path = findPath(this.grid, Grid.worldToTile(u.pos), adj, true);
  }

  private adjacentFreeTile(tile: Vec2, size = 1): Vec2 {
    for (let r = 1; r <= 3; r++) {
      for (let y = tile.y - r; y < tile.y + size + r; y++) {
        for (let x = tile.x - r; x < tile.x + size + r; x++) {
          if (!this.grid.isBlocked(x, y)) return { x, y };
        }
      }
    }
    return { x: tile.x, y: tile.y + size };
  }

  private nearestDropOff(from: Vec2): Entity | null {
    let best: Entity | null = null;
    let bestD = Infinity;
    for (const e of this.entities.values()) {
      if (e.owner !== "player" || e.category !== "building" || (e.buildProgress ?? 0) < 1) continue;
      if (!BUILDING_DEFS[e.kind as BuildingKind].isDropOff) continue;
      const d = dist(from, e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // ── per-frame update (fixed dt) ────────────────────────────
  update(dt: number): void {
    this.time += dt;
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) { this.message = null; this.onChange?.(); }
    }
    for (const e of [...this.entities.values()]) {
      if (e.category === "unit") this.updateUnit(e, dt);
      else this.updateBuilding(e, dt);
    }
  }

  private followPath(u: Entity, dt: number): boolean {
    if (!u.path || u.path.length === 0) return true;
    const next = u.path[0];
    const d = dist(u.pos, next);
    const step = (u.speed ?? 60) * dt;
    if (d <= step) {
      u.pos = { ...next };
      u.path.shift();
      return u.path.length === 0;
    }
    u.pos = { x: u.pos.x + ((next.x - u.pos.x) / d) * step, y: u.pos.y + ((next.y - u.pos.y) / d) * step };
    u.tile = Grid.worldToTile(u.pos);
    return false;
  }

  private updateUnit(u: Entity, dt: number): void {
    if (u.attackCooldown && u.attackCooldown > 0) u.attackCooldown -= dt;
    const task = u.task ?? { type: "idle" };

    switch (task.type) {
      case "idle": {
        this.maybeAutoAttack(u);
        break;
      }
      case "move": {
        if (this.followPath(u, dt)) u.task = { type: "idle" };
        break;
      }
      case "gather": {
        this.updateGather(u, task.node, dt);
        break;
      }
      case "build": {
        this.updateBuild(u, task.building, dt);
        break;
      }
      case "attack": {
        this.updateAttack(u, task.target, dt);
        break;
      }
    }
  }

  private updateGather(u: Entity, nodeId: number, dt: number): void {
    const node = this.grid.nodes[nodeId];
    const task = u.task as Extract<NonNullable<Entity["task"]>, { type: "gather" }>;
    if (!node || (node.amount <= 0 && !(u.carrying && u.carrying.amount > 0))) {
      const next = this.findNearbyNode(u.pos, node?.kind);
      if (next) this.assignGather(u, next);
      else u.task = { type: "idle" };
      return;
    }

    if (task.phase === "to_node") {
      if (this.followPath(u, dt) || this.isAdjacentToTile(u, node.tile)) task.phase = "harvest";
      return;
    }

    if (task.phase === "harvest") {
      const res = NODE_RESOURCE[node.kind];
      u.carrying ??= { kind: res, amount: 0 };
      const take = Math.min(GATHER_RATE, node.amount, CARRY_CAPACITY - u.carrying.amount);
      u.carrying.amount += take;
      node.amount -= take;
      if (u.carrying.amount >= CARRY_CAPACITY || node.amount <= 0) {
        const drop = this.nearestDropOff(u.pos);
        if (!drop) { task.phase = "harvest"; return; }
        task.phase = "to_drop";
        u.path = findPath(this.grid, Grid.worldToTile(u.pos), this.adjacentFreeTile(drop.tile, drop.footprint ?? 1), true);
      }
      return;
    }

    // to_drop
    const drop = this.nearestDropOff(u.pos);
    if (!drop) { u.task = { type: "idle" }; return; }
    if (this.followPath(u, dt) || this.isAdjacentToTile(u, drop.tile, drop.footprint ?? 1)) {
      if (u.carrying) {
        this.resources[u.carrying.kind] += Math.round(u.carrying.amount);
        u.carrying = undefined;
        this.onChange?.();
      }
      if (node.amount > 0) {
        task.phase = "to_node";
        u.path = findPath(this.grid, Grid.worldToTile(u.pos), this.adjacentFreeTile(node.tile), false);
      } else {
        const next = this.findNearbyNode(u.pos, node.kind);
        if (next) this.assignGather(u, next);
        else u.task = { type: "idle" };
      }
    }
  }

  private updateBuild(u: Entity, buildingId: number, dt: number): void {
    const b = this.entities.get(buildingId);
    if (!b || (b.buildProgress ?? 1) >= 1) { u.task = { type: "idle" }; return; }
    if (!this.followPath(u, dt) && !this.isAdjacentToTile(u, b.tile, b.footprint ?? 1)) return;
    const def = BUILDING_DEFS[b.kind as BuildingKind];
    b.buildProgress = Math.min(1, (b.buildProgress ?? 0) + dt / def.buildTime);
    b.hp = Math.max(1, def.hp * (0.05 + 0.95 * b.buildProgress));
    if (b.buildProgress >= 1) { b.hp = def.hp; u.task = { type: "idle" }; this.onChange?.(); }
  }

  private updateAttack(u: Entity, targetId: number, dt: number): void {
    const t = this.entities.get(targetId);
    const def = UNIT_DEFS[u.kind as UnitKind];
    if (!t || t.hp <= 0) { u.task = { type: "idle" }; u.path = []; return; }
    const range = (def.range ?? 16) + (t.footprint ? (t.footprint * TILE) / 2 : 0);
    if (dist(u.pos, t.pos) > range) {
      // close the distance; re-path periodically
      if (!u.path || u.path.length === 0) {
        u.path = findPath(this.grid, Grid.worldToTile(u.pos), Grid.worldToTile(t.pos), true);
      }
      this.followPath(u, dt);
      return;
    }
    u.path = [];
    if ((u.attackCooldown ?? 0) <= 0) {
      t.hp -= def.damage ?? 5;
      u.attackCooldown = def.attackSpeed ?? 1;
      if (t.hp <= 0) this.killEntity(t);
    }
  }

  private maybeAutoAttack(u: Entity): void {
    const def = UNIT_DEFS[u.kind as UnitKind];
    const aggro = def.aggro ?? 0;
    if (aggro <= 0) return;
    let best: Entity | null = null;
    let bestD = aggro;
    for (const e of this.entities.values()) {
      if (e.owner === u.owner || e.owner === "neutral" || e.hp <= 0) continue;
      const d = dist(u.pos, e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) { u.task = { type: "attack", target: best.id }; }
  }

  private updateBuilding(b: Entity, dt: number): void {
    if ((b.buildProgress ?? 1) < 1) return;
    const q = b.trainQueue;
    if (!q || q.length === 0) return;
    if (b.owner === "player" && this.pop >= this.popCap) {
      if (this.messageTimer <= 0) this.notify("Build houses for more population");
      return;
    }
    const order = q[0];
    order.remaining -= dt;
    if (order.remaining <= 0) {
      q.shift();
      const spawnTile = this.adjacentFreeTile(b.tile, b.footprint ?? 1);
      const unit = this.addUnit(order.unit, Grid.tileCenter(spawnTile.x, spawnTile.y), b.owner);
      if (b.rally) this.moveUnit(unit, b.rally);
      this.onChange?.();
    }
  }

  private killEntity(e: Entity): void {
    if (e.category === "building" && e.footprint) {
      for (let y = e.tile.y; y < e.tile.y + e.footprint; y++) {
        for (let x = e.tile.x; x < e.tile.x + e.footprint; x++) this.grid.clearOccupied(x, y);
      }
    }
    e.hp = 0;
    e.selected = false;
    this.selected = this.selected.filter((id) => id !== e.id);
    this.entities.delete(e.id);
    this.onChange?.();
  }

  // ── lookups ────────────────────────────────────────────────
  private entityAtWorld(world: Vec2, pred: (e: Entity) => boolean): Entity | undefined {
    let found: Entity | undefined;
    let bestD = Infinity;
    for (const e of this.entities.values()) {
      if (!pred(e)) continue;
      let hit = false;
      let d = Infinity;
      if (e.category === "building" && e.footprint) {
        const x0 = e.tile.x * TILE;
        const y0 = e.tile.y * TILE;
        const x1 = x0 + e.footprint * TILE;
        const y1 = y0 + e.footprint * TILE;
        hit = world.x >= x0 && world.x <= x1 && world.y >= y0 && world.y <= y1;
        d = dist(world, e.pos);
      } else {
        d = dist(world, e.pos);
        hit = d <= (UNIT_DEFS[e.kind as UnitKind]?.radius ?? 12) + 4;
      }
      if (hit && d < bestD) { bestD = d; found = e; }
    }
    return found;
  }

  private isAdjacentToTile(u: Entity, tile: Vec2, size = 1): boolean {
    const ut = Grid.worldToTile(u.pos);
    return (
      ut.x >= tile.x - 1 && ut.x <= tile.x + size && ut.y >= tile.y - 1 && ut.y <= tile.y + size
    );
  }

  private findNearbyNode(from: Vec2, kind?: ResourceNode["kind"]): ResourceNode | null {
    let best: ResourceNode | null = null;
    let bestD = 8 * TILE;
    for (const n of this.grid.nodes) {
      if (n.amount <= 0) continue;
      if (kind && n.kind !== kind) continue;
      const d = dist(from, Grid.tileCenter(n.tile.x, n.tile.y));
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }

  snapshot(): GameSnapshot {
    return {
      resources: { ...this.resources },
      pop: this.pop,
      popCap: this.popCap,
      selected: this.selectedEntities(),
      placement: this.placement,
      message: this.message,
      time: this.time,
    };
  }
}

function lacking(have: Resources, cost: Partial<Resources>): string {
  return (Object.entries(cost) as [ResourceKind, number][])
    .filter(([k, v]) => have[k] < v)
    .map(([k]) => k)
    .join(" & ");
}

function formationOffset(i: number, total: number): Vec2 {
  if (total <= 1) return { x: 0, y: 0 };
  const perRow = Math.ceil(Math.sqrt(total));
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const gap = TILE * 0.9;
  return { x: (col - (perRow - 1) / 2) * gap, y: (row - (perRow - 1) / 2) * gap };
}
