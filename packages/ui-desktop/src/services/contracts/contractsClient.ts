/**
 * Browser/Electron integration for logistics contracts.
 * When `window.efOverlay.contracts` is missing (e.g. plain Vite dev), UI shows offline messaging.
 */
import type {
  ContractBrowseSummary,
  ContractStats,
  CreateDraftInput,
  LogisticsContract,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
} from "@powerlay/core";

export interface TokenBalanceView {
  balance: number;
  reserved: number;
  available: number;
}

export type ContractsBackendStatus = {
  mode: "http";
  connected: boolean;
  message?: string;
  apiBase: string;
};

export interface ContractsClient {
  search(params: SearchContractsParams): Promise<ContractBrowseSummary[]>;
  /** Contracts for the current user. Optional bucket: all, drafts, published_by_me, removed_by_me, joined, hidden. */
  listMyContracts(bucket?: string): Promise<ContractBrowseSummary[]>;
  listDrafts(): Promise<LogisticsContract[]>;
  get(id: string): Promise<LogisticsContract | null>;
  createDraft(input: CreateDraftInput): Promise<LogisticsContract>;
  updateDraft(id: string, patch: UpdateDraftInput): Promise<LogisticsContract | null>;
  publish(id: string): Promise<PublishContractResult>;
  hide(contractId: string): Promise<boolean>;
  join(contractId: string, displayName?: string): Promise<LogisticsContract | null>;
  tokenBalance(): Promise<TokenBalanceView>;
  stats(): Promise<ContractStats>;
  cancel(contractId: string): Promise<LogisticsContract | null>;
  /** Creator finishes after fulfillment; unspent reserved tokens return (backend-dependent). */
  completeContract(contractId: string): Promise<LogisticsContract | null>;
  /** HTTP mode: checks TCP reachability to the contracts API. Mock mode: always connected. */
  getBackendStatus(): Promise<ContractsBackendStatus>;
}

export function getContractsClient(): ContractsClient | null {
  if (typeof window === "undefined") return null;
  const raw = window.efOverlay?.contracts;
  if (!raw) return null;
  return raw as ContractsClient;
}
