/**
 * Resolve player tribe for contracts (`X-Tribe-Id` + optional display name).
 *
 * **EVE Frontier + Sui (source of truth):** Tribe membership for tooling is the numeric **`tribe_id`**
 * field on the on-chain **`Character`** Move object. The game is responsible for writing/updating that
 * field when the player’s tribe changes; the app only reads it. The wallet address owns a
 * **`PlayerProfile`** whose `character_id` points at that `Character`.
 *
 * **Two services:** (1) **Sui GraphQL** — read `PlayerProfile` → `Character` → `tribe_id`. The app uses
 * a single default indexer URL; override with **`POWERLAY_EF_GRAPHQL_URL`** for operators. (2) **Frontier
 * World API** — `GET /v2/tribes/{id}` maps that id to a **display name** for the UI. The World API base
 * is chosen from the **`PlayerProfile` type’s world package** (Utopia vs Stillness — see CCP Resources).
 * Operators may force a base with **`POWERLAY_EF_WORLD_API_BASE`** or skip name lookup with
 * **`POWERLAY_EF_WORLD_API_DISABLE`**.
 *
 * **Multiple `PlayerProfile`s:** Prefer **Utopia** package, then **Stillness**, then the first profile
 * in GraphQL order.
 *
 * @see docs/contracts-integration.md
 */
import { loadSettings } from "../ipc/settingsStore.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_WORLD_API_TIMEOUT_MS = 8_000;

/** Default Sui testnet GraphQL; override with POWERLAY_EF_GRAPHQL_URL. */
export const DEFAULT_EF_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

/**
 * Default Frontier World API (Stillness production).
 * @see https://world-api-stillness.live.tech.evefrontier.com/docs/index.html
 */
export const DEFAULT_EF_WORLD_API_BASE_URL = "https://world-api-stillness.live.tech.evefrontier.com";

/**
 * Default Frontier World API (Utopia sandbox).
 * @see https://docs.evefrontier.com/tools/resources
 */
export const DEFAULT_EF_WORLD_API_UTOPIA_URL = "https://world-api-utopia.uat.pub.evefrontier.com";

type PlayerProfilePackageKind = "utopia" | "stillness" | "unknown";

