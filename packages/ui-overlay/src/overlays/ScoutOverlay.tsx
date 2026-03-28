import React, { useCallback, useEffect, useState } from "react";
import type { ScoutEntry, RiftZone, CreateScoutEntryInput } from "@powerlay/core";
import { OverlayFrame } from "../components/OverlayFrame";
import { useEfOverlay } from "../hooks/useEfOverlay";

const ZONE_COLORS: Record<RiftZone, string> = {
  RIFT:   "text-cyan-400   border-cyan-400/50",
  INNER:  "text-blue-400   border-blue-400/50",
  TROJAN: "text-violet-400 border-violet-400/50",
  FRINGE: "text-orange-400 border-orange-400/50",
  OUTER:  "text-amber-400  border-amber-400/50",
  FERAL:  "text-red-400    border-red-400/50",
};

const TYPE_FALLBACK = "text-muted border-border/40";

function badgeColor(zone: RiftZone | undefined, type: string): string {
  if (zone && ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  return TYPE_FALLBACK;
}

function badgeLabel(zone: RiftZone | undefined, type: string): string {
  return zone ?? type.toUpperCase();
}

const ZONE_CATALOG: Array<{ zone: RiftZone; sites: string[] }> = [
  { zone: "RIFT",   sites: ["Rift 05D8", "Rift F935", "Rift 0633", "Rift F8DA", "Rift F9BF", "Rift 0769", "Rift 0020"] },
  { zone: "INNER",  sites: ["Ancient Cluster", "Derelict Bay", "Derelict Quarry", "Ruins", "Stone Cluster"] },
  { zone: "TROJAN", sites: ["Drifting Annex", "Garden"] },
  { zone: "FRINGE", sites: ["Crossing", "Latticeway", "Tallyport"] },
  { zone: "OUTER",  sites: ["Abandoned Foundry", "Blue Drift", "Grove", "Shale", "Vestiges"] },
  { zone: "FERAL",  sites: ["Mooneater", "Xeroti"] },
];

function findActiveEntry(entries: ScoutEntry[], system: string, subtype: string): ScoutEntry | null {
  return entries.find((e) => e.system === system && e.subtype === subtype && e.status === "active") ?? null;
}

export function ScoutOverlay() {
  const api = useEfOverlay();
  const [activeSystem, setActiveSystem] = useState<string | null>(null);
  const [overrideInput, setOverrideInput] = useState("");
  const [editingSystem, setEditingSystem] = useState(false);
  const [entries, setEntries] = useState<ScoutEntry[]>([]);
  const [defaultVisibility, setDefaultVisibility] = useState<"tribe" | "alliance" | "private">("tribe");

  const loadData = useCallback(async () => {
    const scout = api?.scout;
    if (!scout) return;
    try {
      const [sys, list, s] = await Promise.all([
        scout.getActiveSystem(),
        scout.list(),
        scout.getSettings(),
      ]);
      setActiveSystem(sys ?? null);
      setEntries(list ?? []);
      if (s?.defaultVisibility) setDefaultVisibility(s.defaultVisibility);
    } catch {
      /* ignore */
    }
  }, [api?.scout]);

  useEffect(() => {
    void loadData();
    const sysInterval = setInterval(async () => {
      try {
        const sys = await api?.scout?.getActiveSystem?.();
        setActiveSystem(sys ?? null);
      } catch {
        /* ignore */
      }
    }, 2000);
    const dataInterval = setInterval(() => void loadData(), 5000);
    return () => {
      clearInterval(sysInterval);
      clearInterval(dataInterval);
    };
  }, [api?.scout, loadData]);

  async function handleSetOverride() {
    const trimmed = overrideInput.trim();
    if (!trimmed) return;
    setEditingSystem(false);
    try {
      await api?.scout?.setSystemOverride?.(trimmed);
      setActiveSystem(trimmed);
    } catch {
      /* ignore */
    }
  }

  async function handleClearOverride() {
    setEditingSystem(false);
    setOverrideInput("");
    try {
      await api?.scout?.setSystemOverride?.(null);
      const sys = await api?.scout?.getActiveSystem?.();
      setActiveSystem(sys ?? null);
    } catch {
      /* ignore */
    }
  }

  async function markDepleted(id: string) {
    try {
      await api?.scout?.update?.(id, { status: "cleared", clearedBy: "overlay" });
      const list = await api?.scout?.list?.();
      if (list) setEntries(list);
    } catch {
      /* ignore */
    }
  }

  async function toggleSite(zone: RiftZone, subtype: string) {
    if (!activeSystem) return;
    const existing = findActiveEntry(entries, activeSystem, subtype);
    try {
      if (existing) {
        await api?.scout?.delete?.(existing.id);
      } else {
        const input: CreateScoutEntryInput = {
          system: activeSystem,
          type: "rift",
          subtype,
          zone,
          visibility: defaultVisibility,
          reporter: "overlay",
        };
        await api?.scout?.create?.(input);
      }
      const list = await api?.scout?.list?.();
      if (list) setEntries(list);
    } catch {
      /* ignore */
    }
  }

  const currentSystemEntries = entries.filter((e) => e.system === activeSystem && e.status === "active");

  return (
    <OverlayFrame title="Scout">
      {/* All interactive content must have overlay-no-drag to receive clicks */}
      <div className="overlay-no-drag">
        {/* System row */}
        <div className="px-3 pt-2 pb-1.5">
          {editingSystem ? (
            <div className="flex gap-1 items-center">
              <input
                autoFocus
                className="flex-1 px-2 py-0.5 text-xs bg-bg/60 border border-border-input rounded text-text focus:outline-none"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder="System name…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSetOverride();
                  if (e.key === "Escape") setEditingSystem(false);
                }}
              />
              <button type="button" onClick={() => void handleSetOverride()}
                className="text-xs px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent">✓</button>
              <button type="button" onClick={() => setEditingSystem(false)}
                className="text-xs px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-sm text-text flex-1 truncate">
                {activeSystem ?? <span className="text-muted italic text-xs">detecting…</span>}
              </span>
              <button type="button" onClick={() => { setOverrideInput(activeSystem ?? ""); setEditingSystem(true); }}
                className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 shrink-0" title="Set system">✎</button>
              {activeSystem && (
                <button type="button" onClick={() => void handleClearOverride()}
                  className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 shrink-0" title="Reset to auto">↺</button>
              )}
            </div>
          )}
        </div>

        {/* Zone quick-picker */}
        <div className="px-3 pb-2 flex flex-col gap-1">
          {ZONE_CATALOG.map(({ zone, sites }) => (
            <div key={zone} className="flex items-start gap-1.5">
              <span className="w-11 shrink-0 text-[10px] font-semibold text-muted uppercase tracking-wide pt-1 text-right">{zone}</span>
              <div className="flex flex-wrap gap-1">
                {sites.map((site) => {
                  const active = !!findActiveEntry(entries, activeSystem ?? "", site);
                  return (
                    <button
                      key={site}
                      type="button"
                      disabled={!activeSystem}
                      onClick={() => void toggleSite(zone, site)}
                      className={`
                        text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors
                        disabled:opacity-30 disabled:cursor-default
                        ${active
                          ? `${ZONE_COLORS[zone]} bg-current/10`
                          : "bg-transparent border-border/40 text-muted hover:border-border hover:text-text"
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

        {/* Active entries for current system */}
        {currentSystemEntries.length > 0 && (
          <div className="px-3 pb-2 border-t border-border/30 pt-2 flex flex-col gap-1 max-h-40 overflow-y-auto">
            {currentSystemEntries
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 10)
              .map((e) => (
                <div key={e.id} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`shrink-0 font-bold border rounded px-1 ${badgeColor(e.zone as RiftZone | undefined, e.type)}`}>
                    {badgeLabel(e.zone as RiftZone | undefined, e.type)}
                  </span>
                  <span className="text-text flex-1 truncate">{e.subtype ?? e.type}</span>
                  <button
                    type="button"
                    onClick={() => void markDepleted(e.id)}
                    className="shrink-0 text-muted hover:text-yellow-400 border border-border/30 hover:border-yellow-400/40 rounded px-1 cursor-pointer bg-transparent"
                    title="Mark as depleted"
                  >
                    depleted
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>
    </OverlayFrame>
  );
}
