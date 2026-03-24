import type { ContractResourceLine, LogisticsContract } from "./types.js";

export function lineProgressPercent(line: ContractResourceLine): number {
  if (line.requiredAmount <= 0) return 0;
  return Math.min(100, Math.round((line.deliveredAmount / line.requiredAmount) * 1000) / 10);
}

/** Tokens earned for a delivery chunk (proportional to full-line reward). */
export function tokensForDeliveredAmount(line: ContractResourceLine, deliveredAmount: number): number {
  if (line.requiredAmount <= 0) return 0;
  const clamped = Math.max(0, Math.min(deliveredAmount, line.requiredAmount));
  return (clamped / line.requiredAmount) * line.rewardTokensFullLine;
}

export function contractRewardCapTokens(contract: LogisticsContract): number {
  return contract.lines.reduce((s, l) => s + l.rewardTokensFullLine, 0);
}

export function contractRewardProgressTokens(contract: LogisticsContract): number {
  return contract.lines.reduce((s, l) => s + tokensForDeliveredAmount(l, l.deliveredAmount), 0);
}

/** Average completion across lines (0–100). */
export function contractProgressPercent(contract: LogisticsContract): number {
  const lines = contract.lines;
  if (lines.length === 0) return 0;
  let sum = 0;
  for (const l of lines) {
    const req = Math.max(l.requiredAmount, 1e-9);
    sum += Math.min(1, l.deliveredAmount / req);
  }
  return Math.round((sum / lines.length) * 1000) / 10;
}
