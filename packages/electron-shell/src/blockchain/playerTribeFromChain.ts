/**
 * Resolve player tribe from Sui GraphQL (wallet → tribe for X-Tribe-Id).
 *
 * Uses official Sui GraphQL: wallet-owned `PlayerProfile` → `character_id` → `Character` Move object
 * `tribe_id` (numeric game id, sent as string in `X-Tribe-Id`).
 * Optional: Frontier World API `GET /v2/tribes/{id}` for display name (see Scetrov World API notes).
 *
 * GraphQL URL: settings `efGraphqlUrl` → env POWERLAY_EF_GRAPHQL_URL → default testnet.
 * World API base: settings `efWorldApiBaseUrl` → env POWERLAY_EF_WORLD_API_BASE → Stillness default.
 *
 * @see docs/contracts-integration.md
 */
import { loadSettings } from "../ipc/settingsStore.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WORLD_API_TIMEOUT_MS = 8_000;

/** Default Sui testnet GraphQL; override in Settings or POWERLAY_EF_GRAPHQL_URL. */
export const DEFAULT_EF_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/**
 * Default Frontier World API (Stillness production). Override via Settings or POWERLAY_EF_WORLD_API_BASE for dev/other hosts.
 * @see https://world-api-stillness.live.tech.evefrontier.com/docs/index.html
 */
export const DEFAULT_EF_WORLD_API_BASE_URL = "https://world-api-stillness.live.tech.evefrontier.com";

export function getEffectiveEfGraphqlUrl(): string {
  const s = loadSettings();
  const fromSettings = s.efGraphqlUrl?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = process.env.POWERLAY_EF_GRAPHQL_URL?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_EF_GRAPHQL_URL;
}

export function getPlayerTribeFetchTimeoutMs(): number {
  const s = process.env.POWERLAY_EF_GRAPHQL_TIMEOUT_MS?.trim();
  if (s) {
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > 0) return Math.min(n, 60_000);
  }
  return DEFAULT_TIMEOUT_MS;
}

export function getEffectiveWorldApiBaseUrl(): string {
  const dis = process.env.POWERLAY_EF_WORLD_API_DISABLE?.trim().toLowerCase();
  if (dis === "1" || dis === "true" || dis === "yes") return "";

  const s = loadSettings();
  const fromSettings = s.efWorldApiBaseUrl?.trim();
  if (fromSettings) return fromSettings;
  const fromEnv = process.env.POWERLAY_EF_WORLD_API_BASE?.trim();
  if (fromEnv) return fromEnv;
  return DEFAULT_EF_WORLD_API_BASE_URL;
}

export function getWorldApiTribeFetchTimeoutMs(): number {
  const s = process.env.POWERLAY_EF_WORLD_API_TIMEOUT_MS?.trim();
  if (s) {
    const n = parseInt(s, 10);
    if (!Number.isNaN(n) && n > 0) return Math.min(n, 60_000);
  }
  return DEFAULT_WORLD_API_TIMEOUT_MS;
}

export interface PlayerTribeResult {
  tribeId: string;
  tribeName?: string;
}

const WALLET_OBJECTS_QUERY = `
  query WalletProfileObjects($address: SuiAddress!) {
    address(address: $address) {
      objects(first: 50) {
        nodes {
          contents {
            type {
              repr
            }
            json
          }
        }
      }
    }
  }
`;

const CHARACTER_TRIBE_QUERY = `
  query CharacterTribe($id: SuiAddress!) {
    object(address: $id) {
      asMoveObject {
        contents {
          type {
            repr
          }
          json
        }
      }
    }
  }
`;

/**
 * Query GraphQL for the player's tribe by wallet address.
 * Returns null on failure, timeout, or when the response has no tribe (schema may differ per endpoint).
 * Never throws.
 */
