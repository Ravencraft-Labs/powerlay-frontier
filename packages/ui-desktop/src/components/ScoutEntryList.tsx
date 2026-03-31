import React, { useMemo } from "react";
import type { ScoutEntry, RiftZone } from "@powerlay/core";
import { entryBadgeColor, entryBadgeLabel } from "./scoutZoneColors";

type FilterValue = RiftZone | "all" | "note" | "anomaly" | "resource" | "structure";

interface Props {
  entries: ScoutEntry[];
  filter: FilterValue;
  onMarkCleared: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ScoutEntryList({ entries, filter, onMarkCleared, onDelete }: Props) {
  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    // Zone filter
    const ZONES = ["RIFT", "INNER", "TROJAN", "FRINGE", "OUTER", "FERAL"];
    if (ZONES.includes(filter)) return entries.filter((e) => e.zone === filter);
    // Type filter
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  const grouped = useMemo(() => {
    const map = new Map<string, ScoutEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.system) ?? [];
      list.push(e);
      map.set(e.system, list);
    }
    return map;
  }, [filtered]);

  if (filtered.length === 0) {
    return <p className="text-sm text-muted py-2">No entries yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {[...grouped.entries()].map(([system, systemEntries]) => (
        <div key={system}>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">{system}</div>
          <div className="flex flex-col gap-1">
            {systemEntries
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((entry) => (
                <ScoutEntryRow key={entry.id} entry={entry} onMarkCleared={onMarkCleared} onDelete={onDelete} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoutEntryRow({ entry, onMarkCleared, onDelete }: {
  entry: ScoutEntry;
  onMarkCleared: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isCleared = entry.status === "cleared" || entry.status === "expired";
  const badgeColor = entryBadgeColor(entry.zone as RiftZone | undefined, entry.type);
  const badgeLabel = entryBadgeLabel(entry.zone as RiftZone | undefined, entry.type);

  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded border text-sm transition-opacity ${
      isCleared ? "border-border/20 opacity-40" : "border-border/40"
    }`}>
      <span className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded border ${badgeColor}`}>
        {badgeLabel}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-baseline">
          {entry.subtype && (
            <span className={`font-medium ${isCleared ? "line-through text-muted" : "text-text"}`}>
              {entry.subtype}
            </span>
          )}
          {entry.stability !== undefined && (
            <span className="text-xs text-muted">{entry.stability}% stability</span>
          )}
        </div>
        {entry.notes && <div className="text-xs text-muted mt-0.5 truncate">{entry.notes}</div>}
        <div className="text-xs text-muted/60 mt-0.5 flex flex-wrap gap-x-2">
          <span>found by {entry.reporter}</span>
          <span>{new Date(entry.createdAt).toLocaleString()}</span>
          {entry.clearedBy && <span className="text-muted/40">depleted by {entry.clearedBy}</span>}
          <span>{entry.visibility}</span>
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {!isCleared && (
          <button
            type="button"
            onClick={() => onMarkCleared(entry.id)}
            className="text-xs text-muted hover:text-yellow-400 px-1.5 py-0.5 rounded border border-border/40 hover:border-yellow-400/40 cursor-pointer bg-transparent"
            title="Mark as depleted"
          >
            depleted
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="text-xs text-muted hover:text-red-400 px-1.5 py-0.5 rounded border border-border/40 hover:border-red-400/40 cursor-pointer bg-transparent"
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
