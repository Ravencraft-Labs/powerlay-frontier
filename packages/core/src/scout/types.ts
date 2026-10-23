export type ScoutEntryType = "rift" | "anomaly" | "resource" | "structure" | "note" | "system";

export type RiftZone = "RIFT" | "INNER" | "TROJAN" | "FRINGE" | "OUTER" | "FERAL" | "UNKNOWN";

export type ScoutVisibility = "tribe" | "alliance" | "private";

/** What a player reads off a system in game (same fields ef-map collects). All optional. */
export interface SystemReport {
  planets?: number;
  /** e.g. "M6" */
  spectralClass?: string;
  /** 1–5 */
  transientMass?: number;
  /** 1–6 */
  infestationIndex?: number;
}

/** Static system state from systemstate.fsdbinary. */
export type SystemState = "SETTLED" | "DEVASTATED";

/** One quick-mark site from static data (data/stripped/scout_sites.json). */
export interface ScoutSiteDef {
  name: string;
  zone: RiftZone;
  /** Internal ecosystem name, e.g. "Broken World - Inner Belt - Derelict Bay". */
  description?: string;
  /** Spawn tags, e.g. ["belt", "rocky"]. */
  tags?: string[];
}

export interface ScoutEntry {
  id: string;
  system: string;
  type: ScoutEntryType;
  subtype?: string;
  zone?: RiftZone;
  notes?: string;
  /** 0–100, only meaningful for rifts. */
  stability?: number;
  /** Only for type "system". */
  report?: SystemReport;
  reporter: string;
  reporterWalletId?: string;
  tribeId?: string;
  visibility: ScoutVisibility;
  createdAt: string;
  expiresAt?: string;
  status: "active" | "expired" | "cleared";
  /** Set when status transitions to "cleared". */
  clearedBy?: string;
  clearedAt?: string;
}

export interface CreateScoutEntryInput {
  system: string;
  type: ScoutEntryType;
  subtype?: string;
  zone?: RiftZone;
  notes?: string;
  stability?: number;
  report?: SystemReport;
  reporter: string;
  reporterWalletId?: string;
  tribeId?: string;
  visibility: ScoutVisibility;
  expiresAt?: string;
}

export interface UpdateScoutEntryInput {
  subtype?: string;
  zone?: RiftZone;
  notes?: string;
  stability?: number;
  report?: SystemReport;
  status?: ScoutEntry["status"];
  expiresAt?: string | null;
  visibility?: ScoutVisibility;
  /** Who is clearing the entry (set together with status: "cleared"). */
  clearedBy?: string;
  clearedAt?: string;
}

/** One event in the scout activity log. */
export interface ScoutActivityEvent {
  id: string;
  entryId: string;
  action: "created" | "cleared" | "deleted";
  actor: string;
  system: string;
  subtype?: string;
  zone?: RiftZone;
  timestamp: string;
}

export interface ScoutSettings {
  defaultVisibility: ScoutVisibility;
  /** When set, overrides auto-detected chatlog system. null = use chatlog. */
  systemOverride?: string | null;
}
