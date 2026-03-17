import { describe, it, expect } from "vitest";
import {
  buildProductionTree,
  getBlueprintOptionsForProduct,
  getOptimizedBlueprintForProduct,
  getMaterialsPerUnitProduct,
  BASE_ORE_TYPE_IDS,
} from "./gameData";
import type { TypesMap, BlueprintsMap } from "./types";

function makeTypes(entries: Array<{ typeID: number; name: string }>): TypesMap {
  const map: TypesMap = {};
  for (const { typeID, name } of entries) {
    map[String(typeID)] = {
      typeID,
      name,
      groupID: 0,
      mass: 1,
      volume: 1,
      basePrice: 0,
      portionSize: 1,
    };
  }
  return map;
}

function makeBlueprints(
  entries: Array<{
    blueprintTypeID: number;
    productTypeID: number;
    productQty: number;
    materials: Array<{ typeID: number; quantity: number }>;
  }>
): BlueprintsMap {
  const map: BlueprintsMap = {};
  for (const entry of entries) {
    map[String(entry.blueprintTypeID)] = {
      blueprintTypeID: entry.blueprintTypeID,
      activities: {
        manufacturing: {
          materials: entry.materials,
          products: [{ typeID: entry.productTypeID, quantity: entry.productQty }],
          time: 1000,
        },
      },
    };
  }
  return map;
}

describe("buildProductionTree with overrides", () => {
  const productTypeID = 100;
  const materialA = 77800;
  const materialB = 77810;
  const types = makeTypes([
    { typeID: productTypeID, name: "Product" },
    { typeID: materialA, name: "Feldspar" },
    { typeID: materialB, name: "Platinum-Palladium" },
  ]);
  const blueprints = makeBlueprints([
    {
      blueprintTypeID: 201,
      productTypeID,
      productQty: 1,
      materials: [{ typeID: materialA, quantity: 5 }],
    },
    {
      blueprintTypeID: 202,
      productTypeID,
      productQty: 1,
      materials: [{ typeID: materialB, quantity: 10 }],
    },
  ]);

  it("uses optimized blueprint when no override", () => {
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 2 }],
      blueprints,
      types,
      { maxDepth: 3 }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].typeID).toBe(productTypeID);
    expect(trees[0].quantity).toBe(2);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(materialA);
    expect(trees[0].children[0].quantity).toBe(5 * 2);
  });

  it("uses override blueprint when path matches", () => {
    const pathRoot = `0/${productTypeID}`;
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 2 }],
      blueprints,
      types,
      { maxDepth: 3, overrides: { [pathRoot]: 202 } }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(materialB);
    expect(trees[0].children[0].quantity).toBe(10 * 2);
  });

  it("falls back to optimized when override blueprint ID is not in blueprints map", () => {
    const pathRoot = `0/${productTypeID}`;
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 2 }],
      blueprints,
      types,
      { maxDepth: 3, overrides: { [pathRoot]: 99999 } }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(materialA);
    expect(trees[0].children[0].quantity).toBe(5 * 2);
  });

  it("falls back to optimized when override blueprint does not produce this product", () => {
    const otherProduct = 200;
    const blueprintsWithOther = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: materialA, quantity: 5 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: materialB, quantity: 10 }],
      },
      {
        blueprintTypeID: 299,
        productTypeID: otherProduct,
        productQty: 1,
        materials: [{ typeID: materialA, quantity: 1 }],
      },
    ]);
    const pathRoot = `0/${productTypeID}`;
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 2 }],
      blueprintsWithOther,
      types,
      { maxDepth: 3, overrides: { [pathRoot]: 299 } }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(materialA);
    expect(trees[0].children[0].quantity).toBe(5 * 2);
  });

  it("uses override when three options all isOptimized (Kerogen Tar style)", () => {
    const types3 = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: materialA, name: "Feldspar" },
      { typeID: materialB, name: "Platinum-Palladium" },
    ]);
    const blueprints3 = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: materialA, quantity: 1 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: materialB, quantity: 1 }],
      },
      {
        blueprintTypeID: 203,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: materialA, quantity: 2 }],
      },
    ]);
    const pathRoot = `0/${productTypeID}`;
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 3 }],
      blueprints3,
      types3,
      { maxDepth: 3, overrides: { [pathRoot]: 202 } }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(materialB);
    expect(trees[0].children[0].quantity).toBe(1 * 3);
  });

  it("uses override for intermediate node when path matches", () => {
    const midTypeID = 50;
    const types2 = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: midTypeID, name: "Mid" },
      { typeID: materialA, name: "Feldspar" },
      { typeID: materialB, name: "Platinum-Palladium" },
    ]);
    const blueprints2 = makeBlueprints([
      {
        blueprintTypeID: 301,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: midTypeID, quantity: 2 }],
      },
      {
        blueprintTypeID: 302,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: midTypeID, quantity: 4 }],
      },
      {
        blueprintTypeID: 303,
        productTypeID: midTypeID,
        productQty: 1,
        materials: [{ typeID: materialA, quantity: 1 }],
      },
      {
        blueprintTypeID: 304,
        productTypeID: midTypeID,
        productQty: 1,
        materials: [{ typeID: materialB, quantity: 1 }],
      },
    ]);
    const pathMid = `0/${productTypeID}/${midTypeID}`;
    const trees = buildProductionTree(
      [{ typeID: productTypeID, quantity: 1 }],
      blueprints2,
      types2,
      { maxDepth: 4, overrides: { [pathMid]: 304 } }
    );
    expect(trees).toHaveLength(1);
    expect(trees[0].children).toHaveLength(1);
    expect(trees[0].children[0].typeID).toBe(midTypeID);
    expect(trees[0].children[0].children).toHaveLength(1);
    expect(trees[0].children[0].children[0].typeID).toBe(materialB);
  });
});

