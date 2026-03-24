/**
 * In-memory logistics contracts store + mock balances.
 * Replace with HTTP/RPC client when the real backend ships.
 */
import { randomUUID } from "crypto";
import {
  contractProgressPercent,
  contractRewardCapTokens,
  contractRewardProgressTokens,
  mergeContractResourceLines,
  mergeDraftResourceLines,
  type ContractBrowseSummary,
  type ContractLineDraftInput,
  type ContractParticipant,
  type ContractResourceLine,
  type ContractStats,
  type CreateDraftInput,
  type LogisticsContract,
  type PublishContractResult,
  type SearchContractsParams,
  type UpdateDraftInput,
} from "@powerlay/core";
import { loadSession } from "../auth/sessionStore.js";

const MOCK_DEFAULT_BALANCE = 50_000;

let contracts: LogisticsContract[] = [];
/** wallet lower -> hidden contract ids */
const hiddenByWallet = new Map<string, Set<string>>();
/** wallet lower -> token balance (mock escrow subtracted on publish) */
const tokenBalances = new Map<string, number>();
/** wallet lower -> tokens reserved for published contracts */
const reservedByWallet = new Map<string, number>();

function walletKey(wallet: string | null | undefined): string | null {
  if (!wallet || typeof wallet !== "string") return null;
  return wallet.trim().toLowerCase() || null;
}

