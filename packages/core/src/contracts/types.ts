/** Visibility for logistics contracts (alliance treated like tribe in UI for now). */
export type ContractVisibility = "tribe" | "public" | "alliance";

/** Lifecycle driven by backend; UI must render all. */
export type ContractLifecycleStatus = "draft" | "published" | "in_progress" | "completed" | "canceled";

export type ContractPriority = "low" | "medium" | "high";

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
