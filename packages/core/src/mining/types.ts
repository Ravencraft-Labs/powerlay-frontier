/** Fictional resource types for mock build engine */
export type ResourceId = "ore_a" | "ore_b" | "gas" | "alloy";

export interface ResourceRequirement {
  resourceId: ResourceId;
  quantity: number;
}

export interface BuildBlueprint {
  id: string;
  name: string;
  /** Requirements per unit built (fictional) */
  requirements: ResourceRequirement[];
  /** Base time in seconds per unit */
  buildTimePerUnit: number;
}

export interface MiningYield {
  resourceId: ResourceId;
  quantity: number;
  /** Seconds to obtain this yield (mock rate) */
  durationSeconds: number;
}

export interface AllocationConstraint {
  resourceId: ResourceId;
  availableQuantity: number;
}

export interface AllocationResult {
  allocations: { blueprintId: string; units: number }[];
  usedResources: ResourceRequirement[];
  totalBuildTimeSeconds: number;
}
