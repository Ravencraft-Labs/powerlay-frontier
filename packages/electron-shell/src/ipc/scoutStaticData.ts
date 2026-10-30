import fs from "fs";
import path from "path";
import type { ScoutSiteDef, SystemState } from "@powerlay/core";
import { getDataRoot } from "./gameDataLoader.js";

/** Static data for Scout from data/stripped (written by scripts/strip-data.js). */
export interface ScoutStaticData {
  /** Quick-mark sites; empty when scout_sites.json is missing (UI falls back to the built-in catalog). */
  sites: ScoutSiteDef[];
  /** solarSystemID -> state. Only systems listed in systemstate.fsdbinary. */
  systemStates: Record<string, SystemState>;
}

let cached: ScoutStaticData | null = null;

function readJson<T>(file: string, fallback: T): T {
  const p = path.join(getDataRoot(), "data", "stripped", file);
  try {
    return fs.existsSync(p) ? (JSON.parse(fs.readFileSync(p, "utf-8")) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadScoutStaticData(): ScoutStaticData {
  cached ??= {
    sites: readJson<ScoutSiteDef[]>("scout_sites.json", []),
    systemStates: readJson<Record<string, SystemState>>("system_states.json", {}),
  };
  return cached;
}
