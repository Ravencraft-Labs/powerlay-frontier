import type {
  TribeTodo,
  BuildPlan,
  TypesMap,
  BlueprintsMap,
  ContractBrowseSummary,
  ContractStats,
  CreateDraftInput,
  LogisticsContract,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
  ScoutEntry,
  CreateScoutEntryInput,
  UpdateScoutEntryInput,
  ScoutSettings,
  ScoutVisibility,
  ScoutActivityEvent,
} from "@powerlay/core";
import type { ContractsBackendStatus } from "../services/contracts/contractsClient";

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

export type OverlayShellFrame = "contracts" | "builder" | "scout";

export interface EFOverlayAPI {
  contracts?: {
    search: (params: SearchContractsParams) => Promise<ContractBrowseSummary[]>;
    listMyContracts: (bucket?: string) => Promise<ContractBrowseSummary[]>;
    listDrafts: () => Promise<LogisticsContract[]>;
    get: (id: string) => Promise<LogisticsContract | null>;
    createDraft: (input: CreateDraftInput) => Promise<LogisticsContract>;
    updateDraft: (id: string, patch: UpdateDraftInput) => Promise<LogisticsContract | null>;
    publish: (id: string) => Promise<PublishContractResult>;
    hide: (contractId: string) => Promise<boolean>;
    join: (contractId: string, displayName?: string) => Promise<LogisticsContract | null>;
    tokenBalance: () => Promise<{ balance: number; reserved: number; available: number }>;
    stats: () => Promise<ContractStats>;
    cancel: (contractId: string) => Promise<LogisticsContract | null>;
    completeContract: (contractId: string) => Promise<LogisticsContract | null>;
    getBackendStatus: () => Promise<ContractsBackendStatus>;
  };
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
    setContentSize?: (frame: OverlayShellFrame, width: number, height: number, buildId?: string) => void;
    toggle: (frame: OverlayShellFrame) => Promise<void>;
    toggleBuilder: (buildId: string) => Promise<void>;
    getVisibleBuilderIds: () => Promise<string[]>;
    getVisible?: (frame: OverlayShellFrame) => Promise<boolean>;
    show: (frame: OverlayShellFrame) => Promise<void>;
    hide: (frame: OverlayShellFrame, buildId?: string) => Promise<void>;
    hideBuilder?: (buildId: string) => Promise<void>;
    getLockState: (frame: OverlayShellFrame, buildId?: string) => Promise<boolean>;
    toggleLock: (frame: OverlayShellFrame, buildId?: string) => Promise<boolean>;
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
    get: () => Promise<{
      gameLogDir?: string;
      skipLogPrompt?: boolean;
    }>;
    set: (settings: { gameLogDir?: string; skipLogPrompt?: boolean }) => Promise<void>;
  };
  app?: {
    openLogFolder: () => Promise<string>;
    pickLogDir: (defaultPath?: string) => Promise<string | null>;
    shouldShowLogPrompt: () => Promise<{ show: boolean }>;
    setSkipLogPrompt: () => Promise<void>;
  };
  auth?: {
    getSession: () => Promise<{ walletAddress: string; sessionId?: string; expiresAt?: number; tribeId?: string; tribeName?: string; tribeResolvedAt?: number } | null>;
    login: () => Promise<{ walletAddress: string } | { error: string }>;
    logout: () => Promise<void>;
    cancel: () => Promise<void>;
  };
  tribe?: {
    resolve: () => Promise<{ ok: boolean; tribeId?: string; tribeName?: string; error?: string }>;
  };
  scout?: {
    getCurrentSystem: () => Promise<string | null>;
    getActiveSystem: () => Promise<string | null>;
    setSystemOverride: (system: string | null) => Promise<ScoutSettings>;
    getError: () => Promise<string | null>;
    list: () => Promise<ScoutEntry[]>;
    get: (id: string) => Promise<ScoutEntry | null>;
    create: (input: CreateScoutEntryInput) => Promise<ScoutEntry>;
    update: (id: string, patch: UpdateScoutEntryInput) => Promise<ScoutEntry | null>;
    delete: (id: string) => Promise<boolean>;
    getSettings: () => Promise<ScoutSettings>;
    updateSettings: (patch: Partial<ScoutSettings>) => Promise<ScoutSettings>;
    startWatching: () => Promise<void>;
    stopWatching: () => Promise<void>;
    getActivityLog: (limit?: number) => Promise<ScoutActivityEvent[]>;
  };
  getIconsBaseUrl?: () => Promise<string>;
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}
