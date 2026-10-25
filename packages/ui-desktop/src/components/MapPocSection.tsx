// POC (throwaway, not for release): star map tab — the map canvas (./map/MapCanvas) plus search, layer toggles,
// chat-link capture, LogLite feed and the selected-system panel. Data comes from ./map/useMapData.
import React, { useCallback, useMemo, useRef, useState } from "react";
import type { PocEdgeResult, PocLogLiteStatus } from "../preload";
import { OverlayWithLock } from "./OverlayWithLock";
import { FOCUS_ZOOM, MapCanvas, type MapCanvasHandle } from "./map/MapCanvas";
import { DormantGatesPanel } from "./map/DormantGatesPanel";
import { TravelPanel } from "./map/TravelPanel";
import {
  EDGE_COLORS,
  EDGE_KIND_LABELS,
  EDGE_KIND_SHORT,
  GATE_TYPE_NAMES,
  edgeColor,
  edgeKind,
  ENTRY_COLORS,
  TRAVEL_COLOR,
  useMapData,
  type EdgeKind,
  type Pt,
} from "./map/useMapData";
import type { PocEdge } from "../preload";

const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";
const btnCls =
  "px-3 py-1 text-xs rounded-md border border-border/60 text-muted hover:text-text hover:border-border cursor-pointer bg-transparent disabled:opacity-50 disabled:cursor-default";

