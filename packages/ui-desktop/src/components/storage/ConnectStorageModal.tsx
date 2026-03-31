/**
 * Connect Storage modal.
 *
 * Three views:
 *  "list"  — shows connected storages + "Add storage" button
 *  "add"   — discover wallet SSUs, let user pick one + optional name, then sign + register
 *  "busy"  — spinner while chain tx or backend call is in flight
 *
 * On-chain signing flow (when POWERLAY_STORAGE_PACKAGE_ID is set):
 *   1. Build PTB via `buildConnectStorageTx`
 *   2. Call `signAndExecuteStorageConnect` → Eve Vault signs → returns digest
 *   3. Call `storage:register` IPC with digest → backend records it
 *
 * While the Move package ID is still a TODO placeholder the modal is fully
 * functional for the backend-registration path; the on-chain tx step will
 * warn in the console and return a stub digest so the rest of the flow can
 * be tested.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import type { ConnectedStorage, StorageHistoryEntry, WalletSsu } from "../../preload";
import { useAuth } from "../../context/AuthContext";
import { useContractsAccess } from "../../context/ContractsAccessContext";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Stillness world package (default; can be overridden in Settings). */
const DEFAULT_WORLD_PACKAGE_ID = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

function shortId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

// ---------------------------------------------------------------------------
// CSS constants
// ---------------------------------------------------------------------------

const btnCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed";
const primaryCls =
  "cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed";
const dangerCls =
  "cursor-pointer px-2 py-1 rounded border border-destructive/50 bg-destructive/10 text-destructive text-xs hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed";
const inputCls =
  "px-2 py-1.5 rounded-md border border-border-input bg-bg text-text text-sm focus:outline-none focus:border-muted w-full";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type View = "list" | "add" | "busy" | "history";

const HISTORY_BADGE: Record<string, string> = {
  mint: "bg-emerald-900/40 text-emerald-300",
  burn: "bg-amber-900/40 text-amber-300",
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      type="button"
      title={`Copy: ${value}`}
      onClick={handleCopy}
      className="cursor-pointer px-1 py-0.5 rounded border border-border-input bg-border text-muted text-[0.6rem] hover:bg-surface shrink-0 leading-none"
    >
      {copied ? "✓" : "copy"}
    </button>
  );
}

function StorageHistoryRow({ entry }: { entry: StorageHistoryEntry }) {
  const badgeCls = HISTORY_BADGE[entry.eventType] ?? "bg-border text-muted";
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "—";
  // Prefer character name, fall back to truncated character ID, then truncated wallet
  const actorLabel =
    entry.actorName ||
    (entry.characterId ? `${entry.characterId.slice(0, 10)}…` : null) ||
    (entry.senderWallet ? `${entry.senderWallet.slice(0, 10)}…` : null);

  return (
    <li className="flex gap-2 text-xs rounded-md border border-border/50 bg-bg px-3 py-2">
      <span className="text-muted shrink-0 tabular-nums w-36">{ts}</span>
      <span className={`shrink-0 px-1.5 py-0.5 rounded text-[0.65rem] font-medium ${badgeCls}`}>
        {entry.eventType}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        {entry.resourceName && (
          <span className="text-text">
            {entry.resourceName}
            {entry.quantity != null && (
              <span className="tabular-nums ml-1 text-muted">
                ×{Math.round(entry.quantity).toLocaleString()}
              </span>
            )}
          </span>
        )}
        {actorLabel && (
          <span className="flex items-center gap-1 text-muted">
            <span>by {actorLabel}</span>
            {entry.characterId && <CopyButton value={entry.characterId} />}
          </span>
        )}
        {entry.contractTitle && (
          <span className="text-muted">
            contract: {entry.contractTitle}
          </span>
        )}
        {entry.txHash && (
          <span className="text-muted font-mono">{entry.txHash.slice(0, 10)}…</span>
        )}
      </span>
    </li>
  );
}

export interface ConnectStorageModalProps {
  onClose: () => void;
}

