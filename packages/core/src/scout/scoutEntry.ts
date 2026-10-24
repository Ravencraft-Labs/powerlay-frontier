import type { ScoutEntry, CreateScoutEntryInput, UpdateScoutEntryInput, SystemReport } from "./types.js";

/** Newest active "system" report for a system; reports are edited in place, one per system. */
export function findSystemReport(entries: ScoutEntry[], system: string): ScoutEntry | null {
  let found: ScoutEntry | null = null;
  for (const e of entries) {
    if (e.type !== "system" || e.system !== system || e.status !== "active") continue;
    if (!found || e.createdAt > found.createdAt) found = e;
  }
  return found;
}

/** Copy of `report` with `key` set, or removed when `value` is undefined. */
export function withReportField<K extends keyof SystemReport>(
  report: SystemReport | undefined,
  key: K,
  value: SystemReport[K] | undefined
): SystemReport {
  const next: SystemReport = { ...report };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/** "4 planets · M6 · mass 3 · infestation 6" */
export function formatSystemReport(r: SystemReport): string {
  return [
    r.planets !== undefined && `${r.planets} planets`,
    r.spectralClass,
    r.transientMass !== undefined && `mass ${r.transientMass}`,
    r.infestationIndex !== undefined && `infestation ${r.infestationIndex}`,
  ].filter(Boolean).join(" · ");
}

export function createScoutEntry(input: CreateScoutEntryInput, id: string, now: string = new Date().toISOString()): ScoutEntry {
  return {
    id,
    system: input.system,
    type: input.type,
    subtype: input.subtype,
    zone: input.zone,
    notes: input.notes,
    stability: input.stability,
    report: input.report,
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
    ...(patch.report !== undefined && { report: patch.report }),
    ...(patch.status !== undefined && { status: patch.status }),
    ...(patch.visibility !== undefined && { visibility: patch.visibility }),
    ...(patch.expiresAt !== undefined && { expiresAt: patch.expiresAt ?? undefined }),
    ...(patch.clearedBy !== undefined && { clearedBy: patch.clearedBy }),
    ...(patch.clearedAt !== undefined && { clearedAt: patch.clearedAt }),
  };
}
