import type { ContractLifecycleStatus, ContractPriority, ContractVisibility } from "@powerlay/core";

const PRIORITY_RANK: Record<ContractPriority, number> = { high: 0, medium: 1, low: 2 };

export function comparePriority(a: ContractPriority, b: ContractPriority): number {
  return PRIORITY_RANK[a] - PRIORITY_RANK[b];
}

export function visibilityLabel(v: ContractVisibility): string {
  switch (v) {
    case "tribe":
      return "Tribe";
    case "alliance":
      return "Alliance";
    case "public":
      return "Public";
    default:
      return v;
  }
}

export function statusLabel(s: ContractLifecycleStatus): string {
  switch (s) {
    case "draft":
      return "Draft";
    case "published":
      return "Published";
    case "in_progress":
      return "In progress";
    case "completed":
      return "Completed";
    case "canceled":
      return "Canceled";
    default:
      return s;
  }
}

export function walletMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function callsignMatchesLine(assignee: string | undefined, callsign: string): boolean {
  const c = callsign.trim().toLowerCase();
  const a = assignee?.trim().toLowerCase() ?? "";
  if (!c || !a) return false;
  return a === c || a.split(/[,\s]+/).some((p) => p === c);
}

const CALLSIGN_KEY = "powerlay.contracts.callsign";

export function loadStoredCallsign(): string {
  try {
    return sessionStorage.getItem(CALLSIGN_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveStoredCallsign(value: string): void {
  try {
    sessionStorage.setItem(CALLSIGN_KEY, value);
  } catch {
    /* ignore */
  }
}

const AUTO_REFRESH_KEY = "powerlay.contracts.auto-refresh";

/** Load the set of contract IDs that have live-refresh enabled (persisted in sessionStorage). */
export function loadAutoRefreshIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(AUTO_REFRESH_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    /* ignore */
  }
  return new Set();
}

/** Persist the current live-refresh set to sessionStorage. */
export function saveAutoRefreshIds(ids: Set<string>): void {
  try {
    sessionStorage.setItem(AUTO_REFRESH_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}
