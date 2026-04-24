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
      worldContractsPackageId?: string;
      contractsApiBase?: string;
      storageApiBase?: string;
      overlayOpacity?: number;
    }>;
    set: (settings: {
      gameLogDir?: string;
      skipLogPrompt?: boolean;
      worldContractsPackageId?: string;
      contractsApiBase?: string;
      storageApiBase?: string;
      overlayOpacity?: number;
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
  };
  getIconsBaseUrl?: () => Promise<string>;
}

declare global {
  interface Window {
    efOverlay?: EFOverlayAPI;
  }
}
