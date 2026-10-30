import React from "react";
import { siteTooltip } from "@powerlay/core";
import type { ScoutEntry, RiftZone, ScoutVisibility, CreateScoutEntryInput, ZoneCatalogGroup } from "@powerlay/core";
import { ZONE_COLORS } from "./scoutZoneColors";

interface Props {
  system: string;
  catalog: ZoneCatalogGroup[];
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

export function ScoutQuickPicker({ system, catalog, entries, defaultVisibility, onAdd, onRemove }: Props) {
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
      {catalog.map(({ zone, sites }) => (
        <div key={zone} className="flex items-start gap-2">
          <span className={`w-16 shrink-0 text-xs font-semibold uppercase tracking-wide pt-1 text-right ${ZONE_COLORS[zone].split(" ")[0]}`}>
            {zone}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sites.map((site) => {
              const active = !!findActiveEntry(entries, system, site.name);
              return (
                <button
                  key={site.name}
                  type="button"
                  disabled={!system}
                  title={siteTooltip(site)}
                  onClick={() => toggle(zone, site.name)}
                  className={`
                    px-2.5 py-1 text-xs font-medium rounded border cursor-pointer transition-colors
                    disabled:opacity-40 disabled:cursor-default
                    ${active
                      ? ZONE_COLORS[zone]
                      : "bg-transparent border-border/50 text-muted hover:border-border hover:text-text"
                    }
                  `}
                >
                  {site.name.toUpperCase()}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
