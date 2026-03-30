/**
 * Resolve the `StorageConfig` object ID created in a successful `connect_storage` PTB
 * via Sui JSON-RPC (`sui_getTransactionBlock`), or by scanning the Sui GraphQL indexer
 * for `StorageConfig` objects matching an SSU (`storage_unit_id`).
 */
import { getEffectiveEfGraphqlUrl, getPlayerTribeFetchTimeoutMs } from "./playerTribeFromChain.js";
import { POWERLAY_STORAGE_PACKAGE_ID } from "../storage/storageConfig.js";
import { appLog } from "../log/appLogger.js";

const DEFAULT_SUI_RPC = "https://rpc.testnet.sui.io";

function getSuiRpcUrl(): string {
  const u = process.env.POWERLAY_SUI_RPC_URL?.trim();
  return u || DEFAULT_SUI_RPC;
}

interface RpcObjectChange {
  type?: string;
  objectType?: string;
  objectId?: string;
}

function normalizePkg(addr: string): string {
  return addr.trim().toLowerCase().replace(/^0x/, "");
}

/** Canonical 64-char hex (no 0x) for comparing Sui addresses / object ids. */
function canonHexId(id: string): string {
  const s = id.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]+$/.test(s)) return "";
  return s.padStart(64, "0");
}

function storageUnitIdFromConfigJson(json: Record<string, unknown> | null | undefined): string | null {
  if (!json) return null;
  const raw = json["storage_unit_id"];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

const STORAGE_CONFIG_OBJECTS_QUERY = `
  query StorageConfigsByType($type: String!, $after: String) {
    objects(filter: { type: $type }, first: 50, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        address
        asMoveObject {
          contents {
            json
          }
        }
      }
    }
  }
`;

async function postGraphql(url: string, query: string, variables: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!res.ok) return null;
  return (await res.json()) as unknown;
}

function graphqlErrors(json: unknown): boolean {
  const e = (json as { errors?: unknown[] })?.errors;
  return Array.isArray(e) && e.length > 0;
}

/** Original v1 publish id — configs may still report this defining type after linkage. */
const LEGACY_POWERLAY_STORAGE_PACKAGE_ID =
  "0x71209391e483f34d27b72e07b4559909ea37d970e7f9e0d4fb712ae1fffa17b3";

function powerlayStorageConfigStructTypes(): string[] {
  const cur = POWERLAY_STORAGE_PACKAGE_ID.trim();
  const legacy = LEGACY_POWERLAY_STORAGE_PACKAGE_ID.trim();
  const set = new Set<string>();
  set.add(`${cur}::powerlay_storage::StorageConfig`);
  if (legacy.toLowerCase() !== cur.toLowerCase()) {
    set.add(`${legacy}::powerlay_storage::StorageConfig`);
  }
  return [...set];
}

/**
 * Find a shared `StorageConfig` whose `storage_unit_id` matches `ssuObjectId`.
 * Used when the deliverer is not the SSU registrant in Powerlay (`listConnected` has no tx digest).
 *
 * Uses Sui GraphQL (`POWERLAY_EF_GRAPHQL_URL` / default testnet indexer) — public JSON-RPC does not
 * expose `suix_queryObjects` on `rpc.testnet.sui.io`.
 *
 * @param verbose Log each GraphQL page (set `POWERLAY_DEBUG_DELIVERY=1` from IPC).
 */
