import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useContractsAccess } from "../../context/ContractsAccessContext";
import type { GameData } from "../../preload";
import { getContractsClient, type ContractsBackendStatus } from "../../services/contracts/contractsClient";
import { formatWithThousandsSeparator } from "../../utils/format";
import { OverlayWithLock } from "../OverlayWithLock";
import { CreateContractForm } from "./CreateContractForm";
import { FindContractsPanel } from "./FindContractsPanel";
import { MyContractsPanel } from "./MyContractsPanel";

type Subview = "find" | "create" | "manage";

const sectionCls = "bg-surface rounded-lg px-5 py-4 border border-border";
const btnCls = "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";
const subTabCls = (on: boolean) =>
  `px-3 py-1.5 text-sm font-medium rounded-md border ${
    on ? "border-selection-bg bg-selection-bg/15 text-text" : "border-transparent text-muted hover:text-text"
  }`;

function contractsModeBadge(s: ContractsBackendStatus | null): string {
  if (!s) return "Checking…";
  if (s.mode === "mock") return "Mock store";
  return s.connected ? "Powerlay API" : "Powerlay API (offline)";
}

export function ContractsSection() {
  const { session } = useAuth();
  const { status, tribeId, tribeName, errorMessage } = useContractsAccess();
  const client = getContractsClient();
  const [subview, setSubview] = useState<Subview>("find");
  const [balance, setBalance] = useState<{ balance: number; reserved: number; available: number } | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState<{ totalPublished: number; openForDelivery: number; totalTokensCommitted: number } | null>(null);
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [backendStatus, setBackendStatus] = useState<ContractsBackendStatus | null>(null);

  const loadBackendStatus = useCallback(async () => {
    if (!client?.getBackendStatus) return;
    try {
      setBackendStatus(await client.getBackendStatus());
    } catch {
      setBackendStatus({ mode: "http", connected: false, apiBase: "" });
    }
  }, [client]);

  const refreshBalance = useCallback(async () => {
    if (!client) return;
    try {
      setBalance(await client.tokenBalance());
    } catch {
      setBalance(null);
    }
  }, [client]);

  const loadStats = useCallback(async () => {
    if (!client) return;
    try {
      setStats(await client.stats());
    } catch {
      setStats(null);
    }
  }, [client]);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance, subview, session?.walletAddress]);

  useEffect(() => {
    void loadBackendStatus();
  }, [loadBackendStatus, session?.walletAddress]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.efOverlay?.gameData?.get) return;
    window.efOverlay.gameData.get().then(setGameData).catch(() => setGameData(null));
  }, []);

  const openStats = async () => {
    setStatsOpen(true);
    await loadStats();
  };

  if (!client) {
    return (
      <section className={sectionCls}>
        <h2 className="m-0 text-base font-semibold text-text">Contracts</h2>
        <p className="text-sm text-muted mt-2 mb-0">Run the app from Electron to use the contracts API (search, drafts, publish, join).</p>
      </section>
    );
  }

  return (
    <section className={sectionCls}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="m-0 text-base font-semibold text-text flex flex-wrap items-center gap-2">
            Contracts
            <span
              className="inline-flex items-center px-2 py-0.5 text-xs rounded-md border border-border/60 bg-surface/60 text-muted select-none cursor-default font-normal"
              role="status"
            >
              {contractsModeBadge(backendStatus)}
            </span>
          </h2>
          {balance && (
            <p className="text-xs text-muted m-0 mt-1">
              Token balance{" "}
              <span className="text-text font-medium tabular-nums">{formatWithThousandsSeparator(Math.round(balance.balance))}</span>
              {" · "}
              Reserved {formatWithThousandsSeparator(Math.round(balance.reserved))}
              {" · "}
              Available {formatWithThousandsSeparator(Math.round(balance.available))}
            </p>
          )}
          {status === "loading" && (
            <p className="text-xs text-muted m-0 mt-1" role="status">
              Resolving tribe…
            </p>
          )}
          {status === "ready" && tribeId && (
            <p className="text-xs text-muted m-0 mt-1" role="status">
              Tribe: {tribeName || tribeId.slice(0, 8)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btnCls} onClick={openStats}>
            Statistics
          </button>
          <OverlayWithLock frame="contracts" btnCls={btnCls} />
        </div>
      </div>

      {session?.walletAddress && (status === "unavailable" || status === "error") && (
        <div
          className="mb-4 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm text-text"
          role="alert"
          aria-live="polite"
        >
          <p className="m-0 font-medium text-amber-200">Tribe not available</p>
          <p className="m-0 mt-1 text-xs text-muted leading-relaxed">
            {errorMessage ??
              "Only public contracts are shown in search until your tribe can be resolved. Check Settings → Contracts & tribe (Sui GraphQL URL) or sign in with the wallet linked to your character."}
          </p>
        </div>
      )}

      {backendStatus?.mode === "http" && !backendStatus.connected && (
        <div
          className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm"
          role="alert"
          aria-live="polite"
        >
          <p className="m-0 text-text font-medium">Cannot connect to the Powerlay backend</p>
          <button type="button" className={`${btnCls} mt-2`} onClick={() => void loadBackendStatus()}>
            Check again
          </button>
        </div>
      )}

      <div className="flex gap-1 p-0.5 rounded-lg bg-border/40 border border-border/60 mb-4 w-fit">
        <button type="button" className={subTabCls(subview === "find")} onClick={() => setSubview("find")}>
          Find contracts
        </button>
        <button type="button" className={subTabCls(subview === "create")} onClick={() => setSubview("create")}>
          Create contract
        </button>
        <button type="button" className={subTabCls(subview === "manage")} onClick={() => setSubview("manage")}>
          My contracts
        </button>
      </div>

      {subview === "find" && <FindContractsPanel client={client} onRefreshBalance={refreshBalance} />}
      {subview === "manage" && <MyContractsPanel client={client} onRefreshBalance={refreshBalance} />}
      {subview === "create" && (
        <CreateContractForm
          client={client}
          gameData={gameData}
          onPublished={() => {
            refreshBalance();
            setSubview("find");
          }}
          onDraftsChanged={refreshBalance}
        />
      )}

      {statsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="contracts-stats-title"
        >
          <div className="bg-surface border border-border rounded-lg max-w-md w-full p-4 shadow-xl">
            <h3 id="contracts-stats-title" className="m-0 text-sm font-semibold text-text mb-3">
              Contract statistics
            </h3>
            {stats ? (
              <ul className="list-none m-0 p-0 text-sm space-y-2 text-muted">
                <li>
                  Published contracts: <span className="text-text">{stats.totalPublished}</span>
                </li>
                <li>
                  Open for delivery: <span className="text-text">{stats.openForDelivery}</span>
                </li>
                <li>
                  Tokens committed (mock): <span className="text-text">{formatWithThousandsSeparator(Math.round(stats.totalTokensCommitted))}</span>
                </li>
              </ul>
            ) : (
              <p className="text-sm text-muted m-0">Loading…</p>
            )}
            <button type="button" className={`${btnCls} mt-4`} onClick={() => setStatsOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
