import type { TribeTodo, BuildPlan, TypesMap, BlueprintsMap } from "@powerlay/core";

export interface GameDataErrors {
  types?: string;
  blueprints?: string;
  oreGroupIDs?: string;
}

export interface GameData {
  types: TypesMap;
  blueprints: BlueprintsMap;
  starSystems: string[];
  /** blueprintTypeID -> comma-separated facility names */
  blueprintToFacilityNames: Record<number, string>;
  /** Facility type names from industry_facilities */
  facilityTypeNames: string[];
  /** groupIDs for mineable ores. Empty = no filtering. */
  oreGroupIDs: number[];
  errors?: GameDataErrors;
}

export interface EFOverlayAPI {
  tribeTodo: {
    list: () => Promise<TribeTodo[]>;
    create: (todo: unknown) => Promise<TribeTodo>;
    update: (id: string, patch: unknown) => Promise<TribeTodo | null>;
    delete: (id: string) => Promise<boolean>;
  };
  builds: {
    list: () => Promise<BuildPlan[]>;
    get: (id: string) => Promise<BuildPlan | null>;
    save: (plan: BuildPlan) => Promise<BuildPlan>;
    delete: (id: string) => Promise<boolean>;
  };
  overlay: {
    toggle: (frame: "todo" | "builder") => Promise<void>;
    toggleBuilder: (buildId: string) => Promise<void>;
    getVisibleBuilderIds: () => Promise<string[]>;
    show: (frame: "todo" | "builder") => Promise<void>;
    hide: (frame: "todo" | "builder") => Promise<void>;
    getLockState: (frame: "todo" | "builder", buildId?: string) => Promise<boolean>;
    toggleLock: (frame: "todo" | "builder", buildId?: string) => Promise<boolean>;
    getBuilderState: (buildId: string) => Promise<{ buildName?: string; mined?: number; totalOre?: number; productionLeftSeconds?: number; miningOres?: Array<{ name: string; minedVol: number; neededVol: number }>; plannedVolByTypeId?: Record<number, number> }>;
    setBuilderState: (states: Record<string, { buildName?: string; mined?: number; totalOre?: number; productionLeftSeconds?: number; miningOres?: Array<{ name: string; minedVol: number; neededVol: number }>; plannedVolByTypeId?: Record<number, number> }>) => void;
  };
  gameData: {
    get: () => Promise<GameData>;
  };
  mining?: {
    getState: () => Promise<Record<string, Record<number, number>>>;
    getErrors: () => Promise<{ tailerTestError?: string; logReaderError?: string; trackingActive?: boolean; trackingBuildId?: string | null }>;
    setSelectedBuild: (buildId: string | null) => Promise<void>;
    setState: (state: Record<string, Record<number, number>>) => Promise<void>;
    resetBuild: (buildId: string) => Promise<void>;
    startTracking: (opts?: {
      buildId?: string;
      plannedVolByTypeId?: Record<number, number>;
    }) => Promise<void>;
    stopTracking: () => Promise<void>;
  };
  settings?: {
    get: () => Promise<{ gameLogDir?: string; skipLogPrompt?: boolean }>;
    set: (settings: { gameLogDir?: string; skipLogPrompt?: boolean }) => Promise<void>;
  };
  app?: {
    openLogFolder: () => Promise<string>;
    pickLogDir: (defaultPath?: string) => Promise<string | null>;
    shouldShowLogPrompt: () => Promise<{ show: boolean }>;
    setSkipLogPrompt: () => Promise<void>;
  };
  getIconsBaseUrl?: () => Promise<string>;
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}