export async function queryPlayerTribeFromChain(
  walletAddress: string
): Promise<PlayerTribeResult | null> {
  const url = getEffectiveEfGraphqlUrl().trim();
  if (!url) return null;

  const normalized = walletAddress?.trim();
  if (!normalized) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());
  const signal = controller.signal;

  try {
    const profileRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: WALLET_OBJECTS_QUERY,
        variables: { address: normalized },
      }),
      signal,
    });

    if (!profileRes.ok) return null;

    const profileJson = (await profileRes.json()) as unknown;
    if (graphqlErrors(profileJson)) return null;

    const characterId = findCharacterIdFromWalletResponse(profileJson);
    if (!characterId) return null;

    const charRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CHARACTER_TRIBE_QUERY,
        variables: { id: characterId },
      }),
      signal,
    });

    if (!charRes.ok) return null;

    const charJson = (await charRes.json()) as unknown;
    if (graphqlErrors(charJson)) return null;

    const parsed = parseTribeFromCharacterResponse(charJson);
    if (!parsed) return null;

    const worldBase = getEffectiveWorldApiBaseUrl().trim();
    if (worldBase) {
      const tribeName = await fetchTribeNameFromWorldApi(worldBase, parsed.tribeId);
      if (tribeName) parsed.tribeName = tribeName;
    }

    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function worldApiTribesUrl(baseUrl: string, tribeId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const id = encodeURIComponent(tribeId.trim());
  return `${base}/v2/tribes/${id}`;
}

/**
 * GET /v2/tribes/{id} — best-effort; returns undefined on any failure.
 */
export async function fetchTribeNameFromWorldApi(
  baseUrl: string,
  tribeId: string
): Promise<string | undefined> {
  const id = tribeId?.trim();
  const base = baseUrl?.trim();
  if (!id || !base) return undefined;

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), getWorldApiTribeFetchTimeoutMs());
  try {
    const url = worldApiTribesUrl(base, id);
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as unknown;
    return parseTribeNameFromWorldApiJson(json);
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

function parseTribeNameFromWorldApiJson(json: unknown): string | undefined {
  if (!json || typeof json !== "object") return undefined;
  const o = json as Record<string, unknown>;
  const name = pickNonEmptyString(o.name) ?? pickNonEmptyString(o.nameShort);
  if (name) return name;
  const nested = o.data;
  if (nested && typeof nested === "object") {
    const d = nested as Record<string, unknown>;
    return pickNonEmptyString(d.name) ?? pickNonEmptyString(d.nameShort);
  }
  return undefined;
}

function pickNonEmptyString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

function graphqlErrors(json: unknown): boolean {
  const errs = (json as { errors?: unknown[] })?.errors;
  return Array.isArray(errs) && errs.length > 0;
}

function findCharacterIdFromWalletResponse(json: unknown): string | null {
  type Node = { contents?: { type?: { repr?: string }; json?: Record<string, unknown> } };
  const nodes = (json as { data?: { address?: { objects?: { nodes?: Node[] } } } })?.data?.address?.objects
    ?.nodes;
  if (!Array.isArray(nodes)) return null;

  for (const n of nodes) {
    const repr = n?.contents?.type?.repr ?? "";
    if (!repr.includes("::character::PlayerProfile")) continue;
    const raw = n?.contents?.json?.character_id;
    if (typeof raw === "string" && raw.trim()) return raw.trim();
  }
  return null;
}

function parseTribeFromCharacterResponse(json: unknown): PlayerTribeResult | null {
  const contents = (json as { data?: { object?: { asMoveObject?: { contents?: { type?: { repr?: string }; json?: Record<string, unknown> } } } } })?.data?.object?.asMoveObject?.contents;
  if (!contents) return null;

  const repr = contents.type?.repr ?? "";
  if (!repr.includes("::character::Character")) return null;

  const tid = contents.json?.tribe_id;
  if (typeof tid === "number" && Number.isFinite(tid) && tid > 0) {
    return { tribeId: String(Math.trunc(tid)) };
  }
  if (typeof tid === "string" && tid.trim()) {
    return { tribeId: tid.trim() };
  }
  return null;
}
