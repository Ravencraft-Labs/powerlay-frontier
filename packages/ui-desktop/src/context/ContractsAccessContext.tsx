/**
 * Tribe access context for contracts: resolves tribe from session/chain,
 * constrains search visibility to public-only when tribe is missing.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ContractVisibility } from "@powerlay/core";
import { useAuth } from "./AuthContext";

export type ContractsAccessStatus = "idle" | "loading" | "ready" | "unavailable" | "error";

interface ContractsAccessContextValue {
  status: ContractsAccessStatus;
  tribeId: string | null;
  tribeName: string | null;
  errorMessage: string | null;
  allowTribeScopes: boolean;
  refreshTribe: () => Promise<void>;
  buildSearchVisibility: (userSelected: ContractVisibility[]) => ContractVisibility[];
}

const ContractsAccessContext = createContext<ContractsAccessContextValue | null>(null);

export function useContractsAccess(): ContractsAccessContextValue {
  const ctx = useContext(ContractsAccessContext);
  if (!ctx) throw new Error("useContractsAccess must be used within ContractsAccessProvider");
  return ctx;
}

export function ContractsAccessProvider({ children }: { children: React.ReactNode }) {
  const { session, refreshSession } = useAuth();
  const [status, setStatus] = useState<ContractsAccessStatus>("idle");
  const [tribeId, setTribeId] = useState<string | null>(null);
  const [tribeName, setTribeName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshTribe = useCallback(async () => {
    if (!window.efOverlay?.tribe?.resolve) {
      const s = await window.efOverlay?.auth?.getSession?.();
      setTribeId(s?.tribeId ?? null);
      setTribeName(s?.tribeName ?? null);
      setStatus(s?.walletAddress ? (s?.tribeId ? "ready" : "unavailable") : "unavailable");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      const result = await window.efOverlay.tribe.resolve();
      const s = await window.efOverlay.auth?.getSession?.();
      if (result.ok && result.tribeId) {
        setTribeId(result.tribeId);
        setTribeName(result.tribeName ?? s?.tribeName ?? null);
        setStatus("ready");
        await refreshSession();
      } else {
        setTribeId(s?.tribeId ?? null);
        setTribeName(s?.tribeName ?? null);
        setStatus("unavailable");
        setErrorMessage(result.error ?? "Tribe could not be determined.");
      }
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Failed to resolve tribe");
      setTribeId(null);
      setTribeName(null);
    }
  }, [refreshSession]);

  useEffect(() => {
    if (!session?.walletAddress) {
      setStatus("unavailable");
      setTribeId(null);
      setTribeName(null);
      setErrorMessage(null);
      return;
    }
    refreshTribe();
  }, [session?.walletAddress, refreshTribe]);

  const allowTribeScopes = status === "ready" && !!tribeId;

  const buildSearchVisibility = useCallback(
    (userSelected: ContractVisibility[]): ContractVisibility[] => {
      if (!allowTribeScopes) return ["public"];
      return userSelected.length > 0 ? userSelected : ["tribe", "public", "alliance"];
    },
    [allowTribeScopes]
  );

  const value: ContractsAccessContextValue = {
    status,
    tribeId,
    tribeName,
    errorMessage,
    allowTribeScopes,
    refreshTribe,
    buildSearchVisibility,
  };

  return (
    <ContractsAccessContext.Provider value={value}>
      {children}
    </ContractsAccessContext.Provider>
  );
}