describe("getBlueprintOptionsForProduct", () => {
  it("returns multiple options with isOptimized set for minimum base ore", () => {
    const productTypeID = 100;
    const types = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: 77800, name: "Feldspar" },
      { typeID: 77810, name: "Platinum-Palladium" },
    ]);
    const blueprints = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 77800, quantity: 10 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 77800, quantity: 5 }],
      },
    ]);
    const options = getBlueprintOptionsForProduct(productTypeID, blueprints, types);
    expect(options).toHaveLength(2);
    expect(options[0].blueprintTypeID).toBe(202);
    expect(options[0].baseOrePerUnit).toBe(5);
    expect(options[0].isOptimized).toBe(true);
    expect(options[1].blueprintTypeID).toBe(201);
    expect(options[1].baseOrePerUnit).toBe(10);
    expect(options[1].isOptimized).toBe(false);
  });

  it("deduplicates identical recipes (same inputs), keeping first by sort order", () => {
    const productTypeID = 100;
    const types = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: 77800, name: "Feldspar" },
    ]);
    const blueprints = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 77800, quantity: 0 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 77800, quantity: 0 }],
      },
    ]);
    const options = getBlueprintOptionsForProduct(productTypeID, blueprints, types);
    expect(options).toHaveLength(1);
    expect(options[0].isOptimized).toBe(true);
    expect(options[0].baseOrePerUnit).toBe(0);
  });
});

describe("tiered ore optimization", () => {
  const productTypeID = 100;
  const commonOre = 77800;

  it("prefers tier 1 (common ores only) over tier 3 (drop-only)", () => {
    const types = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: commonOre, name: "Feldspar Crystals" },
      { typeID: 99999, name: "Drop Only Item" },
    ]);
    const blueprints = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: commonOre, quantity: 10 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 99999, quantity: 1 }],
      },
    ]);
    const best = getOptimizedBlueprintForProduct(productTypeID, blueprints, types);
    expect(best?.blueprintTypeID).toBe(201);
  });

  it("prefers tier 2 (common + rare ore name) over tier 3", () => {
    const types = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: commonOre, name: "Feldspar Crystals" },
      { typeID: 88888, name: "Something Matrix" },
      { typeID: 99999, name: "Drop Only Item" },
    ]);
    const blueprints = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [
          { typeID: commonOre, quantity: 5 },
          { typeID: 88888, quantity: 2 },
        ],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 99999, quantity: 1 }],
      },
    ]);
    const best = getOptimizedBlueprintForProduct(productTypeID, blueprints, types);
    expect(best?.blueprintTypeID).toBe(201);
  });

  it("sorts options by tier then baseOrePerUnit, isOptimized only on first", () => {
    const types = makeTypes([
      { typeID: productTypeID, name: "Product" },
      { typeID: commonOre, name: "Feldspar Crystals" },
      { typeID: 99999, name: "Drop Only Item" },
    ]);
    const blueprints = makeBlueprints([
      {
        blueprintTypeID: 201,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: commonOre, quantity: 10 }],
      },
      {
        blueprintTypeID: 202,
        productTypeID,
        productQty: 1,
        materials: [{ typeID: 99999, quantity: 1 }],
      },
    ]);
    const options = getBlueprintOptionsForProduct(productTypeID, blueprints, types);
    expect(options).toHaveLength(2);
    expect(options[0].blueprintTypeID).toBe(201);
    expect(options[0].isOptimized).toBe(true);
    expect(options[1].blueprintTypeID).toBe(202);
    expect(options[1].isOptimized).toBe(false);
  });
});

describe("BASE_ORE_TYPE_IDS", () => {
  it("contains the three base ore typeIDs", () => {
    expect(BASE_ORE_TYPE_IDS.has(77800)).toBe(true);
    expect(BASE_ORE_TYPE_IDS.has(77810)).toBe(true);
    expect(BASE_ORE_TYPE_IDS.has(77811)).toBe(true);
  });
});
