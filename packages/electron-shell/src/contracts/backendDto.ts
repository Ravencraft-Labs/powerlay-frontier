/**
 * Loose backend JSON shapes (FastAPI / Pydantic). Kept separate from @powerlay/core domain types.
 */

export interface BackendErrorBody {
  code?: string;
  message?: string;
  details?: unknown;
}

export interface BackendTokenBalance {
  user_id?: string;
  currency_code?: string;
  balance?: string | number;
}

export interface BackendContractStats {
  visible_contract_count?: number;
  created_contract_count?: number;
  joined_contract_count?: number;
  hidden_contract_count?: number;
  draft_count?: number;
  published_count?: number;
  in_progress_count?: number;
  completed_count?: number;
}

export interface BackendParticipant {
  user_id: string;
  nickname?: string | null;
  wallet_address?: string | null;
  joined_at: string;
}

export interface BackendContractItem {
  id: string;
  resource_id: string;
  resource_name: string;
  type_id?: number | null;
  required_amount: string | number;
  delivered_amount: string | number;
  reward_amount: string | number;
  paid_reward_amount: string | number;
  assignee_text?: string | null;
  sort_order: number;
}

export interface BackendContractListRow {
  id: string;
  title: string;
  description?: string | null;
  visibility: string;
  visibility_scope?: string;
  priority?: string | null;
  target_star_system: string;
  target_system_id?: string | null;
  target_system_name: string;
  target_ssu_id: string;
  status: string;
  total_reserved_reward: string | number;
  total_paid_reward: string | number;
  published_at?: string | null;
  created_at: string;
  progress_percent: string | number;
  participant_count: number;
  item_count: number;
  resource_summary: string[];
  /** When true, backend/watcher may update progress from SSU-targeted events (optional API field). */
  track_ssu_auto?: boolean | null;
  /** Alias some backends may use instead of `track_ssu_auto`. */
  ssu_tracking_enabled?: boolean | null;
  /** When present (some API versions), avoids scanning unrelated contracts for “my contracts”. */
  creator_user_id?: string | null;
  creator_wallet_address?: string | null;
}

export interface BackendContractListEnvelope {
  items: BackendContractListRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface BackendContractDetail {
  id: string;
  creator_user_id: string;
  creator_wallet_address?: string | null;
  creator_tribe_id?: string | null;
  visibility: string;
  visibility_scope?: string;
  priority?: string | null;
  title: string;
  description?: string | null;
  target_system_id?: string | null;
  target_star_system: string;
  target_system_name: string;
  target_ssu_id: string;
  status: string;
  total_reserved_reward: string | number;
  total_paid_reward: string | number;
  expires_at?: string | null;
  published_at?: string | null;
  completed_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
  updated_at: string;
  progress_percent: string | number;
  /** When true, backend/watcher may update progress from SSU-targeted events (optional API field). */
  track_ssu_auto?: boolean | null;
  ssu_tracking_enabled?: boolean | null;
  items: BackendContractItem[];
  participants: BackendParticipant[];
}

export interface BackendPublishResponse {
  contract_id: string;
  status: string;
  reserved_reward: string | number;
  published_at: string;
}

export interface BackendActionResponse {
  contract_id: string;
  action: string;
  status?: string | null;
  message: string;
}
