import { useEffect, useRef } from "react";
import type { LogisticsContract } from "@powerlay/core";
import type { ContractsClient } from "../../services/contracts/contractsClient";

/**
 * Polls GET /contracts/{id} on an interval so the UI reflects backend-updated progress.
 *
 * Architecture: a separate watcher service ingests chain events → backend updates contract rows →
 * this hook only refetches the contract document. The Electron app never processes raw SSU events.
 */
const DEFAULT_POLL_MS = 15_000;

export function useContractBackendPoll(
  client: ContractsClient,
  contractId: string | null,
  enabled: boolean,
  onContract: (c: LogisticsContract) => void,
  intervalMs: number = DEFAULT_POLL_MS
): void {
  const onRef = useRef(onContract);
  onRef.current = onContract;

  useEffect(() => {
    if (!contractId || !enabled) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const c = await client.get(contractId);
        if (!cancelled && c) onRef.current(c);
      } catch {
        /* ignore — user may be offline; next tick retries */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [client, contractId, enabled, intervalMs]);
}