export function getEffectiveEfGraphqlUrl(): string {
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

/**
 * World API base for tribe display names, given which world package the chosen `PlayerProfile` belongs to.
 * Empty string disables HTTP (same as `POWERLAY_EF_WORLD_API_DISABLE`).
 */
export function resolveWorldApiBaseUrlForPackageKind(packageKind: PlayerProfilePackageKind): string {
  const dis = process.env.POWERLAY_EF_WORLD_API_DISABLE?.trim().toLowerCase();
  if (dis === "1" || dis === "true" || dis === "yes") return "";

  const override = process.env.POWERLAY_EF_WORLD_API_BASE?.trim();
  if (override) return override;

  if (packageKind === "utopia") return DEFAULT_EF_WORLD_API_UTOPIA_URL;
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
  /** On-chain Character object ID for the wallet's PlayerProfile. */
  characterId?: string;
  /** Character display name from Character.json.metadata.name (EVE Frontier on-chain). */
  characterName?: string;
}

/** World Package object ids — https://docs.evefrontier.com/tools/resources */
export const FRONTIER_WORLD_PACKAGE_UTOPIA =
  "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";
export const FRONTIER_WORLD_PACKAGE_STILLNESS =
  "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

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

    const profiles = collectPlayerProfilesFromWalletJson(profileJson);
    const picked = pickPlayerProfileForTribe(profiles);
    if (!picked) return null;
    const { characterId, packageKind } = picked;

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

    const worldBase = resolveWorldApiBaseUrlForPackageKind(packageKind).trim();
    if (worldBase) {
      const tribeName = await fetchTribeNameFromWorldApi(worldBase, parsed.tribeId);
      if (tribeName) parsed.tribeName = tribeName;
    }

    parsed.characterId = characterId;
    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * In-memory cache: wallet address (lowercase) → character name or null.
 * null means we already looked and found nothing; skip re-querying within the same session.
 */
const characterNameCache = new Map<string, string | null>();

/**
 * Resolve a character display name for a wallet address.
 * Reuses the full tribe query path (same two GraphQL round-trips) and caches results
 * so repeated calls for the same wallet within an app session are free.
 * Returns null if not found or on any error.
 */
export async function queryCharacterNameFromChain(walletAddress: string): Promise<string | null> {
  const key = walletAddress.trim().toLowerCase();
  if (!key) return null;
  if (characterNameCache.has(key)) return characterNameCache.get(key) ?? null;
  const result = await queryPlayerTribeFromChain(walletAddress);
  const name = result?.characterName ?? null;
  characterNameCache.set(key, name);
  return name;
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

function packageKindFromPlayerProfileTypeRepr(typeRepr: string): PlayerProfilePackageKind {
  const lower = typeRepr.toLowerCase();
  const u = FRONTIER_WORLD_PACKAGE_UTOPIA.toLowerCase();
  const s = FRONTIER_WORLD_PACKAGE_STILLNESS.toLowerCase();
  if (lower.startsWith(`${u}::`)) return "utopia";
  if (lower.startsWith(`${s}::`)) return "stillness";
  return "unknown";
}

function collectPlayerProfilesFromWalletJson(json: unknown): { characterId: string; packageKind: PlayerProfilePackageKind }[] {
  type Node = { contents?: { type?: { repr?: string }; json?: Record<string, unknown> } };
  const nodes = (json as { data?: { address?: { objects?: { nodes?: Node[] } } } })?.data?.address?.objects
    ?.nodes;
  if (!Array.isArray(nodes)) return [];

  const out: { characterId: string; packageKind: PlayerProfilePackageKind }[] = [];
  for (const n of nodes) {
    const repr = n?.contents?.type?.repr ?? "";
    if (!repr.includes("::character::PlayerProfile")) continue;
    const raw = n?.contents?.json?.character_id;
    if (typeof raw !== "string" || !raw.trim()) continue;
    out.push({
      characterId: raw.trim(),
      packageKind: packageKindFromPlayerProfileTypeRepr(repr),
    });
  }
  return out;
}

function pickPlayerProfileForTribe(
  profiles: { characterId: string; packageKind: PlayerProfilePackageKind }[]
): { characterId: string; packageKind: PlayerProfilePackageKind } | null {
  if (profiles.length === 0) return null;
  if (profiles.length === 1) return profiles[0];

  const worldPkg = loadSettings().worldContractsPackageId?.trim().toLowerCase() ?? "";
  const preferStillness = worldPkg === FRONTIER_WORLD_PACKAGE_STILLNESS.toLowerCase();
  const preferUtopia = worldPkg === FRONTIER_WORLD_PACKAGE_UTOPIA.toLowerCase();

  if (preferStillness) {
    const s = profiles.find((x) => x.packageKind === "stillness");
    if (s) return s;
    const u = profiles.find((x) => x.packageKind === "utopia");
    if (u) return u;
  }

  if (preferUtopia) {
    const u = profiles.find((x) => x.packageKind === "utopia");
    if (u) return u;
    const s = profiles.find((x) => x.packageKind === "stillness");
    if (s) return s;
  }

  // Backward-compatible fallback when no explicit world package preference is configured.
  const u = profiles.find((x) => x.packageKind === "utopia");
  if (u) return u;
  const s = profiles.find((x) => x.packageKind === "stillness");
  if (s) return s;
  return profiles[0];
}

function parseTribeFromCharacterResponse(json: unknown): PlayerTribeResult | null {
  const contents = (json as { data?: { object?: { asMoveObject?: { contents?: { type?: { repr?: string }; json?: Record<string, unknown> } } } } })?.data?.object?.asMoveObject?.contents;
  if (!contents) return null;

  const repr = contents.type?.repr ?? "";
  if (!repr.includes("::character::Character")) return null;

  const charJson = contents.json ?? {};

  const tid = charJson.tribe_id;
  let tribeId: string | null = null;
  if (typeof tid === "number" && Number.isFinite(tid) && tid > 0) {
    tribeId = String(Math.trunc(tid));
  } else if (typeof tid === "string" && tid.trim()) {
    tribeId = tid.trim();
  }
  if (!tribeId) return null;

  // Character display name lives at Character.json.metadata.name (EVE Frontier on-chain struct)
  const metadata = charJson.metadata;
  let characterName: string | undefined;
  if (metadata && typeof metadata === "object") {
    const n = (metadata as Record<string, unknown>).name;
    if (typeof n === "string" && n.trim()) characterName = n.trim();
  }

  return { tribeId, ...(characterName ? { characterName } : {}) };
}
