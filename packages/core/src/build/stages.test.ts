import { describe, it, expect } from "vitest";
import { activeTrackingStage, buildProductionStages, isStageComplete, oreMiningProgress } from "./stages";
import type { ProductionTreeNode } from "./gameData";
import type { TypesMap } from "./types";

const node = (typeID: number, quantity: number, children: ProductionTreeNode[] = []): ProductionTreeNode => ({
  typeID,
  name: String(typeID),
  quantity,
  children,
});

const types: TypesMap = Object.fromEntries(
  [
    [1, "Ore A", 2],
    [2, "Ore B", 1],
    [10, "Refined", 1],
    [20, "Can", 5],
    [30, "Ship", 100],
  ].map(([typeID, name, volume]) => [
    String(typeID),
    { typeID: typeID as number, name: name as string, groupID: 0, mass: 1, volume: volume as number, basePrice: 0, portionSize: 1 },
  ])
);

describe("buildProductionStages", () => {
  // Ship <- (Can <- Refined <- Ore A) + (Refined <- Ore B): Refined appears twice at level 1.
  const trees = [
    node(30, 1, [
      node(20, 4, [node(10, 8, [node(1, 16)])]),
      node(10, 3, [node(2, 6)]),
    ]),
  ];

  it("groups by height above base materials and sums quantities", () => {
    const stages = buildProductionStages(trees, types);
    expect(stages.map((s) => s.level)).toEqual([1, 2, 3]);
    expect(stages[0].items).toEqual([{ typeID: 10, name: "Refined", quantity: 11 }]);
    expect(stages[1].items).toEqual([{ typeID: 20, name: "Can", quantity: 4 }]);
    expect(stages[2].items).toEqual([{ typeID: 30, name: "Ship", quantity: 1 }]);
  });

  it("returns no stages for a tree without recipes", () => {
    expect(buildProductionStages([node(1, 5)], types)).toEqual([]);
  });

  it("checks stage completion", () => {
    const [refined] = buildProductionStages(trees, types);
    expect(isStageComplete(refined, { 10: 10 })).toBe(false);
    expect(isStageComplete(refined, { 10: 11 })).toBe(true);
  });
});

describe("oreMiningProgress", () => {
  it("caps each ore at needed and prefers the larger of log/manual", () => {
    const ores = [{ typeID: 1, quantity: 10 }, { typeID: 2, quantity: 5 }];
    expect(oreMiningProgress(ores, types, { 1: 30 }, { 2: 2 }, {})).toEqual({ mined: 22, needed: 25 });
    expect(oreMiningProgress(ores, types, {}, {}, { 1: 4 })).toEqual({ mined: 0, needed: 9 });
  });
});

describe("activeTrackingStage", () => {
  it("shows the first incomplete step unless one is pinned", () => {
    expect(activeTrackingStage([true, false, false], null)).toBe(1);
    expect(activeTrackingStage([true, true, true], null)).toBe(2);
    expect(activeTrackingStage([false, false], 1)).toBe(1);
    expect(activeTrackingStage([true, false], 0)).toBe(0);
    expect(activeTrackingStage([true, false], 5)).toBe(1);
    expect(activeTrackingStage([], null)).toBe(0);
  });
});
