import type { ItemOreTable } from "./types.js";
import type { ResourceId } from "../mining/types.js";

export const FACILITY_TYPES = ["Printer S", "Printer M"] as const;

export const PRODUCIBLE_ITEMS = ["D2 Fuel", "Carbon Weave"] as const;

export const LASER_TYPES = ["Small Cutting Laser", "Medium Cutting Laser"] as const;

/** Fictional ore per unit for each item. */
export const ITEM_ORE_TABLE: ItemOreTable = {
  "D2 Fuel": { ore_a: 10, ore_b: 5, gas: 2 },
  "Carbon Weave": { ore_a: 8, ore_b: 12, alloy: 3 },
};

export function getItemOreTable(): ItemOreTable {
  return { ...ITEM_ORE_TABLE };
}
