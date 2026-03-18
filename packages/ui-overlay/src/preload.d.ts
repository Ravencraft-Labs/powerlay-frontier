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
  plannedVolByTypeId?: Record<number, number>;
}

export interface EFOverlayAPI {
  tribeTodo: {
    list: () => Promise<TribeTodo[]>;
    update: (id: string, patch: unknown) => Promise<TribeTodo | null>;
  };
  overlay?: {
    getBuilderState: (buildId: string) => Promise<BuilderOverlayState>;
    toggleLock: (frame: "todo" | "builder", buildId?: string) => Promise<boolean>;
    setContentSize: (frame: "todo" | "builder", width: number, height: number, buildId?: string) => void;
    hideBuilder: (buildId: string) => Promise<void>;
  };
  mining?: {
    getErrors: () => Promise<{ tailerTestError?: string; logReaderError?: string; trackingActive?: boolean; trackingBuildId?: string | null }>;
    startTracking: (opts?: { buildId?: string; plannedVolByTypeId?: Record<number, number> }) => Promise<void>;
    stopTracking: () => Promise<void>;
  };
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}
