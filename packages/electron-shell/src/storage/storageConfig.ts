import {
  FRONTIER_WORLD_PACKAGE_STILLNESS,
  FRONTIER_WORLD_PACKAGE_UTOPIA,
} from "../blockchain/playerTribeFromChain.js";
import { loadSettings } from "../ipc/settingsStore.js";

/**
 * Powerlay Move package ids by target Frontier world.
 *
 * Utopia original publish tx: 2RePpe2WvYR6J7Xe7j48WGbRvnU7dSWW1HJocEAB8N63
 * Utopia upgrade v2 tx: 9HWitbw1XpfwHezEj7BL2xxuJtmJTYSYrVeS9wVzUtSP
 * Utopia upgrade cap: 0xe8a097337e52b8ad897d09803dd4954ee4c910639059eeb71e28a17fa6db9034
 *
 * Stillness publish tx: DeWg8TVmHLVM725bCxwa5VGmxFfi3SdvchjvBweqYF1
 * Stillness upgrade cap: 0xb5c0b6f419cde569823a0fa1c5dbc1c6ec4d60cb03d2d1c3752af812c7df6e36
 */
export const POWERLAY_STORAGE_PACKAGE_ID_UTOPIA =
  "0x95a12684424d9b10d6ad602be7112159aa1b4e165bd3853653f025049f2a4c76";

export const POWERLAY_STORAGE_PACKAGE_ID_STILLNESS =
  "0xb5b0006235c1f27542c6efc1d60778e719f71e254ea3000fca131f8f92f19522";

export function getPowerlayStoragePackageId(): string {
  const worldPkg = loadSettings().worldContractsPackageId?.trim().toLowerCase() ?? "";
  if (worldPkg === FRONTIER_WORLD_PACKAGE_STILLNESS.toLowerCase()) {
    return POWERLAY_STORAGE_PACKAGE_ID_STILLNESS;
  }
  if (worldPkg === FRONTIER_WORLD_PACKAGE_UTOPIA.toLowerCase()) {
    return POWERLAY_STORAGE_PACKAGE_ID_UTOPIA;
  }
  return POWERLAY_STORAGE_PACKAGE_ID_STILLNESS;
}
