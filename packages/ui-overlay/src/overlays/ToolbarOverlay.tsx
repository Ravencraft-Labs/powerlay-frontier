import React, { useCallback, useEffect, useRef, useState } from "react";
import { useEfOverlay } from "../hooks/useEfOverlay";
import type { OverlayBarState, OverlayShellFrame, OverlayWindowState } from "../preload.d";
import logoUrl from "../assets/logo.png";

const MODULES: Array<{ frame: OverlayShellFrame; label: string }> = [
  { frame: "scout", label: "Scout" },
  { frame: "contracts", label: "Contracts" },
  { frame: "map", label: "Map" },
];

/** Main window tabs → bar items ("builder" is the Builds dropdown). Default = the app's default tab order. */
type BarItem = OverlayShellFrame;
const DEFAULT_ORDER: BarItem[] = ["contracts", "builder", "scout", "map"];

function barOrder(tabOrder: string[] | undefined): BarItem[] {
  const known = (tabOrder ?? []).filter((t): t is BarItem => DEFAULT_ORDER.includes(t as BarItem));
  return [...new Set([...known, ...DEFAULT_ORDER])];
}

const EMPTY_STATE: OverlayBarState = { frames: {}, builds: {} };

function LockIcon({ open, size = 12 }: { open?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d={open ? "M7 11V7a5 5 0 0 1 9.9-1" : "M7 11V7a5 5 0 0 1 10 0v4"} />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  );
}

/** Always rendered (open or closed) so locking never changes the bar's width. */
function LockToggle({ locked, onClick, title }: { locked: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      className={`overlay-no-drag w-5 h-6 shrink-0 flex items-center justify-center rounded-sm transition-colors hover:bg-border ${
        locked ? "text-accent" : "text-muted/60 hover:text-text"
      }`}
      onClick={onClick}
      title={title}
    >
      <LockIcon open={!locked} size={11} />
    </button>
  );
}

function ToolbarButton({
  label,
  state,
  onClick,
  onToggleLock,
  title,
  children,
}: {
  label: string;
  state?: OverlayWindowState;
  onClick: () => void;
  /** Lockable overlays get a lock button beside the label; right-click on the label does the same. */
  onToggleLock?: () => void;
  title?: string;
  children?: React.ReactNode;
}) {
  const on = !!state?.visible;
  const button = (
    <button
      type="button"
      className={`overlay-no-drag flex items-center gap-1 px-2 h-6 rounded-sm text-[11px] font-semibold uppercase tracking-wider border transition-colors ${
        on ? "bg-accent/15 border-accent/60 text-accent" : "border-transparent text-muted hover:text-text hover:bg-border"
      }`}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggleLock?.();
      }}
      title={title}
    >
      {label}
      {children}
    </button>
  );
  if (!onToggleLock) return button;
  const locked = !!state?.locked;
  return (
    <span className="flex items-center">
      {button}
      <LockToggle locked={locked} onClick={onToggleLock} title={locked ? `Unlock the ${label} overlay` : `Lock the ${label} overlay (click-through)`} />
    </span>
  );
}

/**
 * Overlay bar: switches the other overlays on and off without going back to the app window.
 * Each overlay has its own lock button (right-click on its name does the same). The bar itself is never locked.
 */
