import type { BuildingKind, EntityKind, Resources, Terrain, UnitKind } from "./types";

export const TILE = 36; // world pixels per tile
export const MAP_W = 56; // tiles
export const MAP_H = 44; // tiles
export const SIM_HZ = 30; // fixed simulation steps per second
export const SIM_DT = 1 / SIM_HZ;

export const START_RESOURCES: Resources = { food: 200, wood: 200, gold: 100, stone: 0 };
export const BASE_POP_CAP = 5;

// Palette — a warm, parchment / aged-map look (not the AI-default flat scheme).
export const COLORS = {
  bg: "#0e1413",
  grass: "#5c7d4f",
  grassAlt: "#688a58",
  forest: "#23402a",
  gold: "#d8a93a",
  stone: "#9aa3ad",
  water: "#2c5d77",
  waterAlt: "#27506a",
  grid: "rgba(15, 24, 20, 0.18)",
  player: "#3da5e0",
  playerDark: "#1f6f9e",
  enemy: "#d6533f",
  enemyDark: "#9c3526",
  neutral: "#c9b48a",
  selection: "#f5e6a8",
  hpGood: "#5fcf6a",
  hpBad: "#d6533f",
  parchment: "#e9dcc0",
  ink: "#1b211e",
} as const;

export interface UnitDef {
  name: string;
  cost: Partial<Resources>;
  trainTime: number; // seconds
  hp: number;
  speed: number; // world px/sec
  radius: number; // collision/render radius px
  damage?: number;
  range?: number; // px
  attackSpeed?: number; // seconds between hits
  aggro?: number; // auto-acquire radius px
}

export const UNIT_DEFS: Record<UnitKind, UnitDef> = {
  villager: {
    name: "Villager",
    cost: { food: 50 },
    trainTime: 6,
    hp: 40,
    speed: 70,
    radius: 9,
    damage: 3,
    range: 16,
    attackSpeed: 1.2,
    aggro: 0,
  },
  soldier: {
    name: "Soldier",
    cost: { food: 60, gold: 20 },
    trainTime: 9,
    hp: 100,
    speed: 64,
    radius: 11,
    damage: 12,
    range: 20,
    attackSpeed: 1.0,
    aggro: 150,
  },
};

export interface BuildingDef {
  name: string;
  cost: Partial<Resources>;
  buildTime: number; // seconds of villager work
  hp: number;
  footprint: number; // tiles per side
  trains?: UnitKind[];
  popProvided?: number;
  isDropOff?: boolean;
}

export const BUILDING_DEFS: Record<BuildingKind, BuildingDef> = {
  town_center: {
    name: "Town Center",
    cost: { wood: 350 },
    buildTime: 30,
    hp: 600,
    footprint: 3,
    trains: ["villager"],
    popProvided: 5,
    isDropOff: true,
  },
  house: {
    name: "House",
    cost: { wood: 30 },
    buildTime: 8,
    hp: 120,
    footprint: 1,
    popProvided: 5,
  },
  barracks: {
    name: "Barracks",
    cost: { wood: 150 },
    buildTime: 18,
    hp: 350,
    footprint: 2,
    trains: ["soldier"],
  },
};

// Gathering economy
export const GATHER_RATE = 0.7; // resource units per sim-tick while harvesting
export const CARRY_CAPACITY = 10;

export const RESOURCE_NODE_AMOUNT: Record<Exclude<Terrain, "grass" | "water">, number> = {
  forest: 120,
  gold: 220,
  stone: 180,
};

export const NODE_RESOURCE: Record<Exclude<Terrain, "grass" | "water">, "wood" | "gold" | "stone"> = {
  forest: "wood",
  gold: "gold",
  stone: "stone",
};

export function entityIsBuilding(kind: EntityKind): kind is BuildingKind {
  return kind === "town_center" || kind === "house" || kind === "barracks";
}