export async function resolveStorageConfigObjectIdForSsu(
  ssuObjectId: string,
  verbose = false
): Promise<string | null> {
  const want = canonHexId(ssuObjectId);
  if (!want) return null;

  const url = getEffectiveEfGraphqlUrl().trim();
  if (!url) return null;

  const structTypes = powerlayStorageConfigStructTypes();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());

  try {
    for (const structType of structTypes) {
      let after: string | null = null;
      const maxPages = 40;

      for (let page = 0; page < maxPages; page++) {
        if (verbose) {
          appLog.info("[delivery:resolve] graphql StorageConfig page", {
            structType,
            page,
            ssuObjectId,
            wantCanon: want,
          });
        }
        const raw = await postGraphql(
          url,
          STORAGE_CONFIG_OBJECTS_QUERY,
          { type: structType, after },
          controller.signal
        );
        if (!raw || graphqlErrors(raw)) {
          if (verbose) {
            appLog.warn("[delivery:resolve] graphql error or empty", {
              structType,
              page,
              hasErrors: graphqlErrors(raw),
            });
          }
          break;
        }

        const data = (raw as {
          data?: {
            objects?: {
              pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
              nodes?: Array<{
                address?: string;
                asMoveObject?: { contents?: { json?: Record<string, unknown> } };
              }>;
            };
          };
        })?.data?.objects;

        const nodes = data?.nodes ?? [];
        if (verbose) {
          appLog.info("[delivery:resolve] graphql page nodes", {
            structType,
            page,
            nodeCount: nodes.length,
            sampleStorageUnitIds: nodes
              .map((n) => storageUnitIdFromConfigJson(n.asMoveObject?.contents?.json as Record<string, unknown>))
              .filter(Boolean)
              .slice(0, 8),
          });
        }
        for (const node of nodes) {
          const addr = node.address?.trim();
          const json = node.asMoveObject?.contents?.json;
          if (!addr || !json || typeof json !== "object") continue;
          if (json["active"] === false) continue;
          const su = storageUnitIdFromConfigJson(json);
          if (!su) continue;
          if (canonHexId(su) !== want) continue;
          appLog.info("[delivery:resolve] StorageConfig matched via GraphQL", {
            storageConfigObjectId: addr,
            storageUnitIdFromConfig: su,
            ssuQuery: ssuObjectId,
            structType,
          });
          return addr;
        }

        const pi = data?.pageInfo;
        if (!pi?.hasNextPage || !pi.endCursor) break;
        after = pi.endCursor;
      }
    }

    appLog.warn("[delivery:resolve] no StorageConfig for SSU after GraphQL scan", {
      ssuObjectId,
      wantCanon: want,
      graphqlUrlHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return "invalid-url";
        }
      })(),
    });
    return null;
  } catch (e) {
    appLog.warn("[delivery:resolve] GraphQL scan threw", {
      ssuObjectId,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Returns a created `StorageConfig` object id from the transaction. Prefers the instance
 * whose defining package matches {@link POWERLAY_STORAGE_PACKAGE_ID}.
 */
export async function resolveStorageConfigObjectIdFromConnectTx(txDigest: string): Promise<string | null> {
  const digest = txDigest?.trim();
  if (!digest) return null;

  const rpc = getSuiRpcUrl();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "sui_getTransactionBlock",
        params: [
          digest,
          {
            showObjectChanges: true,
            showEffects: true,
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      result?: { objectChanges?: RpcObjectChange[] };
      error?: { message?: string };
    };
    if (json.error?.message) {
      appLog.warn("[delivery:resolve] sui_getTransactionBlock error", { digest, err: json.error.message });
      return null;
    }
    const changes = json.result?.objectChanges ?? [];
    const wantPkg = normalizePkg(POWERLAY_STORAGE_PACKAGE_ID);
    let fallback: string | null = null;
    for (const ch of changes) {
      if (ch.type !== "created") continue;
      const ot = ch.objectType ?? "";
      if (!ot.includes("::powerlay_storage::StorageConfig")) continue;
      const id = ch.objectId?.trim();
      if (!id) continue;
      const pkgMatch = ot.match(/^0x([0-9a-fA-F]+)::/);
      if (pkgMatch && normalizePkg(`0x${pkgMatch[1]}`) === wantPkg) {
        appLog.info("[delivery:resolve] StorageConfig from connect tx (package match)", { digest, storageConfigObjectId: id });
        return id;
      }
      if (!fallback) fallback = id;
    }
    if (fallback) {
      appLog.info("[delivery:resolve] StorageConfig from connect tx (fallback type)", { digest, storageConfigObjectId: fallback });
    } else {
      appLog.warn("[delivery:resolve] no StorageConfig in connect tx objectChanges", {
        digest,
        changeCount: changes.length,
      });
    }
    return fallback;
  } catch (e) {
    appLog.warn("[delivery:resolve] connect tx RPC threw", {
      digest,
      err: e instanceof Error ? e.message : String(e),
    });
    return null;
  } finally {
    clearTimeout(t);
  }
}
