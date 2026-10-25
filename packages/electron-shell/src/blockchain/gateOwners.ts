/**
 * Owner of a deployable gate by its in-game item ID, read from the EVE Frontier world package on Sui:
 * gate::Gate (key.item_id) → owner_cap_id → the OwnerCap's owner, a character::Character (name, tribe).
 * Catapults and server-placed gates aren't gate::Gate objects, so they come back "offchain".
 */
import type { GateOwner } from "@powerlay/core";
import { FRONTIER_WORLD_PACKAGE_STILLNESS, getEffectiveEfGraphqlUrl, getPlayerTribeFetchTimeoutMs } from "./playerTribeFromChain.js";

interface ChainGate {
  key?: { item_id?: string };
  owner_cap_id?: string;
  type_id?: string;
  status?: { status?: { "@variant"?: string } };
}

/** Gate list refresh: new gates get anchored during a session. */
const GATES_TTL_MS = 5 * 60_000;
const MAX_PAGES = 40;

let gatesCache: { at: number; byItemId: Map<string, ChainGate> } | null = null;
const ownerCache = new Map<string, GateOwner>();

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), getPlayerTribeFetchTimeoutMs());
  try {
    const res = await fetch(getEffectiveEfGraphqlUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`);
    const json = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
    if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
    return json.data as T;
  } finally {
    clearTimeout(timer);
  }
}

const GATES_QUERY = `
  query Gates($type: String!, $after: String) {
    objects(first: 50, after: $after, filter: { type: $type }) {
      pageInfo { hasNextPage endCursor }
      nodes { asMoveObject { contents { json } } }
    }
  }
`;

async function loadGates(): Promise<Map<string, ChainGate>> {
  if (gatesCache && Date.now() - gatesCache.at < GATES_TTL_MS) return gatesCache.byItemId;
  type Page = {
    objects: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: Array<{ asMoveObject?: { contents?: { json?: ChainGate } } }> };
  };
  const byItemId = new Map<string, ChainGate>();
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data: Page = await gql<Page>(GATES_QUERY, { type: `${FRONTIER_WORLD_PACKAGE_STILLNESS}::gate::Gate`, after });
    for (const n of data.objects.nodes) {
      const g = n.asMoveObject?.contents?.json;
      if (g?.key?.item_id) byItemId.set(g.key.item_id, g);
    }
    if (!data.objects.pageInfo.hasNextPage) break;
    after = data.objects.pageInfo.endCursor;
  }
  gatesCache = { at: Date.now(), byItemId };
  return byItemId;
}

const CAP_OWNER_QUERY = `
  query CapOwner($id: SuiAddress!) {
    object(address: $id) {
      owner { ... on AddressOwner { address { address } } }
    }
  }
`;

const CHARACTER_QUERY = `
  query Character($id: SuiAddress!) {
    object(address: $id) { asMoveObject { contents { json } } }
  }
`;

async function ownerCharacter(capId: string): Promise<{ name: string | null; tribeId: number | null }> {
  const cap = await gql<{ object?: { owner?: { address?: { address?: string } } } }>(CAP_OWNER_QUERY, { id: capId });
  const charId = cap.object?.owner?.address?.address;
  if (!charId) return { name: null, tribeId: null };
  const ch = await gql<{ object?: { asMoveObject?: { contents?: { json?: { tribe_id?: number | string; metadata?: { name?: string } } } } } }>(
    CHARACTER_QUERY,
    { id: charId },
  );
  const json = ch.object?.asMoveObject?.contents?.json;
  const tribe = Number(json?.tribe_id);
  return { name: json?.metadata?.name?.trim() || null, tribeId: Number.isFinite(tribe) && tribe > 0 ? tribe : null };
}

/** Never throws: network trouble comes back as `{ kind: "unknown" }` and isn't cached. */
export async function lookupGateOwner(gateItemId: number): Promise<GateOwner> {
  const key = String(gateItemId);
  const cached = ownerCache.get(key);
  if (cached) return cached;
  try {
    const gate = (await loadGates()).get(key);
    let owner: GateOwner;
    if (!gate) {
      owner = { kind: "offchain" };
    } else {
      const character = gate.owner_cap_id ? await ownerCharacter(gate.owner_cap_id) : { name: null, tribeId: null };
      const typeId = Number(gate.type_id);
      owner = {
        kind: "player",
        characterName: character.name,
        tribeId: character.tribeId,
        typeId: Number.isFinite(typeId) ? typeId : null,
        online: gate.status?.status?.["@variant"] === "ONLINE",
      };
    }
    // "offchain" isn't cached: the gate list refreshes and may pick up a gate anchored meanwhile.
    if (owner.kind === "player") ownerCache.set(key, owner);
    return owner;
  } catch (err) {
    return { kind: "unknown", error: err instanceof Error ? err.message : String(err) };
  }
}
