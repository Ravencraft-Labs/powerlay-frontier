import type {
  TribeTodo,
  ContractBrowseSummary,
  CreateDraftInput,
  LogisticsContract,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
  ContractStats,
  ScoutEntry,
  CreateScoutEntryInput,
  UpdateScoutEntryInput,
  ScoutSettings,
  ScoutSiteDef,
  SystemState,
} from "@powerlay/core";

export interface MiningOreEntry {
  /** For the item icon. */
  typeID?: number;
  name: string;
  minedVol: number;
  neededVol: number;
  /** Asteroid kinds carrying this ore, richest first. */
  asteroids?: string[];
}

export interface BuilderOverlayState {
  buildName?: string;
  mined?: number;
  totalOre?: number;
  productionLeftSeconds?: number;
  miningOres?: MiningOreEntry[];
  plannedVolByTypeId?: Record<number, number>;
  /** Active crafting stage once mining is done (or picked by hand); absent while on mining. */
  stage?: BuilderStageState;
  /** Steps to switch between: `active` in first..last (0 = mining). */
  steps?: { active: number; first: number; last: number; auto: boolean };
}

/** Crafting stage `index` of `count` (1-based; 0 would be mining) with made/needed units per item. */
export interface BuilderStageState {
  index: number;
  count: number;
  items: Array<{ typeID?: number; name: string; made: number; needed: number; batch?: number; batchTitle?: string; asteroids?: string[] }>;
}

/** "map" (POC): the mini-map overlay window, rendered by the desktop app. "toolbar": the overlay bar. */
export type OverlayShellFrame = "contracts" | "builder" | "scout" | "map" | "toolbar";

export interface OverlayWindowState {
  visible: boolean;
  locked: boolean;
}

/** Which overlays are open and locked; builds keyed by id (only ones opened this session). */
export interface OverlayBarState {
  frames: Partial<Record<OverlayShellFrame, OverlayWindowState>>;
  builds: Record<string, OverlayWindowState>;
}

export interface EFOverlayAPI {
  settings?: {
    get: () => Promise<{ overlayOpacity?: number }>;
  };
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
    getBackendStatus: () => Promise<{ mode: "http"; connected: boolean; message?: string; apiBase: string }>;
  };
  tribeTodo?: {
    list: () => Promise<TribeTodo[]>;
    update: (id: string, patch: unknown) => Promise<TribeTodo | null>;
  };
  tribe?: {
    resolve: () => Promise<{ ok: boolean; tribeId?: string; tribeName?: string; error?: string }>;
  };
  auth?: {
    getSession: () => Promise<{ walletAddress: string; tribeId?: string; tribeName?: string } | null>;
  };
  builds?: {
    list: () => Promise<Array<{ id: string; name: string; updatedAt: number }>>;
  };
  overlay?: {
    getBarState?: () => Promise<OverlayBarState>;
    setAllLocked?: (locked: boolean) => Promise<void>;
    toggleBuilder?: (buildId: string) => Promise<void>;
    getBuilderState: (buildId: string) => Promise<BuilderOverlayState>;
    /** Mark an ore mined / a crafted item made (or undo) in the desktop app. */
    sendBuilderAction?: (buildId: string, action: { kind: "ore-done" | "item-done"; typeID: number; done: boolean } | { kind: "item-add"; typeID: number; delta: number } | { kind: "pick-step"; step: number | null } | { kind: "set-auto"; on: boolean } | { kind: "needed-add"; typeID: number; delta: number }) => void;
    toggleLock: (frame: OverlayShellFrame, buildId?: string) => Promise<boolean>;
    setContentSize: (frame: OverlayShellFrame, width: number, height: number, buildId?: string) => void;
    hide?: (frame: OverlayShellFrame, buildId?: string) => Promise<void>;
    hideBuilder: (buildId: string) => Promise<void>;
    getLockState?: (frame: OverlayShellFrame, buildId?: string) => Promise<boolean>;
    getVisible?: (frame: OverlayShellFrame) => Promise<boolean>;
    toggle?: (frame: OverlayShellFrame) => Promise<void>;
  };
  mining?: {
    getErrors: () => Promise<{ tailerTestError?: string; logReaderError?: string; trackingActive?: boolean; trackingBuildId?: string | null }>;
    startTracking: (opts?: { buildId?: string; plannedVolByTypeId?: Record<number, number> }) => Promise<void>;
    stopTracking: () => Promise<void>;
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
    getSites?: () => Promise<ScoutSiteDef[]>;
    getSystemInfo?: (system: string) => Promise<{ systemId: number | null; state: SystemState | null }>;
  };
  /** POC (throwaway): chat link → system ID capture, shared with the desktop Map tab. */
  pocMap?: {
    getLinks: () => Promise<{ links: PocSystemLink[]; edges: PocEdge[]; currentSystemId: number | null }>;
    ingestText: (text: string) => Promise<PocSystemLink[]>;
    ingestClipboard: () => Promise<PocSystemLink[]>;
    addAdjacent: (anchorId: number | null, text?: string) => Promise<PocEdgeResult>;
    addRoute: (text?: string) => Promise<PocEdgeResult>;
    setLogLite: (on: boolean) => Promise<unknown>;
    getLogLiteStatus: () => Promise<PocLogLiteStatus>;
  };
}

export interface PocEdge {
  a: number;
  b: number;
  source: "adjacent" | "route" | "jump";
  gateId?: number;
  at: string;
}

export interface PocEdgeResult {
  anchorId?: number | null;
  ingested: PocSystemLink[];
  added: PocEdge[];
  error?: string;
}

export interface PocSystemLink {
  id: number;
  name: string | null;
  linkTexts: string[];
  source: "current-system" | "link-text" | "prefix-only" | "loglite";
  at: string;
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}

export interface PocLogLiteFeedItem {
  at: string;
  kind: "connected" | "disconnected" | "system" | "jump" | "edge-added" | "edge-known" | "name-bound" | "warp";
  text: string;
}

export interface PocLogLiteStatus {
  state: "off" | "listening" | "connected" | "error";
  error: string | null;
  currentSystemId: number | null;
  feed: PocLogLiteFeedItem[];
}
