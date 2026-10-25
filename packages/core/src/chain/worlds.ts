/**
 * Every EVE Frontier blockchain address Powerlay talks to, in one place. CCP publishes a fresh world
 * package for a new cycle; when that happens, update `worldPackage` here and move the old one to
 * `legacyWorldPackages` (objects created before the switch — older gates, characters — still live there).
 * @see https://docs.evefrontier.com/tools/resources
 */

export type FrontierServer = "stillness" | "utopia";

export interface FrontierWorld {
  server: FrontierServer;
  label: string;
  /** Current world package: characters, gates, catapults, storage units of this cycle. */
  worldPackage: string;
  /** Earlier world packages, newest first. Read-only lookups fall back to them. */
  legacyWorldPackages: string[];
  /**
   * Powerlay's own `powerlay_storage` Move package for this server. It is linked against the world package
   * it was published with, so after a world switch it needs a re-publish before storage sign flows work.
   */
  powerlayStoragePackage: string;
  /** World package `powerlayStoragePackage` was published against. */
  powerlayStorageWorldPackage: string;
}

/** Sui network the worlds live on (testnet), via its public GraphQL indexer. */
export const SUI_GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

const STILLNESS_CYCLE_6 = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";
const UTOPIA_CYCLE_6 = "0xd12a70c74c1e759445d6f209b01d43d860e97fcf2ef72ccbbd00afd828043f75";

export const FRONTIER_WORLDS: Record<FrontierServer, FrontierWorld> = {
  stillness: {
    server: "stillness",
    label: "Stillness",
    // Cycle 7: found from catapult / gate objects seen in game (assembly ids); its ObjectRegistry derives their IDs.
    worldPackage: "0x7be18d6294e533bedd9a5d70a96ce8d9d4b87a7c74188ba65d3fe966bbed9d92",
    legacyWorldPackages: [STILLNESS_CYCLE_6],
    powerlayStoragePackage: "0xb5b0006235c1f27542c6efc1d60778e719f71e254ea3000fca131f8f92f19522",
    powerlayStorageWorldPackage: STILLNESS_CYCLE_6,
  },
  utopia: {
    server: "utopia",
    label: "Utopia (sandbox)",
    // Not re-checked for Cycle 7.
    worldPackage: UTOPIA_CYCLE_6,
    legacyWorldPackages: [],
    powerlayStoragePackage: "0x95a12684424d9b10d6ad602be7112159aa1b4e165bd3853653f025049f2a4c76",
    powerlayStorageWorldPackage: UTOPIA_CYCLE_6,
  },
};

export const DEFAULT_FRONTIER_SERVER: FrontierServer = "stillness";

/** Current and legacy world packages of a server, newest first. */
export function worldPackagesOf(server: FrontierServer): string[] {
  const w = FRONTIER_WORLDS[server];
  return [w.worldPackage, ...w.legacyWorldPackages];
}

/** Which server a world package belongs to, and whether it is the current one. */
export function worldOfPackage(packageId: string | null | undefined): { world: FrontierWorld; current: boolean } | null {
  const id = packageId?.trim().toLowerCase();
  if (!id) return null;
  for (const world of Object.values(FRONTIER_WORLDS)) {
    if (world.worldPackage.toLowerCase() === id) return { world, current: true };
    if (world.legacyWorldPackages.some((p) => p.toLowerCase() === id)) return { world, current: false };
  }
  return null;
}

/** World of a Move type like `0x…::character::PlayerProfile`. */
export function worldOfTypeRepr(repr: string): { world: FrontierWorld; current: boolean } | null {
  return worldOfPackage(repr.split("::")[0]);
}

/**
 * A saved world package setting brought up to date: a legacy package becomes its server's current one,
 * an unknown (custom) one is kept, an empty one gets the default server's.
 */
export function currentWorldPackage(saved: string | null | undefined): string {
  return worldOfPackage(saved)?.world.worldPackage ?? (saved?.trim() || FRONTIER_WORLDS[DEFAULT_FRONTIER_SERVER].worldPackage);
}
