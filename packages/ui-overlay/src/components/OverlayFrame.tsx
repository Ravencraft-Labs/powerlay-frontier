import React, { useEffect, useRef, useState, useCallback } from "react";
import { OVERLAY_FRAME_CLASSES } from "../overlayStyles";
import { getCurrentFrame } from "../overlayRegistry";
import { OverlayLockProvider } from "../context/OverlayLockContext";

export interface OverlayFrameProps {
  title: React.ReactNode;
  children: React.ReactNode | ((locked: boolean) => React.ReactNode);
  /** For builder overlay: buildId for lock state and content size. */
  buildId?: string | null;
}

function LockClosedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function LockOpenIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/**
 * Shared layout for overlay frames.
 * Provides consistent container and header styling; content is passed as children.
 * Reports content size to main process so the overlay window matches exactly (no invisible click-blocking area).
 * When unlocked: shows lock and close buttons. When locked: hides all interactive buttons.
 */
export function OverlayFrame({ title, children, buildId }: OverlayFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);
  const [bgOpacity, setBgOpacity] = useState(92);
  const frame = getCurrentFrame();

  const loadLockState = useCallback(async () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { getLockState?: (f: string, bid?: string) => Promise<boolean> } } }).efOverlay;
    const lockedState = await api?.overlay?.getLockState?.(frame, frame === "builder" ? buildId ?? undefined : undefined);
    if (typeof lockedState === "boolean") setLocked(lockedState);
  }, [frame, buildId]);

  useEffect(() => {
    loadLockState();
    const id = setInterval(loadLockState, 500);
    return () => clearInterval(id);
  }, [loadLockState]);

  useEffect(() => {
    const api = (window as unknown as { efOverlay?: { settings?: { get?: () => Promise<{ overlayOpacity?: number }> } } }).efOverlay;
    api?.settings?.get?.().then((s) => {
      if (typeof s?.overlayOpacity === "number") setBgOpacity(s.overlayOpacity);
    });
    const id = setInterval(() => {
      api?.settings?.get?.().then((s) => {
        if (typeof s?.overlayOpacity === "number") setBgOpacity(s.overlayOpacity);
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    const api = (window as unknown as { efOverlay?: { overlay?: { setContentSize?: (f: string, w: number, h: number, bid?: string) => void } } }).efOverlay;
    if (!el || !api?.overlay?.setContentSize) return;

    const report = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        api.overlay!.setContentSize!(frame, Math.ceil(rect.width), Math.ceil(rect.height), frame === "builder" ? buildId ?? undefined : undefined);
      }
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [frame, buildId]);

  const handleToggleLock = async () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { toggleLock?: (f: string, bid?: string) => Promise<boolean> } } }).efOverlay;
    const newLocked = await api?.overlay?.toggleLock?.(frame, frame === "builder" ? buildId ?? undefined : undefined);
    if (typeof newLocked === "boolean") setLocked(newLocked);
  };

  const handleClose = () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { hide?: (f: string, bid?: string) => void; hideBuilder?: (bid: string) => void } } }).efOverlay;
    if (frame === "builder" && buildId) {
      api?.overlay?.hideBuilder?.(buildId);
    } else {
      api?.overlay?.hide?.(frame);
    }
  };

  const hasOverlayApi = typeof window !== "undefined" && (window as unknown as { efOverlay?: { overlay?: { toggleLock?: unknown; hide?: unknown } } }).efOverlay?.overlay?.toggleLock;

  return (
    <div
      ref={containerRef}
      className={OVERLAY_FRAME_CLASSES.container}
      style={{ backgroundColor: `color-mix(in srgb, var(--color-bg) ${bgOpacity}%, transparent)` }}
    >
      <div className={`${OVERLAY_FRAME_CLASSES.header} flex justify-between items-center gap-2`}>
        <span className="min-w-0 truncate">{title}</span>
        {!locked && hasOverlayApi && (
          <div className="flex items-center gap-0.5 shrink-0 overlay-no-drag">
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors"
              onClick={handleToggleLock}
              title="Lock overlay (click-through)"
            >
              <LockOpenIcon />
            </button>
            <button
              type="button"
              className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors"
              onClick={handleClose}
              title="Close overlay"
            >
              <CloseIcon />
            </button>
          </div>
        )}
      </div>
      <OverlayLockProvider locked={locked}>
        {typeof children === "function" ? children(locked) : children}
      </OverlayLockProvider>
    </div>
  );
}
