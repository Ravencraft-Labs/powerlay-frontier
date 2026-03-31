/** Visibility for logistics contracts (alliance treated like tribe in UI for now). */
export type ContractVisibility = "tribe" | "public" | "alliance";

/** Lifecycle driven by backend; UI must render all. */
export type ContractLifecycleStatus = "draft" | "published" | "in_progress" | "completed" | "canceled";

export type ContractPriority = "low" | "medium" | "high";
export type ContractDepositRowStatus = "ready" | "waiting" | "confirmed" | "failed";

export interface ContractResourceLine {
  id: string;
  typeID: number;
  resourceName: string;
  requiredAmount: number;
  deliveredAmount: number;
  /** Reward for delivering the full `requiredAmount` (payouts scale proportionally). */
  rewardTokensFullLine: number;
  assigneeText?: string;
  /** Present on lines loaded from contract detail; used for draft PUT payloads. */
  sortOrder?: number;
  /** Tokens already paid on this line (detail / API). */
  paidRewardAmount?: number;
  /** Remaining quantity required for this contract line (backend-computed). */
  remainingRequired?: number;
  /** Quantity available in the caller's personal SSU slot for this resource (backend-computed). */
  availableInMyPersonalSlot?: number;
  /** Maximum quantity allowed to deposit now (backend-computed, authoritative). */
  maxDepositAllowed?: number;
  /** Quantity currently pending chain confirmation for this line/resource (backend-computed). */
  pendingDepositQty?: number;
  /** Optional backend status for the deposit row. */
  depositRowStatus?: ContractDepositRowStatus | string;
  /** Optional backend-provided message for pending/failed states. */
  depositStatusMessage?: string;
}

export interface ContractParticipant {
  id: string;
  displayName: string;
  walletAddress?: string;
  joinedAt: number;
}

export interface LogisticsContract {
  id: string;
  title: string;
  description?: string;
  targetStarSystem: string;
  targetSsuId: string;
  /**
   * When true, a backend watcher (separate service) may update progress from SSU events; the app only
   * polls GET /contracts/{id} — it never ingests raw chain events. Maps to `track_ssu_auto` (or
   * `ssu_tracking_enabled`) on the API when present.
   */
  trackSsuAuto?: boolean;
  visibility: ContractVisibility;
  priority: ContractPriority;
  status: ContractLifecycleStatus;
  lines: ContractResourceLine[];
  participants: ContractParticipant[];
  createdByWallet?: string;
  /** Present when loaded from contract detail (list rows omit it). Used for “my contracts” matching. */
  creatorUserId?: string;
  createdAt: number;
  updatedAt: number;
  expiresAt?: number;
}

export interface SearchContractsParams {
  query: string;
  filterMode: "title" | "resource";
  /** Empty = all scopes (desktop HTTP client expands to tribe + public + alliance). */
  visibility: ContractVisibility[];
  priority: ContractPriority | "all";
}

export interface ContractLineDraftInput {
  typeID: number;
  resourceName: string;
  requiredAmount: number;
  rewardTokensFullLine: number;
  assigneeText?: string;
}

export interface CreateDraftInput {
  title: string;
  description?: string;
  targetStarSystem: string;
  targetSsuId: string;
  /** Optional; default false when omitted. */
  trackSsuAuto?: boolean;
  visibility: ContractVisibility;
  priority: ContractPriority;
  lines: ContractLineDraftInput[];
  expiresAt?: number;
}

export interface UpdateDraftInput {
  title?: string;
  description?: string;
  targetStarSystem?: string;
  targetSsuId?: string;
  trackSsuAuto?: boolean;
  visibility?: ContractVisibility;
  priority?: ContractPriority;
  lines?: ContractLineDraftInput[];
  expiresAt?: number | null;
}

export type PublishErrorCode =
  | "INSUFFICIENT_BALANCE"
  | "INVALID_SSU"
  | "NO_TRIBE_ACCESS"
  | "INVALID_LINES"
  | "NOT_DRAFT"
  | "UNKNOWN";

export interface PublishContractFailure {
  ok: false;
  code: PublishErrorCode;
  message: string;
}

export interface PublishContractSuccess {
  ok: true;
  contract: LogisticsContract;
}

export type PublishContractResult = PublishContractSuccess | PublishContractFailure;

export interface ContractBrowseSummary {
  contract: LogisticsContract;
  /** Whole-contract progress 0–100. */
  progressPercent: number;
  /** Sum of proportional rewards already “earned” by deliveries (mock / backend-filled). */
  rewardProgressTokens: number;
  /** Max total tokens if fully delivered. */
  rewardCapTokens: number;
}

export interface ContractStats {
  totalPublished: number;
  openForDelivery: number;
  /** Placeholder aggregate for dashboard. */
  totalTokensCommitted: number;
}