function shortWallet(addr: string): string {
  const a = addr.trim();
  if (a.length <= 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function now(): number {
  return Date.now();
}

function newLineId(): string {
  return `line-${randomUUID()}`;
}

function newContractId(): string {
  return `ctr-${randomUUID()}`;
}

function ensureBalance(w: string | null): number {
  const k = walletKey(w);
  if (!k) return 0;
  if (!tokenBalances.has(k)) tokenBalances.set(k, MOCK_DEFAULT_BALANCE);
  return tokenBalances.get(k)!;
}

function reservedTotal(k: string): number {
  return reservedByWallet.get(k) ?? 0;
}

function setReserved(k: string, n: number): void {
  if (n <= 0) reservedByWallet.delete(k);
  else reservedByWallet.set(k, n);
}

function lineTotalReward(lines: ContractResourceLine[]): number {
  return lines.reduce((s, l) => s + l.rewardTokensFullLine, 0);
}

/** Escrow still attributable to undelivered portions (mock proportional release). */
function unspentRewardReserveOnContract(c: LogisticsContract): number {
  let u = 0;
  for (const l of c.lines) {
    const req = l.requiredAmount;
    if (req <= 0 || l.rewardTokensFullLine <= 0) continue;
    const ratio = Math.min(1, Math.max(0, l.deliveredAmount) / req);
    u += l.rewardTokensFullLine * (1 - ratio);
  }
  return u;
}

function hasAnyDelivery(c: LogisticsContract): boolean {
  return c.lines.some((l) => l.deliveredAmount > 0);
}

function draftLinesFromInput(inputs: ContractLineDraftInput[]): ContractResourceLine[] {
  const merged = mergeDraftResourceLines(inputs);
  return merged.map((l) => ({
    id: newLineId(),
    typeID: l.typeID,
    resourceName: l.resourceName,
    requiredAmount: l.requiredAmount,
    deliveredAmount: 0,
    rewardTokensFullLine: l.rewardTokensFullLine,
    assigneeText: l.assigneeText?.trim() || undefined,
  }));
}

function recomputeStatus(c: LogisticsContract): LogisticsContract {
  if (c.status === "draft" || c.status === "canceled" || c.status === "completed") return c;
  const pct = contractProgressPercent(c);
  if (pct >= 100) return { ...c, status: "completed", updatedAt: now() };
  if (c.participants.length > 0 || c.lines.some((l) => l.deliveredAmount > 0)) {
    if (c.status === "published") return { ...c, status: "in_progress", updatedAt: now() };
  }
  return c;
}

function seedIfEmpty(): void {
  if (contracts.length > 0) return;
  const t = now();
  const sampleLines: ContractResourceLine[] = [
    {
      id: newLineId(),
      typeID: 18,
      resourceName: "Feldspar",
      requiredAmount: 1000,
      deliveredAmount: 400,
      rewardTokensFullLine: 100,
      assigneeText: " hauler-1 ",
    },
    {
      id: newLineId(),
      typeID: 19,
      resourceName: "Silicates",
      requiredAmount: 500,
      deliveredAmount: 0,
      rewardTokensFullLine: 80,
    },
  ];
  contracts.push({
    id: newContractId(),
    title: "SSU restock — Forward base",
    description: "Deliver to tribe SSU; proportional token payout.",
    targetStarSystem: "Fora",
    targetSsuId: "SSU-DEMO-001",
    visibility: "tribe",
    priority: "high",
    status: "in_progress",
    lines: mergeContractResourceLines(sampleLines),
    participants: [
      {
        id: "p1",
        displayName: "0xabc…def",
        walletAddress: "0xabc0000000000000000000000000000000def",
        joinedAt: t - 3600_000,
      },
    ],
    createdByWallet: "0x1111111111111111111111111111111111111111",
    createdAt: t - 7200_000,
    updatedAt: t,
  });
  contracts.push({
    id: newContractId(),
    title: "Public ore run",
    description: "Open contract — first come first served.",
    targetStarSystem: "Hope",
    targetSsuId: "SSU-PUB-77",
    visibility: "public",
    priority: "medium",
    status: "published",
    lines: mergeContractResourceLines([
      {
        id: newLineId(),
        typeID: 20,
        resourceName: "Tritanium",
        requiredAmount: 2000,
        deliveredAmount: 0,
        rewardTokensFullLine: 250,
      },
    ]),
    participants: [],
    createdByWallet: "0x2222222222222222222222222222222222222222",
    createdAt: t - 500_000,
    updatedAt: t,
  });
}

function matchesSearch(c: LogisticsContract, params: SearchContractsParams): boolean {
  const q = params.query.trim().toLowerCase();
  if (!q) return true;
  if (params.filterMode === "title") {
    return (
      c.title.toLowerCase().includes(q) ||
      (c.description?.toLowerCase().includes(q) ?? false) ||
      c.targetStarSystem.toLowerCase().includes(q)
    );
  }
  return c.lines.some((l) => l.resourceName.toLowerCase().includes(q));
}

function matchesVisibility(c: LogisticsContract, vis: SearchContractsParams["visibility"]): boolean {
  if (!vis.length) return true;
  return vis.includes(c.visibility);
}

function matchesPriority(c: LogisticsContract, p: SearchContractsParams["priority"]): boolean {
  if (p === "all") return true;
  return c.priority === p;
}

function toSummary(c: LogisticsContract): ContractBrowseSummary {
  return {
    contract: c,
    progressPercent: contractProgressPercent(c),
    rewardProgressTokens: contractRewardProgressTokens(c),
    rewardCapTokens: contractRewardCapTokens(c),
  };
}

export function getContractsStore() {
  return {
    search(params: SearchContractsParams): ContractBrowseSummary[] {
      seedIfEmpty();
      const wk = walletKey(loadSession()?.walletAddress);
      const hidden = wk ? hiddenByWallet.get(wk) : undefined;
      return contracts
        .filter((c) => c.status !== "draft")
        .filter((c) => !hidden?.has(c.id))
        .filter((c) => matchesSearch(c, params))
        .filter((c) => matchesVisibility(c, params.visibility))
        .filter((c) => matchesPriority(c, params.priority))
        .map(toSummary);
    },

    listMyContracts(bucket?: string): ContractBrowseSummary[] {
      seedIfEmpty();
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return [];
      const hidden = hiddenByWallet.get(wk);
      let filtered: LogisticsContract[];
      switch (bucket) {
        case "drafts":
          filtered = contracts.filter((c) => c.status === "draft" && walletKey(c.createdByWallet) === wk);
          break;
        case "published_by_me":
          filtered = contracts.filter(
            (c) =>
              (c.status === "published" || c.status === "in_progress" || c.status === "completed") &&
              walletKey(c.createdByWallet) === wk
          );
          break;
        case "removed_by_me":
          filtered = contracts.filter((c) => c.status === "canceled" && walletKey(c.createdByWallet) === wk);
          break;
        case "joined":
          filtered = contracts.filter(
            (c) =>
              c.status !== "draft" &&
              walletKey(c.createdByWallet) !== wk &&
              c.participants.some((p) => walletKey(p.walletAddress) === wk)
          );
          break;
        case "hidden":
          filtered = contracts.filter((c) => c.status !== "draft" && hidden?.has(c.id));
          break;
        case "all":
        default:
          filtered = contracts.filter((c) => walletKey(c.createdByWallet) === wk);
      }
      return filtered.map(toSummary).sort((a, b) => (b.contract.updatedAt ?? 0) - (a.contract.updatedAt ?? 0));
    },

    listDrafts(): LogisticsContract[] {
      seedIfEmpty();
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return [];
      const rows = contracts.filter((c) => c.status === "draft" && walletKey(c.createdByWallet) === wk);
      return [...rows].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    },

    get(id: string): LogisticsContract | null {
      seedIfEmpty();
      return contracts.find((c) => c.id === id) ?? null;
    },

    createDraft(input: CreateDraftInput): LogisticsContract {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) throw new Error("CONTRACTS_AUTH_REQUIRED");
      const lines = draftLinesFromInput(input.lines);
      const t = now();
      const c: LogisticsContract = {
        id: newContractId(),
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        targetStarSystem: input.targetStarSystem.trim(),
        targetSsuId: input.targetSsuId.trim(),
        visibility: input.visibility,
        priority: input.priority,
        status: "draft",
        lines: mergeContractResourceLines(lines),
        participants: [],
        createdByWallet: loadSession()?.walletAddress,
        createdAt: t,
        updatedAt: t,
        expiresAt: input.expiresAt,
      };
      contracts.push(c);
      return c;
    },

    updateDraft(id: string, patch: UpdateDraftInput): LogisticsContract | null {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return null;
      const idx = contracts.findIndex((c) => c.id === id);
      if (idx < 0) return null;
      const c = contracts[idx];
      if (c.status !== "draft" || walletKey(c.createdByWallet) !== wk) return null;
      let lines = c.lines;
      if (patch.lines) {
        lines = mergeContractResourceLines(draftLinesFromInput(patch.lines));
      }
      const next: LogisticsContract = {
        ...c,
        title: patch.title?.trim() ?? c.title,
        description: patch.description !== undefined ? patch.description.trim() || undefined : c.description,
        targetStarSystem: patch.targetStarSystem?.trim() ?? c.targetStarSystem,
        targetSsuId: patch.targetSsuId?.trim() ?? c.targetSsuId,
        visibility: patch.visibility ?? c.visibility,
        priority: patch.priority ?? c.priority,
        lines,
        expiresAt: patch.expiresAt === null ? undefined : patch.expiresAt ?? c.expiresAt,
        updatedAt: now(),
      };
      contracts[idx] = next;
      return next;
    },

    publish(id: string): PublishContractResult {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) {
        return { ok: false, code: "UNKNOWN", message: "Not signed in." };
      }
      const idx = contracts.findIndex((c) => c.id === id);
      if (idx < 0) return { ok: false, code: "UNKNOWN", message: "Contract not found." };
      const c = contracts[idx];
      if (c.status !== "draft") return { ok: false, code: "NOT_DRAFT", message: "Only drafts can be published." };
      if (walletKey(c.createdByWallet) !== wk) {
        return { ok: false, code: "NO_TRIBE_ACCESS", message: "You are not the creator of this draft." };
      }
      if (!c.targetSsuId.trim()) {
        return { ok: false, code: "INVALID_SSU", message: "SSU ID is required." };
      }
      if (c.lines.length === 0) {
        return { ok: false, code: "INVALID_LINES", message: "Add at least one resource line." };
      }
      const need = lineTotalReward(c.lines);
      ensureBalance(loadSession()?.walletAddress ?? null);
      const bal = tokenBalances.get(wk)!;
      const reserved = reservedTotal(wk);
      const available = bal - reserved;
      if (need > available) {
        return {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          message: `Need ${need} tokens to reserve; available ${Math.max(0, Math.floor(available))}.`,
        };
      }
      setReserved(wk, reserved + need);
      const published: LogisticsContract = recomputeStatus({
        ...c,
        status: "published",
        updatedAt: now(),
      });
      contracts[idx] = published;
      return { ok: true, contract: published };
    },

    hide(contractId: string): boolean {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return false;
      let set = hiddenByWallet.get(wk);
      if (!set) {
        set = new Set();
        hiddenByWallet.set(wk, set);
      }
      set.add(contractId);
      return true;
    },

    join(contractId: string, displayName?: string): LogisticsContract | null {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return null;
      const idx = contracts.findIndex((c) => c.id === contractId);
      if (idx < 0) return null;
      const c = contracts[idx];
      if (c.status === "draft" || c.status === "canceled" || c.status === "completed") return null;
      const wallet = loadSession()?.walletAddress ?? "";
      if (c.participants.some((p) => walletKey(p.walletAddress) === wk)) return c;
      const p: ContractParticipant = {
        id: `p-${randomUUID()}`,
        displayName: (displayName?.trim() || shortWallet(wallet)) || "Pilot",
        walletAddress: wallet || undefined,
        joinedAt: now(),
      };
      const next = recomputeStatus({
        ...c,
        participants: [...c.participants, p],
        updatedAt: now(),
      });
      contracts[idx] = next;
      return next;
    },

    getTokenBalance(): { balance: number; reserved: number; available: number } {
      const w = loadSession()?.walletAddress ?? null;
      const wk = walletKey(w);
      if (!wk) return { balance: 0, reserved: 0, available: 0 };
      const b = ensureBalance(w);
      const r = reservedTotal(wk);
      return { balance: b, reserved: r, available: Math.max(0, b - r) };
    },

    getStats(): ContractStats {
      seedIfEmpty();
      const published = contracts.filter((c) => c.status !== "draft");
      const open = published.filter((c) => c.status === "published" || c.status === "in_progress");
      let totalTokens = 0;
      for (const c of published) {
        if (c.status !== "canceled") totalTokens += lineTotalReward(c.lines);
      }
      return {
        totalPublished: published.length,
        openForDelivery: open.length,
        totalTokensCommitted: totalTokens,
      };
    },

    /**
     * Mock finish: creator ends an active listing after some delivery; undelivered reward escrow returns to available.
     */
    completeContract(contractId: string): LogisticsContract | null {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return null;
      const idx = contracts.findIndex((c) => c.id === contractId);
      if (idx < 0) return null;
      const c = contracts[idx];
      if (walletKey(c.createdByWallet) !== wk) return null;
      if (c.status !== "published" && c.status !== "in_progress") return null;
      if (!hasAnyDelivery(c) && contractProgressPercent(c) < 100) return null;
      const unspent = unspentRewardReserveOnContract(c);
      const r = reservedTotal(wk);
      setReserved(wk, Math.max(0, r - unspent));
      const next: LogisticsContract = { ...c, status: "completed", updatedAt: now() };
      contracts[idx] = next;
      return next;
    },

    /** Mock cancel: only creator, only if no deliveries yet. */
    cancel(contractId: string): LogisticsContract | null {
      const wk = walletKey(loadSession()?.walletAddress);
      if (!wk) return null;
      const idx = contracts.findIndex((c) => c.id === contractId);
      if (idx < 0) return null;
      const c = contracts[idx];
      if (walletKey(c.createdByWallet) !== wk) return null;
      if (c.lines.some((l) => l.deliveredAmount > 0)) return null;
      if (c.status === "draft") {
        const removed: LogisticsContract = { ...c, status: "canceled", updatedAt: now() };
        contracts.splice(idx, 1);
        return removed;
      }
      if (c.status === "published" || c.status === "in_progress") {
        const need = lineTotalReward(c.lines);
        const r = reservedTotal(wk);
        setReserved(wk, Math.max(0, r - need));
        const next: LogisticsContract = { ...c, status: "canceled", updatedAt: now() };
        contracts[idx] = next;
        return next;
      }
      return null;
    },
  };
}
