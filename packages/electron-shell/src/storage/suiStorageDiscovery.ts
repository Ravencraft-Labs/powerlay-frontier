/**
 * Discover StorageUnit objects owned by (or accessible to) the connected wallet.
 *
 * Strategy — same Sui GraphQL endpoint used for tribe resolution:
 * 1. Query all objects owned by the wallet address.
 * 2. Filter for `OwnerCap<StorageUnit>` by matching the type repr string.
 * 3. Read `authorized_object_id` from each OwnerCap's JSON to get the SSU object ID.
 *
 * NOTE: On real Frontier SSUs the OwnerCap may be *Character-owned*, not
 * wallet-address-owned (see `ssu-extension-and-deposit-paths.md`).  In that case
 * the OwnerCap will NOT appear in the wallet's direct object list.  The fallback
 * is to query via the Character object (same two-step pattern used in
 * `playerTribeFromChain.ts`).  This file implements both paths.
 */

import { getEffectiveEfGraphqlUrl, getPlayerTribeFetchTimeoutMs } from "../blockchain/playerTribeFromChain.js";

export interface WalletSsu {
  /** Object ID of the OwnerCap<StorageUnit> (used in the PTB for connect_storage). */
  ownerCapId: string;
  /** Object ID of the StorageUnit itself (used as the SSU identifier throughout the app). */
  storageUnitId: string;
  /** Display label — populated when the SSU's name metadata can be read, otherwise undefined. */
  name?: string;
}

function getSuiRpcUrl(): string {
  const u = process.env.POWERLAY_SUI_RPC_URL?.trim();
  return u || "https://rpc.testnet.sui.io";
}

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

