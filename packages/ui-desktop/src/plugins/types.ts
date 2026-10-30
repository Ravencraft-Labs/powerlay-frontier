// Contract between the desktop renderer and local plugins' renderer.js (`export function activate(host)`).
import type React from "react";

export interface PluginHostApi {
  /** Host React instance — plugins must use it so hooks work. */
  React: typeof React;
  /** Calls a handler the plugin registered in its main.cjs via `ctx.handle(channel, fn)`. */
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  /** Host class names, so plugin controls look native. */
  ui: { btnCls: string; errorCls: string; labelCls: string };
}

/** Extra system-to-system edges drawn on the map. */
export interface MapEdgeLayer {
  visible: boolean;
  edges: [number, number][];
  /** Canvas stroke style. */
  color: string;
  lineWidth?: number;
  /** One legend line under the map. */
  legend?: string;
  /** When set, the selected-system panel lists this layer's neighbours under this title. */
  neighboursTitle?: string;
}

export interface MapControlsProps {
  setLayer(layer: MapEdgeLayer | null): void;
}

export interface PluginContributions {
  map?: {
    /** Rendered in the map toolbar: the plugin's own toggles, buttons and errors. */
    Controls: React.ComponentType<MapControlsProps>;
  };
}

export interface ActivePlugin {
  id: string;
  name: string;
  contributions: PluginContributions;
}
