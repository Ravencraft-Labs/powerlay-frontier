import type { EFOverlayAPI } from "../preload.d";

/**
 * Provides access to the EF Overlay API.
 * Abstraction over window.efOverlay for dependency inversion (DIP).
 * Allows tests or alternative environments to inject a mock.
 */
export function useEfOverlay(): EFOverlayAPI | undefined {
  return typeof window !== "undefined" ? window.efOverlay : undefined;
}
