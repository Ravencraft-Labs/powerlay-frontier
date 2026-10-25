import { DEFAULT_FRONTIER_SERVER, FRONTIER_WORLDS, worldOfPackage } from "@powerlay/core";
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
export const POWERLAY_STORAGE_PACKAGE_ID_UTOPIA = FRONTIER_WORLDS.utopia.powerlayStoragePackage;

export const POWERLAY_STORAGE_PACKAGE_ID_STILLNESS = FRONTIER_WORLDS.stillness.powerlayStoragePackage;

export function getPowerlayStoragePackageId(): string {
  const server = worldOfPackage(loadSettings().worldContractsPackageId)?.world.server ?? DEFAULT_FRONTIER_SERVER;
  return FRONTIER_WORLDS[server].powerlayStoragePackage;
}
