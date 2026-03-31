import type { ScoutEntry, ScoutEntryType, RiftZone, ScoutVisibility } from "./types.js";

const ENTRY_TYPES: ScoutEntryType[] = ["rift", "anomaly", "resource", "structure", "note"];
const RIFT_ZONES: RiftZone[] = ["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL"];
const VISIBILITIES: ScoutVisibility[] = ["tribe", "alliance", "private"];
const STATUSES = ["active", "expired", "cleared"] as const;

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
  return true;
}