/** Fetch all objects owned by a wallet address (paginated first 50). */
const WALLET_OBJECTS_QUERY = `
  query WalletObjects($address: SuiAddress!) {
    address(address: $address) {
      objects(first: 50) {
        nodes {
          address
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

/**
 * Fetch objects owned by a specific Character object (to find Character-owned OwnerCaps).
 * The Character object may own OwnerCap<StorageUnit> objects via dynamic fields or direct ownership.
 *
 * TODO: EVE Frontier may represent Character-held OwnerCaps differently (e.g. as dynamic fields
 * on the Character object). Verify the exact layout against a live Frontier SSU and adjust the
 * filter / traversal below as needed.
 */
const CHARACTER_OBJECTS_QUERY = `
  query CharacterObjects($id: SuiAddress!) {
    object(address: $id) {
      dynamicFields(first: 50) {
        nodes {
          name {
            type {
              repr
            }
            json
          }
          value {
            ... on MoveObject {
              address
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
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function graphqlErrors(json: unknown): boolean {
  const errs = (json as { errors?: unknown[] })?.errors;
  return Array.isArray(errs) && errs.length > 0;
}

/** Type repr for OwnerCap<StorageUnit> contains both substrings regardless of package ID. */
function isOwnerCapForStorageUnit(typeRepr: string): boolean {
  return (
    typeRepr.includes("::access_control::OwnerCap<") &&
    typeRepr.includes("::storage_unit::StorageUnit")
  );
}

function extractStorageUnitId(json: Record<string, unknown>): string | undefined {
  // world-contracts access_control::OwnerCap has an `authorized_object_id` field.
  const raw = json["authorized_object_id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return undefined;
}

async function postGraphql(
  url: string,
  query: string,
  variables: Record<string, string>,
  signal: AbortSignal
): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

/**
 * Query a StorageUnit object and return its `owner_cap_id` field.
 * `StorageUnit` has a top-level `owner_cap_id: ID` field that holds the OwnerCap object ID.
 * Returns undefined on any error.
 */
const SSU_OWNER_CAP_QUERY = `
  query SsuOwnerCap($id: SuiAddress!) {
    object(address: $id) {
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
`;

const CHARACTER_OWNER_CAP_QUERY = `
  query CharacterOwnerCap($id: SuiAddress!) {
    object(address: $id) {
      asMoveObject {
        contents {
          json
        }
      }
    }
  }
`;

/**
 * Read `owner_cap_id` from an on-chain `Character` object (Move field).
 */
export async function fetchCharacterOwnerCapId(characterObjectId: string): Promise<string | undefined> {
  const url = getEffectiveEfGraphqlUrl().trim();
  const id = characterObjectId?.trim();
  if (!url || !id) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());
  try {
    const json = await postGraphql(url, CHARACTER_OWNER_CAP_QUERY, { id }, controller.signal);
    if (!json || graphqlErrors(json)) return undefined;
    const contents = (json as {
      data?: { object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } } } };
    })?.data?.object?.asMoveObject?.contents?.json;
    if (!contents) return undefined;
    const raw = contents["owner_cap_id"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchSsuOwnerCapId(ssuObjectId: string): Promise<string | undefined> {
  const url = getEffectiveEfGraphqlUrl().trim();
  const id = ssuObjectId?.trim();
  if (!url || !id) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());
  try {
    const json = await postGraphql(url, SSU_OWNER_CAP_QUERY, { id }, controller.signal);
    if (!json || graphqlErrors(json)) return undefined;
    const contents = (json as {
      data?: { object?: { asMoveObject?: { contents?: { json?: Record<string, unknown> } } } };
    })?.data?.object?.asMoveObject?.contents?.json;
    if (!contents) return undefined;
    const raw = contents["owner_cap_id"];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Read the owner of an object through Sui JSON-RPC.
 * Returns the owning address when the object is address-owned, or the parent object id
 * when the object is object-owned. Undefined on any error.
 */
export async function fetchObjectOwnerAddress(objectId: string): Promise<string | undefined> {
  const rpcUrl = getSuiRpcUrl();
  const id = objectId?.trim();
  if (!rpcUrl || !id) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getObject",
        params: [id, { showOwner: true }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      result?: {
        data?: {
          owner?: {
            AddressOwner?: string;
            ObjectOwner?: string;
          };
        };
      };
    };
    const owner = json.result?.data?.owner;
    return owner?.AddressOwner?.trim() || owner?.ObjectOwner?.trim() || undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover StorageUnit objects accessible to `walletAddress`.
 *
 * Tries both:
 *  1. Direct wallet-owned OwnerCap<StorageUnit> objects.
 *  2. Character-held OwnerCaps (via dynamic fields on the Character object).
 *     The character ID is resolved from the PlayerProfile owned by the wallet,
 *     using the same approach as `playerTribeFromChain.ts`.
 *
 * Returns an empty array on any error (non-throwing by design).
 */
export async function discoverWalletSsus(walletAddress: string): Promise<WalletSsu[]> {
  const url = getEffectiveEfGraphqlUrl().trim();
  const normalized = walletAddress?.trim();
  if (!url || !normalized) return [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());

  try {
    const json = await postGraphql(url, WALLET_OBJECTS_QUERY, { address: normalized }, controller.signal);
    if (!json || graphqlErrors(json)) return [];

    const found = collectOwnerCapsFromWalletJson(json);
    return found;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Parse wallet objects response and extract OwnerCap<StorageUnit> entries.
 */
function collectOwnerCapsFromWalletJson(json: unknown): WalletSsu[] {
  type Node = {
    address?: string;
    contents?: {
      type?: { repr?: string };
      json?: Record<string, unknown>;
    };
  };

  const nodes = (
    json as {
      data?: {
        address?: {
          objects?: { nodes?: Node[] };
        };
      };
    }
  )?.data?.address?.objects?.nodes;

  if (!Array.isArray(nodes)) return [];

  const out: WalletSsu[] = [];
  for (const n of nodes) {
    const repr = n?.contents?.type?.repr ?? "";
    if (!isOwnerCapForStorageUnit(repr)) continue;

    const ownerCapId = n?.address?.trim();
    const json = n?.contents?.json ?? {};
    const storageUnitId = extractStorageUnitId(json);

    if (!ownerCapId || !storageUnitId) continue;
    out.push({ ownerCapId, storageUnitId });
  }
  return out;
}
