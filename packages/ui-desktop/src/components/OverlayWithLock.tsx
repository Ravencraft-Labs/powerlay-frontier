import React, { useState, useEffect, useCallback } from "react";

type OverlayFrame = "todo" | "builder";

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

export interface OverlayWithLockProps {
  frame: OverlayFrame;
  btnCls: string;
}

export function OverlayWithLock({ frame, btnCls }: OverlayWithLockProps) {
  const [locked, setLocked] = useState(false);

  const loadLockState = useCallback(async () => {
    const lockedState = await window.efOverlay?.overlay?.getLockState?.(frame);
    if (typeof lockedState === "boolean") setLocked(lockedState);
  }, [frame]);

  useEffect(() => {
    if (!window.efOverlay?.overlay?.getLockState) return;
    loadLockState();
  }, [loadLockState]);

  const handleToggleOverlay = () => {
    window.efOverlay?.overlay?.toggle?.(frame);
  };

  const handleToggleLock = async () => {
    const newLocked = await window.efOverlay?.overlay?.toggleLock?.(frame);
    if (typeof newLocked === "boolean") setLocked(newLocked);
  };

  const hasOverlayApi = typeof window !== "undefined" && window.efOverlay?.overlay?.toggle;
  const hasLockApi = typeof window !== "undefined" && window.efOverlay?.overlay?.toggleLock;

  if (!hasOverlayApi) return null;

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={btnCls} onClick={handleToggleOverlay}>
        Overlay
      </button>
      {hasLockApi && (
        <button
          type="button"
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded text-muted hover:text-text hover:bg-border transition-colors ${locked ? "text-amber-500" : ""}`}
          onClick={handleToggleLock}
          title={locked ? "Overlay locked (click-through)" : "Unlock overlay to move it"}
        >
          {locked ? <LockClosedIcon /> : <LockOpenIcon />}
        </button>
      )}
    </div>
  );
}
