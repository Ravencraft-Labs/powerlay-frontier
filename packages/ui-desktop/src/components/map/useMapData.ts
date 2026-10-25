// POC (throwaway, not for release): star map data shared by the Map tab and the mini-map overlay window.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ScoutEntry } from "@powerlay/core";
import { usePlugins } from "../../plugins/PluginsProvider";
import type { MapEdgeLayer } from "../../plugins/types";
import type { PocEdge, PocGateScoutResult, PocLogLiteStatus, PocMapBase, PocMapSystem, PocSystemLink, PocTravel } from "../../preload";

/** Game coordinates are metres (~1e19); scale to a comfortable world unit. */
const WORLD_SCALE = 1e-16;

export const ENTRY_COLORS: Record<string, string> = {
  rift: "#22d3ee",
  anomaly: "#facc15",
  resource: "#4ade80",
  structure: "#fb923c",
  note: "#a1a1aa",
};

/** This session's travel path and the system we came from. */
export const TRAVEL_COLOR = "#c084fc";

/** Confirmed connections by kind: NPC stargates (also Adjacent / Route), player gates, catapults, the rest. */
export const EDGE_COLORS = {
  npc: "rgba(103, 232, 249, 0.85)",
  gate: "rgba(74, 222, 128, 0.9)",
  catapult: "rgba(251, 146, 60, 0.9)",
  /** Deployable gate not found on chain. */
  offchain: "rgba(248, 113, 113, 0.8)",
  /** Deployable gate whose owner isn't looked up yet. */
  deployable: "rgba(212, 212, 216, 0.7)",
} as const;

export type EdgeKind = keyof typeof EDGE_COLORS;

/** On-chain type IDs, from the game's types. */
export const GATE_TYPE_NAMES: Record<number, string> = {
  88086: "Mini Gate",
  84955: "Heavy Gate",
  95627: "Mini Catapult",
  95677: "Heavy Catapult",
};
const CATAPULT_TYPE_IDS = new Set([95627, 95677]);

export function edgeKind(e: PocEdge): EdgeKind {
  if (e.source !== "deployable") return "npc";
  if (e.gateOwner === "player") return e.gateTypeId != null && CATAPULT_TYPE_IDS.has(e.gateTypeId) ? "catapult" : "gate";
  return e.gateOwner ?? "deployable";
}

export function edgeColor(e: PocEdge): string {
  return EDGE_COLORS[edgeKind(e)];
}

/** For a single connection. */
export const EDGE_KIND_SHORT: Record<EdgeKind, string> = {
  npc: "NPC stargate",
  gate: "player gate",
  catapult: "catapult",
  offchain: "gate not on chain",
  deployable: "gate, owner unknown",
};

export const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
  npc: "NPC stargates",
  gate: "Player gates",
  catapult: "Catapults",
  offchain: "Not on chain",
  deployable: "Owner unknown",
};

/** Which connections the map draws. Shared by the Map tab and the mini-map window (same localStorage). */
export interface EdgeFilter {
  kinds: Record<EdgeKind, boolean>;
  /** Player gates and catapults: only those owned by your tribe. */
  myTribeOnly: boolean;
}

const EDGE_FILTER_KEY = "powerlay-map-edge-filter";
const DEFAULT_EDGE_FILTER: EdgeFilter = { kinds: { npc: true, gate: true, catapult: true, offchain: true, deployable: true }, myTribeOnly: false };

function loadEdgeFilter(): EdgeFilter {
  try {
    const raw = JSON.parse(localStorage.getItem(EDGE_FILTER_KEY) ?? "null") as Partial<EdgeFilter> | null;
    return { kinds: { ...DEFAULT_EDGE_FILTER.kinds, ...raw?.kinds }, myTribeOnly: !!raw?.myTribeOnly };
  } catch {
    return DEFAULT_EDGE_FILTER;
  }
}

function useEdgeFilter(): [EdgeFilter, (f: EdgeFilter) => void] {
  const [filter, setFilter] = useState<EdgeFilter>(loadEdgeFilter);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === EDGE_FILTER_KEY) setFilter(loadEdgeFilter());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const update = useCallback((f: EdgeFilter) => {
    setFilter(f);
    try {
      localStorage.setItem(EDGE_FILTER_KEY, JSON.stringify(f));
    } catch {
      /* ignore */
    }
  }, []);
  return [filter, update];
}

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
  const [lastGateScout, setLastGateScout] = useState<PocGateScoutResult | null>(null);
  const [logLite, setLogLite] = useState<PocLogLiteStatus | null>(null);
  const [areaNames, setAreaNames] = useState<AreaNames>({ regions: {}, constellations: {} });
  const [travel, setTravel] = useState<PocTravel | null>(null);
  const [edgeFilter, setEdgeFilter] = useEdgeFilter();
  const [myTribeId, setMyTribeId] = useState<number | null>(null);

  useEffect(() => {
    void window.efOverlay?.auth?.getSession().then((s) => {
      const t = Number(s?.tribeId);
      setMyTribeId(Number.isFinite(t) && t > 0 ? t : null);
    });
  }, []);

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
      const [list, cur, linkRes, logLiteRes, travelRes] = await Promise.all([
        window.efOverlay?.scout?.list?.(),
        window.efOverlay?.scout?.getActiveSystem?.(),
        window.efOverlay?.pocMap?.getLinks?.(),
        window.efOverlay?.pocMap?.getLogLiteStatus?.(),
        window.efOverlay?.pocMap?.getTravel?.(),
      ]);
      if (!alive) return;
      setTravel(travelRes ?? null);
      setLogLite(logLiteRes ?? null);
      if (list) setEntries(list.filter((e) => e.status === "active"));
      setCurrentSystem(cur ?? null);
      if (linkRes) {
        setLinks(linkRes.links);
        setLastIngested(linkRes.lastIngested);
        setLastGateScout(linkRes.lastGateScout);
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

  /** Confirmed connections the filter lets through. */
  const visibleEdges = useMemo(
    () =>
      edges.filter((e) => {
        const kind = edgeKind(e);
        if (!edgeFilter.kinds[kind]) return false;
        const owned = kind === "gate" || kind === "catapult";
        return !(owned && edgeFilter.myTribeOnly && (myTribeId == null || e.gateTribeId !== myTribeId));
      }),
    [edges, edgeFilter, myTribeId],
  );

  /** Every confirmed connection per system — a pair can appear more than once (NPC stargate + gates). */
  const edgesBySystem = useMemo(() => {
    const m = new Map<number, PocEdge[]>();
    for (const e of edges) {
      (m.get(e.a) ?? m.set(e.a, []).get(e.a)!).push(e);
      (m.get(e.b) ?? m.set(e.b, []).get(e.b)!).push(e);
    }
    return m;
  }, [edges]);

  const currentPt =
    (currentSystemId != null ? byId.get(currentSystemId) : undefined) ??
    (currentSystem ? byName.get(currentSystem.toLowerCase()) ?? null : null);

  /** One jump back: the last hop's origin, as long as that hop landed where we are now. */
  const lastHop = travel?.lastHop ?? null;
  const previousSystemId =
    lastHop && (currentPt == null || lastHop.toSystemId === currentPt.sys.id) ? lastHop.fromSystemId : null;
  const sessionHops = travel?.hops ?? [];

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
    lastGateScout,
    setLastGateScout,
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
    edgesBySystem,
    visibleEdges,
    edgeFilter,
    setEdgeFilter,
    myTribeId,
    currentPt,
    travel,
    setTravel,
    previousSystemId,
    sessionHops,
  };
}

export type MapData = ReturnType<typeof useMapData>;