export function MapPocSection() {
  const data = useMapData({ watchClipboard: true });
  const {
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
  } = data;
  const [showBase, setShowBase] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [edgeResult, setEdgeResult] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const canvasRef = useRef<MapCanvasHandle>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Pt[] = [];
    for (const l of links) {
      const p = byId.get(l.id);
      if (p && l.name?.toLowerCase().includes(q)) out.push(p);
    }
    for (const p of pts) {
      if (out.length >= 8) break;
      if (p.sys.n.toLowerCase().includes(q) && !out.includes(p)) out.push(p);
    }
    return out.slice(0, 8);
  }, [query, pts, links, byId]);

  const focusOn = useCallback((p: Pt, zoomTo?: number) => {
    setSelectedId(p.sys.id);
    canvasRef.current?.center(p, zoomTo);
  }, []);

  const selected = selectedId != null ? byId.get(selectedId) : undefined;
  const selectedEntries = selected ? entriesBySystem.get(selected.sys.id) ?? [] : [];
  /** Selected system's connections grouped by neighbour: two entries for one neighbour = two different ways there. */
  const selectedLinks = useMemo(() => {
    if (!selected) return [];
    const byNeighbour = new Map<number, PocEdge[]>();
    for (const e of edgesBySystem.get(selected.sys.id) ?? []) {
      const n = e.a === selected.sys.id ? e.b : e.a;
      (byNeighbour.get(n) ?? byNeighbour.set(n, []).get(n)!).push(e);
    }
    return [...byNeighbour.entries()];
  }, [selected, edgesBySystem]);

  function edgeTitle(e: PocEdge): string {
    const parts = [e.gateTypeId != null ? GATE_TYPE_NAMES[e.gateTypeId] ?? `type ${e.gateTypeId}` : EDGE_KIND_SHORT[edgeKind(e)]];
    if (e.gateOwnerName) parts.push(e.gateOwnerName);
    if (e.gateTribeId != null) parts.push(e.gateTribeId === myTribeId ? "your tribe" : `tribe ${e.gateTribeId}`);
    else if (e.gateOwner === "player") parts.push("no player tribe");
    if (e.scouted) parts.push("scouted, not travelled");
    if (e.gateId != null) parts.push(`gate ${e.gateId}`);
    return parts.join(" · ");
  }

  function reportEdges(res: PocEdgeResult | undefined, what: string) {
    if (!res) return;
    const parts = [`${what}: +${res.added.length} connection${res.added.length === 1 ? "" : "s"}`];
    if (res.error) parts.push(res.error);
    setEdgeResult(parts.join(" · "));
    if (res.ingested.length) setLastIngested(res.ingested);
  }

  return (
    <section className={`${sectionCls} flex-1 min-h-0 flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-base font-semibold text-text">
          Map <span className="text-xs font-normal text-accent">POC</span>
        </h2>
        <div className="relative">
          <input
            className="w-64 px-2 py-1 text-sm bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg"
            placeholder="Find system…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && matches[0]) {
                focusOn(matches[0], FOCUS_ZOOM);
                setQuery("");
              }
            }}
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-64 max-h-64 overflow-y-auto bg-surface border border-border rounded shadow-lg list-none m-0 p-0">
              {matches.map((p) => (
                <li key={p.sys.id}>
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1 text-sm text-text bg-transparent border-0 cursor-pointer hover:bg-selection-bg"
                    onClick={() => {
                      focusOn(p, FOCUS_ZOOM);
                      setQuery("");
                    }}
                  >
                    {nameOf(p)}
                    {linkById.get(p.sys.id)?.name ? <span className="text-muted text-xs"> · was {p.sys.n}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={showBase} onChange={(e) => setShowBase(e.target.checked)} />
            Cycle 6 systems
          </label>
          {mapPlugins.map((p) => {
            const Controls = p.contributions.map!.Controls;
            return <Controls key={p.id} setLayer={layerSetters.get(p.id)!} />;
          })}
          <OverlayWithLock frame="map" btnCls={btnCls} />
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap text-xs text-muted">
        <span>Connections:</span>
        {(Object.keys(EDGE_COLORS) as EdgeKind[]).map((k) => (
          <React.Fragment key={k}>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={edgeFilter.kinds[k]}
                onChange={(e) => setEdgeFilter({ ...edgeFilter, kinds: { ...edgeFilter.kinds, [k]: e.target.checked } })}
              />
              <span style={{ color: EDGE_COLORS[k] }}>—</span>
              {EDGE_KIND_LABELS[k]} ({edges.filter((x) => edgeKind(x) === k).length})
            </label>
            {k === "catapult" && (
              <label
                className={`flex items-center gap-1 ${myTribeId == null ? "opacity-50" : "cursor-pointer"}`}
                title={myTribeId == null ? "Sign in with your wallet so the app knows your tribe" : undefined}
              >
                <input
                  type="checkbox"
                  disabled={myTribeId == null || (!edgeFilter.kinds.gate && !edgeFilter.kinds.catapult)}
                  checked={edgeFilter.myTribeOnly}
                  onChange={(e) => setEdgeFilter({ ...edgeFilter, myTribeOnly: e.target.checked })}
                />
                gates &amp; catapults of my tribe only
              </label>
            )}
          </React.Fragment>
        ))}
        <span className="text-[11px]">Several connections between two systems are drawn side by side.</span>
      </div>

      {baseError && <div className="px-3 py-2 rounded-md border border-red-500/40 bg-red-500/10 text-xs text-red-400">{baseError}</div>}

      <div className="flex-1 min-h-[480px] flex gap-3">
        <MapCanvas
          ref={canvasRef}
          data={data}
          showBase={showBase}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="flex-1 min-w-0 rounded-md border border-border"
        >
          <div className="absolute left-2 bottom-2 px-2 py-1.5 rounded bg-black/60 text-[11px] leading-4 text-muted pointer-events-none">
            <div><span className="text-zinc-400">●</span> Cycle 6 systems — our last pre-fog client data ({base?.systems.length ?? 0}), unverified for Cycle 7</div>
            {Object.entries(layers).map(([id, l]) =>
              l.legend ? (
                <div key={id}>
                  <span style={{ color: l.color }}>—</span> {l.legend}
                </div>
              ) : null,
            )}
            <div>
              Cycle 7 connections confirmed in game: {visibleEdges.length} of {edges.length} shown (filter above)
            </div>
            <div>
              <span style={{ color: TRAVEL_COLOR }}>—</span> this session's path (dashed: ship jump / respawn) ·{" "}
              <span style={{ color: TRAVEL_COLOR }}>◯</span> previous system
            </div>
            <div>
              <span className="text-accent">◯</span> current system ·{" "}
              {Object.entries(ENTRY_COLORS).map(([t, c]) => (
                <span key={t} style={{ color: c }}> ● {t}</span>
              ))}
            </div>
          </div>
        </MapCanvas>

        {/* Positioned so the side panels scroll inside the map's height instead of stretching the page. */}
        <div className="relative w-64 shrink-0">
        <aside className="absolute inset-0 flex flex-col gap-3 text-sm overflow-y-auto [&>*]:shrink-0">
          {logLite && <LogLitePanel status={logLite} onToggle={async (on) => {
            await window.efOverlay?.pocMap?.setLogLite?.(on);
            setLogLite((await window.efOverlay?.pocMap?.getLogLiteStatus?.()) ?? null);
          }} />}
          <TravelPanel data={data} onFocus={(p) => focusOn(p, FOCUS_ZOOM)} />
          <DormantGatesPanel data={data} systemId={selectedId ?? currentPt?.sys.id ?? currentSystemId} onFocus={(p) => focusOn(p, FOCUS_ZOOM)} />
          <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted flex flex-col gap-1.5">
            <div className="text-text font-medium">Chat links → map</div>
            <div>Watching the clipboard. Copy a chat message with a system link — it gets pinned to the map.</div>
            {lastIngested.map((l) => {
              const p = byId.get(l.id);
              return (
                <button key={l.id} type="button" className={`${btnCls} text-left`} onClick={() => p && focusOn(p, FOCUS_ZOOM)} disabled={!p}>
                  ✓ {l.name ?? `${l.linkTexts.join(", ")}…`} → {l.id}
                  {p ? ` (Cycle 6: ${p.sys.n})` : " (not in Cycle 6 data)"}
                </button>
              );
            })}
            <input
              className="px-2 py-1 bg-bg border border-border-input rounded text-text focus:outline-none focus:border-selection-bg"
              placeholder="…or paste a link here"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key !== "Enter") return;
                const res = await window.efOverlay?.pocMap?.ingestText?.(pasteText);
                if (/0x[0-9a-f]{64}/i.test(pasteText)) {
                  const scout = await window.efOverlay?.pocMap?.scoutGate?.(pasteText);
                  if (scout) setLastGateScout(scout);
                  setPasteText("");
                }
                if (res?.length) {
                  setLastIngested(res);
                  setPasteText("");
                  const p = byId.get(res[0].id);
                  if (p) focusOn(p, FOCUS_ZOOM);
                }
              }}
            />
            <div className="flex gap-1 flex-wrap">
              <button
                type="button"
                className={btnCls}
                title="In game: open your current system's info → Adjacent Solar Systems, drag them into chat, copy the lines"
                onClick={async () => reportEdges(await window.efOverlay?.pocMap?.addAdjacent?.(null), "Adjacent of current")}
              >
                Adjacent of current
              </button>
              <button
                type="button"
                className={btnCls}
                title="In game: open a system's info → Route, drag the route systems into chat in order, copy the lines"
                onClick={async () => reportEdges(await window.efOverlay?.pocMap?.addRoute?.(), "Route")}
              >
                Route from current
              </button>
            </div>
            {edgeResult && <div className="text-text">{edgeResult}</div>}
            <div className="text-[11px]">
              Gate or catapult without jumping: in its info window copy the <b>assembly id</b> and the <b>destination system</b>{" "}
              link (either order). It is added from the current system as a dashed connection.
            </div>
            {lastGateScout && lastGateScout.found !== "nothing" && (
              <div className={lastGateScout.error ? "text-amber-400" : lastGateScout.edge ? "text-green-400" : "text-text"}>
                {lastGateScout.error ??
                  (lastGateScout.edge
                    ? `✓ Scouted: ${lastGateScout.edge.gateTypeId != null ? GATE_TYPE_NAMES[lastGateScout.edge.gateTypeId] ?? "gate" : "gate"} → ${linkById.get(lastGateScout.edge.a === currentSystemId ? lastGateScout.edge.b : lastGateScout.edge.a)?.name ?? "system"}`
                    : lastGateScout.found === "gate"
                      ? "Gate recognised — now copy its destination system link"
                      : "Destination noted — now copy the gate's assembly id")}
              </div>
            )}
            <div>
              Confirmed systems: {links.length} · connections: {edges.length}
              {currentSystem && currentSystemId == null ? " · current system ID unknown" : ""}
            </div>
          </div>
          {selected ? (
            <div className="p-3 rounded-md border border-border/50 bg-bg/40 flex flex-col gap-2">
              <div className="font-semibold text-text">{nameOf(selected)}</div>
              {linkById.get(selected.sys.id) && (
                <div className="text-xs text-muted">
                  Cycle 6 name: {selected.sys.n} · confirmed via{" "}
                  {linkById.get(selected.sys.id)!.source === "current-system" ? "chat link + Local log" : "chat link"}
                </div>
              )}
              <div className="text-xs text-muted">
                id {selected.sys.id} · region {areaNames.regions[selected.sys.r] ?? selected.sys.r} · const.{" "}
                {areaNames.constellations[selected.sys.c] ?? selected.sys.c}
              </div>
              <div className="text-[11px] text-muted italic">Position from Cycle 6 data — may be wrong now.</div>
              <div>
                <div className="text-xs text-muted mb-1">Cycle 7 connections, confirmed ({selectedLinks.length})</div>
                <div className="flex flex-col gap-1">
                  {selectedLinks.map(([nid, list]) => {
                    const n = byId.get(nid);
                    return (
                      <div key={nid} className="flex items-center gap-1.5 flex-wrap">
                        {n ? (
                          <button type="button" className={btnCls} onClick={() => focusOn(n)}>
                            {nameOf(n)}
                          </button>
                        ) : (
                          <span className="text-xs text-muted">{linkById.get(nid)?.name ?? nid}</span>
                        )}
                        {list.map((e, i) => (
                          <span key={i} className="text-[11px]" style={{ color: edgeColor(e) }} title={edgeTitle(e)}>
                            {e.scouted ? "○" : "●"} {EDGE_KIND_SHORT[edgeKind(e)]}
                            {e.gateTribeId != null && e.gateTribeId === myTribeId ? " (yours)" : ""}
                          </span>
                        ))}
                        {list.length > 1 && <span className="text-[11px] text-muted">{list.length} ways</span>}
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className={`${btnCls} mt-1`}
                  title="In game: this system's info → Adjacent Solar Systems, drag them into chat, copy the lines, then press this"
                  onClick={async () =>
                    reportEdges(await window.efOverlay?.pocMap?.addAdjacent?.(selected.sys.id), `Adjacent of ${nameOf(selected)}`)
                  }
                >
                  Paste its adjacent systems
                </button>
              </div>
              {layerNeighbours.map(({ id, title, m }) => {
                const ids = m.get(selected.sys.id) ?? [];
                return (
                  <div key={id}>
                    <div className="text-xs text-muted mb-1">
                      {title} ({ids.length})
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ids.map((nid) => {
                        const n = byId.get(nid);
                        return n ? (
                          <button key={nid} type="button" className={btnCls} onClick={() => focusOn(n)}>
                            {nameOf(n)}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                );
              })}
              <div>
                <div className="text-xs text-muted mb-1">Scout entries ({selectedEntries.length})</div>
                {selectedEntries.length === 0 && <div className="text-xs text-muted">None. Add them in the Scout tab.</div>}
                {selectedEntries.map((e) => (
                  <div key={e.id} className="text-xs text-text">
                    <span style={{ color: ENTRY_COLORS[e.type] }}>●</span> {e.type}
                    {e.subtype ? ` · ${e.subtype}` : ""}
                    {e.notes ? <div className="text-muted pl-3">{e.notes}</div> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted">
              Click a star or search by name. Scroll to zoom, drag to pan.
            </div>
          )}
          <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted flex flex-col gap-1">
            <div>
              Current system:{" "}
              {currentPt ? (
                <button
                  type="button"
                  className="text-accent bg-transparent border-0 p-0 cursor-pointer underline decoration-dotted"
                  onClick={() => focusOn(currentPt, FOCUS_ZOOM)}
                  title="Center the map on it"
                >
                  {currentSystem}
                </button>
              ) : (
                <span className="text-accent">{currentSystem ?? "—"}</span>
              )}
              {currentSystem && !currentPt && (
                <div className="mt-0.5">
                  ID unknown — it has a Cycle 7 name. Drag it into game chat, copy the line and it will be placed.
                </div>
              )}
            </div>
            <div>Systems with scout entries: {entriesBySystem.size}</div>
            {unmappedEntries.length > 0 && (
              <div>
                Not on map ({unmappedEntries.length}): {[...new Set(unmappedEntries.map((e) => e.system))].join(", ")}
              </div>
            )}
          </div>
        </aside>
        </div>
      </div>
    </section>
  );
}

const LOGLITE_STATE_LABEL: Record<PocLogLiteStatus["state"], string> = {
  off: "Off",
  listening: "Waiting for the game client… (start or restart it)",
  connected: "Game client connected",
  error: "Error",
};

const FEED_COLORS: Partial<Record<string, string>> = {
  "edge-added": "text-cyan-300",
  hop: "text-purple-400",
  "name-bound": "text-green-400",
  system: "text-text",
  disconnected: "text-amber-400",
};

/** Client connection, jumps (with gate kind) and new connections; warps, name binds etc. are noise here. */
const FEED_KINDS_SHOWN = new Set(["connected", "disconnected", "hop", "edge-added"]);

function LogLitePanel({ status, onToggle }: { status: PocLogLiteStatus; onToggle: (on: boolean) => void }) {
  const on = status.state !== "off";
  const feed = status.feed.filter((f) => FEED_KINDS_SHOWN.has(f.kind));
  return (
    <div className="p-3 rounded-md border border-border/50 bg-bg/40 text-xs text-muted flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-text font-medium">LogLite → map</span>
        <button type="button" className={btnCls} onClick={() => onToggle(!on)}>
          {on ? "Stop reading LogLite" : "Read LogLite"}
        </button>
      </div>
      <div className={status.state === "connected" ? "text-green-400" : status.state === "error" ? "text-red-400" : ""}>
        {status.error ?? LOGLITE_STATE_LABEL[status.state]}
      </div>
      {feed.length > 0 && (
        <div className="max-h-32 overflow-y-auto flex flex-col gap-0.5">
          {feed.map((f, i) => (
            <div key={`${f.at}-${i}`} className={FEED_COLORS[f.kind] ?? ""}>
              <span className="text-muted">{new Date(f.at).toLocaleTimeString()}</span> {f.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
