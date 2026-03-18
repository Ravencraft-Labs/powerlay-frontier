import { app } from "electron";
import fs from "fs";
import path from "path";
import type { TypesMap, BlueprintsMap } from "@powerlay/core";

export interface GameDataErrors {
  types?: string;
  blueprints?: string;
  oreGroupIDs?: string;
}

export interface GameData {
  types: TypesMap;
  blueprints: BlueprintsMap;
  starSystems: string[];
  /** blueprintTypeID -> comma-separated facility names (e.g. "Printer S, Portable Printer") */
  blueprintToFacilityNames: Record<number, string>;
  /** Facility type names from industry_facilities (e.g. "Printer S", "Portable Refinery") */
  facilityTypeNames: string[];
  /** groupIDs for mineable ores (from data/stripped/oreGroupIDs.json). Empty = no filtering. */
  oreGroupIDs: number[];
  errors?: GameDataErrors;
}

/** Raw entry from data/raw/industry_blueprints.json */
interface IndustryBlueprintRaw {
  inputs: Array<{ typeID: number; quantity: number }>;
  outputs: Array<{ typeID: number; quantity: number }>;
  primaryTypeID: number;
  runTime: number;
}

/** Raw entry from data/raw/industry_facilities.json */
interface IndustryFacilityRaw {
  blueprints: Array<{ blueprintID: number }>;
  inputCapacity?: number;
  outputCapacity?: number;
}

function industryBlueprintsToMap(
  raw: Record<string, IndustryBlueprintRaw>
): BlueprintsMap {
  const map: BlueprintsMap = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (!entry?.outputs?.length) continue;
    const blueprintTypeID = Number(key);
    if (!Number.isFinite(blueprintTypeID)) continue;
    map[key] = {
      blueprintTypeID,
      activities: {
        manufacturing: {
          materials: entry.inputs ?? [],
          products: entry.outputs ?? [],
          time: entry.runTime ?? 0,
        },
      },
    };
  }
  return map;
}

/** Build blueprintID -> "Facility A, Facility B" from industry_facilities + types. */
function buildBlueprintToFacilityNames(
  raw: Record<string, IndustryFacilityRaw>,
  types: TypesMap
): Record<number, string> {
  const blueprintToFacilityIds = new Map<number, number[]>();
  for (const [facilityTypeIdStr, entry] of Object.entries(raw)) {
    if (!entry?.blueprints?.length) continue;
    const facilityTypeID = Number(facilityTypeIdStr);
    if (!Number.isFinite(facilityTypeID)) continue;
    for (const { blueprintID } of entry.blueprints) {
      const list = blueprintToFacilityIds.get(blueprintID) ?? [];
      if (!list.includes(facilityTypeID)) list.push(facilityTypeID);
      blueprintToFacilityIds.set(blueprintID, list);
    }
  }
  const result: Record<number, string> = {};
  for (const [blueprintID, facilityIds] of blueprintToFacilityIds) {
    const names = facilityIds
      .map((id) => types[String(id)]?.name ?? String(id))
      .filter(Boolean);
    if (names.length > 0) result[blueprintID] = names.join(", ");
  }
  return result;
}

/** Build sorted array of facility type names from industry_facilities + types. */
function getFacilityTypeNames(
  raw: Record<string, IndustryFacilityRaw>,
  types: TypesMap
): string[] {
  const names: string[] = [];
  for (const facilityTypeIdStr of Object.keys(raw)) {
    const facilityTypeID = Number(facilityTypeIdStr);
    if (!Number.isFinite(facilityTypeID)) continue;
    const name = types[String(facilityTypeID)]?.name;
    if (name && typeof name === "string" && name.trim().length > 0) {
      names.push(name);
    }
  }
  return [...new Set(names)].sort();
}

let cached: GameData | null = null;

