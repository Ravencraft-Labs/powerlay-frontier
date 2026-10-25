import type {
  TravelHop,
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
  ScoutSiteDef,
  FacilityRuns,
  SystemState,
} from "@powerlay/core";

export interface SignDeliveryTxParams {
  storageUnitId: string;
  /** When you registered this SSU in-app; otherwise the shell scans chain for `StorageConfig`. */
  connectTxDigest?: string;
  typeId: number;
  quantity: number;
  worldPackageId?: string;
  useCharacterCapBorrow?: boolean;
}

export interface RecordDeliveryBody {
  lineId: string;
  quantity: number;
  suiTxDigest: string;
  ssuObjectId: string;
}

export interface SubmitDepositAttemptBody {
  txDigest: string;
  typeId: number;
  requestedQty: number;
}

export interface SubmitDepositAttemptResult {
  attemptId?: string;
  status?: string;
  allowedQty?: number;
  requestedQty?: number;
  contract?: LogisticsContract;
}
import type { ContractsBackendStatus } from "../services/contracts/contractsClient";

export interface WalletSsu {
  ownerCapId: string;
  storageUnitId: string;
  name?: string;
}

export interface ContractLogEntry {
  id: string;
  eventType: string;
  timestamp: number;
  actorName?: string;
  actorWallet?: string;
  actorCharacterId?: string;
  description?: string;
  resourceName?: string;
  quantity?: number;
  txHash?: string;
  fromStatus?: string;
  toStatus?: string;
  raw?: unknown;
}

export interface StorageHistoryEntry {
  id: string;
  eventType: string;
  timestamp: number;
  senderWallet?: string;
  characterId?: string;
  actorName?: string;
  resourceType?: string;
  resourceName?: string;
  quantity?: number;
  txHash?: string;
  contractId?: string;
  contractTitle?: string;
  raw?: unknown;
}

export interface ConnectedStorage {
  id: string;
  ssuObjectId: string;
  tribeId: string;
  txHash: string;
  connectedAt: number;
  name?: string;
  ownerUserId?: string;
  ownerWallet?: string | null;
  isActive?: boolean;
  /** On-chain Character object id when the API returned it (audit / correlation). */
  characterId?: string;
}

/**
 * Sent by a build overlay: mark an ore mined / a crafted item made (done: false undoes the manual mark),
 * or pick the tracking step to show (null = follow progress again).
 */
export type BuilderOverlayAction =
  | { kind: "ore-done" | "item-done"; typeID: number; done: boolean }
  | { kind: "item-add"; typeID: number; delta: number }
  | { kind: "pick-step"; step: number | null }
  | { kind: "set-auto"; on: boolean }
  | { kind: "needed-add"; typeID: number; delta: number };

/** What the desktop sends to a build overlay window. */
export interface BuilderOverlayState {
  buildName?: string;
  mined?: number;
  totalOre?: number;
  productionLeftSeconds?: number;
  miningOres?: Array<{ typeID?: number; name: string; minedVol: number; neededVol: number; asteroids?: string[] }>;
  plannedVolByTypeId?: Record<number, number>;
  /** Active crafting stage (1-based of `count`) with made/needed units; absent while on mining. */
  stage?: { index: number; count: number; items: Array<{ typeID?: number; name: string; made: number; needed: number; batch?: number; batchTitle?: string; asteroids?: string[] }> };
  /** Steps the overlay can switch between: `active` in first..last (0 = mining). */
  steps?: { active: number; first: number; last: number; auto: boolean };
}

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
  /** blueprintID -> per facility type, max output runs of one job (absent on older shells). */
  blueprintFacilityRuns?: Record<number, FacilityRuns[]>;
  /** Facility type names from industry_facilities */
  facilityTypeNames: string[];
  /** groupIDs for mineable ores. Empty = no filtering. */
  oreGroupIDs: number[];
  errors?: GameDataErrors;
}

