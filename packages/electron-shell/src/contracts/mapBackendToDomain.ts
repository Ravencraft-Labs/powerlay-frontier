import type {
  ContractBrowseSummary,
  ContractLifecycleStatus,
  ContractParticipant,
  ContractPriority,
  ContractResourceLine,
  ContractStats,
  ContractVisibility,
  LogisticsContract,
  PublishContractFailure,
  PublishContractResult,
} from "@powerlay/core";
import type {
  BackendContractDetail,
  BackendContractListRow,
  BackendContractStats,
  BackendErrorBody,
  BackendParticipant,
  BackendTokenBalance,
} from "./backendDto.js";

export function decNum(v: string | number | undefined | null): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function mapVisibility(raw: string | undefined): ContractVisibility {
  const v = (raw ?? "public").toLowerCase();
  if (v === "tribe" || v === "public" || v === "alliance") return v;
  return "public";
}

function mapPriority(raw: string | null | undefined): ContractPriority {
  const p = (raw ?? "medium").toLowerCase();
  if (p === "low" || p === "medium" || p === "high") return p;
  return "medium";
}

/** Backend may send `track_ssu_auto` or `ssu_tracking_enabled` (optional). */
function readTrackSsuAuto(
  d: BackendContractDetail | BackendContractListRow
): boolean | undefined {
  const a = d.track_ssu_auto;
  const b = d.ssu_tracking_enabled;
  if (typeof a === "boolean") return a;
  if (typeof b === "boolean") return b;
  return undefined;
}

function mapStatus(raw: string | undefined): ContractLifecycleStatus {
  const s = (raw ?? "draft").toLowerCase().replace(/-/g, "_");
  if (s === "in_progress") return "in_progress";
  if (s === "cancelled") return "canceled";
  if (s === "draft" || s === "published" || s === "completed" || s === "canceled") return s;
  return "draft";
}

function mapItem(it: BackendContractDetail["items"][0]): ContractResourceLine {
  const typeID =
    it.type_id != null && Number.isFinite(Number(it.type_id))
      ? Number(it.type_id)
      : /^\d+$/.test(String(it.resource_id).trim())
        ? parseInt(String(it.resource_id), 10)
        : 0;
  return {
    id: String(it.id),
    typeID,
    resourceName: it.resource_name,
    requiredAmount: decNum(it.required_amount),
    deliveredAmount: decNum(it.delivered_amount),
    rewardTokensFullLine: decNum(it.reward_amount),
    assigneeText: it.assignee_text?.trim() || undefined,
    sortOrder: typeof it.sort_order === "number" ? it.sort_order : undefined,
    paidRewardAmount: decNum(it.paid_reward_amount),
  };
}

function mapParticipant(p: BackendParticipant, idx: number): ContractParticipant {
  // Treat "string" as absent — it is the Pydantic OpenAPI default that sometimes ends up as
  // legacy test data; real nicknames are user-set or resolved from chain.
  const rawNick = p.nickname?.trim();
  const nickname = rawNick && rawNick !== "string" ? rawNick : undefined;
  return {
    id: String(p.user_id ?? `p-${idx}`),
    displayName: nickname || p.wallet_address?.trim() || String(p.user_id).slice(0, 8),
    walletAddress: p.wallet_address ?? undefined,
    joinedAt: Date.parse(p.joined_at) || 0,
  };
}

export function mapContractDetailToLogistics(d: BackendContractDetail): LogisticsContract {
  const createdAt = Date.parse(d.created_at) || 0;
  const updatedAt = Date.parse(d.updated_at) || createdAt;
  const track = readTrackSsuAuto(d);
  return {
    id: String(d.id),
    title: d.title,
    description: d.description ?? undefined,
    targetStarSystem: d.target_star_system || d.target_system_name,
    targetSsuId: d.target_ssu_id,
    ...(track !== undefined ? { trackSsuAuto: track } : {}),
    visibility: mapVisibility(d.visibility ?? d.visibility_scope),
    priority: mapPriority(d.priority),
    status: mapStatus(d.status),
    lines: (d.items ?? []).map(mapItem),
    participants: (d.participants ?? []).map(mapParticipant),
    createdByWallet: d.creator_wallet_address ?? undefined,
    creatorUserId: d.creator_user_id,
    createdAt,
    updatedAt,
    expiresAt: d.expires_at ? Date.parse(d.expires_at) : undefined,
  };
}

function normUserIdKey(s: string | undefined | null): string {
  if (s == null || !String(s).trim()) return "";
  return String(s).trim().toLowerCase().replace(/-/g, "");
}

function normWalletKey(s: string | undefined | null): string {
  if (s == null || !String(s).trim()) return "";
  return String(s).trim().toLowerCase();
}

