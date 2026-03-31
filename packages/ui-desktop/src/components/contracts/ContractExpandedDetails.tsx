import React, { useEffect, useMemo, useState } from "react";
import type { ContractBrowseSummary, ContractResourceLine } from "@powerlay/core";
import { lineProgressPercent, tokensForDeliveredAmount } from "@powerlay/core";
import { formatWithThousandsSeparator } from "../../utils/format";
import { statusLabel, visibilityLabel } from "../../utils/contractsUi";
import { contractsErrorForUi } from "../../utils/contractsIpcError";
import { getContractsClient } from "../../services/contracts/contractsClient";
import { ItemIcon } from "../ItemIcon";

/** Wallet / simulation errors are verbose; trim and attach hints for known Move aborts. */
function formatDeliverySignError(raw: string): string {
  const core = raw.length > 720 ? `${raw.slice(0, 720)}…` : raw;
  if (/EItemDoesNotExist|Item not found/i.test(raw)) {
    return `${core}\n\nHint: There is no stack of that resource type in your character’s personal inventory on this SSU. In-game, put the items in your character’s tab on this exact storage unit (not the owner’s main bay only, and not only Powerlay’s shared/open stash). The contract line’s resource must match the in-game type id; try quantity 1.`;
  }
  return core;
}

const CONFIRMATION_POLL_MS = 2_000;
const CONFIRMATION_TIMEOUT_MS = 5 * 60 * 1_000;
const DEFAULT_WORLD_PACKAGE_ID = "0x28b497559d65ab320d9da4613bf2498d5946b2c0ae3597ccfda3072ce127448c";

type LineDepositStatus = "ready" | "waiting" | "confirmed" | "failed" | "unknown";

function normalizeDepositStatus(raw: string | undefined): LineDepositStatus {
  const v = raw?.trim().toLowerCase();
  if (!v) return "unknown";
  if (v === "ready") return "ready";
  if (v === "confirmed") return "confirmed";
  if (v === "failed") return "failed";
  if (v === "waiting") return "waiting";
  if (/pending|submitted|processing|confirm/i.test(v)) return "waiting";
  if (/success|succeeded|confirmed|complete/i.test(v)) return "confirmed";
  if (/fail|rejected|error|expired|timeout/i.test(v)) return "failed";
  return "unknown";
}

function lineStatusFromBackend(line: ContractResourceLine): LineDepositStatus {
  const norm = normalizeDepositStatus(typeof line.depositRowStatus === "string" ? line.depositRowStatus : undefined);
  if (norm !== "unknown") return norm;
  if ((line.pendingDepositQty ?? 0) > 0) return "waiting";
  if ((line.maxDepositAllowed ?? 0) > 0) return "ready";
  return "unknown";
}

function lineStatusLabel(status: LineDepositStatus): string {
  if (status === "waiting") return "Waiting for confirmation";
  if (status === "confirmed") return "Confirmed";
  if (status === "failed") return "Failed";
  if (status === "ready") return "Ready";
  return "—";
}

