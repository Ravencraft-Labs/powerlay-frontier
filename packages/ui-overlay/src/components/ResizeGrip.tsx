import React, { useRef } from "react";

/** Smallest size an overlay can be dragged down to. */
export const MIN_OVERLAY_SIZE = { w: 200, h: 80 };

export interface ResizeGripProps {
  /** Size when the drag starts. */
  getSize: () => { w: number; h: number };
  onResize: (w: number, h: number) => void;
  onResizeEnd: (w: number, h: number) => void;
  /** Double-click: back to fitting the content. */
  onReset?: () => void;
}

/**
 * Bottom-right resize handle for frameless overlay windows (native resizing is unreliable on transparent windows).
 * Uses pointer capture and screen coordinates, so the drag keeps working while the window grows or shrinks under it.
 * Duplicated in ui-desktop (components/map/ResizeGrip.tsx) for the map overlay — keep the two in sync.
 */
export function ResizeGrip({ getSize, onResize, onResizeEnd, onReset }: ResizeGripProps) {
  const drag = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const sizeAt = (e: React.PointerEvent): [number, number] => {
    const d = drag.current!;
    return [Math.max(MIN_OVERLAY_SIZE.w, d.w + e.screenX - d.x), Math.max(MIN_OVERLAY_SIZE.h, d.h + e.screenY - d.y)];
  };

  return (
    <div
      className="overlay-no-drag absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize text-muted/60 hover:text-text"
      title={onReset ? "Drag to resize · double-click to fit content" : "Drag to resize"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const { w, h } = getSize();
        drag.current = { x: e.screenX, y: e.screenY, w, h };
      }}
      onPointerMove={(e) => {
        if (drag.current) onResize(...sizeAt(e));
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        const [w, h] = sizeAt(e);
        drag.current = null;
        onResizeEnd(w, h);
      }}
      onDoubleClick={onReset}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path d="M14 7L7 14M14 11L11 14" />
      </svg>
    </div>
  );
}
