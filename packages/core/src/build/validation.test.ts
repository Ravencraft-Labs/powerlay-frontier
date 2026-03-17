import { describe, it, expect } from "vitest";
import { validateBuildPlan } from "./validation";

describe("validateBuildPlan", () => {
  it("returns true for valid plan", () => {
    const plan = {
      id: "b1",
      name: "ORT-411",
      facilities: [],
      plannedItems: [],
      lasers: [],
      updatedAt: Date.now(),
    };
    expect(validateBuildPlan(plan)).toBe(true);
  });

  it("returns true with optional starSystemId and non-empty arrays", () => {
    const plan = {
      id: "b2",
      name: "Build",
      starSystemId: "ORT-411",
      facilities: [{ type: "Printer S", count: 2 }],
      plannedItems: [{ itemId: "D2 Fuel", quantity: 10 }],
      lasers: [{ type: "Small Cutting Laser", amount: 1 }],
      updatedAt: 1,
    };
    expect(validateBuildPlan(plan)).toBe(true);
  });

  it("returns true for facility with dynamic type from game data", () => {
    const plan = {
      id: "b2b",
      name: "Build",
      facilities: [{ type: "Portable Refinery", count: 1 }],
      plannedItems: [],
      lasers: [],
      updatedAt: 1,
    };
    expect(validateBuildPlan(plan)).toBe(true);
  });

  it("returns true for plannedItem with typeID", () => {
    const plan = {
      id: "b3",
      name: "Build",
      facilities: [],
      plannedItems: [{ typeID: 82426, quantity: 1 }],
      lasers: [],
      updatedAt: 1,
    };
    expect(validateBuildPlan(plan)).toBe(true);
  });

  it("returns false for non-object", () => {
    expect(validateBuildPlan(null)).toBe(false);
    expect(validateBuildPlan(1)).toBe(false);
  });

  it("returns true with optional intermediateBlueprintOverrides", () => {
    const plan = {
      id: "b4",
      name: "Build",
      facilities: [],
      plannedItems: [],
      lasers: [],
      intermediateBlueprintOverrides: { "0/82426": 12345, "0/82426/78417": 67890 },
      updatedAt: 1,
    };
    expect(validateBuildPlan(plan)).toBe(true);
  });

  it("returns false for missing or invalid fields", () => {
    expect(validateBuildPlan({})).toBe(false);
    expect(validateBuildPlan({ id: "x", name: "y", updatedAt: 1 })).toBe(false);
    expect(
      validateBuildPlan({
        id: "x",
        name: "y",
        facilities: "not-array",
        plannedItems: [],
        lasers: [],
        updatedAt: 1,
      })
    ).toBe(false);
  });
});
