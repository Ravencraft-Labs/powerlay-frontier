import React, { type ComponentType } from "react";
import { BuildTrackingOverlay } from "./BuildTrackingOverlay";
import { ContractsOverlay } from "./overlays/ContractsOverlay";

/** Supported overlay frame IDs. Add new frame IDs here to extend (Open/Closed). */
export type OverlayFrameId = "contracts" | "builder";

/** Registry of frame IDs to overlay components. Add new overlays here without modifying App. */
export const OVERLAY_REGISTRY: Record<OverlayFrameId, ComponentType> = {
  contracts: ContractsOverlay,
  builder: BuildTrackingOverlay,
};

/** Default frame when URL param is missing or invalid. */
export const DEFAULT_FRAME: OverlayFrameId = "contracts";

/** Reads frame ID from URL query (?frame=...). */
export function getCurrentFrame(): OverlayFrameId {
  if (typeof window === "undefined") return DEFAULT_FRAME;
  const params = new URLSearchParams(window.location.search);
  const f = params.get("frame");
  if (f === "todo") return "contracts";
  return (f === "builder" || f === "contracts" ? f : DEFAULT_FRAME) as OverlayFrameId;
}

/** Reads buildId from URL query (?buildId=...). Used for builder overlay. */
export function getBuildIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("buildId");
}

/** Renders the overlay component for the current frame. */
export function OverlayRouter() {
  const frame = getCurrentFrame();
  const buildId = frame === "builder" ? getBuildIdFromUrl() : null;
  if (frame === "builder") return <BuildTrackingOverlay buildId={buildId} />;
  if (frame === "contracts") return <ContractsOverlay />;
  return null;
}
