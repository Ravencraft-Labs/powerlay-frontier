export type ScoutEntryType = "rift" | "anomaly" | "resource" | "structure" | "note";

export type RiftZone = "RIFT" | "INNER" | "TROJAN" | "FRINGE" | "OUTER" | "FERAL";

export type ScoutVisibility = "tribe" | "alliance" | "private";

export interface ScoutEntry {
  id: string;
  system: string;
  type: ScoutEntryType;
  subtype?: string;
  zone?: RiftZone;
  notes?: string;
  /** 0–100, only meaningful for rifts. */
  stability?: number;
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
