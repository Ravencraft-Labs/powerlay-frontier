import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildZoneCatalog, findSystemReport, formatSystemReport, siteTooltip, withReportField } from "@powerlay/core";
import type { ScoutEntry, RiftZone, CreateScoutEntryInput, ScoutSiteDef, SystemState } from "@powerlay/core";
import { OverlayFrame } from "../components/OverlayFrame";
import { useEfOverlay } from "../hooks/useEfOverlay";
import type { PocEdgeResult, PocLogLiteStatus, PocSystemLink } from "../preload.d";

const ZONE_COLORS: Record<RiftZone, string> = {
  RIFT:   "text-cyan-400   border-cyan-400/50",
  INNER:  "text-blue-400   border-blue-400/50",
  TROJAN: "text-violet-400 border-violet-400/50",
  FRINGE: "text-orange-400 border-orange-400/50",
  OUTER:  "text-amber-400  border-amber-400/50",
  FERAL:  "text-red-400    border-red-400/50",
  UNKNOWN: "text-slate-400 border-slate-400/50",
};

const TYPE_COLORS: Partial<Record<string, string>> = {
  system: "text-teal-400 border-teal-400/50",
};

const TYPE_FALLBACK = "text-muted border-border/40";

function badgeColor(zone: RiftZone | undefined, type: string): string {
  if (zone && ZONE_COLORS[zone]) return ZONE_COLORS[zone];
  return TYPE_COLORS[type] ?? TYPE_FALLBACK;
}

