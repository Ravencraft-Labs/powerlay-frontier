import React from "react";
import { OVERLAY_FRAME_CLASSES } from "../overlayStyles";

export interface OverlayFrameProps {
  title: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Shared layout for overlay frames.
 * Provides consistent container and header styling; content is passed as children.
 */
export function OverlayFrame({ title, children }: OverlayFrameProps) {
  return (
    <div className={OVERLAY_FRAME_CLASSES.container}>
      <div className={OVERLAY_FRAME_CLASSES.header}>{title}</div>
      {children}
    </div>
  );
}
