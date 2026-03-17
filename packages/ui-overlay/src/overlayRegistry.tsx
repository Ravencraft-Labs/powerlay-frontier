import React, { type ComponentType } from "react";
import { BuildTrackingOverlay } from "./BuildTrackingOverlay";
import { TribeTodoOverlay } from "./overlays/TribeTodoOverlay";

/** Supported overlay frame IDs. Add new frame IDs here to extend (Open/Closed). */
export type OverlayFrameId = "todo" | "builder";

/** Registry of frame IDs to overlay components. Add new overlays here without modifying App. */
export const OVERLAY_REGISTRY: Record<OverlayFrameId, ComponentType> = {
  todo: TribeTodoOverlay,
  builder: BuildTrackingOverlay,
};

/** Default frame when URL param is missing or invalid. */
export const DEFAULT_FRAME: OverlayFrameId = "todo";

/** Reads frame ID from URL query (?frame=...). */
export function getCurrentFrame(): OverlayFrameId {
  if (typeof window === "undefined") return DEFAULT_FRAME;
  const params = new URLSearchParams(window.location.search);
  const f = params.get("frame");
  return (f === "builder" || f === "todo" ? f : DEFAULT_FRAME) as OverlayFrameId;
}

/** Renders the overlay component for the current frame. */
export function OverlayRouter() {
  const frame = getCurrentFrame();
  const Component = OVERLAY_REGISTRY[frame];
  return Component ? <Component /> : null;
}
