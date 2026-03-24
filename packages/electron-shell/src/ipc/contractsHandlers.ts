import { ipcMain } from "electron";
import type {
  CreateDraftInput,
  PublishContractResult,
  SearchContractsParams,
  UpdateDraftInput,
} from "@powerlay/core";
import { getContractsApiBaseUrl, useContractsMock } from "../contracts/contractsApiConfig.js";
import { getContractsHttpBackend, type ContractsHttpBackend } from "../contracts/contractsHttpBackend.js";
import { getContractsStore } from "./contractsStore.js";

type ContractsService = ReturnType<typeof getContractsStore> | ContractsHttpBackend;

function getContractsService(): ContractsService {
  return useContractsMock() ? getContractsStore() : getContractsHttpBackend();
}

export function registerContractsHandlers(): void {
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

  ipcMain.handle("contracts:backend-status", async () => {
    if (useContractsMock()) {
      return { mode: "mock" as const, connected: true as const };
    }
    const ping = await getContractsHttpBackend().pingReachability();
    return {
      mode: "http" as const,
      connected: ping.ok,
      ...(ping.ok ? {} : { message: ping.message }),
      apiBase: getContractsApiBaseUrl(),
    };
  });
}
