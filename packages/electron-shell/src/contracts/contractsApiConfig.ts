/**
 * Central configuration for the Powerlay HTTP APIs.
 *
 * Base URLs must include the API version prefix the server expects (e.g. `.../api/v1`).
 * Request paths are relative to that base (`/contracts`, `/storages`, etc.).
 *
 * Settings take precedence, then dedicated env vars, then the legacy shared env var.
 *
 * @see docs/contracts-integration.md
 */
import { loadSettings } from "../ipc/settingsStore.js";

const DEFAULT_CONTRACTS_BASE = "https://stillness-back.ravencraft.dev/api/v1";
const DEFAULT_STORAGE_BASE = "https://stillness-back.ravencraft.dev/api/v1";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Contracts API base including `/api/v1` (or equivalent) prefix; no trailing slash. */
export function getContractsApiBaseUrl(): string {
  const fromSettings = loadSettings().contractsApiBase?.trim();
  if (fromSettings) return trimTrailingSlash(fromSettings);

  const fromEnv = process.env.POWERLAY_CONTRACTS_API_BASE?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  const legacy = process.env.POWERLAY_API_BASE?.trim();
  if (legacy) return trimTrailingSlash(legacy);

  return DEFAULT_CONTRACTS_BASE;
}

/** Storage API base including `/api/v1` (or equivalent) prefix; no trailing slash. */
export function getStorageApiBaseUrl(): string {
  const fromSettings = loadSettings().storageApiBase?.trim();
  if (fromSettings) return trimTrailingSlash(fromSettings);

  const fromEnv = process.env.POWERLAY_STORAGE_API_BASE?.trim();
  if (fromEnv) return trimTrailingSlash(fromEnv);

  const legacy = process.env.POWERLAY_API_BASE?.trim();
  if (legacy) return trimTrailingSlash(legacy);

  return DEFAULT_STORAGE_BASE;
}

/** Legacy shared API base helper retained for compatibility with older callers. */
export function getPowerlayApiBaseUrl(): string {
  return getContractsApiBaseUrl();
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
