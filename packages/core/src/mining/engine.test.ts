import { describe, it, expect } from "vitest";
import {
  calculateBuildCost,
  estimateMiningTime,
  optimizeResourceAllocation,
} from "./engine";
import type { BuildBlueprint, AllocationConstraint } from "./types";

describe("calculateBuildCost", () => {
  it("returns copy of blueprint requirements", () => {
    const bp: BuildBlueprint = {
      id: "x",
      name: "X",
      requirements: [
        { resourceId: "ore_a", quantity: 100 },
        { resourceId: "alloy", quantity: 20 },
      ],
      buildTimePerUnit: 60,
    };
    const cost = calculateBuildCost(bp);
    expect(cost).toHaveLength(2);
    expect(cost[0]).toEqual({ resourceId: "ore_a", quantity: 100 });
    expect(cost[1]).toEqual({ resourceId: "alloy", quantity: 20 });
  });
});

describe("estimateMiningTime", () => {
  it("returns baseTime + quantity * rate", () => {
    expect(estimateMiningTime("ore_a", 0)).toBe(10);
    expect(estimateMiningTime("ore_a", 10)).toBe(10 + 20);
    expect(estimateMiningTime("gas", 5)).toBe(10 + 10);
  });
});

describe("optimizeResourceAllocation", () => {
  it("allocates greedily and returns used resources and total time", () => {
    const blueprints: BuildBlueprint[] = [
      {
        id: "bp1",
        name: "A",
        requirements: [{ resourceId: "ore_a", quantity: 100 }],
        buildTimePerUnit: 60,
      },
      {
        id: "bp2",
        name: "B",
        requirements: [{ resourceId: "ore_a", quantity: 50 }],
        buildTimePerUnit: 30,
      },
    ];
    const constraints: AllocationConstraint[] = [
      { resourceId: "ore_a", availableQuantity: 250 },
    ];
    const result = optimizeResourceAllocation(blueprints, constraints);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations.find((a) => a.blueprintId === "bp1")?.units).toBe(2);
    expect(result.allocations.find((a) => a.blueprintId === "bp2")?.units).toBe(1);
    expect(result.totalBuildTimeSeconds).toBe(2 * 60 + 1 * 30);
    const totalOreA = result.usedResources.filter((r) => r.resourceId === "ore_a").reduce((s, r) => s + r.quantity, 0);
    expect(totalOreA).toBe(250);
  });

  it("returns empty allocations when no resources", () => {
    const blueprints: BuildBlueprint[] = [
      {
        id: "bp1",
        name: "A",
        requirements: [{ resourceId: "ore_a", quantity: 100 }],
        buildTimePerUnit: 60,
      },
    ];
    const constraints: AllocationConstraint[] = [
      { resourceId: "ore_a", availableQuantity: 0 },
    ];
    const result = optimizeResourceAllocation(blueprints, constraints);
    expect(result.allocations).toHaveLength(0);
    expect(result.usedResources).toHaveLength(0);
    expect(result.totalBuildTimeSeconds).toBe(0);
  });
});
