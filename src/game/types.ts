export interface Vec2 {
  x: number;
  y: number;
}

export type Terrain = "grass" | "forest" | "gold" | "stone" | "water";

export type ResourceKind = "food" | "wood" | "gold" | "stone";

export type Resources = Record<ResourceKind, number>;

export type Owner = "player" | "enemy" | "neutral";

export type UnitKind = "villager" | "soldier";
export type BuildingKind = "town_center" | "house" | "barracks";
export type EntityKind = UnitKind | BuildingKind;

export type UnitTask =
  | { type: "idle" }
  | { type: "move"; target: Vec2 }
  | { type: "gather"; node: number; phase: "to_node" | "harvest" | "to_drop" }
  | { type: "build"; building: number }
  | { type: "attack"; target: number };

export interface Entity {
  id: number;
  kind: EntityKind;
  category: "unit" | "building";
  owner: Owner;
  pos: Vec2; // world pixels (center)
  tile: Vec2; // tile coords (for buildings, top-left tile)
  hp: number;
  maxHp: number;
  selected: boolean;

  // unit-only
  task?: UnitTask;
  path?: Vec2[];
  speed?: number;
  carrying?: { kind: ResourceKind; amount: number };
  attackCooldown?: number;

  // building-only
  footprint?: number; // tiles per side
  buildProgress?: number; // 0..1, 1 = complete
  trainQueue?: TrainOrder[];
  rally?: Vec2;
}

export interface TrainOrder {
  unit: UnitKind;
  remaining: number; // seconds left
  total: number;
}

export interface ResourceNode {
  id: number;
  kind: Exclude<Terrain, "grass" | "water">; // forest | gold | stone
  tile: Vec2;
  amount: number;
  maxAmount: number;
}
