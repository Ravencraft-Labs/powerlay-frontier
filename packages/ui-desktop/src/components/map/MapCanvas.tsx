// POC (throwaway, not for release): star map canvas — drawing, zoom and pan. Layers, dimmest to brightest:
//   1. Cycle 6 systems from our last pre-fog client extraction — thin grey, "unverified / outdated"
//   2. Edge layers contributed by local plugins (see ../../plugins) — each with its own style
//   3. Live data: systems with active scout entries, the current system from the chat log, and systems
//      whose Cycle 7 name ↔ ID was confirmed via a chat link copied to the clipboard — bright
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { edgeColor, ENTRY_COLORS, TRAVEL_COLOR, type MapData, type Pt } from "./useMapData";

interface View {
  cx: number;
  cy: number;
  /** Screen pixels per world unit. */
  k: number;
}

/** Zoom used when jumping to a single system. */
export const FOCUS_ZOOM = 60;

export interface MapCanvasHandle {
  center(p: Pt, zoomTo?: number): void;
}

interface MapCanvasProps {
  data: MapData;
  showBase: boolean;
  selectedId: number | null;
  onSelect(id: number | null): void;
  /** Keep the current system centred (mini-map); otherwise start fitted to all systems. */
  followCurrent?: boolean;
  /** Leave the background clear so the window's own (semi-transparent) background shows through. */
  transparent?: boolean;
  className?: string;
  /** Drawn over the canvas, e.g. a legend. */
  children?: React.ReactNode;
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  { data, showBase, selectedId, onSelect, followCurrent, transparent, className, children },
  ref,
) {
  const { pts, byId, layers, visibleEdges, links, entriesBySystem, currentPt, layerNeighbours, nameOf, sessionHops, previousSystemId } = data;
  const [view, setView] = useState<View | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoverId, setHoverId] = useState<number | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  // --- sizing + initial view ---
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (view || pts.length === 0 || size.w < 10) return;
    if (followCurrent && currentPt) {
      setView({ cx: currentPt.wx, cy: currentPt.wy, k: FOCUS_ZOOM });
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.wx);
      maxX = Math.max(maxX, p.wx);
      minY = Math.min(minY, p.wy);
      maxY = Math.max(maxY, p.wy);
    }
    const k = 0.95 * Math.min(size.w / (maxX - minX), size.h / (maxY - minY));
    setView({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, k });
  }, [pts, size, view, followCurrent, currentPt]);

  // follow: re-centre when the current system changes (e.g. after a jump), keeping the zoom
  const currentId = currentPt?.sys.id ?? null;
  useEffect(() => {
    if (!followCurrent || currentId == null) return;
    const p = byId.get(currentId);
    if (p) setView((v) => ({ cx: p.wx, cy: p.wy, k: v?.k ?? FOCUS_ZOOM }));
  }, [followCurrent, currentId, byId]);

  const toScreen = useCallback(
    (wx: number, wy: number): [number, number] =>
      view ? [(wx - view.cx) * view.k + size.w / 2, (wy - view.cy) * view.k + size.h / 2] : [0, 0],
    [view, size],
  );

  useImperativeHandle(
    ref,
    () => ({
      center: (p, zoomTo) => setView((v) => (v ? { cx: p.wx, cy: p.wy, k: Math.max(v.k, zoomTo ?? v.k) } : v)),
    }),
    [],
  );

  // --- drawing ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (transparent) {
      ctx.clearRect(0, 0, size.w, size.h);
    } else {
      ctx.fillStyle = "#0d0e11";
      ctx.fillRect(0, 0, size.w, size.h);
    }

    const onScreen = (x: number, y: number, pad = 20) => x > -pad && y > -pad && x < size.w + pad && y < size.h + pad;

    // 2. plugin edge layers
    for (const layer of Object.values(layers)) {
      if (!layer.visible) continue;
      ctx.strokeStyle = layer.color;
      ctx.lineWidth = layer.lineWidth ?? 0.6;
      ctx.beginPath();
      for (const [a, b] of layer.edges) {
        const pa = byId.get(a), pb = byId.get(b);
        if (!pa || !pb) continue;
        const [x1, y1] = toScreen(pa.wx, pa.wy);
        const [x2, y2] = toScreen(pb.wx, pb.wy);
        if (!onScreen(x1, y1, 400) && !onScreen(x2, y2, 400)) continue;
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.stroke();
    }

    // 1. Cycle 6 systems
    const visible: Pt[] = [];
    if (showBase) {
      ctx.fillStyle = "rgba(161, 161, 170, 0.45)";
      const r = view.k > 40 ? 1.6 : 0.9;
      for (const p of pts) {
        const [x, y] = toScreen(p.wx, p.wy);
        if (!onScreen(x, y)) continue;
        visible.push(p);
        ctx.fillRect(x - r / 2, y - r / 2, r, r);
      }
    }

    // One name label per system: the brightest layer that marks it labels it, the others don't repeat it.
    const sel = selectedId != null ? byId.get(selectedId) : undefined;
    const currentId = currentPt?.sys.id;
    /** Systems named by the current / selected / confirmed-link labels. */
    const named = new Set<number>(links.map((l) => l.id));
    if (currentId != null) named.add(currentId);
    if (sel) named.add(sel.sys.id);

    // grey labels when zoomed in enough
    if (showBase && visible.length < 250) {
      ctx.fillStyle = "rgba(161, 161, 170, 0.6)";
      ctx.font = "10px ui-monospace, monospace";
      for (const p of visible) {
        if (named.has(p.sys.id) || entriesBySystem.has(p.sys.id)) continue;
        const [x, y] = toScreen(p.wx, p.wy);
        ctx.fillText(p.sys.n, x + 4, y - 3);
      }
    }

    // confirmed Cycle 7 connections — bright, coloured by gate kind; several between one pair are drawn side by side
    ctx.lineWidth = 1.6;
    const byPair = new Map<string, typeof visibleEdges>();
    for (const e of visibleEdges) {
      const key = `${e.a}-${e.b}`;
      (byPair.get(key) ?? byPair.set(key, []).get(key)!).push(e);
    }
    for (const group of byPair.values()) {
      const pa = byId.get(group[0].a), pb = byId.get(group[0].b);
      if (!pa || !pb) continue;
      const [x1, y1] = toScreen(pa.wx, pa.wy);
      const [x2, y2] = toScreen(pb.wx, pb.wy);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
      group.forEach((e, i) => {
        const off = (i - (group.length - 1) / 2) * 3.5;
        ctx.strokeStyle = edgeColor(e);
        ctx.beginPath();
        ctx.moveTo(x1 + nx * off, y1 + ny * off);
        ctx.lineTo(x2 + nx * off, y2 + ny * off);
        ctx.stroke();
      });
    }

    // this session's travel path; dashed where there was no gate (ship jump, respawn)
    ctx.strokeStyle = TRAVEL_COLOR;
    ctx.lineWidth = 2.2;
    for (const h of sessionHops) {
      const pa = byId.get(h.fromSystemId), pb = byId.get(h.toSystemId);
      if (!pa || !pb) continue;
      const [x1, y1] = toScreen(pa.wx, pa.wy);
      const [x2, y2] = toScreen(pb.wx, pb.wy);
      ctx.setLineDash(h.via === "stargate" || h.via === "deployable-gate" ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = TRAVEL_COLOR;
    for (const h of sessionHops) {
      const p = byId.get(h.toSystemId);
      if (!p) continue;
      const [x, y] = toScreen(p.wx, p.wy);
      if (!onScreen(x, y)) continue;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // selected system's gate links, brighter
    if (sel) {
      const [sx, sy] = toScreen(sel.wx, sel.wy);
      ctx.strokeStyle = "rgba(226, 232, 240, 0.7)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const nid of layerNeighbours.flatMap((l) => l.m.get(sel.sys.id) ?? [])) {
        const n = byId.get(nid);
        if (!n) continue;
        const [nx, ny] = toScreen(n.wx, n.wy);
        ctx.moveTo(sx, sy);
        ctx.lineTo(nx, ny);
      }
      ctx.stroke();
    }

    // 3. live data
    ctx.font = "600 11px ui-monospace, monospace";
    for (const [id, list] of entriesBySystem) {
      const p = byId.get(id);
      if (!p) continue;
      const [x, y] = toScreen(p.wx, p.wy);
      if (!onScreen(x, y)) continue;
      const types = [...new Set(list.map((e) => e.type))];
      types.forEach((t, i) => {
        ctx.fillStyle = ENTRY_COLORS[t] ?? "#e4e4e7";
        ctx.beginPath();
        ctx.arc(x + i * 7, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      // scout entries count; the name too unless another label already shows it
      ctx.fillStyle = "#f4f4f5";
      const label = named.has(id) ? `${list.length}` : `${nameOf(p)} · ${list.length}`;
      ctx.fillText(label, x + 6 + (types.length - 1) * 7, y - 6);
    }

    // confirmed via chat link: Cycle 7 name, white
    for (const l of links) {
      const p = byId.get(l.id);
      if (!p) continue;
      const [x, y] = toScreen(p.wx, p.wy);
      if (!onScreen(x, y)) continue;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (l.id === currentId || l.id === sel?.sys.id) continue; // labelled below
      ctx.fillStyle = "#e4e4e7";
      ctx.fillText(l.name ?? `${l.linkTexts[0]}…`, x + 5, y + 12);
    }

    const prev = previousSystemId != null && previousSystemId !== currentId ? byId.get(previousSystemId) : undefined;
    if (prev) {
      const [x, y] = toScreen(prev.wx, prev.wy);
      ctx.strokeStyle = TRAVEL_COLOR;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.stroke();
      if (prev.sys.id !== sel?.sys.id) {
        ctx.fillStyle = TRAVEL_COLOR;
        ctx.fillText(`◀ ${nameOf(prev)}`, x + 9, y + 4);
      }
    }

    if (currentPt) {
      const [x, y] = toScreen(currentPt.wx, currentPt.wy);
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#eab308";
      ctx.fillText(`▶ ${nameOf(currentPt)}`, x + 11, y + 4);
    }

    if (sel) {
      const [x, y] = toScreen(sel.wx, sel.wy);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - 6, y - 6, 12, 12);
      if (sel.sys.id !== currentId) {
        ctx.fillStyle = "#ffffff";
        ctx.fillText(nameOf(sel), x + 9, y + 14);
      }
    }

    const hov = hoverId != null && hoverId !== selectedId ? byId.get(hoverId) : undefined;
    if (hov) {
      const [x, y] = toScreen(hov.wx, hov.wy);
      ctx.fillStyle = "#e4e4e7";
      ctx.fillText(nameOf(hov), x + 8, y - 8);
    }
  }, [view, size, pts, byId, layers, showBase, entriesBySystem, currentPt, selectedId, hoverId, layerNeighbours, toScreen, links, nameOf, visibleEdges, transparent, sessionHops, previousSystemId]);

  // --- interaction ---
  const nearest = useCallback(
    (mx: number, my: number, maxPx = 8): Pt | null => {
      let best: Pt | null = null;
      let bestD = maxPx * maxPx;
      for (const p of pts) {
        const [x, y] = toScreen(p.wx, p.wy);
        const d = (x - mx) ** 2 + (y - my) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    },
    [pts, toScreen],
  );

  function localXY(e: React.MouseEvent | React.WheelEvent): [number, number] {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function onWheel(e: React.WheelEvent) {
    if (!view) return;
    const [mx, my] = localXY(e);
    const f = Math.exp(-e.deltaY * 0.0015);
    const wx = (mx - size.w / 2) / view.k + view.cx;
    const wy = (my - size.h / 2) / view.k + view.cy;
    const k = Math.min(Math.max(view.k * f, 0.05), 5000);
    setView({ k, cx: wx - (mx - size.w / 2) / k, cy: wy - (my - size.h / 2) / k });
  }

  function onMouseDown(e: React.MouseEvent) {
    dragRef.current = { x: e.clientX, y: e.clientY, moved: false };
  }

  function onMouseMove(e: React.MouseEvent) {
    const d = dragRef.current;
    if (d && view) {
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
      d.x = e.clientX;
      d.y = e.clientY;
      setView({ ...view, cx: view.cx - dx / view.k, cy: view.cy - dy / view.k });
      return;
    }
    const [mx, my] = localXY(e);
    setHoverId(nearest(mx, my)?.sys.id ?? null);
  }

  function onMouseUp(e: React.MouseEvent) {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) return;
    const [mx, my] = localXY(e);
    onSelect(nearest(mx, my)?.sys.id ?? null);
  }

  return (
    <div ref={wrapRef} className={`relative overflow-hidden ${className ?? ""}`}>
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, display: "block", cursor: dragRef.current ? "grabbing" : "crosshair" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={() => {
          dragRef.current = null;
          setHoverId(null);
        }}
      />
      {children}
    </div>
  );
});
