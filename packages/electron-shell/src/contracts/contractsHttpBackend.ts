/**
 * FastAPI contracts + me endpoints → @powerlay/core domain types.
 */
import {
  type ContractBrowseSummary,
  type ContractLineDraftInput,
  contractProgressPercent,
  contractRewardCapTokens,
  contractRewardProgressTokens,
  type ContractStats,
  type CreateDraftInput,
  type LogisticsContract,
  type PublishContractResult,
  type SearchContractsParams,
  type UpdateDraftInput,
} from "@powerlay/core";
import { loadSession } from "../auth/sessionStore.js";
import type {
  BackendContractDetail,
  BackendContractListEnvelope,
  BackendContractLogItem,
  BackendContractStats,
  BackendTokenBalance,
} from "./backendDto.js";
import { getPowerlayApiBaseUrl } from "./contractsApiConfig.js";
import {
  failureFromHttp,
  listRowCreatorMatch,
  mapContractDetailToLogistics,
  mapContractStats,
  mapListRowToBrowseSummary,
  mapPublishFailure,
  mapTokenBalance,
  parseErrorBody,
} from "./mapBackendToDomain.js";
import { mapCreateDraftToBackend, mapCreateDraftToBackendWithExistingLineIds } from "./mapDomainToBackend.js";
import {
  forgetContractDraft,
  getRememberedDraftIds,
  rememberContractDraft,
} from "./contractsDraftIndexStore.js";
import { deterministicUserIdFromWallet } from "./walletUserId.js";
import { getContractsDevNickname, getContractsDevUserId } from "./contractsApiConfig.js";
import { queryCharacterNameFromChain } from "../blockchain/playerTribeFromChain.js";
import type { ContractParticipant } from "@powerlay/core";

/** Minimal UUID so list endpoint accepts the request; reachability only cares that TCP/HTTP completes. */
const PING_USER_ID = "00000000-0000-4000-8000-000000000001";

function errnoFromUnknown(err: unknown): string | undefined {
  const e = err as { cause?: unknown };
  let c: unknown = e?.cause;
  for (let i = 0; i < 4 && c && typeof c === "object"; i++) {
    const code = (c as { code?: string }).code;
    if (typeof code === "string") return code;
    c = (c as { cause?: unknown }).cause;
  }
  return undefined;
}

function humanizeReachabilityError(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return "The Powerlay backend did not respond in time. Check that the API is running and reachable.";
  }
  const code = errnoFromUnknown(err);
  if (code === "ECONNREFUSED") {
    return "Cannot connect to the Powerlay backend (connection refused). Start the API server.";
  }
  if (code === "ENOTFOUND") {
    return "Cannot resolve the Powerlay backend host. Check POWERLAY_API_BASE.";
  }
  if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "Connection to the Powerlay backend timed out. Check the server address and firewall.";
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed/i.test(msg)) {
    return "Cannot reach the Powerlay backend. Ensure the server is running and POWERLAY_API_BASE is correct.";
  }
  return msg || "Cannot reach the Powerlay backend.";
}

export interface AuthHeadersContext {
  userId: string;
  walletAddress: string | null;
  tribeId: string | null;
  nickname: string | null;
}

