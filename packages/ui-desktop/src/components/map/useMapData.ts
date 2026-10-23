// POC (throwaway, not for release): star map data shared by the Map tab and the mini-map overlay window.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScoutEntry } from "@powerlay/core";
import { usePlugins } from "../../plugins/PluginsProvider";
import type { MapEdgeLayer } from "../../plugins/types";
import type { PocEdge, PocLogLiteStatus, PocMapBase, PocMapSystem, PocSystemLink } from "../../preload";

/** Game coordinates are metres (~1e19); scale to a comfortable world unit. */
const WORLD_SCALE = 1e-16;

export const ENTRY_COLORS: Record<string, string> = {
  rift: "#22d3ee",
  anomaly: "#facc15",
  resource: "#4ade80",
  structure: "#fb923c",
  note: "#a1a1aa",
};

export interface Pt {
  sys: PocMapSystem;
  wx: number;
  wy: number;
}

export interface AreaNames {
  regions: Record<string, string>;
  constellations: Record<string, string>;
}

function hasError(x: unknown): x is { error: string } {
  return typeof x === "object" && x !== null && "error" in x;
}

function adjacency(pairs: Iterable<[number, number]>): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (const [a, b] of pairs) {
    (m.get(a) ?? m.set(a, []).get(a)!).push(b);
    (m.get(b) ?? m.set(b, []).get(b)!).push(a);
  }
  return m;
}

/**
 * `watchClipboard`: the clipboard watcher is a single main-process switch, so only one window (the Map tab)
 * should own it — otherwise closing the mini-map would stop it for the tab too.
 */
export function useMapData({ watchClipboard }: { watchClipboard: boolean }) {
  const [base, setBase] = useState<PocMapBase | null>(null);
  const [baseError, setBaseError] = useState<string | null>(null);
  const mapPlugins = usePlugins().filter((p) => p.contributions.map);
  /** Plugin edge layers, by plugin id. */
  const [layers, setLayers] = useState<Record<string, MapEdgeLayer>>({});
  const [entries, setEntries] = useState<ScoutEntry[]>([]);
  const [currentSystem, setCurrentSystem] = useState<string | null>(null);
  const [links, setLinks] = useState<PocSystemLink[]>([]);
  const [edges, setEdges] = useState<PocEdge[]>([]);
  const [currentSystemId, setCurrentSystemId] = useState<number | null>(null);
  const [lastIngested, setLastIngested] = useState<PocSystemLink[]>([]);
  const [logLite, setLogLite] = useState<PocLogLiteStatus | null>(null);
  const [areaNames, setAreaNames] = useState<AreaNames>({ regions: {}, constellations: {} });

  // --- loading ---
  useEffect(() => {
    void (async () => {
      const res = await window.efOverlay?.pocMap?.getBase();
      if (!res) setBaseError("pocMap API not available");
      else if (hasError(res)) setBaseError(res.error);
      else setBase(res);
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      const [list, cur, linkRes, logLiteRes] = await Promise.all([
        window.efOverlay?.scout?.list?.(),
        window.efOverlay?.scout?.getActiveSystem?.(),
        window.efOverlay?.pocMap?.getLinks?.(),
        window.efOverlay?.pocMap?.getLogLiteStatus?.(),
      ]);
      if (!alive) return;
      setLogLite(logLiteRes ?? null);
      if (list) setEntries(list.filter((e) => e.status === "active"));
      setCurrentSystem(cur ?? null);
      if (linkRes) {
        setLinks(linkRes.links);
        setLastIngested(linkRes.lastIngested);
        setAreaNames(linkRes.areaNames);
        setEdges(linkRes.edges);
        setCurrentSystemId(linkRes.currentSystemId);
      }
    };
    void tick();
    if (watchClipboard) void window.efOverlay?.pocMap?.watchClipboard?.(true);
    const t = setInterval(() => void tick(), 1500);
    return () => {
      alive = false;
      clearInterval(t);
      if (watchClipboard) void window.efOverlay?.pocMap?.watchClipboard?.(false);
    };
  }, [watchClipboard]);

  const setLayerFor = useCallback(
    (id: string) => (layer: MapEdgeLayer | null) =>
      setLayers((prev) => {
        const next = { ...prev };
        if (layer) next[id] = layer;
        else delete next[id];
        return next;
      }),
    [],
  );
  /** Stable setter per plugin, so plugin effects depending on `setLayer` don't re-run every render. */
  const mapPluginIds = mapPlugins.map((p) => p.id).join(",");
  const layerSetters = useMemo(
    () => new Map(mapPluginIds.split(",").map((id) => [id, setLayerFor(id)])),
    [mapPluginIds, setLayerFor],
  );

  // --- derived ---
  const pts = useMemo<Pt[]>(
    () => (base?.systems ?? []).map((s) => ({ sys: s, wx: s.x * WORLD_SCALE, wy: -s.z * WORLD_SCALE })),
    [base],
  );
  const byId = useMemo(() => new Map(pts.map((p) => [p.sys.id, p])), [pts]);
  const linkById = useMemo(() => new Map(links.map((l) => [l.id, l])), [links]);
  /** Display name: confirmed Cycle 7 name when we have one, else the Cycle 6 name. */
  const nameOf = useCallback((p: Pt) => linkById.get(p.sys.id)?.name ?? p.sys.n, [linkById]);
  const byName = useMemo(() => {
    const m = new Map(pts.map((p) => [p.sys.n.toLowerCase(), p]));
    for (const l of links) {
      const p = l.name ? byId.get(l.id) : undefined;
      if (p && l.name) m.set(l.name.toLowerCase(), p); // Cycle 7 names win over Cycle 6 ones
    }
    return m;
  }, [pts, links, byId]);

  /** Per plugin layer that lists neighbours of the selected system. */
  const layerNeighbours = useMemo(
    () =>
      Object.entries(layers)
        .filter(([, l]) => l.neighboursTitle)
        .map(([id, l]) => ({ id, title: l.neighboursTitle!, m: adjacency(l.edges) })),
    [layers],
  );

  const entriesBySystem = useMemo(() => {
    const m = new Map<number, ScoutEntry[]>();
    for (const e of entries) {
      const p = byName.get(e.system.toLowerCase());
      if (!p) continue;
      (m.get(p.sys.id) ?? m.set(p.sys.id, []).get(p.sys.id)!).push(e);
    }
    return m;
  }, [entries, byName]);

  const unmappedEntries = useMemo(
    () => entries.filter((e) => !byName.has(e.system.toLowerCase())),
    [entries, byName],
  );

  /** Confirmed Cycle 7 connections (from in-game Adjacent / Route tabs). */
  const c7Neighbours = useMemo(() => adjacency(edges.map(({ a, b }) => [a, b] as [number, number])), [edges]);

  const currentPt =
    (currentSystemId != null ? byId.get(currentSystemId) : undefined) ??
    (currentSystem ? byName.get(currentSystem.toLowerCase()) ?? null : null);

  return {
    base,
    baseError,
    mapPlugins,
    layerSetters,
    layers,
    currentSystem,
    currentSystemId,
    links,
    edges,
    lastIngested,
    setLastIngested,
    logLite,
    setLogLite,
    areaNames,
    pts,
    byId,
    linkById,
    nameOf,
    layerNeighbours,
    entriesBySystem,
    unmappedEntries,
    c7Neighbours,
    currentPt,
  };
}

export type MapData = ReturnType<typeof useMapData>;