function badgeLabel(zone: RiftZone | undefined, type: string): string {
  return zone ?? type.toUpperCase();
}

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
  const [sites, setSites] = useState<ScoutSiteDef[]>([]);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const catalog = useMemo(() => buildZoneCatalog(sites), [sites]);
  // POC: chat link capture
  const [links, setLinks] = useState<PocSystemLink[]>([]);
  const [currentSystemId, setCurrentSystemId] = useState<number | null>(null);
  const [linkResult, setLinkResult] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  // POC: mini-map overlay window
  const [miniMapOpen, setMiniMapOpen] = useState(false);

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
      const info = sys ? await scout.getSystemInfo?.(sys) : null;
      setSystemState(info?.state ?? null);
      const linkRes = await api?.pocMap?.getLinks?.();
      if (linkRes) {
        setLinks(linkRes.links);
        setCurrentSystemId(linkRes.currentSystemId);
      }
      if (s?.defaultVisibility) setDefaultVisibility(s.defaultVisibility);
    } catch {
      /* ignore */
    }
  }, [api?.scout]);

  useEffect(() => {
    api?.scout?.getSites?.().then(setSites).catch(() => setSites([]));
  }, [api?.scout]);

  useEffect(() => {
    void loadData();
    const sysInterval = setInterval(async () => {
      try {
        const [sys, mapOpen] = await Promise.all([api?.scout?.getActiveSystem?.(), api?.overlay?.getVisible?.("map")]);
        setActiveSystem(sys ?? null);
        setMiniMapOpen(!!mapOpen);
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

  /** One report entry per system: set/clear one level in place, delete the entry when it empties. */
  async function setReportLevel(key: "transientMass" | "infestationIndex", value: number | undefined) {
    if (!activeSystem) return;
    const existing = findSystemReport(entries, activeSystem);
    const report = withReportField(existing?.report, key, value);
    try {
      if (existing) {
        if (Object.keys(report).length === 0 && !existing.notes) await api?.scout?.delete?.(existing.id);
        else await api?.scout?.update?.(existing.id, { report });
      } else if (value !== undefined) {
        await api?.scout?.create?.({
          system: activeSystem,
          type: "system",
          visibility: defaultVisibility,
          reporter: "overlay",
          report,
        });
      }
      const list = await api?.scout?.list?.();
      if (list) setEntries(list);
    } catch {
      /* ignore */
    }
  }

  function showLinkResult(res: PocSystemLink[] | undefined) {
    if (!res || res.length === 0) {
      setLinkResult("No system links found");
      return;
    }
    setLinkResult(res.map((l) => `${l.name ?? `${l.linkTexts[0]}…`} → ${l.id}`).join(", "));
    void loadData();
  }

  function showEdgeResult(res: PocEdgeResult | undefined, what: string) {
    if (!res) return;
    setLinkResult([`${what}: +${res.added.length}`, res.error].filter(Boolean).join(" · "));
    void loadData();
  }

  const currentLink = activeSystem ? links.find((l) => l.name?.toLowerCase() === activeSystem.toLowerCase()) : undefined;

  const currentSystemEntries = entries.filter((e) => e.system === activeSystem && e.status === "active");
  const currentReport = activeSystem ? findSystemReport(entries, activeSystem) : null;

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
              {systemState && (
                <span className={`text-[10px] font-semibold border rounded px-1 shrink-0 ${
                  systemState === "DEVASTATED" ? "text-red-400 border-red-400/50" : "text-emerald-400 border-emerald-400/50"
                }`}>
                  {systemState}
                </span>
              )}
              <button type="button" onClick={() => { setOverrideInput(activeSystem ?? ""); setEditingSystem(true); }}
                className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 shrink-0" title="Set system">✎</button>
              <button type="button" onClick={async () => {
                  await api?.overlay?.toggle?.("map");
                  setMiniMapOpen(!!(await api?.overlay?.getVisible?.("map")));
                }}
                className={`text-xs px-1.5 py-0.5 rounded border cursor-pointer bg-transparent shrink-0 ${miniMapOpen ? "border-accent/60 text-accent" : "border-border/60 text-muted hover:text-text"}`}
                title={miniMapOpen ? "Hide map overlay" : "Show map overlay"}>Map</button>
              {activeSystem && (
                <button type="button" onClick={() => void handleClearOverride()}
                  className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 shrink-0" title="Reset to auto">↺</button>
              )}
            </div>
          )}
        </div>

        {/* POC: chat link → system ID */}
        <div className="px-3 pb-2 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={currentLink || currentSystemId ? "text-green-400" : "text-muted"}>
              {currentLink || currentSystemId ? `ID ${currentLink?.id ?? currentSystemId}` : "ID unknown"}
            </span>
            <button
              type="button"
              onClick={async () => showLinkResult(await api?.pocMap?.ingestClipboard?.())}
              className="ml-auto px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent"
              title="Copy chat lines with system links in game (Ctrl+C), then press this"
            >
              Links from clipboard
            </button>
          </div>
          <div className="flex gap-1 text-[10px]">
            <button
              type="button"
              disabled={!currentSystemId}
              onClick={async () => showEdgeResult(await api?.pocMap?.addAdjacent?.(null), "Adjacent")}
              className="flex-1 px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent disabled:opacity-30 disabled:cursor-default"
              title="Info → Adjacent Solar Systems: drag them into chat, copy the lines, press this"
            >
              Adjacent from clipboard
            </button>
            <button
              type="button"
              onClick={async () => showEdgeResult(await api?.pocMap?.addRoute?.(), "Route")}
              className="flex-1 px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent"
              title="Info → Route: drag the route systems into chat in order, copy the lines, press this"
            >
              Route from clipboard
            </button>
          </div>
          <input
            className="px-2 py-0.5 text-[10px] bg-bg/60 border border-border-input rounded text-text focus:outline-none"
            placeholder="…or paste chat here (Ctrl+V)"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onPaste={async (e) => {
              e.preventDefault();
              showLinkResult(await api?.pocMap?.ingestText?.(e.clipboardData.getData("text")));
              setPasteText("");
            }}
          />
          {linkResult && <div className="text-[10px] text-muted break-words">{linkResult}</div>}
        </div>

        {/* POC: LogLite → map */}
        <LogLiteFeed />

        {/* Zone quick-picker */}
        <div className="px-3 pb-2 flex flex-col gap-1">
          {catalog.map(({ zone, sites }) => (
            <div key={zone} className="flex items-start gap-1.5">
              <span className="w-14 shrink-0 text-[10px] font-semibold text-muted uppercase tracking-wide pt-1 text-right">{zone}</span>
              <div className="flex flex-wrap gap-1">
                {sites.map((site) => {
                  const active = !!findActiveEntry(entries, activeSystem ?? "", site.name);
                  return (
                    <button
                      key={site.name}
                      type="button"
                      disabled={!activeSystem}
                      title={siteTooltip(site)}
                      onClick={() => void toggleSite(zone, site.name)}
                      className={`
                        text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer transition-colors
                        disabled:opacity-30 disabled:cursor-default
                        ${active
                          ? `${ZONE_COLORS[zone]} bg-current/10`
                          : "bg-transparent border-border/40 text-muted hover:border-border hover:text-text"
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

        {/* System report levels (game UI only; one click each, click again to clear) */}
        <div className="px-3 pb-2 flex flex-col gap-1">
          {([
            ["transientMass", "MASS", 5],
            ["infestationIndex", "INFEST", 6],
          ] as const).map(([key, label, max]) => {
            const value = currentReport?.report?.[key];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <span className="w-14 shrink-0 text-[10px] font-semibold text-muted uppercase tracking-wide text-right">{label}</span>
                <div className="flex gap-1">
                  {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      type="button"
                      disabled={!activeSystem}
                      onClick={() => void setReportLevel(key, value === n ? undefined : n)}
                      className={`min-w-[1.25rem] text-[10px] font-medium px-1 py-0.5 rounded border cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-default ${
                        value === n
                          ? "text-teal-300 border-teal-400/60 bg-teal-400/15"
                          : "bg-transparent border-border/40 text-muted hover:border-border hover:text-text"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
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
                  <span className="text-text flex-1 truncate">
                    {e.report ? formatSystemReport(e.report) : e.subtype ?? e.type}
                  </span>
                  {e.type !== "system" && <button
                    type="button"
                    onClick={() => void markDepleted(e.id)}
                    className="shrink-0 text-muted hover:text-yellow-400 border border-border/30 hover:border-yellow-400/40 rounded px-1 cursor-pointer bg-transparent"
                    title="Mark as depleted"
                  >
                    depleted
                  </button>}
                </div>
              ))}
          </div>
        )}
      </div>
    </OverlayFrame>
  );
}

const FEED_COLORS: Partial<Record<string, string>> = {
  "edge-added": "text-cyan-300",
  "name-bound": "text-green-400",
  system: "text-text",
  disconnected: "text-amber-400",
};

/** POC: toggle for reading the game client's LogLite stream, plus its latest events. */
function LogLiteFeed() {
  const api = useEfOverlay();
  const [status, setStatus] = useState<PocLogLiteStatus | null>(null);

  const refresh = useCallback(async () => {
    setStatus((await api?.pocMap?.getLogLiteStatus?.()) ?? null);
  }, [api]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 1500);
    return () => clearInterval(t);
  }, [refresh]);

  if (!status) return null;
  const on = status.state !== "off";
  const stateText =
    status.error ??
    { off: "", listening: "waiting for client…", connected: "client connected", error: "error" }[status.state];

  return (
    <div className="px-3 pb-2 flex flex-col gap-0.5 text-[10px]">
      <div className="flex items-center gap-1.5">
        <span className={status.state === "connected" ? "text-green-400" : status.state === "error" ? "text-red-400" : "text-muted"}>
          {on ? `LogLite: ${stateText}` : "LogLite: off"}
        </span>
        <button
          type="button"
          onClick={async () => {
            await api?.pocMap?.setLogLite?.(!on);
            await refresh();
          }}
          className="ml-auto px-1.5 py-0.5 rounded border border-border/60 text-muted hover:text-text cursor-pointer bg-transparent"
          title="Read the game client's debug log instead of LogLite (port 3273): jumps add map connections"
        >
          {on ? "Stop LogLite" : "Read LogLite"}
        </button>
      </div>
      {status.feed.slice(0, 5).map((f, i) => (
        <div key={`${f.at}-${i}`} className={`truncate ${FEED_COLORS[f.kind] ?? "text-muted"}`} title={f.text}>
          {f.text}
        </div>
      ))}
    </div>
  );
}
