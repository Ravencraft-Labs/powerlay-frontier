import React, { useEffect, useState } from "react";
import type { ContractBrowseSummary } from "@powerlay/core";
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
  useEffect(() => {
    const ssuId = c.targetSsuId?.trim();
    if (!ssuId || !window.efOverlay?.storage?.listConnected) return;
    void window.efOverlay.storage.listConnected().then((list) => {
      const match = list.find((s) => s.ssuObjectId === ssuId);
      setSsuName(match?.name ?? null);
    }).catch(() => { /* best-effort */ });
  }, [c.targetSsuId]);

  const btnCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";
  const primaryCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const dangerCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed";
  const active = c.status === "published" || c.status === "in_progress";
  const ssu = c.targetSsuId?.trim() ?? "";
  const showAutoRefresh = ssu.length > 0 && active && !!onAutoRefreshToggle;

  const runLineDeposit = async (lineId: string, typeID: number, maxQty: number) => {
    setDepositError(null);
    const ctx = deliveryTxContext;
    if (!ctx?.ssuObjectId) {
      setDepositError("This contract has no target storage unit.");
      return;
    }
    const raw = (qtyByLine[lineId] ?? "1").trim();
    const q = Math.floor(Number(raw));
    if (!Number.isFinite(q) || q < 1 || q > maxQty) {
      setDepositError(`Enter a quantity between 1 and ${maxQty}.`);
      return;
    }
    const client = getContractsClient();
    if (!client?.signDeliveryTx || !client.recordDelivery) {
      setDepositError("Contracts bridge unavailable (sign / record delivery).");
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
      });
      if ("error" in signed && signed.error) {
        setDepositError(formatDeliverySignError(signed.error));
        return;
      }
      if (!("digest" in signed) || !signed.digest) {
        setDepositError("Wallet did not return a transaction digest.");
        return;
      }
      await client.recordDelivery(c.id, {
        lineId,
        quantity: q,
        suiTxDigest: signed.digest,
        ssuObjectId: ctx.ssuObjectId,
      });
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
              <th className="p-2 font-medium">Delivered / req</th>
              <th className="p-2 font-medium">Line %</th>
              <th className="p-2 font-medium">Reward progress</th>
              <th className="p-2 font-medium">Assignee</th>
              <th className="p-2 font-medium">Deposit</th>
            </tr>
          </thead>
          <tbody>
            {c.lines.map((line) => {
              const pct = lineProgressPercent(line);
              const earned = tokensForDeliveredAmount(line, line.deliveredAmount);
              const remFloor = Math.floor(Math.max(0, line.requiredAmount - line.deliveredAmount));
              const canDepositLine =
                mode === "participant" &&
                isParticipant &&
                active &&
                !!deliveryTxContext?.ssuObjectId &&
                remFloor >= 1;
              const maxQty = Math.max(1, remFloor);
              const defaultQ = Math.min(1, maxQty);
              const qVal = qtyByLine[line.id] ?? String(defaultQ);
              return (
                <tr key={line.id} className="border-t border-border/80">
                  <td className="p-2">
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <ItemIcon typeID={line.typeID} size={20} className="rounded-sm shrink-0" />
                      <span className="truncate">{line.resourceName}</span>
                    </span>
                  </td>
                  <td className="p-2 font-mono">
                    {formatWithThousandsSeparator(Math.round(line.deliveredAmount))} / {formatWithThousandsSeparator(Math.round(line.requiredAmount))}
                  </td>
                  <td className="p-2">{pct}%</td>
                  <td className="p-2">
                    {formatWithThousandsSeparator(Math.round(earned))} / {formatWithThousandsSeparator(Math.round(line.rewardTokensFullLine))} tok
                  </td>
                  <td className="p-2 text-muted">{line.assigneeText ?? "—"}</td>
                  <td className="p-2 align-top">
                    {canDepositLine ? (
                      <div className="flex flex-col gap-1 items-stretch min-w-[7rem]">
                        <input
                          type="number"
                          min={1}
                          max={maxQty}
                          value={qVal}
                          disabled={depositLineId === line.id}
                          onChange={(e) =>
                            setQtyByLine((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                          className="w-full px-1.5 py-1 rounded border border-border-input bg-bg text-text text-xs font-mono"
                        />
                        <button
                          type="button"
                          className={primaryCls}
                          disabled={depositLineId === line.id}
                          onClick={() => void runLineDeposit(line.id, line.typeID, maxQty)}
                        >
                          {depositLineId === line.id ? "Signing…" : "Deposit"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
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