/** "map" (POC): the mini-map overlay window. */
export type OverlayShellFrame = "contracts" | "builder" | "scout" | "map" | "toolbar";

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
    getLogs: (contractId: string) => Promise<ContractLogEntry[]>;
    signDeliveryTx: (params: SignDeliveryTxParams) => Promise<{ digest: string } | { error: string }>;
    recordDelivery: (contractId: string, body: RecordDeliveryBody) => Promise<LogisticsContract>;
    submitDepositAttempt: (contractId: string, body: SubmitDepositAttemptBody) => Promise<SubmitDepositAttemptResult>;
  };
  storage?: {
    listConnected: () => Promise<ConnectedStorage[]>;
    discoverWalletSsus: () => Promise<WalletSsu[]>;
    register: (ssuObjectId: string, txHash: string, name?: string) => Promise<ConnectedStorage>;
    disconnect: (ssuObjectId: string) => Promise<void>;
    signConnectTx: (params: { storageUnitId: string; ownerCapId: string; tribeId: string; characterId?: string; worldPackageId?: string }) => Promise<{ digest: string } | { error: string }>;
    getHistory: (ssuId: string) => Promise<StorageHistoryEntry[]>;
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
    getBuilderState: (buildId: string) => Promise<BuilderOverlayState>;
    setBuilderState: (states: Record<string, BuilderOverlayState>) => void;
    /** Actions sent from a build overlay (mark ore mined / item made). Returns an unsubscribe. */
    onBuilderAction?: (cb: (buildId: string, action: BuilderOverlayAction) => void) => () => void;
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
      worldContractsPackageId?: string;
      contractsApiBase?: string;
      storageApiBase?: string;
      overlayOpacity?: number;
      miniMapOpacity?: number;
    }>;
    set: (settings: {
      gameLogDir?: string;
      skipLogPrompt?: boolean;
      worldContractsPackageId?: string;
      contractsApiBase?: string;
      storageApiBase?: string;
      overlayOpacity?: number;
      miniMapOpacity?: number;
    }) => Promise<void>;
  };
  app?: {
    openLogFolder: () => Promise<string>;
    pickLogDir: (defaultPath?: string) => Promise<string | null>;
    shouldShowLogPrompt: () => Promise<{ show: boolean }>;
    setSkipLogPrompt: () => Promise<void>;
  };
  auth?: {
    getSession: () => Promise<{
      walletAddress: string;
      sessionId?: string;
      expiresAt?: number;
      tribeId?: string;
      tribeName?: string;
      tribeResolvedAt?: number;
      characterId?: string;
      characterName?: string;
    } | null>;
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
    getSites?: () => Promise<ScoutSiteDef[]>;
    getSystemInfo?: (system: string) => Promise<{ systemId: number | null; state: SystemState | null }>;
  };
  /** POC (throwaway): Map tab. */
  pocMap?: {
    getBase: () => Promise<PocMapBase | { error: string }>;
    setLogLite: (on: boolean) => Promise<unknown>;
    getLogLiteStatus: () => Promise<PocLogLiteStatus>;
    watchClipboard: (on: boolean) => Promise<void>;
    getLinks: () => Promise<{
      links: PocSystemLink[];
      lastIngested: PocSystemLink[];
      areaNames: { regions: Record<string, string>; constellations: Record<string, string> };
      edges: PocEdge[];
      currentSystemId: number | null;
      lastGateScout: PocGateScoutResult | null;
      dormantGates: PocDormantGate[];
    }>;
    ingestText: (text: string) => Promise<PocSystemLink[]>;
    ingestClipboard: () => Promise<PocSystemLink[]>;
    addAdjacent: (anchorId: number | null, text?: string) => Promise<PocEdgeResult>;
    addRoute: (text?: string) => Promise<PocEdgeResult>;
    getTravel: () => Promise<PocTravel>;
    clearTravel: () => Promise<PocTravel>;
    /** A gate / catapult from its in-game info (assembly id + destination link); clipboard when no text. */
    scoutGate: (text?: string) => Promise<PocGateScoutResult>;
    /** Mark a dormant NPC stargate: destination as a name, the depot title or a system link. */
    addDormant: (fromSystemId: number | null, text: string, note?: string) => Promise<{ gate?: PocDormantGate; error?: string }>;
    removeDormant: (id: string) => Promise<void>;
  };
  /** Local user plugins (see packages/electron-shell/src/plugins/pluginHost.ts). */
  plugins?: {
    list: () => Promise<PluginInfo[]>;
    dir: () => Promise<string>;
    setEnabled: (id: string, enabled: boolean) => Promise<PluginInfo[]>;
    rendererSource: (id: string) => Promise<string | null>;
    invoke: (id: string, channel: string, ...args: unknown[]) => Promise<unknown>;
  };
  getIconsBaseUrl?: () => Promise<string>;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string | null;
  hasRenderer: boolean;
  enabled: boolean;
  error?: string;
}

export interface PocMapSystem {
  id: number;
  n: string;
  x: number;
  y: number;
  z: number;
  c: number;
  r: number;
}

export interface PocMapBase {
  source: string;
  systems: PocMapSystem[];
}

export interface PocEdge {
  a: number;
  b: number;
  /** "dormant": NPC stargate marked by hand as needing restoration. */
  source: "adjacent" | "route" | "jump" | "deployable" | "dormant";
  gateId?: number;
  /** Deployable edges: "player" = found on chain (gate or catapult), "offchain" = not on chain; unset until looked up. */
  gateOwner?: "player" | "offchain";
  /** On-chain type: Mini / Heavy Gate, Mini / Heavy Catapult. */
  gateTypeId?: number;
  /** Owner's player tribe (unset for characters in an NPC corp). */
  gateTribeId?: number;
  gateOwnerName?: string;
  /** Known from the gate's in-game info (scouted), not travelled through yet. */
  scouted?: boolean;
  at: string;
}

/** NPC stargate that needs restoration (Stargate Depot), marked by hand. */
export interface PocDormantGate {
  id: string;
  fromSystemId: number;
  toName: string;
  toSystemId: number | null;
  note?: string;
  at: string;
}

export interface PocGateScoutResult {
  found: "gate" | "destination" | "nothing";
  edge?: PocEdge;
  error?: string;
}

/** Travel journal (LogLite): hops of the current game session, plus the very last hop for "previous system". */
export interface PocTravel {
  sessionStartedAt: string | null;
  hops: TravelHop[];
  lastHop: TravelHop | null;
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
  kind: "connected" | "disconnected" | "system" | "jump" | "hop" | "edge-added" | "edge-known" | "name-bound" | "warp";
  text: string;
}

export interface PocLogLiteStatus {
  state: "off" | "listening" | "connected" | "error";
  error: string | null;
  currentSystemId: number | null;
  feed: PocLogLiteFeedItem[];
}
