/**
 * Owner of a deployable gate (player gate or catapult) by its in-game item ID, read from the EVE Frontier
 * world package on Sui. World objects are `derived_object`s of the package's ObjectRegistry keyed by
 * TenantItemId { item_id, tenant }, so the object ID is computed from the item ID — one request per gate.
 * Chain: gate::Gate / assembly::Assembly → owner_cap_id → the OwnerCap's owner, a character::Character.
 */
import { bcs } from "@mysten/sui/bcs";
import { deriveObjectID } from "@mysten/sui/utils";
import type { GateOwner } from "@powerlay/core";
import { FRONTIER_WORLD_PACKAGE_STILLNESS, getEffectiveEfGraphqlUrl, getPlayerTribeFetchTimeoutMs } from "./playerTribeFromChain.js";

/** Cycle 7 world package (catapults, current gates), then the Cycle 6 one. */
const WORLD_PACKAGES = ["0x7be18d6294e533bedd9a5d70a96ce8d9d4b87a7c74188ba65d3fe966bbed9d92", FRONTIER_WORLD_PACKAGE_STILLNESS];
const TENANT = "stillness";
/** Tribe IDs below this are NPC corporations (characters without a player tribe). */
const FIRST_PLAYER_TRIBE_ID = 98_000_000;

const TenantItemId = bcs.struct("TenantItemId", { item_id: bcs.u64(), tenant: bcs.string() });

const ownerCache = new Map<string, GateOwner>();
const registryByPackage = new Map<string, string | null>();

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

const REGISTRY_QUERY = `
  query Registry($type: String!) {
    objects(first: 1, filter: { type: $type }) { nodes { address } }
  }
`;

async function registryOf(pkg: string): Promise<string | null> {
  if (registryByPackage.has(pkg)) return registryByPackage.get(pkg)!;
  const data = await gql<{ objects: { nodes: Array<{ address: string }> } }>(REGISTRY_QUERY, { type: `${pkg}::object_registry::ObjectRegistry` });
  const id = data.objects.nodes[0]?.address ?? null;
  registryByPackage.set(pkg, id);
  return id;
}

const OBJECT_QUERY = `
  query Obj($id: SuiAddress!) {
    object(address: $id) {
      owner { ... on AddressOwner { address { address } } }
      asMoveObject { contents { type { repr } json } }
    }
  }
`;

interface ChainObject {
  owner?: { address?: { address?: string } };
  asMoveObject?: { contents?: { type?: { repr?: string }; json?: Record<string, unknown> } };
}

async function getObject(id: string): Promise<ChainObject | null> {
  return (await gql<{ object: ChainObject | null }>(OBJECT_QUERY, { id })).object;
}

/** World object for an in-game item ID: tries each world package's registry. */
async function findWorldObject(itemId: string): Promise<ChainObject | null> {
  const key = TenantItemId.serialize({ item_id: BigInt(itemId), tenant: TENANT }).toBytes();
  for (const pkg of WORLD_PACKAGES) {
    const registry = await registryOf(pkg);
    if (!registry) continue;
    const obj = await getObject(deriveObjectID(registry, `${pkg}::in_game_id::TenantItemId`, key));
    if (obj?.asMoveObject) return obj;
  }
  return null;
}

/** OwnerCap → its owner (a Character object) → name and player tribe. */
async function ownerCharacter(capId: string): Promise<{ name: string | null; tribeId: number | null }> {
  const charId = (await getObject(capId))?.owner?.address?.address;
  const json = charId ? (await getObject(charId))?.asMoveObject?.contents?.json : undefined;
  const tribe = Number(json?.tribe_id);
  const meta = json?.metadata as { name?: string } | undefined;
  return { name: meta?.name?.trim() || null, tribeId: Number.isFinite(tribe) && tribe >= FIRST_PLAYER_TRIBE_ID ? tribe : null };
}

/** Owner from a world object (gate or assembly) already in hand. */
export async function ownerOfWorldObject(obj: ChainObject): Promise<GateOwner> {
  const json = obj.asMoveObject?.contents?.json ?? {};
  const capId = typeof json.owner_cap_id === "string" ? json.owner_cap_id : null;
  const character = capId ? await ownerCharacter(capId) : { name: null, tribeId: null };
  const typeId = Number(json.type_id);
  const status = json.status as { status?: { "@variant"?: string } } | undefined;
  return {
    kind: "player",
    characterName: character.name,
    tribeId: character.tribeId,
    typeId: Number.isFinite(typeId) ? typeId : null,
    online: status?.status?.["@variant"] === "ONLINE",
  };
}

/** Never throws: network trouble comes back as `{ kind: "unknown" }` and isn't cached. */
export async function lookupGateOwner(gateItemId: number): Promise<GateOwner> {
  const key = String(gateItemId);
  const cached = ownerCache.get(key);
  if (cached) return cached;
  try {
    const obj = await findWorldObject(key);
    const owner: GateOwner = obj ? await ownerOfWorldObject(obj) : { kind: "offchain" };
    ownerCache.set(key, owner);
    return owner;
  } catch (err) {
    return { kind: "unknown", error: err instanceof Error ? err.message : String(err) };
  }
}

/** A gate or catapult picked by its Sui object ID (as copied from its in-game info), with its item ID. */
export async function lookupGateByObjectId(objectId: string): Promise<{ itemId: number; owner: GateOwner } | null> {
  const obj = await getObject(objectId);
  const repr = obj?.asMoveObject?.contents?.type?.repr ?? "";
  if (!obj || !/::(gate::Gate|assembly::Assembly)$/.test(repr)) return null;
  const itemId = Number((obj.asMoveObject?.contents?.json?.key as { item_id?: string } | undefined)?.item_id);
  if (!Number.isFinite(itemId)) return null;
  const owner = await ownerOfWorldObject(obj);
  ownerCache.set(String(itemId), owner);
  return { itemId, owner };
}
