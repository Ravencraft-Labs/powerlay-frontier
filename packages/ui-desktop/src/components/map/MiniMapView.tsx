// POC (throwaway, not for release): the mini-map overlay window (overlay frame "map", desktop renderer loaded
// with ?view=minimap). Toggled from the Map tab or the Scout overlay; has its own position and lock.
import React, { useEffect, useState } from "react";
import { MapCanvas } from "./MapCanvas";
import { ResizeGrip } from "./ResizeGrip";
import { useMapData } from "./useMapData";

/** Mini-map's own opacity setting, falling back to the shared overlay opacity. */
function useMiniMapOpacity(): number {
  const [opacity, setOpacity] = useState(92);
  useEffect(() => {
    const load = () =>
      window.efOverlay?.settings?.get().then((s) => {
        const v = s?.miniMapOpacity ?? s?.overlayOpacity;
        if (typeof v === "number") setOpacity(v);
      });
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, []);
  return opacity;
}

function useMapLock(): [boolean, () => Promise<void>] {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const load = () =>
      window.efOverlay?.overlay?.getLockState("map").then((v) => {
        if (typeof v === "boolean") setLocked(v);
      });
    void load();
    const id = setInterval(() => void load(), 500);
    return () => clearInterval(id);
  }, []);
  const toggle = async () => {
    const v = await window.efOverlay?.overlay?.toggleLock("map");
    if (typeof v === "boolean") setLocked(v);
  };
  return [locked, toggle];
}

function LockOpenIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

const headerBtnCls =
  "w-7 h-7 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border bg-transparent border-0 cursor-pointer transition-colors";

export function MiniMapView() {
  const data = useMapData({ watchClipboard: false });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const opacity = useMiniMapOpacity();
  const [locked, toggleLock] = useMapLock();
  const { mapPlugins, layerSetters, currentPt, currentSystem, nameOf } = data;

  return (
    <div
      className="overlay-drag relative h-screen flex flex-col rounded-[10px] border border-border/90 overflow-hidden backdrop-blur-md"
      style={{ backgroundColor: `color-mix(in srgb, var(--color-bg) ${opacity}%, transparent)` }}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border/90 text-[0.85rem] font-semibold text-text">
        <span className="min-w-0 truncate">
          Map <span className="font-mono font-normal text-xs text-accent">{currentPt ? nameOf(currentPt) : currentSystem ?? ""}</span>
        </span>
        {!locked && (
          <div className="overlay-no-drag flex items-center gap-0.5 shrink-0">
            <button type="button" className={headerBtnCls} onClick={() => void toggleLock()} title="Lock overlay (click-through)">
              <LockOpenIcon />
            </button>
            <button
              type="button"
              className={headerBtnCls}
              onClick={() => void window.efOverlay?.overlay?.hide("map")}
              title="Close map"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
      <MapCanvas
        data={data}
        showBase
        selectedId={selectedId}
        onSelect={setSelectedId}
        followCurrent
        transparent
        className="overlay-no-drag flex-1 min-h-0"
      />
      {!locked && (
        // The window is the map's size (main saves it on resize), so resize the window directly.
        <ResizeGrip
          getSize={() => ({ w: window.innerWidth, h: window.innerHeight })}
          onResize={(w, h) => window.efOverlay?.overlay?.setContentSize?.("map", w, h)}
          onResizeEnd={(w, h) => window.efOverlay?.overlay?.setContentSize?.("map", w, h)}
        />
      )}
      {/* Plugin layers come from their toolbar controls; mount them off-screen so the layers still load here. */}
      <div className="hidden">
        {mapPlugins.map((p) => {
          const Controls = p.contributions.map!.Controls;
          return <Controls key={p.id} setLayer={layerSetters.get(p.id)!} />;
        })}
      </div>
    </div>
  );
}
