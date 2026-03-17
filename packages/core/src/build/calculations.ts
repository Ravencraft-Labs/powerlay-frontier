import type { ResourceId } from "../mining/types.js";
import type { PlannedItem, Laser, ItemOreTable } from "./types.js";
import { ITEM_ORE_TABLE } from "./catalogs.js";

const RESOURCE_IDS: ResourceId[] = ["ore_a", "ore_b", "gas", "alloy"];

export function totalOreFromPlannedItems(
  plannedItems: PlannedItem[],
  itemOreTable: ItemOreTable = ITEM_ORE_TABLE
): Record<ResourceId, number> {
  const total: Record<ResourceId, number> = {
    ore_a: 0,
    ore_b: 0,
    gas: 0,
    alloy: 0,
  };
  for (const item of plannedItems) {
    const itemId = item.itemId;
    if (typeof itemId !== "string") continue; // typeID-only items use materials path
    const ore = itemOreTable[itemId];
    if (!ore || item.quantity <= 0) continue;
    for (const rid of RESOURCE_IDS) {
      const q = ore[rid];
      if (q != null) total[rid] += q * item.quantity;
    }
  }
  return total;
}

function totalOreAmount(totalOre: Record<ResourceId, number>): number {
  return RESOURCE_IDS.reduce((sum, rid) => sum + (totalOre[rid] ?? 0), 0);
}

/** Mock: mass in kg, linear in total ore amount. */
export function oreMass(totalOre: Record<ResourceId, number>): number {
  const amount = totalOreAmount(totalOre);
  return amount * 2.5;
}

/** Mock: volume in m³, linear in total ore amount. */
export function oreVolume(totalOre: Record<ResourceId, number>): number {
  const amount = totalOreAmount(totalOre);
  return amount * 0.8;
}

/** Mock: lenses needed based on ore amount and laser count. */
export function laserLensesNeeded(
  totalOre: Record<ResourceId, number>,
  lasers: Laser[]
): number {
  const amount = totalOreAmount(totalOre);
  if (amount <= 0) return 0;
  const laserCount = lasers.reduce((sum, l) => sum + l.amount, 0);
  if (laserCount <= 0) return 0;
  const lensesPerLaser = 2;
  const orePerLens = 50;
  const lensesForOre = Math.ceil(amount / orePerLens);
  return Math.max(lensesForOre, laserCount * lensesPerLaser);
}

/** Mock: fuel units needed for ore amount. */
export function fuelNeededForOre(totalOre: Record<ResourceId, number>): number {
  const amount = totalOreAmount(totalOre);
  return Math.ceil(amount * 0.05);
}

/** Mock: seconds to mine ore with given lasers. */
export function timeToMineOre(
  totalOre: Record<ResourceId, number>,
  lasers: Laser[]
): number {
  const amount = totalOreAmount(totalOre);
  if (amount <= 0) return 0;
  const laserPower = lasers.reduce((sum, l) => {
    const power = l.type === "Small Cutting Laser" ? 10 : 25;
    return sum + power * l.amount;
  }, 0);
  if (laserPower <= 0) return 0;
  return Math.ceil((amount * 3) / laserPower);
}

/** Mock: seconds to refine ore amount. */
export function timeToRefineOre(totalOre: Record<ResourceId, number>): number {
  const amount = totalOreAmount(totalOre);
  return Math.ceil(amount * 0.5);
}

/** Mock: lenses needed when using a single amount (e.g. total mass from materials). */
export function laserLensesNeededFromAmount(amount: number, lasers: Laser[]): number {
  if (amount <= 0) return 0;
  const laserCount = lasers.reduce((sum, l) => sum + l.amount, 0);
  if (laserCount <= 0) return 0;
  const lensesPerLaser = 2;
  const orePerLens = 50;
  const lensesForOre = Math.ceil(amount / orePerLens);
  return Math.max(lensesForOre, laserCount * lensesPerLaser);
}

/** Mock: fuel needed when using a single amount. */
export function fuelNeededFromAmount(amount: number): number {
  return Math.ceil(amount * 0.05);
}

/** Mock: seconds to mine when using a single amount. */
export function timeToMineFromAmount(amount: number, lasers: Laser[]): number {
  if (amount <= 0) return 0;
  const laserPower = lasers.reduce((sum, l) => {
    const power = l.type === "Small Cutting Laser" ? 10 : 25;
    return sum + power * l.amount;
  }, 0);
  if (laserPower <= 0) return 0;
  return Math.ceil((amount * 3) / laserPower);
}

/** Mock: seconds to refine when using a single amount. */
export function timeToRefineFromAmount(amount: number): number {
  return Math.ceil(amount * 0.5);
}
