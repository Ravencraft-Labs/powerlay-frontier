import type { ResourceId } from "../mining/types.js";

/** Stripped type from data/stripped/types.json (one locale, no descriptions). */
export interface StrippedType {
  typeID: number;
  name: string;
  groupID: number;
  mass: number;
  volume: number;
  basePrice: number;
  portionSize: number;
  published?: number;
  capacity?: number;
  radius?: number;
  /** Set by the game data loader for types whose groupID is in oreGroupIDs (mineable ore). */
  isOre?: boolean;
  /** Set by the loader from ore_hints.json: asteroid kinds carrying this ore, richest first (e.g. ["Pitch", "Mire"]). */
  oreAsteroids?: string[];
  /** Set by the loader from ore_hints.json: the ore description's location sentence(s). */
  oreHint?: string;
  [key: string]: unknown;
}

/** Blueprint entry; loaded from data/raw/industry_blueprints.json (transformed to this shape by electron-shell). */
export interface BlueprintMaterial {
  typeID: number;
  quantity: number;
}
export interface BlueprintProduct {
  typeID: number;
  quantity: number;
}
export interface BlueprintManufacturing {
  materials: BlueprintMaterial[];
  products: BlueprintProduct[];
  time: number;
}
export interface Blueprint {
  blueprintTypeID: number;
  activities: {
    manufacturing?: BlueprintManufacturing;
  };
  maxProductionLimit?: number;
}

export type TypesMap = Record<string, StrippedType>;
export type BlueprintsMap = Record<string, Blueprint>;

/** @deprecated Use string – facility types are now derived from industry_facilities.json */
export type FacilityType = "Printer S" | "Printer M";
export type LaserType = "Small Cutting Laser" | "Medium Cutting Laser";

export interface Facility {
  type: string;
  count: number;
}

/** typeID is primary when using game data; itemId is legacy / display fallback. blueprintTypeID overrides which blueprint to use (else optimized). */
export interface PlannedItem {
  typeID?: number;
  itemId?: string;
  quantity: number;
  blueprintTypeID?: number;
}

export interface Laser {
  type: LaserType;
  amount: number;
}

export interface BuildPlan {
  id: string;
  name: string;
  starSystemId?: string;
  facilities: Facility[];
  plannedItems: PlannedItem[];
  lasers: Laser[];
  /** Path -> blueprintTypeID for intermediate nodes (path e.g. "0/82426", "0/82426/78417"). */
  intermediateBlueprintOverrides?: Record<string, number>;
  /** Free build: track the planned items by hand as one step (no mining, no recipe steps). */
  freeTracking?: boolean;
  updatedAt: number;
}

/** Ore required per unit of product (fictional). */
export type ItemOreTable = Record<string, Partial<Record<ResourceId, number>>>;
