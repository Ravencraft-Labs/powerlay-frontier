import { describe, it, expect } from "vitest";
import {
  totalOreFromPlannedItems,
  oreMass,
  oreVolume,
  laserLensesNeeded,
  fuelNeededForOre,
  timeToMineOre,
  timeToRefineOre,
} from "./calculations";
import type { PlannedItem, Laser } from "./types";

describe("totalOreFromPlannedItems", () => {
  it("sums ore by type from planned items", () => {
    const items: PlannedItem[] = [
      { itemId: "D2 Fuel", quantity: 10 },
      { itemId: "Carbon Weave", quantity: 2 },
    ];
    const total = totalOreFromPlannedItems(items);
    expect(total.ore_a).toBe(10 * 10 + 8 * 2);
    expect(total.ore_b).toBe(5 * 10 + 12 * 2);
    expect(total.gas).toBe(2 * 10);
    expect(total.alloy).toBe(3 * 2);
  });

  it("returns zeros for empty list", () => {
    const total = totalOreFromPlannedItems([]);
    expect(total.ore_a).toBe(0);
    expect(total.ore_b).toBe(0);
    expect(total.gas).toBe(0);
    expect(total.alloy).toBe(0);
  });
});

describe("oreMass and oreVolume", () => {
  it("compute linear in total ore amount", () => {
    const total = { ore_a: 100, ore_b: 50, gas: 0, alloy: 0 };
    expect(oreMass(total)).toBe(150 * 2.5);
    expect(oreVolume(total)).toBe(150 * 0.8);
  });
});

describe("laserLensesNeeded", () => {
  it("returns 0 for no ore or no lasers", () => {
    expect(laserLensesNeeded({ ore_a: 0, ore_b: 0, gas: 0, alloy: 0 }, [])).toBe(0);
    expect(laserLensesNeeded({ ore_a: 100, ore_b: 0, gas: 0, alloy: 0 }, [])).toBe(0);
  });

  it("returns positive number for ore and lasers", () => {
    const total = { ore_a: 100, ore_b: 0, gas: 0, alloy: 0 };
    const lasers: Laser[] = [{ type: "Small Cutting Laser", amount: 2 }];
    expect(laserLensesNeeded(total, lasers)).toBeGreaterThan(0);
  });
});

describe("fuelNeededForOre", () => {
  it("returns ceil of ore amount * 0.05", () => {
    expect(fuelNeededForOre({ ore_a: 100, ore_b: 0, gas: 0, alloy: 0 })).toBe(5);
  });
});

describe("timeToMineOre", () => {
  it("returns 0 for no ore or no lasers", () => {
    expect(timeToMineOre({ ore_a: 0, ore_b: 0, gas: 0, alloy: 0 }, [])).toBe(0);
  });

  it("returns positive seconds for ore and lasers", () => {
    const total = { ore_a: 100, ore_b: 0, gas: 0, alloy: 0 };
    const lasers: Laser[] = [{ type: "Medium Cutting Laser", amount: 1 }];
    expect(timeToMineOre(total, lasers)).toBeGreaterThan(0);
  });
});

describe("timeToRefineOre", () => {
  it("returns ceil of amount * 0.5", () => {
    expect(timeToRefineOre({ ore_a: 100, ore_b: 0, gas: 0, alloy: 0 })).toBe(50);
  });
});
