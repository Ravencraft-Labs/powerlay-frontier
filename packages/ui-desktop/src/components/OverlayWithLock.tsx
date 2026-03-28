import React, { useState, useEffect, useCallback } from "react";

type OverlayFrame = "contracts" | "builder" | "scout";

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
  const [visible, setVisible] = useState(false);

  const loadState = useCallback(async () => {
    const [lockedState, visibleState] = await Promise.all([
      window.efOverlay?.overlay?.getLockState?.(frame),
      window.efOverlay?.overlay?.getVisible?.(frame),
    ]);
    if (typeof lockedState === "boolean") setLocked(lockedState);
    if (typeof visibleState === "boolean") setVisible(visibleState);
  }, [frame]);

  useEffect(() => {
    if (!window.efOverlay?.overlay?.getLockState) return;
    loadState();
    const id = setInterval(loadState, 500);
    return () => clearInterval(id);
  }, [loadState]);

  const handleToggleOverlay = async () => {
    await window.efOverlay?.overlay?.toggle?.(frame);
    const v = await window.efOverlay?.overlay?.getVisible?.(frame);
    if (typeof v === "boolean") setVisible(v);
  };

  const handleToggleLock = async () => {
    const newLocked = await window.efOverlay?.overlay?.toggleLock?.(frame);
    if (typeof newLocked === "boolean") setLocked(newLocked);
  };

  const hasOverlayApi = typeof window !== "undefined" && window.efOverlay?.overlay?.toggle;
  const hasLockApi = typeof window !== "undefined" && window.efOverlay?.overlay?.toggleLock;

  if (!hasOverlayApi) return null;

  const overlayBtnCls = visible
    ? btnCls
        .replace("text-muted", "text-amber-400")
        .replace("border-border/60", "border-amber-400/60")
        .replace("hover:text-text", "hover:text-amber-300")
        .replace("hover:border-border", "hover:border-amber-400")
    : btnCls;

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={overlayBtnCls} onClick={() => void handleToggleOverlay()}>
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
