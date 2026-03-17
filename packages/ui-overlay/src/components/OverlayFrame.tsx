import React, { useEffect, useRef, useState, useCallback } from "react";
import { OVERLAY_FRAME_CLASSES } from "../overlayStyles";
import { getCurrentFrame } from "../overlayRegistry";
import { OverlayLockProvider } from "../context/OverlayLockContext";

export interface OverlayFrameProps {
  title: React.ReactNode;
  children: React.ReactNode | ((locked: boolean) => React.ReactNode);
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
export function OverlayFrame({ title, children }: OverlayFrameProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState(false);

  const loadLockState = useCallback(async () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { getLockState?: (f: string) => Promise<boolean> } } }).efOverlay;
    const lockedState = await api?.overlay?.getLockState?.(getCurrentFrame());
    if (typeof lockedState === "boolean") setLocked(lockedState);
  }, []);

  useEffect(() => {
    loadLockState();
    const id = setInterval(loadLockState, 500);
    return () => clearInterval(id);
  }, [loadLockState]);

  useEffect(() => {
    const el = containerRef.current;
    const api = (window as unknown as { efOverlay?: { overlay?: { setContentSize?: (f: string, w: number, h: number) => void } } }).efOverlay;
    if (!el || !api?.overlay?.setContentSize) return;

    const report = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        api.overlay!.setContentSize!(getCurrentFrame(), Math.ceil(rect.width), Math.ceil(rect.height));
      }
    };

    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleToggleLock = async () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { toggleLock?: (f: string) => Promise<boolean> } } }).efOverlay;
    const newLocked = await api?.overlay?.toggleLock?.(getCurrentFrame());
    if (typeof newLocked === "boolean") setLocked(newLocked);
  };

  const handleClose = () => {
    const api = (window as unknown as { efOverlay?: { overlay?: { hide?: (f: string) => void } } }).efOverlay;
    api?.overlay?.hide?.(getCurrentFrame());
  };

  const hasOverlayApi = typeof window !== "undefined" && (window as unknown as { efOverlay?: { overlay?: { toggleLock?: unknown; hide?: unknown } } }).efOverlay?.overlay?.toggleLock;

  return (
    <div ref={containerRef} className={OVERLAY_FRAME_CLASSES.container}>
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