function lineStatusClass(status: LineDepositStatus): string {
  if (status === "waiting") return "border-accent/40 bg-accent/10 text-accent";
  if (status === "confirmed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "failed") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (status === "ready") return "border-border/70 bg-surface/70 text-text";
  return "border-border/70 bg-surface/40 text-muted";
}

export interface ContractExpandedDetailsProps {
  summary: ContractBrowseSummary;
  mode: "participant" | "creator";
  callsign: string;
  userWallet: string | null;
  isParticipant: boolean;
  assigneeMatch: boolean;
  onJoin: () => void;
  onHide: () => void;
  joining: boolean;
  canFinish?: boolean;
  canCancel?: boolean;
  onFinish?: () => void;
  onCancel?: () => void;
  onStatistics?: () => void;
  onViewLogs?: () => void;
  actionBusy?: boolean;
  /** UI-only: whether this contract is set to auto-refresh in the app (not a backend state). */
  autoRefresh?: boolean;
  onAutoRefreshToggle?: (next: boolean) => void;
  /**
   * Contract target SSU for delivery PTB. `connectTxDigest` is optional — the shell can resolve
   * `StorageConfig` on-chain when you did not register this SSU in Powerlay storage yourself.
   */
  deliveryTxContext?: { ssuObjectId: string; connectTxDigest?: string } | null;
  onRefreshContractDetail?: () => Promise<void>;
  onRefreshBalance?: () => void;
}

export function ContractExpandedDetails({
  summary,
  mode,
  callsign,
  userWallet,
  isParticipant,
  assigneeMatch,
  onJoin,
  onHide,
  joining,
  canFinish,
  canCancel,
  onFinish,
  onCancel,
  onStatistics,
  onViewLogs,
  actionBusy,
  autoRefresh,
  onAutoRefreshToggle,
  deliveryTxContext,
  onRefreshContractDetail,
  onRefreshBalance,
}: ContractExpandedDetailsProps) {
  const { contract: c, progressPercent, rewardProgressTokens, rewardCapTokens } = summary;

  const [ssuName, setSsuName] = useState<string | null>(null);
  const [depositLineId, setDepositLineId] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [qtyByLine, setQtyByLine] = useState<Record<string, string>>({});
  const [qtyDirtyByLine, setQtyDirtyByLine] = useState<Record<string, boolean>>({});
  const [localPendingByLine, setLocalPendingByLine] = useState<Record<string, number>>({});
  const [worldPackageId, setWorldPackageId] = useState(DEFAULT_WORLD_PACKAGE_ID);
  useEffect(() => {
    const ssuId = c.targetSsuId?.trim();
    if (!ssuId || !window.efOverlay?.storage?.listConnected) return;
    void window.efOverlay.storage.listConnected().then((list) => {
      const match = list.find((s) => s.ssuObjectId === ssuId);
      setSsuName(match?.name ?? null);
    }).catch(() => { /* best-effort */ });
  }, [c.targetSsuId]);

  useEffect(() => {
    if (!window.efOverlay?.settings?.get) return;
    void window.efOverlay.settings.get().then((s) => {
      const v = s.worldContractsPackageId?.trim();
      setWorldPackageId(v || DEFAULT_WORLD_PACKAGE_ID);
    }).catch(() => {
      setWorldPackageId(DEFAULT_WORLD_PACKAGE_ID);
    });
  }, []);

  const btnCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";
  const primaryCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const dangerCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed";
  const active = c.status === "published" || c.status === "in_progress";
  const ssu = c.targetSsuId?.trim() ?? "";
  const showAutoRefresh = ssu.length > 0 && active && !!onAutoRefreshToggle;

  useEffect(() => {
    setQtyByLine((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const line of c.lines) {
        const max = line.maxDepositAllowed;
        if (max == null) continue;
        const hasUserOverride = qtyDirtyByLine[line.id] === true;
        if (hasUserOverride) continue;
        const normalized = String(Math.max(0, Math.floor(max)));
        if (next[line.id] !== normalized) {
          next[line.id] = normalized;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [c.lines, qtyDirtyByLine]);

  useEffect(() => {
    if (!Object.keys(localPendingByLine).length) return;
    setLocalPendingByLine((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const line of c.lines) {
        if (!(line.id in next)) continue;
        const backendStatus = lineStatusFromBackend(line);
        const stillPending = (line.pendingDepositQty ?? 0) > 0 || backendStatus === "waiting";
        if (!stillPending) {
          delete next[line.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [c.lines, localPendingByLine]);

  useEffect(() => {
    if (!Object.keys(localPendingByLine).length || !onRefreshContractDetail) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await onRefreshContractDetail();
      setLocalPendingByLine((prev) => {
        let changed = false;
        const now = Date.now();
        const next = { ...prev };
        for (const [lineId, startedAt] of Object.entries(prev)) {
          if (now - startedAt > CONFIRMATION_TIMEOUT_MS) {
            delete next[lineId];
            changed = true;
          }
        }
        if (changed) {
          setDepositError("Confirmation timed out for one or more deposit attempts. Refresh and try again.");
        }
        return changed ? next : prev;
      });
    };
    void tick();
    const id = window.setInterval(() => void tick(), CONFIRMATION_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [localPendingByLine, onRefreshContractDetail]);

  const rowByLineId = useMemo(() => {
    const out: Record<string, ContractResourceLine> = {};
    for (const line of c.lines) out[line.id] = line;
    return out;
  }, [c.lines]);

  const runLineDeposit = async (lineId: string, typeID: number) => {
    setDepositError(null);
    const ctx = deliveryTxContext;
    if (!ctx?.ssuObjectId) {
      setDepositError("This contract has no target storage unit.");
      return;
    }
    const line = rowByLineId[lineId];
    if (!line) {
      setDepositError("Contract line not found.");
      return;
    }
    const maxQtyRaw = line.maxDepositAllowed;
    const hasLineMetrics =
      line.remainingRequired != null &&
      line.availableInMyPersonalSlot != null &&
      maxQtyRaw != null;
    if (!hasLineMetrics) {
      setDepositError("Deposit data for this line is not available yet. Refresh and try again.");
      return;
    }
    const backendStatus = lineStatusFromBackend(line);
    const hasPending = backendStatus === "waiting" || (line.pendingDepositQty ?? 0) > 0 || !!localPendingByLine[line.id];
    if (hasPending) {
      setDepositError("A deposit attempt is already pending for this resource line.");
      return;
    }
    const maxQty = Math.max(0, Math.floor(maxQtyRaw));
    const raw = (qtyByLine[lineId] ?? String(maxQty)).trim();
    const q = Math.floor(Number(raw));
    if (!Number.isFinite(q) || q <= 0) {
      setDepositError("Enter a quantity greater than 0.");
      return;
    }
    if (q > maxQty) {
      setDepositError(`Enter a quantity between 1 and ${maxQty}.`);
      return;
    }
    const client = getContractsClient();
    if (!client?.signDeliveryTx || !client.submitDepositAttempt) {
      setDepositError("Contracts bridge unavailable (sign / submit deposit attempt).");
      return;
    }
    setDepositLineId(lineId);
    try {
      console.info("[Powerlay:delivery] sign request", {
        contractId: c.id,
        lineId,
        typeID,
        quantity: q,
        ssuObjectId: ctx.ssuObjectId,
        hasConnectDigest: Boolean(ctx.connectTxDigest?.trim()),
      });
      const signed = await client.signDeliveryTx({
        storageUnitId: ctx.ssuObjectId,
        ...(ctx.connectTxDigest?.trim() ? { connectTxDigest: ctx.connectTxDigest.trim() } : {}),
        typeId: typeID,
        quantity: q,
        worldPackageId,
      });
      if ("error" in signed && signed.error) {
        setDepositError(formatDeliverySignError(signed.error));
        return;
      }
      if (!("digest" in signed) || !signed.digest) {
        setDepositError("Wallet did not return a transaction digest.");
        return;
      }
      await client.submitDepositAttempt(c.id, {
        txDigest: signed.digest,
        typeId: typeID,
        requestedQty: q,
      });
      setLocalPendingByLine((prev) => ({ ...prev, [lineId]: Date.now() }));
      await onRefreshContractDetail?.();
      onRefreshBalance?.();
    } catch (e) {
      setDepositError(formatDeliverySignError(contractsErrorForUi(e).message));
    } finally {
      setDepositLineId(null);
    }
  };

  return (
    <div className="mt-3 pl-3 border-l-2 border-border space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted text-xs">
        <span>
          System <span className="text-text">{c.targetStarSystem}</span>
        </span>
        <span>
          Storage{" "}
          {ssuName
            ? <><span className="text-text font-medium">{ssuName}</span><span className="text-muted ml-1 font-mono text-[0.65rem]" title={ssu}>({ssu.slice(0, 10)}…)</span></>
            : <span className="text-text font-mono">{ssu || "—"}</span>
          }
        </span>
        <span>
          State <span className="text-text">{statusLabel(c.status)}</span>
        </span>
        {active && ssu && autoRefresh && (
          <span className="text-[0.65rem] px-1.5 py-0.5 rounded border border-accent/40 bg-accent/10 text-accent">
            Live refresh on
          </span>
        )}
      </div>
      {c.description && <p className="text-muted text-xs m-0">{c.description}</p>}

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-border/40 text-left text-muted">
              <th className="p-2 font-medium">Resource</th>
              <th className="p-2 font-medium">Need</th>
              <th className="p-2 font-medium">Delivered</th>
              <th className="p-2 font-medium">Remaining</th>
              <th className="p-2 font-medium">Available in your slot</th>
              <th className="p-2 font-medium">Max now</th>
              <th className="p-2 font-medium">Pending qty</th>
              <th className="p-2 font-medium">Deposit now</th>
              <th className="p-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((line) => {
              const required = Math.floor(line.requiredAmount);
              const delivered = Math.floor(line.deliveredAmount);
              const remaining = line.remainingRequired != null ? Math.max(0, Math.floor(line.remainingRequired)) : null;
              const available = line.availableInMyPersonalSlot != null ? Math.max(0, Math.floor(line.availableInMyPersonalSlot)) : null;
              const maxQty = line.maxDepositAllowed != null ? Math.max(0, Math.floor(line.maxDepositAllowed)) : null;
              const pendingQty = line.pendingDepositQty != null ? Math.max(0, Math.floor(line.pendingDepositQty)) : 0;
              const backendStatus = lineStatusFromBackend(line);
              const localWaiting = !!localPendingByLine[line.id];
              const status: LineDepositStatus =
                backendStatus === "unknown" && localWaiting ? "waiting" : backendStatus;
              const statusText =
                localWaiting && status === "waiting"
                  ? "Waiting for chain confirmation..."
                  : lineStatusLabel(status);
              const hasLineMetrics = remaining != null && available != null && maxQty != null;
              const waitingOrLocked =
                status === "waiting" || pendingQty > 0 || localWaiting || depositLineId === line.id;
              const canDepositLine =
                mode === "participant" &&
                isParticipant &&
                active &&
                !!deliveryTxContext?.ssuObjectId &&
                hasLineMetrics;
              const showIncompleteData =
                mode === "participant" &&
                isParticipant &&
                active &&
                !!deliveryTxContext?.ssuObjectId &&
                !hasLineMetrics;
              const qVal = qtyByLine[line.id] ?? (maxQty != null ? String(maxQty) : "");
              const showExcessMessage =
                hasLineMetrics &&
                available > remaining &&
                remaining > 0;
              const pct = lineProgressPercent(line);
              const earned = tokensForDeliveredAmount(line, line.deliveredAmount);
              return (
                <tr key={line.id} className="border-t border-border/80 align-top">
                  <td className="p-2">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <ItemIcon typeID={line.typeID} size={20} className="rounded-sm shrink-0" />
                      <span className="truncate">{line.resourceName}</span>
                    </span>
                    <div className="text-[0.65rem] text-muted mt-1">
                      {pct}% line progress · {formatWithThousandsSeparator(Math.round(earned))} / {formatWithThousandsSeparator(Math.round(line.rewardTokensFullLine))} tok
                      {line.assigneeText ? ` · Assignee: ${line.assigneeText}` : ""}
                    </div>
                  </td>
                  <td className="p-2 font-mono">{formatWithThousandsSeparator(required)}</td>
                  <td className="p-2 font-mono">{formatWithThousandsSeparator(delivered)}</td>
                  <td className="p-2 font-mono">{remaining != null ? formatWithThousandsSeparator(remaining) : "—"}</td>
                  <td className="p-2 font-mono">{available != null ? formatWithThousandsSeparator(available) : "—"}</td>
                  <td className="p-2 font-mono">{maxQty != null ? formatWithThousandsSeparator(maxQty) : "—"}</td>
                  <td className="p-2 font-mono">{formatWithThousandsSeparator(pendingQty)}</td>
                  <td className="p-2">
                    {canDepositLine ? (
                      <div className="flex flex-col gap-1 items-stretch min-w-[8.5rem]">
                        <input
                          type="number"
                          min={1}
                          max={Math.max(1, maxQty ?? 0)}
                          value={qVal}
                          disabled={waitingOrLocked || (maxQty ?? 0) <= 0}
                          onChange={(e) => {
                            setQtyDirtyByLine((prev) => ({ ...prev, [line.id]: true }));
                            setQtyByLine((prev) => ({ ...prev, [line.id]: e.target.value }));
                          }}
                          className="w-full px-1.5 py-1 rounded border border-border-input bg-bg text-text text-xs font-mono"
                        />
                        <button
                          type="button"
                          className={primaryCls}
                          disabled={waitingOrLocked || (maxQty ?? 0) <= 0}
                          onClick={() => void runLineDeposit(line.id, line.typeID)}
                        >
                          {depositLineId === line.id ? "Signing…" : waitingOrLocked ? "Waiting…" : "Deposit"}
                        </button>
                        {showExcessMessage && (
                          <p className="text-[0.65rem] text-muted m-0 leading-snug">
                            Only {formatWithThousandsSeparator(remaining)} can be deposited into this contract right now.
                            {" "}The remaining {formatWithThousandsSeparator(available - remaining)} will stay in your storage slot and can be withdrawn later or used for future contracts.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="text-[0.65rem] text-muted leading-snug">
                        {showIncompleteData
                          ? "Deposit data for this line is not available yet."
                          : "—"}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[0.65rem] ${lineStatusClass(status)}`}>
                      {statusText}
                    </span>
                    {line.depositStatusMessage && (
                      <p className="text-[0.65rem] text-muted m-0 mt-1 leading-snug">
                        {line.depositStatusMessage}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {depositError && (
        <p className="text-xs text-destructive m-0" role="alert">
          {depositError}
        </p>
      )}

      {mode === "participant" && isParticipant && active && !ssu && (
        <p className="text-[0.7rem] text-muted m-0">
          This contract has no target SSU — deposit is unavailable.
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>
          Contract progress: <span className="text-text font-medium">{progressPercent}%</span>
        </span>
        <span>
          Reward pool: <span className="text-text font-medium">{formatWithThousandsSeparator(Math.round(rewardProgressTokens))}</span> /{" "}
          {formatWithThousandsSeparator(Math.round(rewardCapTokens))} tokens
        </span>
        <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-border/70 bg-surface/60">{visibilityLabel(c.visibility)}</span>
      </div>

      <div>
        <div className="text-xs text-muted mb-1">Participants</div>
        {c.participants.length === 0 ? (
          <p className="text-xs text-muted m-0 italic">No one has joined yet.</p>
        ) : (
          <ul className="list-none m-0 p-0 flex flex-wrap gap-2">
            {c.participants.map((p) => (
              <li key={p.id} className="px-2 py-1 rounded-md border border-border bg-bg text-xs">
                {p.displayName}
                {userWallet && p.walletAddress?.toLowerCase() === userWallet.toLowerCase() ? (
                  <span className="text-accent ml-1">(you)</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {mode === "participant" && (assigneeMatch || !callsign.trim()) && (
        <p className="text-[0.7rem] text-muted m-0">
          {assigneeMatch
            ? "Your callsign matches an assignee on this contract — you can accept to join the run."
            : "Set your callsign in the header to highlight when a line is assigned to you."}
        </p>
      )}

      {mode === "creator" && (
        <p className="text-[0.7rem] text-muted m-0">
          You created this contract. Use Finish after delivery, or Cancel only when nothing was delivered.
        </p>
      )}

      {showAutoRefresh && (
        <label className="flex flex-row items-start gap-2 text-xs text-muted cursor-pointer select-none">
          <input
            type="checkbox"
            className="rounded border-border-input mt-0.5 shrink-0"
            checked={autoRefresh === true}
            onChange={(e) => onAutoRefreshToggle?.(e.target.checked)}
          />
          <span>Live refresh — auto-poll contract progress every 1 s (this device only).</span>
        </label>
      )}

      {mode === "participant" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btnCls} disabled={joining || isParticipant || c.status === "completed" || c.status === "canceled"} onClick={onJoin}>
              {isParticipant ? "Joined" : assigneeMatch ? "Accept / join" : "Join"}
            </button>
            <button type="button" className={btnCls} onClick={onHide}>
              Hide from my list
            </button>
          </div>
        </div>
      )}

      {mode === "creator" && (
        <div className="flex flex-col gap-3 pt-1 border-t border-border/60">
          <div className="flex flex-wrap gap-2">
            {onStatistics && (
              <button type="button" className={btnCls} onClick={onStatistics}>
                Statistics
              </button>
            )}
            {onViewLogs && (
              <button type="button" className={btnCls} onClick={onViewLogs}>
                Event log
              </button>
            )}
            {canFinish && onFinish && (
              <button type="button" className={primaryCls} disabled={actionBusy} onClick={onFinish}>
                {actionBusy ? "Working…" : "Finish contract"}
              </button>
            )}
            {canCancel && onCancel && (
              <button type="button" className={dangerCls} disabled={actionBusy} onClick={onCancel}>
                {actionBusy ? "Working…" : "Cancel listing"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
