import { useMemo } from "react";
import { getContractsClient, type ContractsClient } from "../../services/contracts/contractsClient";

/** Stable access to the contracts IPC client when running under Electron. */
export function useContractsClient(): ContractsClient | null {
  return useMemo(() => getContractsClient(), []);
}
