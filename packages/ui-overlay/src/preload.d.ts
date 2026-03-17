import type { TribeTodo } from "@powerlay/core";

export interface MiningOreEntry {
  name: string;
  minedVol: number;
  neededVol: number;
}

export interface BuilderOverlayState {
  buildName?: string;
  mined?: number;
  totalOre?: number;
  productionLeftSeconds?: number;
  miningOres?: MiningOreEntry[];
}

export interface EFOverlayAPI {
  tribeTodo: {
    list: () => Promise<TribeTodo[]>;
    update: (id: string, patch: unknown) => Promise<TribeTodo | null>;
  };
  overlay?: {
    getBuilderState: () => Promise<BuilderOverlayState>;
  };
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}