function resolveAuthContext(): AuthHeadersContext | null {
  const session = loadSession();
  const wallet = session?.walletAddress?.trim() || null;
  const devId = getContractsDevUserId();
  const userId = devId ?? (wallet ? deterministicUserIdFromWallet(wallet) : null);
  if (!userId) return null;
  const tribeId = session?.tribeId?.trim() || null;
  // Prefer dev override, then on-chain character name resolved at login time
  const nickname = getContractsDevNickname() ?? session?.characterName?.trim() ?? null;
  return {
    userId,
    walletAddress: wallet,
    tribeId: (tribeId && tribeId.trim()) || null,
    nickname: nickname || null,
  };
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

export interface ContractLogEntry {
  id: string;
  eventType: string;
  timestamp: number;
  /** Resolved display name (nickname or on-chain character name). */
  actorName?: string;
  /** Wallet address — shown truncated when no name is available. */
  actorWallet?: string;
  /** On-chain character ID — shown as last-resort identifier. */
  actorCharacterId?: string;
  description?: string;
  resourceName?: string;
  quantity?: number;
  txHash?: string;
  fromStatus?: string;
  toStatus?: string;
  /** Raw extra fields from the backend for forward compatibility. */
  raw?: unknown;
}

function mapContractLogItem(item: BackendContractLogItem, idx: number): ContractLogEntry {
  const ts = Date.parse(item.occurred_at ?? item.timestamp ?? "");
  const qty = item.quantity != null ? parseFloat(String(item.quantity)) : undefined;
  // actor_wallet covers status_change/contribution; sender_wallet covers ssu_event rows
  const wallet = item.actor_wallet?.trim() || item.sender_wallet?.trim() || undefined;
  const name = item.actor_nickname?.trim() || undefined;
  const charId = item.character_id?.trim() || undefined;
  return {
    id: String(item.id ?? idx),
    eventType: item.event_type?.trim() || "event",
    timestamp: Number.isFinite(ts) ? ts : 0,
    actorName: name,
    actorWallet: wallet,
    actorCharacterId: charId,
    description: item.description?.trim() || undefined,
    resourceName: item.resource_name?.trim() || undefined,
    quantity: qty != null && Number.isFinite(qty) ? qty : undefined,
    txHash: item.tx_hash?.trim() || undefined,
    fromStatus: item.from_status?.trim() || undefined,
    toStatus: item.to_status?.trim() || undefined,
    raw: item.data,
  };
}

/**
 * Best-effort: resolve on-chain character names for participants that have a wallet address.
 * Results are cached in-process so repeated calls for the same wallet are free.
 * Mutates the array in place; never throws.
 */
async function enrichParticipantNames(participants: ContractParticipant[]): Promise<void> {
  const toResolve = participants.filter((p) => !!p.walletAddress);
  if (!toResolve.length) return;
  await Promise.allSettled(
    toResolve.map(async (p) => {
      const name = await queryCharacterNameFromChain(p.walletAddress!);
      if (name) p.displayName = name;
    })
  );
}

export class ContractsHttpBackend {
  private readonly base: string;

  constructor(baseUrl?: string) {
    this.base = (baseUrl ?? getPowerlayApiBaseUrl()).replace(/\/+$/, "");
  }

  private authHeaders(ctx: AuthHeadersContext, nicknameOverride?: string): HeadersInit {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      "X-User-Id": ctx.userId,
    };
    if (ctx.walletAddress) h["X-Wallet-Address"] = ctx.walletAddress;
    if (ctx.tribeId) h["X-Tribe-Id"] = ctx.tribeId;
    const nick = nicknameOverride?.trim() || ctx.nickname;
    if (nick) h["X-Nickname"] = nick;
    return h;
  }

  private requireAuth(): AuthHeadersContext {
    const ctx = resolveAuthContext();
    if (!ctx) throw new Error("CONTRACTS_AUTH_REQUIRED");
    return ctx;
  }

  private async request(
    method: string,
    path: string,
    opts: { body?: unknown; nicknameOverride?: string } = {}
  ): Promise<Response> {
    const ctx = this.requireAuth();
    const url = `${this.base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(this.authHeaders(ctx, opts.nicknameOverride));
    const init: RequestInit = { method, headers };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(url, init);
  }

  /** Auth optional: token balance may be called when logged out — returns zeros. */
  private async requestAllowGuest(method: string, path: string): Promise<Response> {
    const ctx = resolveAuthContext();
    if (!ctx) {
      return new Response(null, { status: 401 });
    }
    const url = `${this.base}${path.startsWith("/") ? path : `/${path}`}`;
    const h = new Headers();
    h.set("X-User-Id", ctx.userId);
    if (ctx.walletAddress) h.set("X-Wallet-Address", ctx.walletAddress);
    if (ctx.tribeId) h.set("X-Tribe-Id", ctx.tribeId);
    if (ctx.nickname) h.set("X-Nickname", ctx.nickname);
    return fetch(url, { method, headers: h });
  }

  private async fetchSearchPage(params: SearchContractsParams, visibility: string): Promise<BackendContractListEnvelope> {
    const q = new URLSearchParams();
    if (params.query.trim()) q.set("q", params.query.trim());
    q.set("search_mode", params.filterMode);
    q.set("visibility", visibility);
    if (params.priority !== "all") q.set("priority", params.priority);
    q.set("limit", "100");
    q.set("offset", "0");
    const res = await this.request("GET", `/contracts?${q.toString()}`);
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    return json as BackendContractListEnvelope;
  }

  async search(params: SearchContractsParams): Promise<ContractBrowseSummary[]> {
    this.requireAuth();
    const vis = params.visibility;
    /** Backend discovery applies scope per request; omitting `visibility` is not equivalent to union of all scopes. */
    const allScopes = ["tribe", "public", "alliance"] as const;
    const scopes: string[] =
      vis.length === 0
        ? [...allScopes]
        : vis.length === 1
          ? [vis[0] as string]
          : vis.map((v) => v as string);

    const merged = new Map<string, ContractBrowseSummary>();
    for (const scope of scopes) {
      const env = await this.fetchSearchPage(params, scope);
      for (const row of env.items ?? []) {
        const id = String(row.id);
        if (!merged.has(id)) merged.set(id, mapListRowToBrowseSummary(row));
      }
    }
    return Array.from(merged.values());
  }

  /**
   * List contracts with optional visibility (omit when `null` if the server allows “all scopes” for the user).
   * Returns `null` when the server rejects the query (e.g. visibility required), so callers can fall back.
   */
  private async fetchContractListPage(opts: {
    visibility: string | null;
    status: string;
    limit: number;
    offset: number;
  }): Promise<BackendContractListEnvelope | null> {
    const q = new URLSearchParams();
    q.set("search_mode", "title");
    if (opts.visibility != null) q.set("visibility", opts.visibility);
    q.set("status", opts.status);
    q.set("limit", String(opts.limit));
    q.set("offset", String(opts.offset));
    const res = await this.request("GET", `/contracts?${q.toString()}`);
    const json = await readJson(res);
    if (!res.ok) {
      if (res.status === 400 || res.status === 422) return null;
      throw new Error(JSON.stringify(parseErrorBody(json)));
    }
    return json as BackendContractListEnvelope;
  }

  private static contractToBrowseSummary(c: LogisticsContract): ContractBrowseSummary {
    return {
      contract: c,
      progressPercent: contractProgressPercent(c),
      rewardProgressTokens: contractRewardProgressTokens(c),
      rewardCapTokens: contractRewardCapTokens(c),
    };
  }

  private static isContractCreatedBy(
    c: LogisticsContract,
    authIdNorm: string,
    walletNorm: string | null
  ): boolean {
    const uid = c.creatorUserId?.trim().toLowerCase().replace(/-/g, "") ?? "";
    const auth = authIdNorm.trim().toLowerCase().replace(/-/g, "");
    if (uid && auth && uid === auth) return true;
    const w = c.createdByWallet?.trim().toLowerCase() ?? "";
    if (walletNorm && w && w === walletNorm) return true;
    return false;
  }

  /** Preferred when the API exposes `GET /me/contracts` (paginated list of the current user’s contracts). */
  private async tryListMyContractsViaMeEndpoint(
    auth: AuthHeadersContext,
    bucket?: string
  ): Promise<ContractBrowseSummary[] | null> {
    const authIdNorm = auth.userId.trim().toLowerCase();
    const walletNorm = auth.walletAddress?.trim().toLowerCase() ?? null;
    const limit = 100;
    let offset = 0;
    const rows: BackendContractListEnvelope["items"] = [];
    const isCreatorBucket =
      !bucket || bucket === "all" || bucket === "drafts" || bucket === "published_by_me" || bucket === "removed_by_me";
    const validBuckets = ["all", "drafts", "published_by_me", "removed_by_me", "joined", "hidden"] as const;
    for (let guard = 0; guard < 600; guard++) {
      const q = new URLSearchParams();
      q.set("search_mode", "title");
      q.set("limit", String(limit));
      q.set("offset", String(offset));
      if (bucket && validBuckets.includes(bucket as (typeof validBuckets)[number])) {
        q.set("bucket", bucket);
      }
      const res = await this.request("GET", `/me/contracts?${q.toString()}`);
      if (res.status === 404 || res.status === 405 || res.status === 501) {
        if (offset === 0) return null;
        break;
      }
      const json = await readJson(res);
      if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
      const env = json as BackendContractListEnvelope;
      const items = env.items ?? [];
      rows.push(...items);
      if (items.length < limit) break;
      offset += limit;
    }
    return this.summariesFromContractIds(
      [...new Set(rows.map((r) => String(r.id)))],
      authIdNorm,
      walletNorm,
      isCreatorBucket
    );
  }

  private async summariesFromContractIds(
    ids: string[],
    authIdNorm: string,
    walletNorm: string | null,
    filterByCreator = true
  ): Promise<ContractBrowseSummary[]> {
    const out: ContractBrowseSummary[] = [];
    const batchSize = 16;
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const details = await Promise.all(batch.map((id) => this.get(id)));
      for (const c of details) {
        if (!c) continue;
        if (filterByCreator && !ContractsHttpBackend.isContractCreatedBy(c, authIdNorm, walletNorm)) continue;
        out.push(ContractsHttpBackend.contractToBrowseSummary(c));
      }
    }
    out.sort((a, b) => (b.contract.updatedAt ?? 0) - (a.contract.updatedAt ?? 0));
    return out;
  }

  /**
   * When `GET /me/contracts` is unavailable, discover candidate ids via list endpoints (status-wide and/or
   * visibility × status), filter list rows when creator fields exist, then hydrate via GET detail.
   */
  private async listMyContractsFallback(auth: AuthHeadersContext): Promise<ContractBrowseSummary[]> {
    const authIdNorm = auth.userId.trim().toLowerCase();
    const walletNorm = auth.walletAddress?.trim().toLowerCase() ?? null;
    const remembered = getRememberedDraftIds(auth.userId);
    const candidateIds: string[] = [];
    const seen = new Set<string>();
    const pushId = (id: string) => {
      const s = String(id);
      if (seen.has(s)) return;
      seen.add(s);
      candidateIds.push(s);
    };
    for (const id of remembered) pushId(id);

    const statuses = ["draft", "published", "in_progress", "completed", "canceled"] as const;
    const scopes = ["tribe", "public", "alliance"] as const;
    const pageSize = 100;
    const maxPagesPerStatus = 60;
    const maxPagesScoped = 40;

    const probe = await this.fetchContractListPage({ visibility: null, status: "draft", limit: 1, offset: 0 });
    const canOmitVisibility = probe !== null;

    if (canOmitVisibility) {
      for (const status of statuses) {
        for (let page = 0; page < maxPagesPerStatus; page++) {
          const env = await this.fetchContractListPage({
            visibility: null,
            status,
            limit: pageSize,
            offset: page * pageSize,
          });
          if (!env) break;
          const items = env.items ?? [];
          for (const row of items) {
            if (listRowCreatorMatch(row, auth.userId, auth.walletAddress) === false) continue;
            pushId(String(row.id));
          }
          if (items.length < pageSize) break;
        }
      }
    } else {
      for (const scope of scopes) {
        for (const status of statuses) {
          for (let page = 0; page < maxPagesScoped; page++) {
            const env = await this.fetchContractListPage({
              visibility: scope,
              status,
              limit: pageSize,
              offset: page * pageSize,
            });
            if (!env) break;
            const items = env.items ?? [];
            for (const row of items) {
              if (listRowCreatorMatch(row, auth.userId, auth.walletAddress) === false) continue;
              pushId(String(row.id));
            }
            if (items.length < pageSize) break;
          }
        }
      }
    }

    const MAX_DETAIL_FETCHES = 5000;
    const ids = candidateIds.slice(0, MAX_DETAIL_FETCHES);
    return this.summariesFromContractIds(ids, authIdNorm, walletNorm);
  }

  async listMyContracts(bucket?: string): Promise<ContractBrowseSummary[]> {
    const auth = this.requireAuth();
    const viaMe = await this.tryListMyContractsViaMeEndpoint(auth, bucket);
    if (viaMe !== null) return viaMe;
    return this.listMyContractsFallback(auth);
  }

  async listDrafts(): Promise<LogisticsContract[]> {
    const auth = this.requireAuth();
    const authIdNorm = auth.userId.trim().toLowerCase();
    const rememberedIds = getRememberedDraftIds(auth.userId);
    const candidateIds = new Set<string>(rememberedIds);

    const q = new URLSearchParams();
    q.set("status", "draft");
    q.set("limit", "50");
    q.set("offset", "0");
    const res = await this.request("GET", `/contracts?${q.toString()}`);
    const json = await readJson(res);
    if (res.ok) {
      const env = json as BackendContractListEnvelope;
      for (const row of env.items ?? []) {
        candidateIds.add(String(row.id));
      }
    }

    const out: LogisticsContract[] = [];

    for (const cid of candidateIds) {
      const dr = await this.request("GET", `/contracts/${encodeURIComponent(cid)}`);
      const dj = await readJson(dr);
      if (!dr.ok) {
        if (dr.status === 404) forgetContractDraft(auth.userId, cid);
        continue;
      }
      const raw = dj as BackendContractDetail;
      const statusNorm = String(raw.status ?? "")
        .toLowerCase()
        .replace(/-/g, "_");
      if (statusNorm !== "draft") {
        forgetContractDraft(auth.userId, cid);
        continue;
      }
      const creator = String(raw.creator_user_id ?? "")
        .trim()
        .toLowerCase()
        .replace(/-/g, "");
      const authK = authIdNorm.trim().toLowerCase().replace(/-/g, "");
      if (creator !== authK) continue;
      out.push(mapContractDetailToLogistics(raw));
    }
    out.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return out;
  }

  async get(id: string): Promise<LogisticsContract | null> {
    this.requireAuth();
    const res = await this.request("GET", `/contracts/${encodeURIComponent(id)}`);
    const json = await readJson(res);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    const contract = mapContractDetailToLogistics(json as BackendContractDetail);
    await enrichParticipantNames(contract.participants);
    return contract;
  }

  async createDraft(input: CreateDraftInput): Promise<LogisticsContract> {
    const auth = this.requireAuth();
    const body = mapCreateDraftToBackend(input);
    const res = await this.request("POST", "/contracts", { body });
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    const created = mapContractDetailToLogistics(json as BackendContractDetail);
    rememberContractDraft(auth.userId, created.id);
    return created;
  }

  private mergeDraftForUpdate(current: LogisticsContract, patch: UpdateDraftInput): CreateDraftInput {
    const lineToDraft = (l: LogisticsContract["lines"][0]): ContractLineDraftInput => ({
      typeID: l.typeID,
      resourceName: l.resourceName,
      requiredAmount: l.requiredAmount,
      rewardTokensFullLine: l.rewardTokensFullLine,
      assigneeText: l.assigneeText,
    });
    const lines =
      patch.lines ??
      current.lines.map(lineToDraft);
    return {
      title: patch.title ?? current.title,
      description: patch.description !== undefined ? patch.description : current.description,
      targetStarSystem: patch.targetStarSystem ?? current.targetStarSystem,
      targetSsuId: patch.targetSsuId ?? current.targetSsuId,
      trackSsuAuto: patch.trackSsuAuto !== undefined ? patch.trackSsuAuto : (current.trackSsuAuto ?? false),
      visibility: patch.visibility ?? current.visibility,
      priority: patch.priority ?? current.priority,
      lines,
      expiresAt: patch.expiresAt === null ? undefined : patch.expiresAt ?? current.expiresAt,
    };
  }

  async updateDraft(id: string, patch: UpdateDraftInput): Promise<LogisticsContract | null> {
    const auth = this.requireAuth();
    const current = await this.get(id);
    if (!current) return null;
    if (current.status !== "draft") return null;
    const full = this.mergeDraftForUpdate(current, patch);
    const mergedBody = mapCreateDraftToBackendWithExistingLineIds(full, current.lines);
    const res = await this.request("PUT", `/contracts/${encodeURIComponent(id)}`, { body: mergedBody });
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    const updated = mapContractDetailToLogistics(json as BackendContractDetail);
    rememberContractDraft(auth.userId, id);
    return updated;
  }

  async publish(id: string): Promise<PublishContractResult> {
    let auth: AuthHeadersContext;
    try {
      auth = this.requireAuth();
    } catch {
      return mapPublishFailure("UNAUTHORIZED", "Sign in to publish contracts.");
    }
    const res = await this.request("POST", `/contracts/${encodeURIComponent(id)}/publish`);
    const json = await readJson(res);
    if (!res.ok) {
      return failureFromHttp(res.status, json);
    }
    forgetContractDraft(auth.userId, id);
    const detail = await this.get(id);
    if (!detail) {
      return mapPublishFailure("CONTRACT_NOT_FOUND", "Published but could not reload contract.");
    }
    return { ok: true, contract: detail };
  }

  async hide(contractId: string): Promise<boolean> {
    this.requireAuth();
    const res = await this.request("POST", `/contracts/${encodeURIComponent(contractId)}/hide`);
    return res.ok;
  }

  async join(contractId: string, displayName?: string): Promise<LogisticsContract | null> {
    this.requireAuth();
    const res = await this.request("POST", `/contracts/${encodeURIComponent(contractId)}/join`, {
      nicknameOverride: displayName,
    });
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    return this.get(contractId);
  }

  async getTokenBalance(): Promise<{ balance: number; reserved: number; available: number }> {
    const res = await this.requestAllowGuest("GET", "/me/token-balance");
    const json = await readJson(res);
    if (!res.ok) return { balance: 0, reserved: 0, available: 0 };
    return mapTokenBalance(json as BackendTokenBalance);
  }

  async getStats(): Promise<ContractStats> {
    const res = await this.requestAllowGuest("GET", "/me/contracts/stats");
    const json = await readJson(res);
    if (!res.ok) {
      return { totalPublished: 0, openForDelivery: 0, totalTokensCommitted: 0 };
    }
    return mapContractStats(json as BackendContractStats);
  }

  async cancel(contractId: string): Promise<LogisticsContract | null> {
    const auth = this.requireAuth();
    const before = await this.get(contractId);
    if (!before) {
      forgetContractDraft(auth.userId, contractId);
      return null;
    }
    // Drafts use DELETE /contracts/{id} — /cancel only accepts published contracts.
    if (before.status === "draft") {
      const delRes = await this.request("DELETE", `/contracts/${encodeURIComponent(contractId)}`);
      if (!delRes.ok && delRes.status !== 404) {
        const json = await readJson(delRes);
        throw new Error(JSON.stringify(parseErrorBody(json)));
      }
      forgetContractDraft(auth.userId, contractId);
      return null;
    }

    const res = await this.request("POST", `/contracts/${encodeURIComponent(contractId)}/cancel`);
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    forgetContractDraft(auth.userId, contractId);
    return this.get(contractId);
  }

  /**
   * Creator finishes an active contract after partial (or full) fulfillment; backend returns unspent reserved tokens.
   * `POST /contracts/{id}/complete` — adjust path if your OpenAPI differs.
   */
  async completeContract(contractId: string): Promise<LogisticsContract | null> {
    const auth = this.requireAuth();
    const before = await this.get(contractId);
    if (!before) return null;
    if (before.status === "draft" || before.status === "completed" || before.status === "canceled") return null;
    const res = await this.request("POST", `/contracts/${encodeURIComponent(contractId)}/complete`);
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    forgetContractDraft(auth.userId, contractId);
    return this.get(contractId);
  }

  /**
   * Record a contract delivery after the on-chain `deliver_personal_to_owner_primary` PTB succeeds.
   * Server must verify the Sui digest and atomically update reserves, deliverer balance, and line progress.
   * `POST /contracts/{id}/deliveries`
   */
  async recordDelivery(
    contractId: string,
    body: {
      lineId: string;
      quantity: number;
      suiTxDigest: string;
      ssuObjectId: string;
    }
  ): Promise<LogisticsContract> {
    this.requireAuth();
    const res = await this.request("POST", `/contracts/${encodeURIComponent(contractId)}/deliveries`, {
      body: {
        line_id: body.lineId,
        quantity: body.quantity,
        sui_tx_digest: body.suiTxDigest.trim(),
        ssu_object_id: body.ssuObjectId.trim(),
      },
    });
    const json = await readJson(res);
    if (!res.ok) throw new Error(JSON.stringify(parseErrorBody(json)));
    const contract = mapContractDetailToLogistics(json as BackendContractDetail);
    await enrichParticipantNames(contract.participants);
    return contract;
  }

  async getLogs(contractId: string, limit = 50): Promise<ContractLogEntry[]> {
    this.requireAuth();
    const q = new URLSearchParams({ limit: String(limit), offset: "0" });
    const res = await this.request("GET", `/contracts/${encodeURIComponent(contractId)}/logs?${q}`);
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const json = await readJson(res);
    const items: BackendContractLogItem[] = Array.isArray((json as { items?: unknown })?.items)
      ? ((json as { items: BackendContractLogItem[] }).items)
      : Array.isArray(json)
        ? (json as BackendContractLogItem[])
        : [];
    return items.map(mapContractLogItem);
  }

  /**
   * True when an HTTP response is received (any status). False when the request fails at the network layer.
   */
  async pingReachability(timeoutMs = 5000): Promise<{ ok: boolean; message?: string }> {
    const q = new URLSearchParams();
    q.set("search_mode", "title");
    q.set("visibility", "public");
    q.set("limit", "1");
    q.set("offset", "0");
    const url = `${this.base}/contracts?${q.toString()}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await fetch(url, {
        method: "GET",
        headers: { "X-User-Id": PING_USER_ID },
        signal: ctrl.signal,
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, message: humanizeReachabilityError(err) };
    } finally {
      clearTimeout(timer);
    }
  }
}

let singleton: ContractsHttpBackend | null = null;

export function getContractsHttpBackend(): ContractsHttpBackend {
  if (!singleton) singleton = new ContractsHttpBackend();
  return singleton;
}
