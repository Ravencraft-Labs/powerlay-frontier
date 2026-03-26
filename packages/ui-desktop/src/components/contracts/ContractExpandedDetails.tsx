import React from "react";
import type { ContractBrowseSummary } from "@powerlay/core";
import { lineProgressPercent, tokensForDeliveredAmount } from "@powerlay/core";
import { formatWithThousandsSeparator } from "../../utils/format";
import { statusLabel, visibilityLabel } from "../../utils/contractsUi";
import { ItemIcon } from "../ItemIcon";

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
  actionBusy?: boolean;
  /** UI-only: whether this contract is set to auto-refresh in the app (not a backend state). */
  autoRefresh?: boolean;
  onAutoRefreshToggle?: (next: boolean) => void;
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
  actionBusy,
  autoRefresh,
  onAutoRefreshToggle,
}: ContractExpandedDetailsProps) {
  const { contract: c, progressPercent, rewardProgressTokens, rewardCapTokens } = summary;
  const btnCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-border-input bg-border text-text text-sm hover:bg-surface";
  const primaryCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-selection-bg bg-selection-bg text-selection-text text-sm disabled:opacity-50 disabled:cursor-not-allowed";
  const dangerCls =
    "cursor-pointer px-3 py-1.5 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm hover:bg-destructive/20 disabled:opacity-50 disabled:cursor-not-allowed";
  const active = c.status === "published" || c.status === "in_progress";
  const ssu = c.targetSsuId?.trim() ?? "";
  const showAutoRefresh = ssu.length > 0 && active && !!onAutoRefreshToggle;

  return (
    <div className="mt-3 pl-3 border-l-2 border-border space-y-3 text-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted text-xs">
        <span>
          System <span className="text-text">{c.targetStarSystem}</span>
        </span>
        <span>
          SSU ID <span className="text-text font-mono">{ssu || "—"}</span>
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
            </tr>
          </thead>
          <tbody>
            {c.lines.map((line) => {
              const pct = lineProgressPercent(line);
              const earned = tokensForDeliveredAmount(line, line.deliveredAmount);
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
          <span>Live refresh — auto-poll contract progress every 15 s (this device only).</span>
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
