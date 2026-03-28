import type { ScoutEntry, CreateScoutEntryInput, UpdateScoutEntryInput } from "./types.js";

export function createScoutEntry(input: CreateScoutEntryInput, id: string, now: string = new Date().toISOString()): ScoutEntry {
  return {
    id,
    system: input.system,
    type: input.type,
    subtype: input.subtype,
    zone: input.zone,
    notes: input.notes,
    stability: input.stability,
    reporter: input.reporter,
    reporterWalletId: input.reporterWalletId,
    tribeId: input.tribeId,
    visibility: input.visibility,
    createdAt: now,
    expiresAt: input.expiresAt,
    status: "active",
  };
}

export function updateScoutEntry(entry: ScoutEntry, patch: UpdateScoutEntryInput): ScoutEntry {
  return {
    ...entry,
    ...(patch.subtype !== undefined && { subtype: patch.subtype }),
    ...(patch.zone !== undefined && { zone: patch.zone }),
    ...(patch.notes !== undefined && { notes: patch.notes }),
    ...(patch.stability !== undefined && { stability: patch.stability }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.visibility !== undefined && { visibility: patch.visibility }),
    ...(patch.expiresAt !== undefined && { expiresAt: patch.expiresAt ?? undefined }),
    ...(patch.clearedBy !== undefined && { clearedBy: patch.clearedBy }),
    ...(patch.clearedAt !== undefined && { clearedAt: patch.clearedAt }),
  };
}
