import type { ContractLineDraftInput, ContractResourceLine } from "./types.js";

function combineAssignee(a?: string, b?: string): string | undefined {
  const x = (a ?? "").trim();
  const y = (b ?? "").trim();
  if (!x) return y || undefined;
  if (!y || x.toLowerCase() === y.toLowerCase()) return x;
  return `${x}, ${y}`;
}

/**
 * Merges duplicate resources (same typeID) for create/edit flows.
 * Sums required amounts and line rewards; combines assignee text when both differ.
 */
export function mergeDraftResourceLines(lines: ContractLineDraftInput[]): ContractLineDraftInput[] {
  const byType = new Map<number, ContractLineDraftInput>();
  for (const line of lines) {
    const existing = byType.get(line.typeID);
    if (!existing) {
      byType.set(line.typeID, { ...line });
    } else {
      byType.set(line.typeID, {
        ...existing,
        requiredAmount: existing.requiredAmount + line.requiredAmount,
        rewardTokensFullLine: existing.rewardTokensFullLine + line.rewardTokensFullLine,
        assigneeText: combineAssignee(existing.assigneeText, line.assigneeText),
      });
    }
  }
  return Array.from(byType.values());
}

/** Merge persisted lines by typeID (same rules as draft). */
export function mergeContractResourceLines(lines: ContractResourceLine[]): ContractResourceLine[] {
  const byType = new Map<number, ContractResourceLine>();
  for (const line of lines) {
    const existing = byType.get(line.typeID);
    if (!existing) {
      byType.set(line.typeID, { ...line });
    } else {
      byType.set(line.typeID, {
        ...existing,
        requiredAmount: existing.requiredAmount + line.requiredAmount,
        deliveredAmount: existing.deliveredAmount + line.deliveredAmount,
        rewardTokensFullLine: existing.rewardTokensFullLine + line.rewardTokensFullLine,
        assigneeText: combineAssignee(existing.assigneeText, line.assigneeText),
      });
    }
  }
  return Array.from(byType.values());
}