/** Resolve project root: directory containing data/stripped and data/raw (e.g. Builder_companion). When packaged, resources contain data/ so root is process.resourcesPath. */
export function getDataRoot(): string {
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  const cwd = process.cwd();
  // When Electron runs from packages/electron-shell, cwd is that package; use loader location to find repo root.
  const loaderDir = typeof __dirname !== "undefined" ? __dirname : cwd;
  // Bundled main.js lives in dist/; dist/ipc/ no longer exists. dist -> electron-shell -> packages -> repo root = 3 levels.
  const repoRootFromLoader = path.resolve(loaderDir, "..", "..", "..");
  const candidates = [
    path.resolve(repoRootFromLoader),
    path.resolve(cwd),
    path.resolve(cwd, ".."),
    path.resolve(cwd, "..", ".."),
  ];
  const typesFile = "data/stripped/types.json";
  const blueprintsFile = "data/raw/industry_blueprints.json";
  for (const dir of candidates) {
    const p = path.join(dir, typesFile);
    const bp = path.join(dir, blueprintsFile);
    if (fs.existsSync(p)) {
      return dir;
    }
  }
  const userData = app.getPath("userData");
  const fromUser = path.join(userData, "Powerlay");
  if (fs.existsSync(path.join(fromUser, typesFile))) return fromUser;
  return cwd;
}

function loadJson<T>(filePath: string): { data: T; error?: string } {
  if (!fs.existsSync(filePath)) {
    return { data: {} as T, error: `File not found: ${filePath}` };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as T;
    const count = typeof data === "object" && data !== null && !Array.isArray(data) ? Object.keys(data).length : 0;
    return { data, error: count === 0 ? `File empty or invalid: ${filePath}` : undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { data: {} as T, error: `${path.basename(filePath)}: ${message}` };
  }
}

export function loadSolarSystems(root: string): string[] {
  const filePath = path.join(root, "data", "stripped", "solarsystems.json");
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter((x): x is string => typeof x === "string");
  } catch {
    return [];
  }
}

export async function loadGameData(): Promise<GameData> {
  if (cached) return cached;
  const root = getDataRoot();
  const typesPath = path.join(root, "data", "stripped", "types.json");
  const blueprintsPath = path.join(root, "data", "raw", "industry_blueprints.json");
  const errors: GameDataErrors = {};

  const typesResult = loadJson<TypesMap>(typesPath);
  if (typesResult.error) errors.types = typesResult.error;
  else if (Object.keys(typesResult.data).length === 0) {
    errors.types = `No types loaded. Tried: ${typesPath}`;
  }

  const blueprintsRawResult = loadJson<Record<string, IndustryBlueprintRaw>>(blueprintsPath);
  let blueprints: BlueprintsMap = {};
  if (blueprintsRawResult.error) {
    errors.blueprints = blueprintsRawResult.error;
  } else if (Object.keys(blueprintsRawResult.data).length === 0) {
    errors.blueprints = `No blueprints loaded. Tried: ${blueprintsPath}`;
  } else {
    blueprints = industryBlueprintsToMap(blueprintsRawResult.data);
  }

  const starSystems = loadSolarSystems(root);

  const industryFacilitiesPath = path.join(root, "data", "raw", "industry_facilities.json");
  const industryFacilitiesResult = loadJson<Record<string, IndustryFacilityRaw>>(industryFacilitiesPath);
  const hasIndustryFacilities =
    !industryFacilitiesResult.error && Object.keys(industryFacilitiesResult.data).length > 0;
  const blueprintToFacilityNames = hasIndustryFacilities
    ? buildBlueprintToFacilityNames(industryFacilitiesResult.data, typesResult.data)
    : {};
  const facilityTypeNames = hasIndustryFacilities
    ? getFacilityTypeNames(industryFacilitiesResult.data, typesResult.data)
    : [];

  const oreGroupIDsPath = path.join(root, "data", "stripped", "oreGroupIDs.json");
  let oreGroupIDs: number[] = [];
  if (fs.existsSync(oreGroupIDsPath)) {
    try {
      const raw = fs.readFileSync(oreGroupIDsPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        oreGroupIDs = parsed.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
      }
    } catch {
      if (Object.keys(typesResult.data).length > 0) {
        errors.oreGroupIDs = "Could not parse oreGroupIDs.json";
      }
    }
  }

  cached = {
    types: typesResult.data,
    blueprints,
    starSystems,
    blueprintToFacilityNames,
    facilityTypeNames,
    oreGroupIDs,
    errors: Object.keys(errors).length > 0 ? errors : undefined,
  };
  return cached;
}
