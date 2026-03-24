/**
 * Central configuration for the Powerlay Contracts HTTP API (local or deployed).
 *
 * @see docs/contracts-integration.md
 */
const DEFAULT_BASE = "https://back.ravencraft.dev/api/v1";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** When true, IPC uses the in-memory mock store instead of HTTP. */
export function useContractsMock(): boolean {
  const v = process.env.POWERLAY_CONTRACTS_USE_MOCK?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** API base including `/api/v1` prefix (no trailing slash). */
export function getContractsApiBaseUrl(): string {
  const raw = process.env.POWERLAY_CONTRACTS_API_BASE?.trim();
  if (raw) return trimTrailingSlash(raw);
  return DEFAULT_BASE;
}

/** Optional fixed UUID for X-User-Id (local testing with backend seed users). */
export function getContractsDevUserId(): string | undefined {
  const id = process.env.POWERLAY_CONTRACTS_DEV_USER_ID?.trim();
  return id || undefined;
}

export function getContractsDevNickname(): string | undefined {
  const n = process.env.POWERLAY_CONTRACTS_DEV_NICKNAME?.trim();
  return n || undefined;
}