/**
 * When list rows include creator fields, skip unrelated ids before fetching details.
 * Returns "unknown" if the row does not carry creator fields (caller may still fetch detail).
 */
export function listRowCreatorMatch(
  row: BackendContractListRow,
  authUserId: string,
  walletAddress: string | null
): boolean | "unknown" {
  const uid = row.creator_user_id;
  const w = row.creator_wallet_address;
  const authK = normUserIdKey(authUserId);
  const walletK = walletAddress ? normWalletKey(walletAddress) : "";
  const hasUid = uid != null && String(uid).trim() !== "";
  const hasWallet = w != null && String(w).trim() !== "";
  if (!hasUid && !hasWallet) return "unknown";
  if (hasUid && authK && normUserIdKey(uid) === authK) return true;
  if (hasWallet && walletK && normWalletKey(w) === walletK) return true;
  if (hasUid || hasWallet) return false;
  return "unknown";
}

export function mapListRowToBrowseSummary(row: BackendContractListRow): ContractBrowseSummary {
  const createdAt = Date.parse(row.created_at) || 0;
  const track = readTrackSsuAuto(row);
  const contract: LogisticsContract = {
    id: String(row.id),
    title: row.title,
    description: row.description ?? undefined,
    targetStarSystem: row.target_star_system || row.target_system_name,
    targetSsuId: row.target_ssu_id,
    ...(track !== undefined ? { trackSsuAuto: track } : {}),
    visibility: mapVisibility(row.visibility ?? row.visibility_scope),
    priority: mapPriority(row.priority),
    status: mapStatus(row.status),
    lines: [],
    participants: [],
    createdAt,
    updatedAt: createdAt,
    createdByWallet: row.creator_wallet_address?.trim() || undefined,
    creatorUserId: row.creator_user_id?.trim() || undefined,
  };
  return {
    contract,
    progressPercent: decNum(row.progress_percent),
    rewardProgressTokens: decNum(row.total_paid_reward),
    rewardCapTokens: decNum(row.total_reserved_reward),
  };
}

export function mapTokenBalance(b: BackendTokenBalance): { balance: number; reserved: number; available: number } {
  const balance = decNum(b.balance);
  const reserved = decNum(b.reserved ?? b.reserved_balance);
  // Prefer explicit available field; fall back to balance − reserved
  const available = (b.available != null || b.available_balance != null)
    ? decNum(b.available ?? b.available_balance)
    : Math.max(0, balance - reserved);
  return { balance, reserved, available };
}

export function mapContractStats(s: BackendContractStats): ContractStats {
  const published = s.published_count ?? 0;
  const inProg = s.in_progress_count ?? 0;
  const completed = s.completed_count ?? 0;
  return {
    totalPublished: published + inProg + completed,
    openForDelivery: published + inProg,
    totalTokensCommitted: 0,
  };
}

/** Map backend business error codes to frontend publish error codes. */
export function mapPublishFailure(code: string | undefined, message: string): PublishContractFailure {
  const c = (code ?? "UNKNOWN").toUpperCase();
  let uiCode: PublishContractFailure["code"] = "UNKNOWN";
  if (c === "INSUFFICIENT_TOKEN_BALANCE") uiCode = "INSUFFICIENT_BALANCE";
  else if (c === "CONTRACT_NOT_VISIBLE" || c === "FORBIDDEN") uiCode = "NO_TRIBE_ACCESS";
  else if (c === "INVALID_RESOURCE_LINE" || c === "VALIDATION_ERROR") uiCode = "INVALID_LINES";
  else if (c === "CONTRACT_NOT_FOUND") uiCode = "UNKNOWN";
  else if (c === "CONTRACT_ALREADY_PUBLISHED" || c === "INVALID_STATUS_TRANSITION" || c === "CONTRACT_ALREADY_CANCELED") uiCode = "NOT_DRAFT";
  return { ok: false, code: uiCode, message: message || "Request failed." };
}

export function parseErrorBody(json: unknown): { code: string; message: string } {
  const b = json as BackendErrorBody;
  return {
    code: typeof b?.code === "string" ? b.code : "UNKNOWN",
    message: typeof b?.message === "string" ? b.message : "Request failed.",
  };
}

export function failureFromHttp(status: number, body: unknown): PublishContractFailure {
  const { code, message } = parseErrorBody(body);
  if (status === 401) return { ok: false, code: "NO_TRIBE_ACCESS", message: message || "Unauthorized." };
  if (status === 403) return mapPublishFailure("FORBIDDEN", message);
  if (status === 404) return mapPublishFailure("CONTRACT_NOT_FOUND", message);
  return mapPublishFailure(code, message);
}

export function isPublishOk(r: PublishContractResult): r is { ok: true; contract: LogisticsContract } {
  return r.ok === true;
}
