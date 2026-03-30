import { ipcMain, shell } from "electron";
import { randomUUID } from "crypto";
import { loadSession } from "../auth/sessionStore.js";
import { discoverWalletSsus, fetchSsuOwnerCapId } from "../storage/suiStorageDiscovery.js";
import { getStorageHttpBackend } from "../storage/storageHttpBackend.js";
import type { AuthServerResult } from "../auth/authServer.js";
import { POWERLAY_STORAGE_PACKAGE_ID } from "../storage/storageConfig.js";

const SIGN_TX_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export function registerStorageHandlers(authServer: AuthServerResult): void {
  /**
   * List StorageUnits already connected to Powerlay for the current user/tribe.
   * Channel: storage:list-connected
   * Returns: ConnectedStorage[]
   */
  ipcMain.handle("storage:list-connected", async () => {
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
      // Resolve characterId from session if not provided by UI.
      const session = loadSession();
      const resolvedCharacterId = params.characterId?.trim() || session?.characterId?.trim() || undefined;

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
            characterId: resolvedCharacterId,
            worldPackageId: params.worldPackageId,
            powerlayPackageId: POWERLAY_STORAGE_PACKAGE_ID,
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
