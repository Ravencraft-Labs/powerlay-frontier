import React from "react";
import type { ScoutEntry, RiftZone, ScoutVisibility, CreateScoutEntryInput } from "@powerlay/core";
import { ZONE_COLORS } from "./scoutZoneColors";

/** Anomaly catalog grouped by zone, matching EVE Frontier site types. */
export const ZONE_CATALOG: Array<{ zone: RiftZone; sites: string[] }> = [
  {
    zone: "RIFT",
    sites: ["Rift 05D8", "Rift F935", "Rift 0633", "Rift F8DA", "Rift F9BF", "Rift 0769", "Rift 0020"],
  },
  {
    zone: "INNER",
    sites: ["Ancient Cluster", "Derelict Bay", "Derelict Quarry", "Ruins", "Stone Cluster"],
  },
  {
    zone: "TROJAN",
    sites: ["Drifting Annex", "Garden"],
  },
  {
    zone: "FRINGE",
    sites: ["Crossing", "Latticeway", "Tallyport"],
  },
  {
    zone: "OUTER",
    sites: ["Abandoned Foundry", "Blue Drift", "Grove", "Shale", "Vestiges"],
  },
  {
    zone: "FERAL",
    sites: ["Mooneater", "Xeroti"],
  },
];

interface Props {
  system: string;
  entries: ScoutEntry[];
  defaultVisibility: ScoutVisibility;
  onAdd: (input: CreateScoutEntryInput) => void;
  onRemove: (id: string) => void;
}

/** Returns the active entry id for a given system + subtype, or null. */
function findActiveEntry(entries: ScoutEntry[], system: string, subtype: string): ScoutEntry | null {
  return entries.find(
    (e) => e.system === system && e.subtype === subtype && e.status === "active"
  ) ?? null;
}

export function ScoutQuickPicker({ system, entries, defaultVisibility, onAdd, onRemove }: Props) {
  function toggle(zone: RiftZone, subtype: string) {
    if (!system) return;
    const existing = findActiveEntry(entries, system, subtype);
    if (existing) {
      onRemove(existing.id);
    } else {
      onAdd({
        system,
        type: "rift",
        subtype,
        zone,
        visibility: defaultVisibility,
        reporter: "manual",
      });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {ZONE_CATALOG.map(({ zone, sites }) => (
        <div key={zone} className="flex items-start gap-2">
          <span className={`w-14 shrink-0 text-xs font-semibold uppercase tracking-wide pt-1 text-right ${ZONE_COLORS[zone].split(" ")[0]}`}>
            {zone}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sites.map((site) => {
              const active = !!findActiveEntry(entries, system, site);
              return (
                <button
                  key={site}
                  type="button"
                  disabled={!system}
                  onClick={() => toggle(zone, site)}
                  className={`
                    px-2.5 py-1 text-xs font-medium rounded border cursor-pointer transition-colors
                    disabled:opacity-40 disabled:cursor-default
                    ${active
                      ? ZONE_COLORS[zone]
                      : "bg-transparent border-border/50 text-muted hover:border-border hover:text-text"
                    }
                  `}
                >
                  {site.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
