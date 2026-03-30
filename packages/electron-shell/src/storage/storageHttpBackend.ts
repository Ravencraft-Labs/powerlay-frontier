/**
 * HTTP backend for Powerlay storage registration.
 *
 * Follows the same auth-header pattern as `contractsHttpBackend.ts`:
 *   X-User-Id, X-Wallet-Address, X-Tribe-Id (optional)
 *
 * Aligned with backend `app/schemas/storages.py` (names snake_case over the wire).
 *
 * **POST /storages** body (desktop sends):
 *   - `ssu_id` (required)
 *   - `tx_hash` (required) — Sui digest after `connect_storage` (add to Pydantic schema if missing)
 *   - `display_name` (optional)
 *
 * **Response row:** `id`, `ssu_id`, `tribe_id`, `owner_user_id`, `owner_wallet`, `display_name`,
 * `is_active` (and optionally `tx_hash` / timestamps if the API adds them later).
 *
 * Endpoints (relative to `POWERLAY_API_BASE`, e.g. `…/api/v1`):
 *   GET    /storages              — requires `X-Tribe-Id`
 *   POST   /storages
 *   DELETE /storages/{ssu_id}     — requires `X-Tribe-Id`
 *
 * Uses the Powerlay API base (`getPowerlayApiBaseUrl()` → optional `POWERLAY_API_BASE`,
 * otherwise the app default). Storages are served
 * from that host under `/storages` (no separate storage env var).
 */

import { loadSession } from "../auth/sessionStore.js";
import { getContractsDevUserId, getPowerlayApiBaseUrl } from "../contracts/contractsApiConfig.js";
import { deterministicUserIdFromWallet } from "../contracts/walletUserId.js";
import type { BackendStorageHistoryItem } from "../contracts/backendDto.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function resolvePowerlayApiBase(): string {
  const base = getPowerlayApiBaseUrl().trim();
  if (!base) {
    throw new Error(
      "Powerlay backend is not available: API base URL is empty. Set POWERLAY_API_BASE."
    );
  }
  return base.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthCtx {
  userId: string;
  walletAddress: string | null;
  tribeId: string | null;
}

function resolveAuth(): AuthCtx | null {
  const session = loadSession();
  const wallet = session?.walletAddress?.trim() || null;
  const devId = getContractsDevUserId();
  const userId = devId ?? (wallet ? deterministicUserIdFromWallet(wallet) : null);
  if (!userId) return null;
  return {
    userId,
    walletAddress: wallet,
    tribeId: session?.tribeId?.trim() || null,
  };
}

function buildHeaders(ctx: AuthCtx): HeadersInit {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-User-Id": ctx.userId,
  };
  if (ctx.walletAddress) h["X-Wallet-Address"] = ctx.walletAddress;
  if (ctx.tribeId) h["X-Tribe-Id"] = ctx.tribeId;
  return h;
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

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

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
  /** Raw extra fields from the backend for forward compatibility. */
  raw?: unknown;
}

function mapStorageHistoryItem(item: BackendStorageHistoryItem, idx: number): StorageHistoryEntry {
  const ts = Date.parse(item.occurred_at ?? item.timestamp ?? "");
  const qty = item.quantity != null ? parseFloat(String(item.quantity)) : undefined;
  return {
    id: String(item.id ?? idx),
    eventType: item.event_type?.trim() || "event",
    timestamp: Number.isFinite(ts) ? ts : 0,
    senderWallet: item.sender_wallet?.trim() || undefined,
    characterId: item.character_id?.trim() || undefined,
    actorName: item.actor_nickname?.trim() || undefined,
    resourceType: item.resource_type?.trim() || undefined,
    resourceName: item.resource_name?.trim() || undefined,
    quantity: qty != null && Number.isFinite(qty) ? qty : undefined,
    txHash: item.tx_hash?.trim() || undefined,
    contractId: item.contract_id?.trim() || undefined,
    contractTitle: item.contract_title?.trim() || undefined,
    raw: item.data,
  };
}

/** A storage unit that has been connected to Powerlay by the current user. */
export interface ConnectedStorage {
  /** Internal Powerlay record ID (`id` from API). */
  id: string;
  /** On-chain StorageUnit object ID — maps API `ssu_id`. */
  ssuObjectId: string;
  /** Maps API `tribe_id`. */
  tribeId: string;
  /** Maps API `tx_hash` when present; otherwise `""` (UI still has digest from register flow). */
  txHash: string;
  /** Maps API `connected_at` when present; otherwise client uses `Date.now()` at parse time. */
  connectedAt: number;
  /** Maps API `display_name` (fallback: legacy `name`). */
  name?: string;
  /** Maps API `owner_user_id` when present. */
  ownerUserId?: string;
  /** Maps API `owner_wallet` when present. */
  ownerWallet?: string | null;
  /** Maps API `is_active` when present. */
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// HTTP client
// ---------------------------------------------------------------------------

export class StorageHttpBackend {
  private readonly base: string;

  constructor(baseUrl?: string) {
    this.base = (baseUrl ?? resolvePowerlayApiBase()).replace(/\/+$/, "");
  }