export function ConnectStorageModal({ onClose }: ConnectStorageModalProps) {
  const { session } = useAuth();
  const { tribeId, status: tribeStatus, refreshTribe, errorMessage: tribeError } = useContractsAccess();

  const walletConnected = Boolean(session?.walletAddress);
  const tribeReady = Boolean(tribeId?.trim());
  /** Powerlay storage HTTP calls require X-Tribe-Id; character_id for POST comes from session after tribe resolve. */
  const canUseStorageApi = walletConnected && tribeReady;

  const [view, setView] = useState<View>("list");
  const [connectedStorages, setConnectedStorages] = useState<ConnectedStorage[]>([]);
  const [walletSsus, setWalletSsus] = useState<WalletSsu[]>([]);
  const [selectedSsu, setSelectedSsu] = useState<WalletSsu | null>(null);
  const [manualSsuId, setManualSsuId] = useState("");
  const [storageName, setStorageName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyMsg, setBusyMsg] = useState("");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [historyStorage, setHistoryStorage] = useState<ConnectedStorage | null>(null);
  const [historyItems, setHistoryItems] = useState<StorageHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [worldPackageId, setWorldPackageId] = useState(DEFAULT_WORLD_PACKAGE_ID);

  // ---------------------------------------------------------------------------
  // Load connected storages on mount
  // ---------------------------------------------------------------------------

  const loadConnected = useCallback(async () => {
    if (!walletConnected) {
      setConnectedStorages([]);
      return;
    }
    if (!tribeReady) {
      setConnectedStorages([]);
      return;
    }
    if (!window.efOverlay?.storage) return;
    try {
      const list = await window.efOverlay.storage.listConnected();
      setConnectedStorages(list ?? []);
    } catch (e) {
      console.error("[ConnectStorageModal] list-connected failed", e);
    }
  }, [walletConnected, tribeReady]);

  useEffect(() => {
    if (walletConnected) void refreshTribe();
  }, [walletConnected, refreshTribe]);

  useEffect(() => {
    void loadConnected();
  }, [loadConnected]);

  useEffect(() => {
    if (!window.efOverlay?.settings?.get) return;
    void window.efOverlay.settings.get().then((s) => {
      const v = s.worldContractsPackageId?.trim();
      setWorldPackageId(v || DEFAULT_WORLD_PACKAGE_ID);
    }).catch(() => {
      setWorldPackageId(DEFAULT_WORLD_PACKAGE_ID);
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Add view — discover wallet SSUs
  // ---------------------------------------------------------------------------

  const openAddView = async () => {
    setError(null);
    if (!walletConnected) {
      setError("Connect your wallet in the app header first.");
      return;
    }
    if (!tribeReady) {
      setError(
        tribeError ??
          "Resolve your tribe (wait until it appears under Contracts) before connecting storage — the API needs tribe context and your character id."
      );
      return;
    }
    setSelectedSsu(null);
    setManualSsuId("");
    setStorageName("");
    setView("add");

    if (!window.efOverlay?.storage) return;
    try {
      const discovered = await window.efOverlay.storage.discoverWalletSsus();
      setWalletSsus(discovered ?? []);
    } catch (e) {
      console.error("[ConnectStorageModal] discover-wallet-ssus failed", e);
      setWalletSsus([]);
    }
  };

  // ---------------------------------------------------------------------------
  // Connect a storage
  // ---------------------------------------------------------------------------

  const handleConnect = async () => {
    setError(null);
    if (!walletConnected) {
      setError("Connect your wallet in the app header first.");
      return;
    }
    if (!tribeReady) {
      setError("Tribe context is required for storage. Wait until your tribe is shown under Contracts, then try again.");
      return;
    }

    const effectiveSsuId = selectedSsu?.storageUnitId ?? manualSsuId.trim();
    const effectiveOwnerCapId = selectedSsu?.ownerCapId ?? "";

    if (!effectiveSsuId) {
      setError("Please select a storage unit or enter an SSU ID.");
      return;
    }
    if (!window.efOverlay?.storage) {
      setError("Storage API not available (not running in Electron).");
      return;
    }

    setView("busy");

    // Step 1: Sign on-chain via browser popup (Eve Vault extension is not accessible
    // inside Electron's BrowserWindow — signing must happen in the real browser).
    setBusyMsg("Opening browser for wallet signature…");
    let txHash = "";
    if (!window.efOverlay?.storage?.signConnectTx) {
      setError("Sign transaction IPC not available (not running in Electron).");
      setView("add");
      return;
    }
    try {
      const result = await window.efOverlay.storage.signConnectTx({
        storageUnitId: effectiveSsuId,
        ownerCapId: effectiveOwnerCapId,
        tribeId: String(tribeId ?? "0"),
        worldPackageId,
      });
      if ("error" in result) {
        setError(`On-chain transaction failed: ${result.error}`);
        setView("add");
        return;
      }
      txHash = result.digest;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`On-chain transaction failed: ${msg}`);
      setView("add");
      return;
    }

    // Step 2: Register in backend
    setBusyMsg("Registering with Powerlay backend…");
    try {
      await window.efOverlay.storage.register(
        effectiveSsuId,
        txHash,
        storageName.trim() || undefined
      );
      await loadConnected();
      setView("list");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Backend registration failed: ${msg}`);
      setView("add");
    }
  };

  // ---------------------------------------------------------------------------
  // Disconnect a storage
  // ---------------------------------------------------------------------------

  const handleDisconnect = async (ssuObjectId: string) => {
    if (!walletConnected || !tribeReady) {
      setError("Connect your wallet and resolve your tribe before disconnecting storage.");
      return;
    }
    if (!window.efOverlay?.storage) return;
    setDisconnecting(ssuObjectId);
    setError(null);
    try {
      await window.efOverlay.storage.disconnect(ssuObjectId);
      await loadConnected();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Disconnect failed: ${msg}`);
    } finally {
      setDisconnecting(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Storage history
  // ---------------------------------------------------------------------------

  const openHistory = async (s: ConnectedStorage) => {
    if (!walletConnected || !tribeReady) {
      setError("Connect your wallet and resolve your tribe to view storage history.");
      return;
    }
    setHistoryStorage(s);
    setHistoryItems([]);
    setHistoryLoading(true);
    setView("history");
    if (!window.efOverlay?.storage) {
      setHistoryLoading(false);
      return;
    }
    try {
      const items = await window.efOverlay.storage.getHistory(s.ssuObjectId);
      setHistoryItems(items ?? []);
    } catch (e) {
      console.error("[ConnectStorageModal] get-history failed", e);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-storage-title"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-lg p-4 shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 id="connect-storage-title" className="m-0 text-sm font-semibold text-text">
            {view === "add"
              ? "Add storage unit"
              : view === "history"
                ? `History · ${historyStorage?.name ?? shortId(historyStorage?.ssuObjectId ?? "")}`
                : "Connected storages"}
          </h3>
          <button type="button" className={btnCls} onClick={onClose}>
            Close
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            role="alert"
          >
            {error}
          </div>
        )}

        {!walletConnected && (
          <div className="mb-3 rounded-md border border-border/60 bg-border/20 px-3 py-3 text-sm text-muted">
            <p className="m-0 text-text font-medium">Wallet not connected</p>
            <p className="m-0 mt-2 leading-relaxed">
              Use <span className="text-text font-medium">Connect wallet</span> in the app header, then open Connect storage again.
            </p>
          </div>
        )}

        {walletConnected && tribeStatus === "loading" && (
          <p className="text-xs text-muted m-0 mb-3" role="status">
            Resolving tribe for storage…
          </p>
        )}

        {walletConnected && tribeStatus !== "loading" && !tribeReady && (
          <div className="mb-3 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed">
            <p className="m-0 font-medium text-amber-100">Tribe context required</p>
            <p className="m-0 mt-1 text-muted">
              {tribeError ??
                "The storage API needs your tribe (and saves your character id for registration). Wait until your tribe appears in the Contracts section above, then try again."}
            </p>
          </div>
        )}

        {walletConnected && session?.characterId && tribeReady && (
          <p className="text-[0.65rem] text-muted m-0 mb-2 font-mono truncate" title={session.characterId}>
            Character linked · {shortId(session.characterId)}
          </p>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* LIST view                                                           */}
        {/* ------------------------------------------------------------------ */}
        {walletConnected && view === "list" && (
          <div className="flex flex-col gap-3">
            {connectedStorages.length === 0 ? (
              <p className="text-sm text-muted m-0">
                No storages connected yet. Add one to make it available for tribe use.
              </p>
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-2">
                {connectedStorages.map((s) => (
                  <li
                    key={s.ssuObjectId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-bg px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-xs font-medium text-text truncate">
                        {s.name ?? "Storage unit"}
                      </p>
                      <p className="m-0 text-[0.65rem] text-muted font-mono truncate" title={s.ssuObjectId}>
                        {shortId(s.ssuObjectId)}
                      </p>
                      <p className="m-0 text-[0.65rem] text-muted">
                        Connected {new Date(s.connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[0.6rem] px-1.5 py-0.5 rounded border border-accent/40 bg-accent/10 text-accent">
                        tribe-open
                      </span>
                      <button
                        type="button"
                        className={btnCls + " text-xs py-1 px-2"}
                        disabled={!canUseStorageApi}
                        onClick={() => void openHistory(s)}
                      >
                        History
                      </button>
                      <button
                        type="button"
                        className={dangerCls}
                        disabled={!canUseStorageApi || disconnecting === s.ssuObjectId}
                        onClick={() => void handleDisconnect(s.ssuObjectId)}
                      >
                        {disconnecting === s.ssuObjectId ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className={primaryCls}
              disabled={!canUseStorageApi}
              title={
                !canUseStorageApi
                  ? !walletConnected
                    ? "Connect your wallet first."
                    : "Wait until your tribe is resolved."
                  : undefined
              }
              onClick={() => void openAddView()}
            >
              + Add storage
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* ADD view                                                            */}
        {/* ------------------------------------------------------------------ */}
        {walletConnected && view === "add" && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted m-0">
              Select one of your storage units below, or enter an SSU object ID manually.
              After connecting, tribe members can deposit and withdraw through Powerlay.
            </p>

            {/* Discovered SSUs */}
            {walletSsus.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted m-0">Your storage units (from wallet):</p>
                {walletSsus.map((ssu) => {
                  const isSelected = selectedSsu?.storageUnitId === ssu.storageUnitId;
                  const isAlreadyConnected = connectedStorages.some(
                    (c) => c.ssuObjectId === ssu.storageUnitId
                  );
                  return (
                    <button
                      key={ssu.storageUnitId}
                      type="button"
                      disabled={isAlreadyConnected}
                      onClick={() => {
                        setSelectedSsu(ssu);
                        setManualSsuId("");
                      }}
                      className={`text-left px-3 py-2 rounded-md border text-xs ${
                        isSelected
                          ? "border-selection-bg bg-selection-bg/15 text-text"
                          : isAlreadyConnected
                          ? "border-border/40 text-muted cursor-not-allowed opacity-60"
                          : "border-border hover:border-muted text-text cursor-pointer"
                      }`}
                    >
                      <span className="font-mono block truncate" title={ssu.storageUnitId}>
                        {shortId(ssu.storageUnitId)}
                      </span>
                      {isAlreadyConnected && (
                        <span className="text-[0.6rem] text-muted">already connected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted m-0 italic">
                No storage units discovered for this wallet.
                You can enter the SSU object ID manually below.
              </p>
            )}

            {/* Manual SSU ID input */}
            <div>
              <label className="text-xs text-muted block mb-1">
                SSU object ID (manual)
              </label>
              <input
                className={inputCls}
                placeholder="0x…"
                value={manualSsuId}
                onChange={(e) => {
                  setManualSsuId(e.target.value);
                  setSelectedSsu(null);
                }}
              />
            </div>

            {/* Display name */}
            <div>
              <label className="text-xs text-muted block mb-1">
                Display name
              </label>
              <input
                className={inputCls}
                placeholder="e.g. FORA-STORAGE-07"
                value={storageName}
                onChange={(e) => setStorageName(e.target.value)}
              />
              <p className="text-[0.65rem] text-amber-300/80 mt-1 m-0 leading-snug">
                Use the exact name shown in-game. Other contract participants will see this name when selecting a target storage — a matching name helps them identify the right unit.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className={primaryCls}
                onClick={() => void handleConnect()}
                disabled={(!selectedSsu && !manualSsuId.trim()) || !canUseStorageApi}
                title={!canUseStorageApi ? "Wallet and resolved tribe are required." : undefined}
              >
                Connect storage
              </button>
              <button
                type="button"
                className={btnCls}
                onClick={() => {
                  setError(null);
                  setView("list");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* BUSY view                                                           */}
        {/* ------------------------------------------------------------------ */}
        {walletConnected && view === "busy" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted m-0">{busyMsg || "Working…"}</p>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* HISTORY view                                                        */}
        {/* ------------------------------------------------------------------ */}
        {walletConnected && view === "history" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnCls + " text-xs py-1 px-2"}
                onClick={() => setView("list")}
              >
                ← Back
              </button>
              {historyStorage && (
                <span className="text-xs text-muted font-mono truncate" title={historyStorage.ssuObjectId}>
                  {shortId(historyStorage.ssuObjectId)}
                </span>
              )}
            </div>

            {historyLoading ? (
              <p className="text-sm text-muted m-0">Loading history…</p>
            ) : historyItems.length === 0 ? (
              <p className="text-sm text-muted m-0">No activity recorded for this storage unit yet.</p>
            ) : (
              <ul className="list-none m-0 p-0 flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
                {historyItems.map((entry) => (
                  <StorageHistoryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
