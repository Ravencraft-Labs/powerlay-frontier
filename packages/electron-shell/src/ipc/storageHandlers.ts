import { ipcMain, shell } from "electron";
import { randomUUID } from "crypto";
import { loadSession } from "../auth/sessionStore.js";
import {
  discoverWalletSsus,
  fetchObjectOwnerAddress,
  fetchSsuOwnerCapId,
} from "../storage/suiStorageDiscovery.js";
import { getStorageHttpBackend } from "../storage/storageHttpBackend.js";
import type { AuthServerResult } from "../auth/authServer.js";
import { getPowerlayStoragePackageId } from "../storage/storageConfig.js";
import { getContractsDevUserId } from "../contracts/contractsApiConfig.js";
import { FRONTIER_WORLD_PACKAGE_STILLNESS } from "../blockchain/playerTribeFromChain.js";
import { loadSettings } from "./settingsStore.js";

const SIGN_TX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/** Storage flows require a linked wallet, except local HTTP testing with POWERLAY_CONTRACTS_DEV_USER_ID. */
function storageWalletOrDevBypass(): boolean {
  if (getContractsDevUserId()) return true;
  return Boolean(loadSession()?.walletAddress?.trim());
}

export function registerStorageHandlers(authServer: AuthServerResult): void {
  /**
   * List StorageUnits already connected to Powerlay for the current user/tribe.
   * Channel: storage:list-connected
   * Returns: ConnectedStorage[]
   */
  ipcMain.handle("storage:list-connected", async () => {
    if (!storageWalletOrDevBypass()) return [];
    try {
      return await getStorageHttpBackend().listConnectedStorages();
    } catch (err) {
      console.error("[storage] list-connected failed", err);
      return [];
    }
  });

  /**
   * Discover StorageUnit objects (via OwnerCap) owned by the connected wallet.
   * Channel: storage:discover-wallet-ssus
   * Returns: WalletSsu[]
   */
  ipcMain.handle("storage:discover-wallet-ssus", async () => {
    const session = loadSession();
    const wallet = session?.walletAddress?.trim();
    if (!wallet) return [];
    try {
      return await discoverWalletSsus(wallet);
    } catch (err) {
      console.error("[storage] discover-wallet-ssus failed", err);
      return [];
    }
  });

  /**
   * Register a StorageUnit in the Powerlay backend after the on-chain connect tx succeeds.
   * Channel: storage:register
   * Args: ssuObjectId: string, txHash: string, name?: string
   * Returns: ConnectedStorage
   */
  ipcMain.handle(
    "storage:register",
    async (_e, ssuObjectId: string, txHash: string, name?: string) => {
      if (!storageWalletOrDevBypass()) {
        throw new Error("Connect your wallet in the app before registering storage.");
      }
      return await getStorageHttpBackend().registerStorage(ssuObjectId, txHash, name);
    }
  );

  /**
   * Fetch SSU mint/burn activity for a connected storage in the caller's tribe.
   * Channel: storage:get-history
   * Args: ssuId: string
   * Returns: StorageHistoryEntry[]
   */
  ipcMain.handle("storage:get-history", async (_e, ssuId: string) => {
    if (!storageWalletOrDevBypass()) return [];
    try {
      return await getStorageHttpBackend().getStorageHistory(ssuId);
    } catch (err) {
      console.error("[storage] get-history failed", err);
      return [];
    }
  });

  /**
   * Remove a StorageUnit from the Powerlay backend registry.
   * Channel: storage:disconnect
   */
  ipcMain.handle("storage:disconnect", async (_e, ssuObjectId: string) => {
    if (!storageWalletOrDevBypass()) {
      throw new Error("Connect your wallet in the app before disconnecting storage.");
    }
    try {
      await getStorageHttpBackend().disconnectStorage(ssuObjectId);
    } catch (err) {
      console.error("[storage] disconnect failed", err);
      throw err;
    }
  });

  /**
   * Open a browser popup page so Eve Vault can sign the connect_storage PTB.
   * Returns the transaction digest on success.
   * Channel: storage:sign-connect-tx
   * Args: params: { storageUnitId, ownerCapId, tribeId, characterId?, worldPackageId? }
   */
  ipcMain.handle(
    "storage:sign-connect-tx",
    async (_e, params: {
      storageUnitId: string;
      ownerCapId: string;
      tribeId: string;
      characterId?: string;
      worldPackageId?: string;
    }): Promise<{ digest: string } | { error: string }> => {
      if (!storageWalletOrDevBypass()) {
        return { error: "Connect your wallet in the app before connecting storage on-chain." };
      }
      const session = loadSession();
      let resolvedCharacterId = params.characterId?.trim() || undefined;
      const settingsWorldPkg = loadSettings().worldContractsPackageId?.trim();
      const powerlayPackageId = getPowerlayStoragePackageId();

      // Resolve ownerCapId from SSU object if not provided (common for manual SSU input
      // where discovery hasn't run, or for Character-owned OwnerCaps that aren't in wallet objects).
      let resolvedOwnerCapId = params.ownerCapId?.trim() || undefined;
      if (!resolvedOwnerCapId && params.storageUnitId?.trim()) {
        console.log("[storage] ownerCapId not provided — querying SSU object for owner_cap_id…");
        resolvedOwnerCapId = await fetchSsuOwnerCapId(params.storageUnitId.trim());
        console.log("[storage] fetchSsuOwnerCapId result:", resolvedOwnerCapId);
      }

      if (!resolvedOwnerCapId) {
        return { error: "Could not resolve OwnerCap ID for this SSU. Make sure you own this storage unit." };
      }

      const walletAddress = session?.walletAddress?.trim() || "";
      const sessionCharacterId = session?.characterId?.trim() || "";
      const ownerAddress = await fetchObjectOwnerAddress(resolvedOwnerCapId);
      const ownerNorm = ownerAddress?.toLowerCase() || "";
      const walletNorm = walletAddress.toLowerCase();
      const characterNorm = sessionCharacterId.toLowerCase();

      if (!resolvedCharacterId && ownerNorm && characterNorm && ownerNorm === characterNorm) {
        resolvedCharacterId = sessionCharacterId;
      } else if (ownerNorm && walletNorm && ownerNorm !== walletNorm && (!characterNorm || ownerNorm !== characterNorm)) {
        return {
          error:
            `This storage OwnerCap is owned by ${ownerAddress}, not by the active wallet or stored Character object. ` +
            "Reconnect the correct wallet in Powerlay, or refresh your character/session before connecting storage.",
        };
      }

      const sessionId = randomUUID();
      const { baseUrl, registerSignTx, rejectSignTx } = authServer;

      const result = await new Promise<{ digest: string } | { error: string }>((resolve) => {
        const timeout = setTimeout(() => {
          rejectSignTx(sessionId, new Error("Transaction signing timed out"));
          resolve({ error: "Transaction signing timed out. Please try again." });
        }, SIGN_TX_TIMEOUT_MS);

        registerSignTx(
          sessionId,
          {
            kind: "connect_storage",
            storageUnitId: params.storageUnitId,
            ownerCapId: resolvedOwnerCapId!,
            tribeId: params.tribeId,
            walletAddress: walletAddress || undefined,
            characterId: resolvedCharacterId,
            worldPackageId: params.worldPackageId?.trim() || settingsWorldPkg || FRONTIER_WORLD_PACKAGE_STILLNESS,
            powerlayPackageId,
          },
          (digest) => {
            clearTimeout(timeout);
            resolve({ digest });
          },
          (err) => {
            clearTimeout(timeout);
            resolve({ error: err?.message ?? "Transaction signing failed" });
          }
        );

        const signUrl = `${baseUrl}/sign-tx?session=${encodeURIComponent(sessionId)}`;
        shell.openExternal(signUrl);
      });

      return result;
    }
  );
}
