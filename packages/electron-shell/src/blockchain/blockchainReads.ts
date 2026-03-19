/**
 * Placeholder for blockchain read queries by authenticated wallet address.
 * Auth proves identity; blockchain reads use the resulting wallet address.
 * Future: wire to EVE Frontier GraphQL/RPC (sui-docs.evefrontier.com).
 */
import { loadSession } from "../auth/sessionStore.js";

/**
 * Returns the current wallet address from session, or null if not authenticated.
 * Use this for blockchain read queries that require user identity.
 */
export function getWalletAddress(): string | null {
  const session = loadSession();
  return session?.walletAddress ?? null;
}

/**
 * Placeholder for future EVE Frontier blockchain queries.
 * Will integrate with GraphQL client or RPC when ready.
 */
export async function queryUserData(walletAddress: string): Promise<unknown> {
  // TODO: Wire to EVE Frontier GraphQL/RPC
  void walletAddress;
  return null;
}
