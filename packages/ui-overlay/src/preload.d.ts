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
  TravelHop,
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
export type OverlayShellFrame = "contracts" | "builder" | "scout" | "map" | "toolbar" | "gateloc";

export interface OverlayWindowState {
  visible: boolean;
  locked: boolean;
}

/** Which overlays are open and locked; builds keyed by id (only ones opened this session). */
export interface OverlayBarState {
  frames: Partial<Record<OverlayShellFrame, OverlayWindowState>>;
  builds: Record<string, OverlayWindowState>;
  /** Overlays hidden by the eye button, waiting to be shown again. */
  stashed?: number;
}

export interface EFOverlayAPI {
  settings?: {
    get: () => Promise<{ overlayOpacity?: number; tabOrder?: string[] }>;
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
    toggleAllVisible?: () => Promise<void>;
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
    getLinks: () => Promise<{
      links: PocSystemLink[];
      edges: PocEdge[];
      currentSystemId: number | null;
      lastGateScout: PocGateScoutResult | null;
      gateLocations: Record<string, PocGateLocation>;
    }>;
    getTravel: () => Promise<{ sessionStartedAt: string | null; hops: TravelHop[] }>;
    /** Where a deployable gate stands ("P2L4"); null clears. */
    setGateLocation: (gateId: number, systemId: number, location: string | null) => Promise<void>;
    /** The gate the "gateloc" mini-overlay asks about, or null. */
    getGatePlacement: () => Promise<PocGatePlacement | null>;
    /** Open the mini-overlay for this gate (also when it's placed already, to change it). */
    placeGate: (gateId: number, systemId: number, toSystemId: number | null) => Promise<void>;
    dismissGatePlacement: () => Promise<void>;
    ingestText: (text: string) => Promise<PocSystemLink[]>;
    ingestClipboard: () => Promise<PocSystemLink[]>;
    addAdjacent: (anchorId: number | null, text?: string) => Promise<PocEdgeResult>;
    addRoute: (text?: string) => Promise<PocEdgeResult>;
    setLogLite: (on: boolean) => Promise<unknown>;
    getLogLiteStatus: () => Promise<PocLogLiteStatus>;
    /** Clipboard watcher (gate scouting, chat links); ref-counted across windows. */
    watchClipboard: (on: boolean) => Promise<void>;
    /** A gate / catapult from its info: assembly id and destination link, from the clipboard when no text. */
    scoutGate: (text?: string) => Promise<PocGateScoutResult>;
    /** Dormant NPC stargate from the current system; destination from the clipboard when no text. */
    addDormant: (fromSystemId: number | null, text?: string, note?: string) => Promise<{ gate?: unknown; error?: string }>;
  };
}

export interface PocGatePlacement {
  gateId: number;
  systemId: number;
  toSystemId: number | null;
  systemName: string | null;
  toSystemName: string | null;
  typeId: number | null;
  ownerName: string | null;
  location: string | null;
}

export interface PocGateLocation {
  gateId: number;
  systemId: number;
  location: string;
  at: string;
}

export interface PocGateScoutResult {
  found: "gate" | "destination" | "nothing";
  edge?: PocEdge & { gateTypeId?: number; gateOwnerName?: string };
  error?: string;
}

export interface PocEdge {
  a: number;
  b: number;
  source: "adjacent" | "route" | "jump" | "deployable" | "dormant";
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
