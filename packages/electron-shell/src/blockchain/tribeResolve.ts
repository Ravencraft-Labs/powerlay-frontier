/**
 * Resolve player tribe from chain and merge into session.
 */
import { loadSession, saveSession } from "../auth/sessionStore.js";
import { queryPlayerTribeFromChain } from "./playerTribeFromChain.js";

const TRIBE_LOOKUP_FAILED =
  "We couldn't determine your tribe for this wallet. Only public contracts are shown in search. Try another wallet, or sign in with the one linked to your Frontier character. If CCP changed indexer URLs or on-chain layout, report it so we can update the app.";

export interface TribeResolveResult {
  ok: boolean;
  tribeId?: string;
  tribeName?: string;
  error?: string;
}

export async function resolvePlayerTribe(): Promise<TribeResolveResult> {
  const session = loadSession();
  const wallet = session?.walletAddress?.trim();
  if (!wallet) {
    return { ok: false, error: "Sign in with your wallet to resolve tribe access." };
  }

  const chainResult = await queryPlayerTribeFromChain(wallet);
  if (chainResult) {
    const tribe = { tribeId: chainResult.tribeId, tribeName: chainResult.tribeName };
    saveSession({
      ...session!,
      ...tribe,
      characterId: chainResult.characterId,
      characterName: chainResult.characterName,
      tribeResolvedAt: Date.now(),
    });
    return { ok: true, tribeId: tribe.tribeId, tribeName: tribe.tribeName };
  }

  saveSession({
    ...session!,
    tribeId: undefined,
    tribeName: undefined,
    tribeResolvedAt: Date.now(),
  });
  return { ok: false, error: TRIBE_LOOKUP_FAILED };
}
