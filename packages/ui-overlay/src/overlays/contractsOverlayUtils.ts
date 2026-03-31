import type { ContractPriority } from "@powerlay/core";

const PRIORITY_RANK: Record<ContractPriority, number> = { high: 0, medium: 1, low: 2 };

export function comparePriority(a: ContractPriority, b: ContractPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}
