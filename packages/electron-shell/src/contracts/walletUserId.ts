import { createHash } from "node:crypto";

/** DNS namespace UUID (RFC 4122 §4.3) for name-based UUID v5-style derivation. */
const NAMESPACE_DNS = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Derives a stable RFC 4122 UUID from the wallet address so X-User-Id is valid
 * without persisting a separate user id (local / dev).
 */
export function deterministicUserIdFromWallet(wallet: string): string {
  const ns = Buffer.from(NAMESPACE_DNS.replace(/-/g, ""), "hex");
  const name = Buffer.from(wallet.trim().toLowerCase(), "utf8");
  const hash = createHash("sha1").update(ns).update(name).digest();
  const bytes = Buffer.allocUnsafe(16);
  hash.copy(bytes, 0, 0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
