/** Re-export domain contract types for UI imports; DTO mapping stays in services when backend diverges. */
export type {
  ContractBrowseSummary,
  ContractLineDraftInput,
  ContractLifecycleStatus,
  ContractParticipant,
  ContractPriority,
  ContractResourceLine,
  ContractStats,
  ContractVisibility,
  CreateDraftInput,
  LogisticsContract,
  PublishContractFailure,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
} from "@powerlay/core";