  private requireAuth(): AuthCtx {
    const ctx = resolveAuth();
    if (!ctx) throw new Error("STORAGE_AUTH_REQUIRED");
    if (!ctx.tribeId?.trim()) {
      throw new Error(
        "Storage API requires tribe context. Resolve tribe (wallet login + chain) so X-Tribe-Id can be sent."
      );
    }
    return ctx;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const ctx = this.requireAuth();
    const url = `${this.base}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(buildHeaders(ctx));
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    try {
      return await fetch(url, init);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/fetch failed/i.test(msg) || msg === "Failed to fetch") {
        throw new Error(
          "Powerlay backend is not available. Ensure the API is reachable and POWERLAY_API_BASE is correct.",
          { cause: err }
        );
      }
      throw err;
    }
  }

  /**
   * List all StorageUnits connected by the current user (and/or their tribe).
   * GET /storages
   */
  async listConnectedStorages(): Promise<ConnectedStorage[]> {
    const res = await this.request("GET", "/storages");
    if (res.status === 404) return [];
    if (!res.ok) {
      const json = await readJson(res);
      throw new Error(
        `[storage] list failed HTTP ${res.status}: ${JSON.stringify(json)}`
      );
    }
    const json = await readJson(res);
    return parseStorageList(json);
  }

  /**
   * Register a newly-connected StorageUnit after the on-chain `connect_storage` tx succeeds.
   * POST /storages
   *
   * @param ssuObjectId  On-chain StorageUnit object ID.
   * @param txHash       Transaction digest from the `connect_storage` PTB.
   * @param name         Optional human-readable label.
   */
  async registerStorage(
    ssuObjectId: string,
    txHash: string,
    name?: string
  ): Promise<ConnectedStorage> {
    const body: Record<string, string> = {
      ssu_id: ssuObjectId,
      tx_hash: txHash.trim(),
    };
    if (name?.trim()) body.display_name = name.trim();
    const res = await this.request("POST", "/storages", body);
    if (!res.ok) {
      const json = await readJson(res);
      throw new Error(
        `[storage] register failed HTTP ${res.status}: ${JSON.stringify(json)}`
      );
    }
    const json = await readJson(res);
    return parseStorageRow(json);
  }

  /**
   * Fetch SSU mint/burn activity for a connected storage in the caller's tribe.
   * GET /storages/{ssuId}/history
   */
  async getStorageHistory(ssuId: string, limit = 50): Promise<StorageHistoryEntry[]> {
    const q = new URLSearchParams({ limit: String(limit), offset: "0" });
    const res = await this.request("GET", `/storages/${encodeURIComponent(ssuId)}/history?${q}`);
    if (res.status === 404) return [];
    if (!res.ok) return [];
    const json = await readJson(res);
    const items: BackendStorageHistoryItem[] = Array.isArray((json as { items?: unknown })?.items)
      ? ((json as { items: BackendStorageHistoryItem[] }).items)
      : Array.isArray(json)
        ? (json as BackendStorageHistoryItem[])
        : [];
    return items.map(mapStorageHistoryItem);
  }

  /**
   * Remove a connected storage from the Powerlay registry (backend-only disconnect).
   * DELETE /storages/{ssuObjectId}
   *
   * On-chain revocation of the extension is deferred (see `powerlay_storage.move`).
   */
  async disconnectStorage(ssuObjectId: string): Promise<void> {
    const res = await this.request(
      "DELETE",
      `/storages/${encodeURIComponent(ssuObjectId)}`
    );
    if (res.status === 404) return; // already gone
    if (!res.ok) {
      const json = await readJson(res);
      throw new Error(
        `[storage] disconnect failed HTTP ${res.status}: ${JSON.stringify(json)}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _instance: StorageHttpBackend | null = null;

export function getStorageHttpBackend(): StorageHttpBackend {
  if (!_instance) _instance = new StorageHttpBackend();
  return _instance;
}

// ---------------------------------------------------------------------------
// Response parsers (loose — handle backend shape variations)
// ---------------------------------------------------------------------------

function parseStorageRow(raw: unknown): ConnectedStorage {
  const o = (raw ?? {}) as Record<string, unknown>;
  const displayName =
    typeof o.display_name === "string"
      ? o.display_name
      : typeof o.name === "string"
        ? o.name
        : undefined;
  const ownerWallet = o.owner_wallet;
  const isActive = o.is_active;
  return {
    id: String(o.id ?? o._id ?? ""),
    ssuObjectId: String(
      o.ssu_id ?? o.ssu_object_id ?? o.ssuObjectId ?? ""
    ),
    tribeId: String(o.tribe_id ?? o.tribeId ?? ""),
    txHash: String(o.tx_hash ?? o.txHash ?? ""),
    connectedAt:
      typeof o.connected_at === "number"
        ? o.connected_at
        : typeof o.connectedAt === "number"
        ? o.connectedAt
        : Date.now(),
    name: displayName,
    ownerUserId:
      typeof o.owner_user_id === "string"
        ? o.owner_user_id
        : o.owner_user_id != null
          ? String(o.owner_user_id)
          : undefined,
    ownerWallet:
      ownerWallet === null || typeof ownerWallet === "string"
        ? ownerWallet
        : ownerWallet != null
          ? String(ownerWallet)
          : undefined,
    isActive: typeof isActive === "boolean" ? isActive : undefined,
  };
}

function parseStorageList(raw: unknown): ConnectedStorage[] {
  if (Array.isArray(raw)) return raw.map(parseStorageRow);
  // Some APIs wrap in { data: [...] }
  const wrapped = (raw as { data?: unknown })?.data;
  if (Array.isArray(wrapped)) return wrapped.map(parseStorageRow);
  return [];
}
