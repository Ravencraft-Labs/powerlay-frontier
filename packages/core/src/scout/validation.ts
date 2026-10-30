import type { ScoutEntry, ScoutEntryType, RiftZone, ScoutVisibility } from "./types.js";
import { RIFT_ZONES } from "./catalog.js";

const ENTRY_TYPES: ScoutEntryType[] = ["rift", "anomaly", "resource", "structure", "note", "system"];
const VISIBILITIES: ScoutVisibility[] = ["tribe", "alliance", "private"];
const STATUSES = ["active", "expired", "cleared"] as const;

function isIntInRange(v: unknown, min: number, max: number): boolean {
  return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
}

function isValidReport(x: unknown): boolean {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  if (r.planets !== undefined && !isIntInRange(r.planets, 0, 99)) return false;
  if (r.spectralClass !== undefined && typeof r.spectralClass !== "string") return false;
  if (r.transientMass !== undefined && !isIntInRange(r.transientMass, 1, 5)) return false;
  if (r.infestationIndex !== undefined && !isIntInRange(r.infestationIndex, 1, 6)) return false;
  return true;
}

export function validateScoutEntry(x: unknown): x is ScoutEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  if (typeof e.id !== "string" || !e.id) return false;
  if (typeof e.system !== "string" || !e.system) return false;
  if (!ENTRY_TYPES.includes(e.type as ScoutEntryType)) return false;
  if (!VISIBILITIES.includes(e.visibility as ScoutVisibility)) return false;
  if (typeof e.reporter !== "string" || !e.reporter) return false;
  if (typeof e.createdAt !== "string" || !e.createdAt) return false;
  if (!STATUSES.includes(e.status as (typeof STATUSES)[number])) return false;
  if (e.zone !== undefined && !RIFT_ZONES.includes(e.zone as RiftZone)) return false;
  if (e.stability !== undefined && (typeof e.stability !== "number" || e.stability < 0 || e.stability > 100)) return false;
  if (e.report !== undefined && !isValidReport(e.report)) return false;
  return true;
}
