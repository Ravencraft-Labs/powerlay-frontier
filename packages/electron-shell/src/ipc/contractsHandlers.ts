import { ipcMain, shell } from "electron";
import { randomUUID } from "crypto";
import type {
  CreateDraftInput,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
} from "@powerlay/core";
import type { AuthServerResult } from "../auth/authServer.js";
import { loadSession } from "../auth/sessionStore.js";
import { FRONTIER_WORLD_PACKAGE_UTOPIA } from "../blockchain/playerTribeFromChain.js";
import {
  resolveStorageConfigObjectIdForSsu,
  resolveStorageConfigObjectIdFromConnectTx,
} from "../blockchain/resolveStorageConfigFromTx.js";
import { getPowerlayApiBaseUrl } from "../contracts/contractsApiConfig.js";
import { getContractsHttpBackend, type ContractsHttpBackend } from "../contracts/contractsHttpBackend.js";
import { fetchCharacterOwnerCapId } from "../storage/suiStorageDiscovery.js";
import { POWERLAY_STORAGE_PACKAGE_ID } from "../storage/storageConfig.js";
import { appLog } from "../log/appLogger.js";

const SIGN_TX_TIMEOUT_MS = 5 * 60 * 1000;

function deliveryDebugEnabled(): boolean {
  const v = process.env.POWERLAY_DEBUG_DELIVERY?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function getContractsService(): ContractsHttpBackend {
  return getContractsHttpBackend();
}

export function registerContractsHandlers(authServer: AuthServerResult): void {
  ipcMain.handle("contracts:search", async (_e, params: unknown) => {
    try {
      return await getContractsService().search(params as SearchContractsParams);
    } catch (err) {
      console.error("[contracts] search failed", err);
      return [];
    }
  });

  ipcMain.handle("contracts:list-my-contracts", async (_e, bucket?: string) => {
    try {
      return await getContractsService().listMyContracts(bucket);
    } catch (err) {
      console.error("[contracts] list-my-contracts failed", err);
      return [];
    }
  });

  ipcMain.handle("contracts:list-drafts", async () => {
    try {
      return await getContractsService().listDrafts();
    } catch (err) {
      console.error("[contracts] list-drafts failed", err);
      return [];
    }
  });

  ipcMain.handle("contracts:get", async (_e, id: string) => {
    try {
      return await getContractsService().get(id);
    } catch (err) {
      console.error("[contracts] get failed", err);
      return null;
    }
  });

  ipcMain.handle("contracts:create-draft", async (_e, input: unknown) => {
    try {
      return await getContractsService().createDraft(input as CreateDraftInput);
    } catch (err) {
      console.error("[contracts] create-draft failed", err);
      throw err;
    }
  });

  ipcMain.handle("contracts:update-draft", async (_e, id: string, patch: unknown) => {
    return await getContractsService().updateDraft(id, patch as UpdateDraftInput);
  });

  ipcMain.handle("contracts:publish", async (_e, id: string): Promise<PublishContractResult> => {
    try {
      return await getContractsService().publish(id);
    } catch (err) {
      console.error("[contracts] publish failed", err);
      return { ok: false, code: "UNKNOWN", message: err instanceof Error ? err.message : "Publish failed." };
    }
  });

  ipcMain.handle("contracts:hide", async (_e, contractId: string) => {
    try {
      return await getContractsService().hide(contractId);
    } catch (err) {
      console.error("[contracts] hide failed", err);
      return false;
    }
  });

  ipcMain.handle("contracts:join", async (_e, contractId: string, displayName?: string) => {
    try {
      return await getContractsService().join(contractId, displayName);
    } catch (err) {
      console.error("[contracts] join failed", err);
      return null;
    }
  });

  ipcMain.handle("contracts:token-balance", async () => {
    try {
      return await getContractsService().getTokenBalance();
    } catch (err) {
      console.error("[contracts] token-balance failed", err);
      return { balance: 0, reserved: 0, available: 0 };
    }
  });

  ipcMain.handle("contracts:stats", async () => {
    try {
      return await getContractsService().getStats();
    } catch (err) {
      console.error("[contracts] stats failed", err);
      return { totalPublished: 0, openForDelivery: 0, totalTokensCommitted: 0 };
    }
  });

  ipcMain.handle("contracts:cancel", async (_e, contractId: string) => {
    try {
      return await getContractsService().cancel(contractId);
    } catch (err) {
      console.error("[contracts] cancel failed", err);
      throw err;
    }
  });

  ipcMain.handle("contracts:complete-contract", async (_e, contractId: string) => {
    try {
      return await getContractsService().completeContract(contractId);
    } catch (err) {
      console.error("[contracts] complete-contract failed", err);
      throw err;
    }
  });

  ipcMain.handle("contracts:get-logs", async (_e, contractId: string) => {
    try {
      return await getContractsService().getLogs(contractId);
    } catch (err) {
      console.error("[contracts] get-logs failed", err);
      return [];
    }
  });

  ipcMain.handle(
    "contracts:sign-delivery-tx",
    async (
      _e,
      params: {
        storageUnitId: string;
        /** If set (e.g. you registered this SSU in Powerlay), used first to find `StorageConfig`. */
        connectTxDigest?: string;
        typeId: number;
        quantity: number;
        worldPackageId?: string;
        useCharacterCapBorrow?: boolean;
      }
    ): Promise<{ digest: string } | { error: string }> => {
      const session = loadSession();
      const characterId = session?.characterId?.trim();
      if (!characterId) {
        return {
          error: "No on-chain character in session. Resolve tribe or sign in again so your Character object id is stored.",
        };
      }
      const su = params.storageUnitId?.trim();
      if (!su) {
        return { error: "Storage unit id is required." };
      }
      const typeId = Number(params.typeId);
      const qty = Math.floor(Number(params.quantity));
      if (!Number.isFinite(typeId) || typeId < 0) {
        return { error: "Invalid resource type id." };
      }
      if (!Number.isFinite(qty) || qty < 1) {
        return { error: "Invalid quantity." };
      }

      const connectDigest = params.connectTxDigest?.trim();
      appLog.info("[delivery:ipc] sign-delivery-tx request", {
        storageUnitId: su,
        typeId,
        quantity: qty,
        connectTxDigestPresent: Boolean(connectDigest),
        walletAddress: session?.walletAddress?.trim()?.slice(0, 12),
        characterId: `${characterId.slice(0, 10)}…`,
        debugVerbose: deliveryDebugEnabled(),
      });

      let storageConfigObjectId: string | null = null;
      let configResolvedVia: "connect_tx" | "graphql_ssu" | null = null;
      if (connectDigest) {
        storageConfigObjectId = await resolveStorageConfigObjectIdFromConnectTx(connectDigest);
        if (storageConfigObjectId) configResolvedVia = "connect_tx";
      }
      if (!storageConfigObjectId) {
        storageConfigObjectId = await resolveStorageConfigObjectIdForSsu(su, deliveryDebugEnabled());
        if (storageConfigObjectId) configResolvedVia = "graphql_ssu";
      }
      if (!storageConfigObjectId) {
        appLog.warn("[delivery:ipc] StorageConfig not resolved", {
          storageUnitId: su,
          hadConnectDigest: Boolean(connectDigest),
        });
        return {
          error:
            "Could not find on-chain StorageConfig for this SSU (Powerlay connect). The creator must connect this storage unit to Powerlay, or check RPC (POWERLAY_SUI_RPC_URL) / package ids.",
        };
      }

      const delivererCharacterOwnerCapId = await fetchCharacterOwnerCapId(characterId);
      if (!delivererCharacterOwnerCapId) {
        appLog.warn("[delivery:ipc] Character owner_cap_id missing", { characterId: `${characterId.slice(0, 10)}…` });
        return { error: "Could not read owner_cap_id from your Character object on-chain." };
      }

      const worldPackageId = params.worldPackageId?.trim() || FRONTIER_WORLD_PACKAGE_UTOPIA;
      const useCharacterCapBorrow = params.useCharacterCapBorrow !== false;

      appLog.info("[delivery:ipc] opening sign-tx page", {
        configResolvedVia,
        storageConfigObjectId,
        storageUnitId: su,
        characterId,
        delivererCharacterOwnerCapId,
        typeId,
        quantity: qty,
        worldPackageId,
        powerlayPackageId: POWERLAY_STORAGE_PACKAGE_ID,
        useCharacterCapBorrow,
        note:
          "If chain aborts EItemDoesNotExist, withdraw_by_owner found no stack for typeId in the DF keyed by delivererCharacterOwnerCapId on this SSU.",
      });

      const sessionId = randomUUID();
      const { baseUrl, registerSignTx, rejectSignTx } = authServer;

      return await new Promise<{ digest: string } | { error: string }>((resolve) => {
        const timeout = setTimeout(() => {
          rejectSignTx(sessionId, new Error("Transaction signing timed out"));
          resolve({ error: "Transaction signing timed out. Please try again." });
        }, SIGN_TX_TIMEOUT_MS);

        registerSignTx(
          sessionId,
          {
            kind: "contract_delivery",
            storageConfigObjectId,
            storageUnitId: su,
            characterId,
            delivererCharacterOwnerCapId,
            typeId: String(Math.floor(typeId)),
            quantity: qty,
            worldPackageId,
            powerlayPackageId: POWERLAY_STORAGE_PACKAGE_ID,
            useCharacterCapBorrow,
          },
          (digest) => {
            clearTimeout(timeout);
            appLog.info("[delivery:ipc] wallet reported success", { digest, storageUnitId: su, typeId, quantity: qty });
            resolve({ digest });
          },
          (err) => {
            clearTimeout(timeout);
            const msg = err?.message ?? "Transaction signing failed";
            appLog.warn("[delivery:ipc] wallet reported failure", {
              message: msg.slice(0, 800),
              storageUnitId: su,
              typeId,
              quantity: qty,
            });
            resolve({ error: msg });
          }
        );

        shell.openExternal(`${baseUrl}/sign-tx?session=${encodeURIComponent(sessionId)}`);
      });
    }
  );

  ipcMain.handle(
    "contracts:record-delivery",
    async (
      _e,
      contractId: string,
      body: {
        lineId: string;
        quantity: number;
        suiTxDigest: string;
        ssuObjectId: string;
      }
    ) => {
      try {
        return await getContractsService().recordDelivery(contractId.trim(), body);
      } catch (err) {
        console.error("[contracts] record-delivery failed", err);
        throw err;
      }
    }
  );

  ipcMain.handle("contracts:backend-status", async () => {
    const ping = await getContractsHttpBackend().pingReachability();
    return {
      mode: "http" as const,
      connected: ping.ok,
      ...(ping.ok ? {} : { message: ping.message }),
      apiBase: getPowerlayApiBaseUrl(),
    };
  });
}