export function ToolbarOverlay() {
  const api = useEfOverlay();
  const containerRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<OverlayBarState>(EMPTY_STATE);
  const [builds, setBuilds] = useState<Array<{ id: string; name: string; updatedAt: number }>>([]);
  const [buildsOpen, setBuildsOpen] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(92);
  const [order, setOrder] = useState<BarItem[]>(DEFAULT_ORDER);

  const loadBar = useCallback(async () => {
    const s = await api?.overlay?.getBarState?.();
    if (s) setBar(s);
  }, [api]);

  useEffect(() => {
    void loadBar();
    const id = setInterval(loadBar, 500);
    return () => clearInterval(id);
  }, [loadBar]);

  useEffect(() => {
    const load = () => {
      api?.settings?.get?.().then((s) => {
        if (typeof s?.overlayOpacity === "number") setBgOpacity(s.overlayOpacity);
        const next = barOrder(s?.tabOrder);
        setOrder((prev) => (prev.join() === next.join() ? prev : next));
      });
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [api]);

  useEffect(() => {
    if (!buildsOpen) return;
    const load = () => {
      api?.builds?.list().then((list) => setBuilds([...list].sort((a, b) => b.updatedAt - a.updatedAt)));
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [api, buildsOpen]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !api?.overlay?.setContentSize) return;
    const report = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) api.overlay!.setContentSize("toolbar", Math.ceil(rect.width), Math.ceil(rect.height));
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [api]);

  const run = (p: Promise<unknown> | undefined) => void p?.then(loadBar);

  const visible: OverlayWindowState[] = [
    ...Object.values(bar.frames).filter((s): s is OverlayWindowState => !!s?.visible),
    ...Object.values(bar.builds).filter((s) => s.visible),
  ];
  const allLocked = visible.length > 0 && visible.every((s) => s.locked);
  const openBuilds = Object.values(bar.builds).filter((s) => s.visible).length;
  const stashed = bar.stashed ?? 0;

  return (
    <div
      ref={containerRef}
      className="overlay-drag inline-flex flex-col rounded-md border border-border/90 backdrop-blur-md select-none"
      style={{ backgroundColor: `color-mix(in srgb, var(--color-bg) ${bgOpacity}%, transparent)` }}
    >
      <div className="flex items-center gap-0.5 px-1.5 py-1">
        <span className="flex items-center pr-1.5 mr-0.5 border-r border-border/90" title="Powerlay: drag to move">
          <img src={logoUrl} alt="Powerlay" width={18} height={18} className="rounded-sm" draggable={false} />
        </span>
        {order.map((item) => {
          if (item === "builder") {
            return (
              <ToolbarButton
                key={item}
                label="Builds"
                state={openBuilds > 0 ? { visible: true, locked: false } : undefined}
                onClick={() => setBuildsOpen((o) => !o)}
                title="Build overlays"
              >
                <span className="tabular-nums min-w-[1ch]">{openBuilds > 0 ? openBuilds : ""}</span>
                <span className="text-[9px]">{buildsOpen ? "▲" : "▼"}</span>
              </ToolbarButton>
            );
          }
          const m = MODULES.find((x) => x.frame === item);
          if (!m) return null;
          return (
            <ToolbarButton
              key={item}
              label={m.label}
              state={bar.frames[m.frame]}
              onClick={() => run(api?.overlay?.toggle?.(m.frame))}
              onToggleLock={() => run(api?.overlay?.toggleLock(m.frame))}
              title={`Show/hide the ${m.label} overlay`}
            />
          );
        })}
        <span className="w-px h-4 mx-1 bg-border" />
        <button
          type="button"
          className={`overlay-no-drag w-6 h-6 flex items-center justify-center rounded-sm transition-colors hover:bg-border disabled:opacity-40 ${
            stashed > 0 && visible.length === 0 ? "text-accent" : "text-muted hover:text-text"
          }`}
          onClick={() => run(api?.overlay?.toggleAllVisible?.())}
          disabled={visible.length === 0 && stashed === 0}
          title={visible.length > 0 ? "Hide all overlays" : "Show the hidden overlays again"}
        >
          <EyeIcon open={visible.length > 0 || stashed === 0} />
        </button>
        <button
          type="button"
          className={`overlay-no-drag w-6 h-6 flex items-center justify-center rounded-sm transition-colors hover:bg-border disabled:opacity-40 ${allLocked ? "text-accent" : "text-muted hover:text-text"}`}
          onClick={() => run(api?.overlay?.setAllLocked?.(!allLocked))}
          disabled={visible.length === 0}
          title={allLocked ? "Unlock all overlays" : "Lock all overlays (click-through)"}
        >
          <LockIcon open={!allLocked} size={13} />
        </button>
        <button
          type="button"
          className="overlay-no-drag w-6 h-6 flex items-center justify-center rounded-sm text-muted hover:text-text hover:bg-border transition-colors"
          onClick={() => void api?.overlay?.hide?.("toolbar")}
          title="Close the toolbar (reopen it from the app or the tray menu)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {buildsOpen && (
        <div className="overlay-no-drag border-t border-border/90 py-1 px-1 max-h-[260px] overflow-y-auto flex flex-col gap-0.5">
          {builds.length === 0 && <span className="px-2 py-1 text-[11px] text-muted">No builds yet</span>}
          {builds.map((b) => {
            const s = bar.builds[b.id];
            const on = !!s?.visible;
            const locked = !!s?.locked;
            const toggleLock = () => run(api?.overlay?.toggleLock("builder", b.id));
            return (
              <div key={b.id} className="flex items-center w-0 min-w-full">
                <button
                  type="button"
                  className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 h-6 rounded-sm text-[12px] text-left transition-colors ${
                    on ? "bg-accent/15 text-accent" : "text-muted hover:text-text hover:bg-border"
                  }`}
                  onClick={() => run(api?.overlay?.toggleBuilder?.(b.id))}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggleLock();
                  }}
                  title={`${b.name}: show/hide`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${on ? "bg-accent" : "bg-border-input"}`} />
                  <span className="flex-1 min-w-0 truncate">{b.name}</span>
                </button>
                <LockToggle locked={locked} onClick={toggleLock} title={locked ? "Unlock this build overlay" : "Lock this build overlay (click-through)"} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
