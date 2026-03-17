import type {
  BuildBlueprint,
  ResourceRequirement,
  AllocationConstraint,
  AllocationResult,
} from "./types.js";

/** Sum resource requirements (same resourceId merged). Deterministic. */
export function calculateBuildCost(blueprint: BuildBlueprint): ResourceRequirement[] {
  return blueprint.requirements.map((r) => ({ ...r }));
}

/** Estimate mining time in seconds for a quantity of a resource. Mock formula: baseTime + quantity * rate. */
export function estimateMiningTime(resourceId: string, quantity: number): number {
  const baseSeconds = 10;
  const ratePerUnit = 2;
  return baseSeconds + quantity * ratePerUnit;
}

/** Simple greedy allocation: maximize units of first blueprint within constraints. */
export function optimizeResourceAllocation(
  blueprints: BuildBlueprint[],
  constraints: AllocationConstraint[]
): AllocationResult {
  const used: ResourceRequirement[] = [];
  const allocations: { blueprintId: string; units: number }[] = [];
  const available = new Map(constraints.map((c) => [c.resourceId, c.availableQuantity]));
  let totalBuildTimeSeconds = 0;

  for (const bp of blueprints) {
    let units = Infinity;
    for (const req of bp.requirements) {
      const have = available.get(req.resourceId) ?? 0;
      units = Math.min(units, Math.floor(have / req.quantity));
    }
    if (units <= 0) continue;
    allocations.push({ blueprintId: bp.id, units });
    totalBuildTimeSeconds += bp.buildTimePerUnit * units;
    for (const req of bp.requirements) {
      const usedQty = req.quantity * units;
      used.push({ resourceId: req.resourceId, quantity: usedQty });
      available.set(req.resourceId, (available.get(req.resourceId) ?? 0) - usedQty);
    }
  }

  return { allocations, usedResources: used, totalBuildTimeSeconds };
}
